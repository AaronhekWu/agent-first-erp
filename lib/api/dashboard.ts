import { createServerSupabase } from "@/lib/supabase/server";
import { countScheduledPersonTimes, localDate, type SchedulableCourse } from "@/lib/schedule";

// 角色化仪表盘 —— 全部走 createServerSupabase (以登录用户身份, RLS/security_invoker 视图
// 自动按角色/部门收敛), 无需新增 RPC。

export interface DashSummary {
  period: { from: string; to: string };
  courses: { active: number; active_enrollments: number };
  finance: { recharges: number; refunds: number; consumption: number; net_revenue: number };
  students: { total: number; active: number; new_in_period: number };
  followups: { pending: number };
  monthly_revenue: { month: string; recharge: number | null; consume: number | null; refund: number | null }[];
}

export interface ApprovalBrief {
  id: string;
  title: string;
  type: string;
  created_at: string;
  target_label: string | null;
}
export interface LowBalance {
  student_id: string;
  name: string;
  balance: number;
  days_left: number | null;
  risk_level: string | null;
}
export interface TeacherClass {
  course_id: string;
  name: string;
  active_enrolled: number;
  attendance_rate: number | null;
  pending_sessions: number;
}

export interface DailyFlow {
  day: string; // YYYY-MM-DD (本地)
  recharge: number;
  consume: number;
}

export interface DashboardAccess {
  students: boolean;
  courses: boolean;
  finance: boolean;
  followups: boolean;
  audits: boolean;
}

export interface DashboardPeriod {
  key: "half" | "month" | "quarter" | "year" | "custom";
  from: string;
  to: string;
  label: string;
}

export type DashboardData =
  | {
      role: "admin";
      access: DashboardAccess;
      summary: DashSummary | null;
      pendingApprovals: number;
      approvalQueue: ApprovalBrief[];
      daily: DailyFlow[];
      graduated: number;
      period: DashboardPeriod;
      courses: SchedulableCourse[];
      attendance: { expected: number; actual: number; ratio: number };
    }
  | { role: "counselor"; myStudents: number; pendingFollowups: number; lowBalanceCount: number; lowBalance: LowBalance[] }
  | { role: "teacher"; myClasses: number; classes: TeacherClass[] }
  | { role: "generic" };

export async function getDashboard(
  role: string | null,
  permissions: string[] = [],
  period: DashboardPeriod = resolveDashboardPeriod({ range: "month" }),
): Promise<DashboardData> {
  const sb = createServerSupabase();
  const allowed = new Set(permissions);
  const isAdmin = role === "admin";
  const access: DashboardAccess = {
    students: isAdmin || allowed.has("students.view"),
    courses: isAdmin || allowed.has("courses.view"),
    finance: isAdmin || allowed.has("finance.view"),
    followups: isAdmin || allowed.has("followups.view"),
    audits: isAdmin || allowed.has("audits.view"),
  };

  if (isAdmin || permissions.length > 0) {
    const since = new Date(`${period.from}T00:00:00`);
    const until = new Date(`${period.to}T23:59:59.999`);
    const [summaryRes, apprRes, txRes, gradRes, courseRes, attendanceRes] = await Promise.all([
      sb.rpc("rpc_get_dashboard_summary"),
      sb
        .from("aud_approvals")
        .select("id,title,type,created_at,target_label", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(8),
      sb
        .from("fin_transactions")
        .select("type,amount,created_at")
        .in("type", ["recharge", "consume", "refund"])
        .gte("created_at", since.toISOString())
        .lte("created_at", until.toISOString())
        .limit(50000),
      sb
        .from("stu_students")
        .select("id", { count: "exact", head: true })
        .eq("status", "graduated")
        .is("deleted_at", null),
      sb
        .from("v_course_stats")
        .select("course_id,course_name,start_date,end_date,status,active_enrolled,schedule_info")
        .eq("is_archived", false),
      sb
        .from("crs_attendance")
        .select("id", { count: "exact", head: true })
        .in("status", ["present", "late"])
        .gte("class_date", period.from)
        .lte("class_date", period.to),
    ]);

    // 逐日充值/消课 (本地日期), 补齐无交易的空白天
    const byDay = new Map<string, DailyFlow>();
    const dayCount = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86400000) + 1);
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = localDay(d);
      byDay.set(key, { day: key, recharge: 0, consume: 0 });
    }
    for (const t of (txRes.data ?? []) as { type: string; amount: number; created_at: string }[]) {
      const row = byDay.get(localDay(new Date(t.created_at)));
      if (!row) continue;
      if (t.type === "recharge") row.recharge += Number(t.amount);
      else if (t.type === "consume") row.consume += Number(t.amount);
    }

    const courses = (courseRes.data ?? []) as SchedulableCourse[];
    const expected = countScheduledPersonTimes(courses, period.from, period.to);
    const actual = attendanceRes.count ?? 0;
    const txRows = (txRes.data ?? []) as { type: string; amount: number; created_at: string }[];
    const finance = txRows.reduce((sum, transaction) => {
      if (transaction.type === "recharge") sum.recharges += Number(transaction.amount);
      if (transaction.type === "consume") sum.consumption += Number(transaction.amount);
      if (transaction.type === "refund") sum.refunds += Number(transaction.amount);
      return sum;
    }, { recharges: 0, consumption: 0, refunds: 0 });
    const summary = (summaryRes.data as DashSummary | null) ?? null;
    if (summary) {
      summary.period = { from: period.from, to: period.to };
      summary.finance = {
        recharges: finance.recharges,
        consumption: finance.consumption,
        refunds: finance.refunds,
        net_revenue: finance.recharges - finance.refunds,
      };
      summary.monthly_revenue = groupMonthlyFlows(txRows);
    }

    return {
      role: "admin",
      access,
      summary,
      pendingApprovals: apprRes.count ?? 0,
      approvalQueue: (apprRes.data ?? []) as ApprovalBrief[],
      daily: [...byDay.values()],
      graduated: gradRes.count ?? 0,
      period,
      courses,
      attendance: { expected, actual, ratio: expected > 0 ? Math.round(actual / expected * 1000) / 10 : 0 },
    };
  }

  if (role === "counselor") {
    const [stuRes, flwRes, balRes, balCntRes] = await Promise.all([
      sb.from("stu_students").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb.from("v_pending_followups").select("followup_id", { count: "exact", head: true }),
      sb
        .from("v_balance_warnings")
        .select("student_id,name,balance,days_left,risk_level")
        .order("days_left", { ascending: true, nullsFirst: false })
        .limit(8),
      sb.from("v_balance_warnings").select("student_id", { count: "exact", head: true }),
    ]);
    return {
      role: "counselor",
      myStudents: stuRes.count ?? 0,
      pendingFollowups: flwRes.count ?? 0,
      lowBalanceCount: balCntRes.count ?? 0,
      lowBalance: (balRes.data ?? []) as LowBalance[],
    };
  }

  if (role === "teacher") {
    const { data: userData } = await sb.auth.getUser();
    const myId = userData.user?.id ?? "";
    const coursesRes = await sb
      .from("crs_courses")
      .select("id,name")
      .eq("teacher_id", myId)
      .is("deleted_at", null)
      .neq("status", "archived");
    const courses = (coursesRes.data ?? []) as { id: string; name: string }[];
    const ids = courses.map((c) => c.id);
    const statsMap = new Map<string, { active_enrolled: number; attendance_rate: number | null; total_lessons: number | null; completed_sessions: number | null }>();
    if (ids.length > 0) {
      const statsRes = await sb
        .from("v_course_stats")
        .select("course_id,active_enrolled,attendance_rate,total_lessons,completed_sessions")
        .in("course_id", ids);
      for (const s of (statsRes.data ?? []) as Array<Record<string, unknown>>) {
        statsMap.set(String(s.course_id), {
          active_enrolled: Number(s.active_enrolled ?? 0),
          attendance_rate: s.attendance_rate == null ? null : Number(s.attendance_rate),
          total_lessons: s.total_lessons == null ? null : Number(s.total_lessons),
          completed_sessions: s.completed_sessions == null ? null : Number(s.completed_sessions),
        });
      }
    }
    return {
      role: "teacher",
      myClasses: courses.length,
      classes: courses.map((c) => {
        const s = statsMap.get(c.id);
        return {
          course_id: c.id,
          name: c.name,
          active_enrolled: s?.active_enrolled ?? 0,
          attendance_rate: s?.attendance_rate ?? null,
          pending_sessions: Math.max((s?.total_lessons ?? 0) - (s?.completed_sessions ?? 0), 0),
        };
      }),
    };
  }

  return { role: "generic" };
}

function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function groupMonthlyFlows(rows: { type: string; amount: number; created_at: string }[]): DashSummary["monthly_revenue"] {
  const groups = new Map<string, { month: string; recharge: number; consume: number; refund: number }>();
  for (const row of rows) {
    const month = localDay(new Date(row.created_at)).slice(0, 7);
    const current = groups.get(month) ?? { month, recharge: 0, consume: 0, refund: 0 };
    if (row.type === "recharge") current.recharge += Number(row.amount);
    if (row.type === "consume") current.consume += Number(row.amount);
    if (row.type === "refund") current.refund += Number(row.amount);
    groups.set(month, current);
  }
  return [...groups.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function resolveDashboardPeriod(
  input: { range?: string; from?: string; to?: string },
  now = new Date(),
): DashboardPeriod {
  const range = input.range;
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = localDate(now);
  if (range === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(input.from ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(input.to ?? "") && input.from! <= input.to!) {
    return { key: "custom", from: input.from!, to: input.to!, label: `${input.from} 至 ${input.to}` };
  }
  if (range === "half") {
    const firstHalf = now.getDate() <= 15;
    const from = localDate(new Date(year, month, firstHalf ? 1 : 16));
    const to = firstHalf ? localDate(new Date(year, month, 15)) : localDate(new Date(year, month + 1, 0));
    return { key: "half", from, to, label: `${from} 至 ${to}` };
  }
  if (range === "quarter") {
    const quarterStart = Math.floor(month / 3) * 3;
    const from = localDate(new Date(year, quarterStart, 1));
    const to = localDate(new Date(year, quarterStart + 3, 0));
    return { key: "quarter", from, to, label: `${year} 年第 ${Math.floor(month / 3) + 1} 季度` };
  }
  if (range === "year") {
    return { key: "year", from: `${year}-01-01`, to: `${year}-12-31`, label: `${year} 年` };
  }
  const from = localDate(new Date(year, month, 1));
  const to = localDate(new Date(year, month + 1, 0));
  return { key: "month", from, to, label: `${year} 年 ${month + 1} 月（截至 ${today}）` };
}
