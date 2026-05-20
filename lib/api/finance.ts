import { createServerSupabase } from "@/lib/supabase/server";

// ---------- 类型 ----------

export type TxType =
  | "recharge"
  | "consume"
  | "refund"
  | "transfer_in"
  | "transfer_out"
  | "gift"
  | "adjustment";

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
}

export interface FinanceKpis {
  recharge_mtd: number;
  refund_mtd: number;
  consume_mtd: number;
  net_mtd: number;
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
  const { data, error } = await sb
    .from("fin_transactions")
    .select("type, amount, created_at")
    .gte("created_at", monthStartIso())
    .limit(10000);
  if (error) throw error;
  let r = 0,
    rf = 0,
    c = 0;
  for (const row of (data ?? []) as { type: string; amount: number }[]) {
    const n = Number(row.amount);
    if (row.type === "recharge") r += n;
    else if (row.type === "refund") rf += n;
    else if (row.type === "consume") c += n;
  }
  return { recharge_mtd: r, refund_mtd: rf, consume_mtd: c, net_mtd: r - rf };
}

export async function listTransactions(opts: {
  type?: TxType | "";
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
  if (opts.from) q = q.gte("created_at", opts.from);
  if (opts.to) q = q.lte("created_at", opts.to);
  if (opts.studentId) q = q.eq("fin_accounts.student_id", opts.studentId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Array<
    Transaction & {
      fin_accounts?: {
        student_id: string;
        stu_students?: { name: string; student_code: string | null };
      };
    }
  >).map((r) => ({
    ...r,
    student_id: r.fin_accounts?.student_id,
    student_name: r.fin_accounts?.stu_students?.name,
    student_code: r.fin_accounts?.stu_students?.student_code ?? null,
  }));
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
