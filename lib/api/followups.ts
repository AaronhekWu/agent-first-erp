import { createServerSupabase } from "@/lib/supabase/server";

export interface FollowupItem {
  id: string;
  student_id: string;
  student_name: string;
  student_code: string | null;
  student_phone: string | null;
  counselor_name: string | null;
  creator_name: string | null;
  type: string;
  content: string | null;
  result: string | null;
  next_plan: string | null;
  next_date: string | null;
  is_reminded: boolean;
  metadata: unknown;
  student_balance: number;
  created_at: string;
}

export interface BalanceWarning {
  student_id: string;
  name: string;
  student_code: string | null;
  phone: string | null;
  counselor_name: string | null;
  balance: number;
  consumed_30d: number;
  days_left: number | null;
  last_followup_at: string | null;
  risk_level: "critical" | "warning" | "ok";
}

export interface FollowupOverview {
  students: Array<{
    student_id: string;
    student_name: string;
    student_code: string | null;
    counselor_name: string | null;
    balance: number;
    last_followup_at: string | null;
    days_since_last: number | null;
    record_count: number;
    risk_level: "critical" | "warning" | "ok" | null;
  }>;
}

export async function listFollowupOverview(): Promise<FollowupOverview> {
  const sb = createServerSupabase();
  const [{ data: tl, error: e1 }, { data: warn, error: e2 }] = await Promise.all([
    sb.from("v_followup_timeline").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("v_balance_warnings").select("*"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const rows = (tl ?? []) as FollowupItem[];
  const warnings = (warn ?? []) as BalanceWarning[];

  // group by student, pick latest
  const map = new Map<string, FollowupOverview["students"][number]>();
  for (const r of rows) {
    const exist = map.get(r.student_id);
    if (!exist) {
      map.set(r.student_id, {
        student_id: r.student_id,
        student_name: r.student_name,
        student_code: r.student_code,
        counselor_name: r.counselor_name,
        balance: r.student_balance,
        last_followup_at: r.created_at,
        days_since_last: Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000),
        record_count: 1,
        risk_level: null,
      });
    } else {
      exist.record_count += 1;
    }
  }
  // merge in warnings (students without any followup but at risk)
  for (const w of warnings) {
    const exist = map.get(w.student_id);
    if (exist) {
      exist.risk_level = w.risk_level;
      exist.balance = w.balance;
    } else {
      map.set(w.student_id, {
        student_id: w.student_id,
        student_name: w.name,
        student_code: w.student_code,
        counselor_name: w.counselor_name,
        balance: w.balance,
        last_followup_at: w.last_followup_at,
        days_since_last: w.last_followup_at
          ? Math.floor((Date.now() - new Date(w.last_followup_at).getTime()) / 86400000)
          : null,
        record_count: 0,
        risk_level: w.risk_level,
      });
    }
  }
  const students = [...map.values()].sort((a, b) => {
    const r = (x: typeof a) => (x.risk_level === "critical" ? 0 : x.risk_level === "warning" ? 1 : 2);
    if (r(a) !== r(b)) return r(a) - r(b);
    return (b.days_since_last ?? 0) - (a.days_since_last ?? 0);
  });
  return { students };
}

export async function listFollowupTimelineForStudent(studentId: string): Promise<FollowupItem[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("v_followup_timeline")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as FollowupItem[];
}
