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
import { PERMISSION_CATALOG, ROLE_DEFAULTS, ROLE_LABELS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await getMe();
  const role = me?.user.primary_role ?? null;
  const permissions = role === "admin"
    ? PERMISSION_CATALOG.map((permission) => permission.key)
    : me?.permissions ?? (role ? ROLE_DEFAULTS[role] ?? [] : []);
  const data = await getDashboard(role, permissions);
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
        {data.access.finance && <Tile icon={Wallet} label="近30天充值" value={formatCurrency(s?.finance.recharges ?? 0)} tone="emerald" />}
        {data.access.finance && <Tile icon={TrendingUp} label="近30天消课" value={formatCurrency(s?.finance.consumption ?? 0)} tone="blue" />}
        {data.access.finance && <Tile icon={Wallet} label="近30天净收入" value={formatCurrency(s?.finance.net_revenue ?? 0)} tone="slate" />}
        {data.access.audits && <Tile icon={CheckSquare} label="待审批" value={data.pendingApprovals} sub="点击进入审批中心" tone={data.pendingApprovals > 0 ? "amber" : "slate"} href="/audits" />}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {data.access.students && <Tile icon={Users} label="学员总数" value={s?.students.total ?? 0} sub={`在读 ${s?.students.active ?? 0}`} href="/students" />}
        {data.access.courses && <Tile icon={BookOpen} label="在读班级" value={s?.courses.active ?? 0} sub={`在读报名 ${s?.courses.active_enrollments ?? 0}`} href="/courses" />}
        {data.access.followups && <Tile icon={Clock} label="待跟进" value={s?.followups.pending ?? 0} sub="点击进入跟进中心" href="/followups" />}
      </div>

      {(data.access.finance || data.access.students) && <div className="grid gap-5 lg:grid-cols-3">
        {data.access.finance && <div className="lg:col-span-2">
          <Panel title="近 30 天充值 / 消课趋势（各按峰值归一显示走势）">
            <TrendChart daily={data.daily} />
          </Panel>
        </div>}
        {data.access.students && <Panel title="学员状态分布">
          <StatusDonut
            active={s?.students.active ?? 0}
            graduated={data.graduated}
            total={s?.students.total ?? 0}
          />
        </Panel>}
      </div>}

      {(data.access.finance || data.access.audits) && <div className="grid gap-5 lg:grid-cols-2">
        {data.access.finance && <Panel title="月度流水（充值 / 消课）">
          <div className="space-y-3 px-5 py-4">
            {(s?.monthly_revenue ?? []).length === 0 && <div className="py-6 text-center text-sm text-slate-400">暂无数据</div>}
            {(s?.monthly_revenue ?? []).map((m) => {
              const maxCons = Math.max(1, ...(s?.monthly_revenue ?? []).map((x) => Number(x.consume ?? 0)));
              return (
                <div key={m.month}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{m.month}</span>
                    <span>
                      <span className="text-emerald-600">充值 {formatCurrency(m.recharge ?? 0)}</span>
                      {" · "}
                      <span className="text-blue-600">消课 {formatCurrency(m.consume ?? 0)}</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round((Number(m.recharge ?? 0) / maxRev) * 100)}%` }} />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.round((Number(m.consume ?? 0) / maxCons) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>}

        {data.access.audits && <Panel title="待审批队列" action={<Link href="/audits" className="text-xs text-brand-600 hover:underline">全部</Link>}>
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
        </Panel>}
      </div>}
    </div>
  );
}

/* ---------------- 图表 (纯 SVG, 服务端渲染) ---------------- */

function TrendChart({ daily }: { daily: { day: string; recharge: number; consume: number }[] }) {
  const W = 640;
  const H = 180;
  const PAD = { top: 12, right: 12, bottom: 22, left: 12 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const n = daily.length;
  if (n === 0) return <div className="px-5 py-10 text-center text-sm text-slate-400">暂无数据</div>;
  const maxR = Math.max(1, ...daily.map((d) => d.recharge));
  const maxC = Math.max(1, ...daily.map((d) => d.consume));
  const x = (i: number) => PAD.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const yOf = (v: number, max: number) => PAD.top + ih - (v / max) * ih;
  const line = (pick: (d: { recharge: number; consume: number }) => number, max: number) =>
    daily.map((d, i) => `${x(i).toFixed(1)},${yOf(pick(d), max).toFixed(1)}`).join(" ");
  const rechargeLine = line((d) => d.recharge, maxR);
  const consumeLine = line((d) => d.consume, maxC);
  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <div className="px-5 py-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="近30天充值与消课趋势">
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + ih * r} y2={PAD.top + ih * r} stroke="#f1f5f9" strokeWidth="1" />
        ))}
        <polyline points={rechargeLine} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" />
        <polyline points={consumeLine} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" strokeDasharray="none" />
        {daily.map((d, i) =>
          d.recharge > 0 ? <circle key={`r${i}`} cx={x(i)} cy={yOf(d.recharge, maxR)} r="2.5" fill="#10b981" /> : null,
        )}
        {daily.map((d, i) =>
          d.consume > 0 ? <circle key={`c${i}`} cx={x(i)} cy={yOf(d.consume, maxC)} r="2.5" fill="#3b82f6" /> : null,
        )}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="#94a3b8" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {daily[i]?.day.slice(5)}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full bg-emerald-400" />充值（峰值 {formatCurrency(maxR)}）</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full bg-blue-400" />消课（峰值 {formatCurrency(maxC)}）</span>
      </div>
    </div>
  );
}

function StatusDonut({ active, graduated, total }: { active: number; graduated: number; total: number }) {
  const other = Math.max(0, total - active - graduated);
  const parts = [
    { label: "在读", value: active, color: "#10b981" },
    { label: "已毕业", value: graduated, color: "#60a5fa" },
    { label: "其他", value: other, color: "#cbd5e1" },
  ].filter((p) => p.value > 0);
  const sum = parts.reduce((s, p) => s + p.value, 0);
  if (sum === 0) return <div className="px-5 py-10 text-center text-sm text-slate-400">暂无学员</div>;
  const R = 56;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-4">
      <svg viewBox="0 0 160 160" className="h-40 w-40" role="img" aria-label="学员状态分布">
        <circle cx="80" cy="80" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
        {parts.map((p) => {
          const len = (p.value / sum) * CIRC;
          const el = (
            <circle
              key={p.label}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={p.color}
              strokeWidth="18"
              strokeDasharray={`${len} ${CIRC - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="22" fontWeight="600" fill="#0f172a">{total}</text>
        <text x="80" y="94" textAnchor="middle" fontSize="10" fill="#94a3b8">学员总数</text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.label} {p.value}
          </span>
        ))}
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
