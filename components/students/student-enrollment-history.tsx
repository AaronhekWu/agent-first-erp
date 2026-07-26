"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown, ChevronUp, History } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { StudentEnrollment, StudentEnrollmentEvent } from "@/lib/api/student-detail";
import type { LessonLot } from "@/lib/api/courses";

export function StudentEnrollmentHistory({
  enrollments,
  events,
}: {
  enrollments: StudentEnrollment[];
  events: StudentEnrollmentEvent[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(enrollments[0]?.id ?? null);

  return (
    <div className="rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <BookOpen className="h-4 w-4 text-brand-500" />
          报名与转课记录
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{enrollments.length} 条</span>
        </div>
        <span className="text-xs text-slate-400">点击课程记录展开合同与课时批次</span>
      </div>

      {events.length > 0 && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-600">
            <History className="h-3.5 w-3.5 text-brand-500" />
            报课 / 转课时间线
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {events.map((event) => (
              <div key={`${event.event_type}-${event.enrollment_id}`} className="min-w-64 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${event.event_type === "transfer" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>
                    {event.event_type === "transfer" ? "转课" : "报名"}
                  </span>
                  <span className="ml-auto text-slate-400">{formatDate(event.event_at, true)}</span>
                </div>
                {event.event_type === "transfer" ? (
                  <div className="mt-2 flex items-center gap-1.5 font-medium text-slate-700">
                    <span className="truncate">{event.original_course_name || "原课程"}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <span className="truncate">{event.course_name}</span>
                  </div>
                ) : (
                  <div className="mt-2 truncate font-medium text-slate-700">{event.course_name}</div>
                )}
                <div className="mt-1 text-slate-500">
                  {event.total_lessons ?? 0} 课时 · {formatCurrency(event.total_amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {enrollments.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-slate-400">暂无报名记录</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">课程</th>
                <th className="px-3 py-3 text-left">来源 / 状态</th>
                <th className="px-3 py-3 text-center">课时（已消/剩余/总）</th>
                <th className="px-3 py-3 text-right">合同金额</th>
                <th className="px-3 py-3 text-left">报名时间</th>
                <th className="w-16 px-3 py-3 text-center">明细</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrollments.map((enrollment) => {
                const open = expandedId === enrollment.id;
                const toggle = () => setExpandedId(open ? null : enrollment.id);
                const totalLessons = Number(enrollment.total_lessons ?? 0);
                const averagePrice = totalLessons > 0 ? Number(enrollment.total_amount ?? 0) / totalLessons : 0;
                return (
                  <Fragment key={enrollment.id}>
                    <tr onClick={toggle} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/courses?course=${enrollment.course_id}&tab=roster`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {enrollment.course_name ?? "未知课程"}
                        </Link>
                        {enrollment.subject && <div className="mt-0.5 text-xs text-slate-400">{enrollment.subject}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{sourceLabel(enrollment.source)}</span>
                          <span className={`rounded px-1.5 py-0.5 text-xs ${statusClass(enrollment.status)}`}>{statusLabel(enrollment.status)}</span>
                        </div>
                        {enrollment.original_course_name && <div className="mt-1 text-xs text-violet-600">从「{enrollment.original_course_name}」转入</div>}
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-slate-700">
                        {enrollment.consumed_lessons ?? 0} / <span className="font-medium text-amber-600">{enrollment.remaining_lessons ?? 0}</span> / {enrollment.total_lessons ?? 0}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatCurrency(enrollment.total_amount)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(enrollment.enrolled_at ?? enrollment.created_at, true)}</td>
                      <td className="px-3 py-3 text-center text-slate-400">
                        {open ? <ChevronUp className="mx-auto h-4 w-4" /> : <ChevronDown className="mx-auto h-4 w-4" />}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50/70 px-5 py-4">
                          <div className="grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                            <Info label="综合单价（合同/总课时）" value={formatCurrency(averagePrice)} />
                            <Info label="合同原价" value={formatCurrency(enrollment.gross_amount ?? enrollment.total_amount)} />
                            <Info label="优惠金额" value={`-${formatCurrency(enrollment.discount_amount)}`} tone="emerald" />
                            <Info label="合同应收" value={formatCurrency(enrollment.total_amount)} strong />
                            <Info label="报名来源" value={sourceLabel(enrollment.source)} />
                            <Info label="备注" value={enrollment.discount_reason || enrollment.notes || "无"} />
                          </div>
                          <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white">
                            <table className="w-full min-w-[760px] text-xs">
                              <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                  <th className="px-3 py-2 text-left">课时类型</th>
                                  <th className="px-3 py-2 text-right">实际单价</th>
                                  <th className="px-3 py-2 text-center">已消 / 剩余 / 总课时</th>
                                  <th className="px-3 py-2 text-right">批次总额</th>
                                  <th className="px-3 py-2 text-left">报名时间</th>
                                  <th className="px-3 py-2 text-left">备注</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {enrollment.lesson_lots.length === 0 && (
                                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">暂无课时批次</td></tr>
                                )}
                                {enrollment.lesson_lots.map((lot) => <LessonLotRow key={lot.id} lot={lot} />)}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LessonLotRow({ lot }: { lot: LessonLot }) {
  return (
    <tr>
      <td className="px-3 py-2">{lotTypeLabel(lot.source_type)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(lot.unit_price)}</td>
      <td className="px-3 py-2 text-center tabular-nums">{lot.consumed_lessons} / <span className="font-medium text-amber-600">{lot.remaining_lessons}</span> / {lot.total_lessons}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(lot.total_amount)}</td>
      <td className="px-3 py-2">{formatDate(lot.enrolled_at, true)}</td>
      <td className="max-w-72 truncate px-3 py-2 text-slate-500" title={lot.notes ?? ""}>{lot.notes || "—"}</td>
    </tr>
  );
}

function Info({ label, value, tone, strong }: { label: string; value: string; tone?: "emerald"; strong?: boolean }) {
  return <div><div className="text-slate-400">{label}</div><div className={`mt-1 ${tone === "emerald" ? "text-emerald-600" : strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>{value}</div></div>;
}

function sourceLabel(source?: string | null) {
  return ({ normal: "正常报名", campaign: "活动优惠", referral: "老带新", custom: "自定义优惠", transfer: "转课带入" } as Record<string, string>)[source ?? ""] ?? "正常报名";
}

function statusLabel(status: string) {
  return ({ enrolled: "在读", completed: "已完成", cancelled: "已退课", transferred: "已转课" } as Record<string, string>)[status] ?? status;
}

function statusClass(status: string) {
  return ({
    enrolled: "bg-emerald-50 text-emerald-700",
    completed: "bg-blue-50 text-blue-700",
    cancelled: "bg-slate-100 text-slate-500",
    transferred: "bg-violet-50 text-violet-700",
  } as Record<string, string>)[status] ?? "bg-slate-100 text-slate-600";
}

function lotTypeLabel(value: LessonLot["source_type"]) {
  return ({ paid: "正常付费", transfer: "转课带入", gift: "赠送课时", adjustment: "调整批次" } as const)[value];
}
