import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wallet, BookOpen, Phone, Calendar, User, FileText, GraduationCap } from "lucide-react";
import { getStudentDetail } from "@/lib/api/student-detail";
import { getStudentSignals } from "@/lib/api/signals";
import { StatusBadge } from "@/components/students/status-badge";
import { MonthCalendar } from "@/components/students/month-calendar";
import { StudentSignalsCard } from "@/components/students/student-signals";
import {
  formatCurrency,
  formatDate,
  followupTypeLabel,
  maskPhone,
} from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

const TX_TYPE_LABEL: Record<string, string> = {
  recharge: "充值",
  consume: "消费",
  refund: "退费",
  transfer_in: "转入",
  transfer_out: "转出",
  gift: "赠送",
  adjustment: "调整",
};

const TX_TYPE_CLS: Record<string, string> = {
  recharge: "text-emerald-600",
  consume: "text-red-500",
  refund: "text-amber-600",
  transfer_in: "text-emerald-600",
  transfer_out: "text-slate-600",
  gift: "text-violet-600",
  adjustment: "text-slate-600",
};

export default async function StudentDetailPage({ params }: Props) {
  const [detail, signals] = await Promise.all([
    getStudentDetail(params.id),
    getStudentSignals(params.id).catch(() => null),
  ]);
  if (!detail || !detail.student) notFound();

  const s = detail.student;
  const a = detail.account;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/students"
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="text-sm text-slate-500">学员管理 / 学员详情</div>
          <h1 className="text-2xl font-semibold text-slate-900">{s.name}</h1>
        </div>
      </div>

      {signals && <StudentSignalsCard signals={signals} />}

      {/* Profile + 月历 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-sky-200 to-indigo-300 text-white">
              <User className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-slate-900">{s.name}</span>
                <StatusBadge status={s.status} />
                {s.student_code && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {s.student_code}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                创建于 {formatDate(s.created_at, true)} · 最近更新 {formatDate(s.updated_at, true)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            <InfoLine icon={Phone} label="手机号" value={maskPhone(s.phone)} />
            <InfoLine icon={User} label="性别" value={genderLabel(s.gender)} />
            <InfoLine icon={Calendar} label="生日" value={s.birth_date ?? "—"} />
            <InfoLine icon={BookOpen} label="学校" value={s.school ?? "—"} />
            <InfoLine icon={BookOpen} label="年级" value={s.grade ?? "—"} />
            <InfoLine icon={User} label="顾问" value={s.counselor_name ?? "—"} />
            <InfoLine icon={User} label="部门" value={s.department_name ?? "—"} />
            <InfoLine icon={FileText} label="来源" value={s.source ?? "—"} />
            {s.status === "graduated" && (
              <InfoLine icon={GraduationCap} label="毕业日期" value={s.graduated_at ? formatDate(s.graduated_at) : "—"} />
            )}
          </div>

          {s.status === "graduated" && s.graduation_note && (
            <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
              <span className="font-medium">毕业备注：</span>{s.graduation_note}
            </div>
          )}
          {s.notes && (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-medium text-slate-700">备注：</span>
              {s.notes}
            </div>
          )}
        </div>

        <MonthCalendar studentId={s.id} />
      </div>

      {/* 财务摘要 */}
      <div className="rounded-2xl bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <Wallet className="h-4 w-4 text-amber-500" />
          财务摘要
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <KvBox label="当前余额" value={formatCurrency(a?.balance ?? 0)} accent="amber" />
          <KvBox label="累计充值" value={formatCurrency(a?.total_recharged ?? 0)} />
          <KvBox label="累计消费" value={formatCurrency(a?.total_consumed ?? 0)} />
          <KvBox label="累计退款" value={formatCurrency(a?.total_refunded ?? 0)} />
          <KvBox label="冻结金额" value={formatCurrency(a?.frozen_amount ?? 0)} />
        </div>
      </div>

      {/* 报名 + 跟进 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`报名记录 (${detail.enrollments.length})`}>
          {detail.enrollments.length === 0 ? (
            <EmptyHint text="暂无报名记录" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">课程</th>
                  <th className="px-3 py-2 text-left">状态</th>
                  <th className="px-3 py-2 text-right">课时</th>
                  <th className="px-3 py-2 text-left">报名时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.enrollments.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 text-slate-800">{e.course_name ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{e.status}</td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {e.used_lessons ?? 0} / {e.total_lessons ?? 0}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatDate(e.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={`跟进记录 (${detail.followups.length})`}>
          {detail.followups.length === 0 ? (
            <EmptyHint text="暂无跟进记录" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {detail.followups.map((f) => (
                <li key={f.id} className="px-1 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">
                      {followupTypeLabel(f.type)}
                    </span>
                    <span className="text-slate-700">{f.creator_name ?? "—"}</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {formatDate(f.created_at, true)}
                    </span>
                  </div>
                  {f.content && (
                    <div className="mt-1 text-sm text-slate-600">{f.content}</div>
                  )}
                  {f.next_plan && (
                    <div className="mt-1 text-xs text-slate-500">
                      下次计划：{f.next_plan}
                      {f.next_date && ` · ${formatDate(f.next_date)}`}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 交易流水 */}
      <Card title={`交易流水 (${detail.transactions.length})`}>
        {detail.transactions.length === 0 ? (
          <EmptyHint text="暂无交易流水" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">时间</th>
                <th className="px-3 py-2 text-left">类型</th>
                <th className="px-3 py-2 text-left">说明</th>
                <th className="px-3 py-2 text-right">金额</th>
                <th className="px-3 py-2 text-right">余额（前 → 后）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-slate-600">
                    {formatDate(t.created_at, true)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-sm font-medium ${TX_TYPE_CLS[t.type] ?? "text-slate-700"}`}
                    >
                      {TX_TYPE_LABEL[t.type] ?? t.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.description ?? "—"}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${TX_TYPE_CLS[t.type] ?? "text-slate-700"}`}
                  >
                    {formatCurrency(t.amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {formatCurrency(t.balance_before)} →{" "}
                    <span className="text-slate-800">
                      {formatCurrency(t.balance_after)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function genderLabel(g?: string | null): string {
  if (g === "male") return "男";
  if (g === "female") return "女";
  return "—";
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <span className="text-slate-500">{label}</span>
      <span className="ml-auto font-medium text-slate-700">{value}</span>
    </div>
  );
}

function KvRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span
        className={`tabular-nums font-medium ${
          accent === "amber" ? "text-amber-600" : "text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function KvBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber";
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          accent === "amber" ? "text-amber-600" : "text-slate-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-700">
        {title}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-400">{text}</div>;
}
