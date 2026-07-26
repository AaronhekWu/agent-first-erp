import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wallet, BookOpen, Phone, Calendar, User, FileText, GraduationCap } from "lucide-react";
import { getStudentDetail } from "@/lib/api/student-detail";
import { getStudentSignals } from "@/lib/api/signals";
import { getLookups } from "@/lib/api/lookups";
import { StatusBadge } from "@/components/students/status-badge";
import { MonthCalendar } from "@/components/students/month-calendar";
import { StudentSignalsCard } from "@/components/students/student-signals";
import { TransactionLedger } from "@/components/students/transaction-ledger";
import { StudentEditButton } from "@/components/students/student-edit-button";
import {
  formatCurrency,
  formatDate,
  followupTypeLabel,
  displayPhone,
} from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export default async function StudentDetailPage({ params }: Props) {
  const [detail, signals, lookups] = await Promise.all([
    getStudentDetail(params.id),
    getStudentSignals(params.id).catch(() => null),
    getLookups(),
  ]);
  if (!detail || !detail.student) notFound();

  const s = detail.student;
  const a = detail.account;
  const parents = [...detail.parents].sort((left, right) => Number(Boolean(right.is_primary_contact)) - Number(Boolean(left.is_primary_contact)));
  const parentPhones = parents
    .map((parent) => parent.phone?.trim())
    .filter((phone): phone is string => Boolean(phone));

  // 课时汇总: 跨所有报名聚合
  const lessons = detail.enrollments.reduce(
    (acc, e) => {
      const total = Number(e.total_lessons ?? 0);
      const used = Number(e.consumed_lessons ?? 0);
      acc.total += total;
      acc.used += used;
      acc.remaining += Number(e.remaining_lessons ?? total - used);
      return acc;
    },
    { total: 0, used: 0, remaining: 0 },
  );

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
            <StudentEditButton detail={detail} counselors={lookups.counselors} departments={lookups.departments} />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            <InfoLine
              icon={Phone}
              label="家长电话"
              value={parentPhones.length > 0 ? parentPhones.join(" / ") : displayPhone(s.phone)}
            />
            <InfoLine icon={User} label="性别" value={genderLabel(s.gender)} />
            <InfoLine
              icon={Calendar}
              label="生日 / 年龄"
              value={s.birth_date ? `${formatDate(s.birth_date)} · ${ageFromBirthDate(s.birth_date)} 岁` : "未填写"}
            />
            <InfoLine icon={BookOpen} label="学校" value={s.school ?? "未填写"} />
            <InfoLine icon={BookOpen} label="年级" value={s.grade ?? "未填写"} />
            <InfoLine icon={User} label="顾问" value={s.counselor_name ?? "未分配"} />
            <InfoLine icon={User} label="部门" value={s.department_name ?? "未分配"} />
            <InfoLine icon={FileText} label="来源" value={s.source ?? "未填写"} />
            {s.status === "graduated" && (
              <InfoLine icon={GraduationCap} label="毕业日期" value={s.graduated_at ? formatDate(s.graduated_at) : "暂无"} />
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

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
              <BookOpen className="h-4 w-4 text-brand-500" />
              报名记录 ({detail.enrollments.length})
            </div>
            {detail.enrollments.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">暂无报名记录</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">课程</th>
                      <th className="px-3 py-2 text-left">状态</th>
                      <th className="px-3 py-2 text-right">已消 / 总课时</th>
                      <th className="px-3 py-2 text-left">报名时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.enrollments.map((enrollment) => (
                      <tr key={enrollment.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <Link href={`/courses?course=${enrollment.course_id}`} className="font-medium text-brand-600 hover:underline">
                            {enrollment.course_name ?? "未知课程"}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{enrollmentStatusLabel(enrollment.status)}</td>
                        <td className="px-3 py-2 text-right text-slate-600">
                          {enrollment.consumed_lessons ?? 0} / {enrollment.total_lessons ?? 0}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{formatDate(enrollment.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <MonthCalendar studentId={s.id} />
      </div>

      {/* 金额汇总 */}
      <div className="rounded-2xl bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <Wallet className="h-4 w-4 text-amber-500" />
          金额汇总
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <KvBox label="当前余额" value={formatCurrency(a?.balance ?? 0)} accent="amber" />
          <KvBox label="累计充值" value={formatCurrency(a?.total_recharged ?? 0)} />
          <KvBox label="累计消费" value={formatCurrency(a?.total_consumed ?? 0)} />
          <KvBox label="累计退款" value={formatCurrency(a?.total_refunded ?? 0)} />
          <KvBox label="冻结金额" value={formatCurrency(a?.frozen_amount ?? 0)} />
        </div>
      </div>

      {/* 课时汇总 */}
      <div className="rounded-2xl bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <BookOpen className="h-4 w-4 text-brand-500" />
          课时汇总
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <KvBox label="累计报名课时" value={`${lessons.total} 节`} />
          <KvBox label="已消课时" value={`${lessons.used} 节`} />
          <KvBox label="剩余课时" value={`${lessons.remaining} 节`} accent="amber" />
        </div>
      </div>

      {/* 跟进 */}
      <div>
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
                    <span className="text-slate-700">{f.creator_name ?? "未知"}</span>
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

      {/* 交易台账（按类型/日期定位消课·充值·退费） */}
      <TransactionLedger transactions={detail.transactions} />
    </div>
  );
}

function genderLabel(g?: string | null): string {
  if (g === "male") return "男";
  if (g === "female") return "女";
  return "未填写";
}

function ageFromBirthDate(value: string): number {
  const birth = new Date(`${value}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

function enrollmentStatusLabel(status: string): string {
  return ({
    enrolled: "在读",
    completed: "已完成",
    cancelled: "已退课",
    transferred: "已转课",
  } as Record<string, string>)[status] ?? "未知状态";
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
