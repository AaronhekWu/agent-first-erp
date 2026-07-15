import { createServerSupabase } from "@/lib/supabase/server";

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

export type DashboardData =
  | {
      role: "admin";
      summary: DashSummary | null;
      pendingApprovals: number;
      approvalQueue: ApprovalBrief[];
      daily: DailyFlow[];
      graduated: number;
    }
  | { role: "counselor"; myStudents: number; pendingFollowups: number; lowBalanceCount: number; lowBalance: LowBalance[] }
  | { role: "teacher"; myClasses: number; classes: TeacherClass[] }
  | { role: "generic" };

export async function getDashboard(role: string | null): Promise<DashboardData> {
  const sb = createServerSupabase();

  if (role === "admin") {
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);
    const [summaryRes, apprRes, txRes, gradRes] = await Promise.all([
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
        .in("type", ["recharge", "consume"])
        .gte("created_at", since.toISOString())
        .limit(10000),
      sb
        .from("stu_students")
        .select("id", { count: "exact", head: true })
        .eq("status", "graduated")
        .is("deleted_at", null),
    ]);

    // 逐日充值/消课 (本地日期), 补齐无交易的空白天
    const byDay = new Map<string, DailyFlow>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = localDay(d);
      byDay.set(key, { day: key, recharge: 0, consume: 0 });
    }
    for (const t of (txRes.data ?? []) as { type: string; amount: number; created_at: string }[]) {
      const row = byDay.get(localDay(new Date(t.created_at)));
      if (!row) continue;
      if (t.type === "recharge") row.recharge += Number(t.amount);
      else row.consume += Number(t.amount);
    }

    return {
      role: "admin",
      summary: (summaryRes.data as DashSummary | null) ?? null,
      pendingApprovals: apprRes.count ?? 0,
      approvalQueue: (apprRes.data ?? []) as ApprovalBrief[],
      daily: [...byDay.values()],
      graduated: gradRes.count ?? 0,
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
