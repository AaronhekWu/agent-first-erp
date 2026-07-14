import Link from "next/link";
import {
  Users,
  BookOpen,
  Wallet,
  Clock,
  CheckSquare,
  AlertTriangle,
  GraduationCap,
  TrendingUp,
} from "lucide-react";
import { getMe } from "@/lib/auth/me";
import { getDashboard } from "@/lib/api/dashboard";
import { formatCurrency, formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await getMe();
  const role = me?.user.primary_role ?? null;
  const data = await getDashboard(role);
  const roleLabel = role ? ROLE_LABELS[role] ?? role : "访客";

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {me?.user.display_name ?? "你好"}，欢迎回来
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {roleLabel} · 以下是与你职责相关的概览
        </p>
      </div>

      {data.role === "admin" && <AdminView data={data} />}
      {data.role === "counselor" && <CounselorView data={data} />}
      {data.role === "teacher" && <TeacherView data={data} />}
      {data.role === "generic" && (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-400">
          你的角色（{roleLabel}）暂无专属看板，请联系管理员配置权限。
        </div>
      )}
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "slate",
  href,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "slate" | "amber" | "emerald" | "red" | "blue";
  href?: string;
}) {
  const toneCls = {
    slate: "text-slate-700",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    red: "text-red-500",
    blue: "text-blue-600",
  }[tone];
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="text-sm font-medium text-slate-700">{title}</div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ---------------- 管理人员 ---------------- */
function AdminView({ data }: { data: Extract<Awaited<ReturnType<typeof getDashboard>>, { role: "admin" }> }) {
  const s = data.summary;
  const maxRev = Math.max(1, ...(s?.monthly_revenue ?? []).map((m) => Number(m.recharge ?? 0)));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={Wallet} label="近30天充值" value={formatCurrency(s?.finance.recharges ?? 0)} tone="emerald" />
        <Tile icon={TrendingUp} label="近30天消课" value={formatCurrency(s?.finance.consumption ?? 0)} tone="blue" />
        <Tile icon={Wallet} label="近30天净收入" value={formatCurrency(s?.finance.net_revenue ?? 0)} tone="slate" />
        <Tile icon={CheckSquare} label="待审批" value={data.pendingApprovals} sub="点击进入审批中心" tone={data.pendingApprovals > 0 ? "amber" : "slate"} href="/audits" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={Users} label="学员总数" value={s?.students.total ?? 0} sub={`在读 ${s?.students.active ?? 0}`} href="/students" />
        <Tile icon={BookOpen} label="在读班级" value={s?.courses.active ?? 0} sub={`在读报名 ${s?.courses.active_enrollments ?? 0}`} href="/courses" />
        <Tile icon={Clock} label="待跟进" value={s?.followups.pending ?? 0} href="/followups" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="月度流水（充值 / 消课）">
          <div className="space-y-3 px-5 py-4">
            {(s?.monthly_revenue ?? []).length === 0 && <div className="py-6 text-center text-sm text-slate-400">暂无数据</div>}
            {(s?.monthly_revenue ?? []).map((m) => (
              <div key={m.month}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{m.month}</span>
                  <span>充值 {formatCurrency(m.recharge ?? 0)} · 消课 {formatCurrency(m.consume ?? 0)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round((Number(m.recharge ?? 0) / maxRev) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="待审批队列" action={<Link href="/audits" className="text-xs text-brand-600 hover:underline">全部</Link>}>
          <div className="divide-y divide-slate-100">
            {data.approvalQueue.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-400">暂无待审批</div>}
            {data.approvalQueue.map((a) => (
              <Link key={a.id} href="/audits" className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{a.title}</div>
                  <div className="text-xs text-slate-400">{a.target_label ?? a.type}</div>
                </div>
                <div className="shrink-0 text-xs text-slate-400">{formatDate(a.created_at, true)}</div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- 课程顾问 ---------------- */
function CounselorView({ data }: { data: Extract<Awaited<ReturnType<typeof getDashboard>>, { role: "counselor" }> }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={Users} label="我的学员" value={data.myStudents} href="/students" />
        <Tile icon={Clock} label="待跟进" value={data.pendingFollowups} sub="按计划时间排序" tone={data.pendingFollowups > 0 ? "amber" : "slate"} href="/followups" />
        <Tile icon={AlertTriangle} label="余额不足提醒" value={data.lowBalanceCount} tone={data.lowBalanceCount > 0 ? "red" : "slate"} />
      </div>
      <Panel title="余额不足学员（优先联系）">
        <div className="divide-y divide-slate-100">
          {data.lowBalance.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-400">暂无余额预警</div>}
          {data.lowBalance.map((b) => (
            <Link key={b.student_id} href={`/students/${b.student_id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
              <div className="text-sm font-medium text-slate-800">{b.name}</div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-red-500">余额 {formatCurrency(b.balance)}</span>
                <span className="text-slate-400">预计可用 {b.days_left ?? "未知"} 天</span>
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- 教师 / 班主任 ---------------- */
function TeacherView({ data }: { data: Extract<Awaited<ReturnType<typeof getDashboard>>, { role: "teacher" }> }) {
  const pendingClasses = data.classes.filter((c) => c.pending_sessions > 0).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={BookOpen} label="我的班级" value={data.myClasses} href="/courses" />
        <Tile icon={GraduationCap} label="在读学员" value={data.classes.reduce((n, c) => n + c.active_enrolled, 0)} />
        <Tile icon={Clock} label="待点名 / 有剩余课次的班级" value={pendingClasses} tone={pendingClasses > 0 ? "amber" : "slate"} />
      </div>
      <Panel title="我的班级">
        <div className="divide-y divide-slate-100">
          {data.classes.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-400">你还没有带班</div>}
          {data.classes.map((c) => (
            <Link key={c.course_id} href="/courses" className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{c.name}</div>
                <div className="text-xs text-slate-400">在读 {c.active_enrolled} 人 · 出勤率 {c.attendance_rate != null ? `${c.attendance_rate}%` : "暂无"}</div>
              </div>
              <div className="shrink-0 text-xs">
                {c.pending_sessions > 0 ? (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-600">剩 {c.pending_sessions} 课次待点名</span>
                ) : (
                  <span className="text-slate-400">已完成</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
