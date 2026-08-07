import { createServerSupabase } from "@/lib/supabase/server";
import type { StudentSearchResult } from "./courses";
import { courseEventsForDate, localDate, type SchedulableCourse } from "@/lib/schedule";

// ---------- 类型 ----------

export type TxType =
  | "recharge"
  | "consume"
  | "refund"
  | "transfer_in"
  | "transfer_out"
  | "gift"
  | "adjustment"
  | "enrollment"
  | "lesson_purchase"
  | "prepayment_lock"
  | "prepayment_release"
  | "prepayment_adjustment";

export interface Transaction {
  id: string;
  account_id: string;
  type: TxType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  metadata: unknown;
  created_by: string | null;
  created_at: string;
  student_id?: string;
  student_name?: string;
  student_code?: string | null;
  created_by_name?: string | null;
}
export interface FinanceKpis {
  recharge_mtd: number;
  refund_mtd: number;
  expected_consumption_mtd: number;
  actual_consumption_mtd: number;
  realized_income_mtd: number;
}

export interface ActiveEnrollment {
  id: string;
  course_id: string;
  course_name: string;
  unit_price: number;
  remaining_lessons: number | null;
}

// ---------- 服务端 ----------

export async function getFinanceKpis(): Promise<FinanceKpis> {
  const sb = createServerSupabase();
  const now = new Date();
  const from = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const fromIso = new Date(`${from}T00:00:00+08:00`).toISOString();
  const toIso = new Date(`${to}T23:59:59.999+08:00`).toISOString();
  const [transactionsRes, coursesRes, enrollmentsRes, consumptionRes] = await Promise.all([
    sb.from("fin_transactions")
      .select("type, amount, metadata, created_at")
      .gte("created_at", fromIso).lte("created_at", toIso).limit(10000),
    sb.from("v_course_stats")
      .select("course_id,course_name,start_date,end_date,status,active_enrolled,schedule_info")
      .eq("is_archived", false),
    sb.from("crs_enrollments")
      .select("course_id,unit_price")
      .eq("status", "enrolled"),
    sb.from("fin_consumption_logs")
      .select("amount,created_at")
      .gte("created_at", fromIso).lte("created_at", toIso).limit(20000),
  ]);
  if (transactionsRes.error) throw transactionsRes.error;
  if (coursesRes.error) throw coursesRes.error;
  if (enrollmentsRes.error) throw enrollmentsRes.error;
  if (consumptionRes.error) throw consumptionRes.error;
  let r = 0,
    rf = 0,
    realized = 0;
  for (const row of (transactionsRes.data ?? []) as { type: string; amount: number; metadata?: Record<string, unknown> | null }[]) {
    if (row.metadata?.voided === true) continue;
    const n = Number(row.amount);
    if (row.type === "recharge") r += n;
    else if (row.type === "refund") rf += n;
    else if (row.type === "consume") realized += n;
  }

  const scheduledValueByCourse = new Map<string, number>();
  for (const enrollment of (enrollmentsRes.data ?? []) as Array<{ course_id: string; unit_price: number | null }>) {
    scheduledValueByCourse.set(
      enrollment.course_id,
      (scheduledValueByCourse.get(enrollment.course_id) ?? 0) + Number(enrollment.unit_price ?? 0),
    );
  }
  const courses = (coursesRes.data ?? []) as SchedulableCourse[];
  let expected = 0;
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    for (const event of courseEventsForDate(courses, localDate(cursor))) {
      expected += scheduledValueByCourse.get(event.courseId) ?? 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const actual = (consumptionRes.data ?? []).reduce(
    (sum, row) => sum + Number((row as { amount: number }).amount ?? 0),
    0,
  );
  return {
    recharge_mtd: r,
    refund_mtd: rf,
    expected_consumption_mtd: Math.round(expected * 100) / 100,
    actual_consumption_mtd: Math.round(actual * 100) / 100,
    realized_income_mtd: Math.round(realized * 100) / 100,
  };
}

export async function listTransactions(opts: {
  type?: TxType | "";
  excludeTypes?: TxType[];
  studentId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<Transaction[]> {
  const sb = createServerSupabase();
  let q = sb
    .from("fin_transactions")
    .select(
      "id, account_id, type, amount, balance_before, balance_after, reference_type, reference_id, description, metadata, created_by, created_at, fin_accounts!inner(student_id, stu_students!inner(name, student_code))",
    )
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.type) q = q.eq("type", opts.type);
  for (const excludedType of opts.excludeTypes ?? []) {
    q = q.neq("type", excludedType);
  }
  if (opts.from) q = q.gte("created_at", opts.from);
  if (opts.to) q = q.lte("created_at", opts.to);
  if (opts.studentId) q = q.eq("fin_accounts.student_id", opts.studentId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Array<
    Transaction & {
      fin_accounts?: {
        student_id: string;
        stu_students?: { name: string; student_code: string | null };
      };
    }
  >)
    .filter((row) => {
      const metadata = row.metadata as { domain?: unknown } | null;
      return row.type !== "enrollment"
        && row.type !== "lesson_purchase"
        && metadata?.domain !== "course_contract";
    })
    .map((r) => ({
      ...r,
      student_id: r.fin_accounts?.student_id,
      student_name: r.fin_accounts?.stu_students?.name,
      student_code: r.fin_accounts?.stu_students?.student_code ?? null,
    }));

  // 解析发起人姓名 (谁发起)
  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is string => Boolean(id)))];
  if (creatorIds.length > 0) {
    const { data: profiles } = await sb
      .from("acct_profiles")
      .select("id, display_name")
      .in("id", creatorIds);
    const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
    for (const r of rows) r.created_by_name = r.created_by ? names.get(r.created_by) ?? null : null;
  }
  return rows;
}

export async function getRechargeStudent(studentId?: string): Promise<StudentSearchResult | null> {
  if (!studentId) return null;
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("v_student_overview")
    .select("id, name, student_code, phone, status, balance, frozen_amount, available_balance")
    .eq("id", studentId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return (data as StudentSearchResult | null) ?? null;
}
