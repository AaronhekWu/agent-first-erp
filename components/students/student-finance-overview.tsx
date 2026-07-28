import { CircleDollarSign, LockKeyhole, WalletCards } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { StudentFinancialProfile } from "@/lib/api/student-detail";

export function StudentFinanceOverview({
  profile,
}: {
  profile: StudentFinancialProfile | null | undefined;
}) {
  if (!profile) return null;
  const account = profile.account;
  const total = Number(account.balance ?? 0);
  const locked = Math.max(0, Number(account.frozen_amount ?? 0));
  const available = Number(account.available_balance ?? total - locked);
  const positiveTotal = Math.max(total, locked, 0);
  const lockedShare = positiveTotal > 0
    ? Math.min(100, Math.max(0, locked / positiveTotal * 100))
    : 0;
  const activeCourses = profile.courses.filter((course) => course.status === "enrolled");

  return (
    <section className="rounded-2xl bg-white p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <CircleDollarSign className="h-4 w-4 text-blue-500" />
          学员财务分配
        </div>
        <span className="text-xs text-slate-400">
          充值进入总余额，报名锁定预付款，消课后确认为实际消费
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-4">
            <div
              className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#2563eb 0 ${lockedShare}%, #10b981 ${lockedShare}% 100%)`,
              }}
              aria-label={`锁定预付款占总余额 ${lockedShare.toFixed(1)}%`}
            >
              <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center shadow-sm">
                <div>
                  <div className="text-[11px] text-slate-400">总余额</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-800">
                    {formatCurrency(total)}
                  </div>
                </div>
              </div>
            </div>
            <div className="min-w-0 space-y-2 text-xs">
              <Legend color="bg-emerald-500" label="可用余额" value={available} />
              <Legend color="bg-blue-600" label="锁定预付款" value={locked} />
              {Number(account.historical_unfunded ?? 0) > 0 && (
                <Legend color="bg-amber-500" label="历史待补资金" value={account.historical_unfunded} />
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniMetric label="累计充值" value={account.total_recharged} />
            <MiniMetric label="累计消课收入" value={account.total_consumed} />
            <MiniMetric label="累计退费" value={account.total_refunded} />
            <MiniMetric label="在读课程" value={`${activeCourses.length} 门`} />
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          {activeCourses.length === 0 ? (
            <div className="grid h-full min-h-48 place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
              当前没有在读课程资金分配
            </div>
          ) : activeCourses.map((course) => (
            <details key={course.enrollment_id} className="group rounded-xl border border-slate-200 bg-white" open>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-44 flex-1">
                  <div className="font-medium text-slate-800">{course.course_name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    已消 {course.consumed_lessons} / 剩余 {course.remaining_lessons} / 总 {course.total_lessons} 课时
                  </div>
                </div>
                <CourseMetric label="报名总额" value={formatCurrency(course.contract_amount)} />
                <CourseMetric label="剩余课时价值" value={formatCurrency(course.remaining_value)} />
                <CourseMetric label="已锁定" value={formatCurrency(course.locked_amount)} tone="blue" />
                {Number(course.historical_unfunded) > 0 && (
                  <CourseMetric label="历史待补" value={formatCurrency(course.historical_unfunded)} tone="amber" />
                )}
                <span className="text-xs text-slate-400 group-open:hidden">展开批次</span>
                <span className="hidden text-xs text-slate-400 group-open:inline">收起批次</span>
              </summary>
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="pb-2 text-left">报名时间</th>
                        <th className="pb-2 text-left">类型</th>
                        <th className="pb-2 text-center">已消 / 剩余 / 总课时</th>
                        <th className="pb-2 text-right">实际单价</th>
                        <th className="pb-2 text-right">批次总额</th>
                        <th className="pb-2 text-right">锁定预付款</th>
                        <th className="pb-2 text-left">备注</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {course.batches.map((batch) => (
                        <tr key={batch.id}>
                          <td className="py-2 whitespace-nowrap text-slate-600">
                            {new Date(batch.enrolled_at).toLocaleDateString("zh-CN")}
                          </td>
                          <td className="py-2 whitespace-nowrap text-slate-600">
                            {batchTypeLabel(batch.source_type)}
                          </td>
                          <td className="py-2 text-center tabular-nums text-slate-600">
                            {batch.consumed_lessons} /{" "}
                            <span className="text-amber-600">{batch.remaining_lessons}</span> /{" "}
                            {batch.total_lessons}
                          </td>
                          <td className="py-2 text-right tabular-nums">{formatCurrency(batch.unit_price)}</td>
                          <td className="py-2 text-right tabular-nums">{formatCurrency(batch.total_amount)}</td>
                          <td className="py-2 text-right tabular-nums font-medium text-blue-600">
                            {formatCurrency(batch.locked_amount)}
                          </td>
                          <td className="max-w-56 truncate py-2 pl-4 text-slate-500" title={batch.notes ?? ""}>
                            {batch.notes || "无备注"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-slate-500">{label}</span>
      <span className="ml-auto font-medium tabular-nums text-slate-800">{formatCurrency(value)}</span>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-white px-2.5 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-700">
        {typeof value === "number" ? formatCurrency(value) : value}
      </div>
    </div>
  );
}

function CourseMetric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "blue" | "amber";
}) {
  const color = tone === "blue"
    ? "text-blue-600"
    : tone === "amber"
      ? "text-amber-600"
      : "text-slate-700";
  return (
    <div className="min-w-24 text-right">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function batchTypeLabel(type: StudentFinancialProfile["courses"][number]["batches"][number]["source_type"]) {
  return {
    paid: "正常付费",
    transfer: "转课带入",
    gift: "赠送课时",
    adjustment: "调整批次",
  }[type];
}
