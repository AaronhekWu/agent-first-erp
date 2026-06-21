"use client";

import { Fragment, useEffect, useState } from "react";
import { LogOut, ArrowRightLeft, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, maskPhone } from "@/lib/format";
import { requestApproval } from "@/lib/api/approvals-client";
import { listActiveCourseOptions } from "@/lib/api/courses-client";
import type { ActiveCourseOption, CourseEnrollment, CourseRow } from "@/lib/api/courses";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  enrolled: { label: "在读", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  completed: { label: "已完成", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  transferred: { label: "已转课", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  cancelled: { label: "已退课", cls: "bg-slate-100 text-slate-500 ring-slate-200" },
};

interface Props {
  enrollments: CourseEnrollment[];
  course: CourseRow;
  onMutate: () => Promise<void>;
}

export function RosterTab({ enrollments, course, onMutate }: Props) {
  const [dropTarget, setDropTarget] = useState<CourseEnrollment | null>(null);
  const [transferTarget, setTransferTarget] = useState<CourseEnrollment | null>(null);
  const [pricingDetailId, setPricingDetailId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-3 text-xs text-slate-500">
        共 <span className="font-medium text-slate-800">{enrollments.length}</span> 条报名 ·
        在读 <span className="font-medium text-emerald-600">{enrollments.filter((e) => e.status === "enrolled").length}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">学员</th>
              <th className="px-3 py-2 text-left">编号</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-right">实际单价</th>
              <th className="px-3 py-2 text-center">课时 (已消/剩余/总)</th>
              <th className="px-3 py-2 text-right">合同金额</th>
              <th className="px-3 py-2 text-right">余额</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-400">
                  暂无学员，请前往「添加学员」Tab
                </td>
              </tr>
            )}
            {enrollments.map((e) => {
              const st = STATUS_LABEL[e.status] ?? STATUS_LABEL.enrolled;
              const showPricing = pricingDetailId === e.enrollment_id;
              return (
                <Fragment key={e.enrollment_id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{e.student_name}</div>
                    <div className="text-xs text-slate-400">{maskPhone(e.student_phone)}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{e.student_code ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs ring-1 ring-inset", st.cls)}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(e.unit_price)}</td>
                  <td className="px-3 py-2 text-center text-slate-700">
                    {e.consumed_lessons ?? 0} / <span className="font-medium text-amber-600">{e.remaining_lessons ?? "∞"}</span> / {e.total_lessons ?? "∞"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <button
                      type="button"
                      onClick={() => setPricingDetailId(showPricing ? null : e.enrollment_id)}
                      className="inline-flex items-center gap-1 text-slate-700 hover:text-brand-600"
                      title="查看报名价格明细"
                    >
                      {formatCurrency(e.total_amount)}
                      {showPricing ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      Number(e.balance) < 200 ? "text-red-500" : "text-slate-700",
                    )}
                  >
                    {formatCurrency(e.balance)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {e.status === "enrolled" && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setTransferTarget(e)}
                          className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                          转课
                        </button>
                        <button
                          onClick={() => setDropTarget(e)}
                          className="inline-flex h-7 items-center gap-1 rounded border border-red-100 bg-red-50 px-2 text-xs text-red-600 hover:bg-red-100"
                        >
                          <LogOut className="h-3 w-3" />
                          退课
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {showPricing && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                        <PricingItem label="标准课时单价" value={formatCurrency(e.list_unit_price ?? e.unit_price)} />
                        <PricingItem label="合同原价" value={formatCurrency(e.gross_amount ?? e.total_amount)} />
                        <PricingItem label="优惠金额" value={`-${formatCurrency(e.discount_amount)}`} accent={Number(e.discount_amount) > 0} />
                        <PricingItem label="合同应收" value={formatCurrency(e.total_amount)} strong />
                        <PricingItem label="报名来源" value={sourceLabel(e.source)} />
                        <PricingItem label="优惠说明" value={e.discount_reason || snapshotLabel(e.price_snapshot) || "无优惠"} />
                      </div>
                      {e.notes && <div className="mt-2 text-xs text-slate-500">报名备注：{e.notes}</div>}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {dropTarget && (
        <DropConfirmModal
          enrollment={dropTarget}
          onClose={() => setDropTarget(null)}
          onDone={async () => {
            setDropTarget(null);
            await onMutate();
          }}
        />
      )}
      {transferTarget && (
        <TransferModal
          enrollment={transferTarget}
          fromCourseId={course.course_id}
          onClose={() => setTransferTarget(null)}
          onDone={async () => {
            setTransferTarget(null);
            await onMutate();
          }}
        />
      )}
    </div>
  );
}

function PricingItem({ label, value, accent = false, strong = false }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return <div><div className="text-slate-400">{label}</div><div className={cn("mt-1", accent && "text-emerald-600", strong && "font-semibold text-slate-900")}>{value}</div></div>;
}

function sourceLabel(source: string | null) {
  return ({ normal: "正常报名", campaign: "活动优惠", referral: "老带新", custom: "自定义优惠", transfer: "转课补录" } as Record<string, string>)[source ?? ""] ?? "正常报名";
}

function snapshotLabel(snapshot: Record<string, unknown> | null | undefined) {
  const campaignName = snapshot?.campaign_name;
  const planName = snapshot?.price_plan_name;
  if (typeof campaignName === "string" && campaignName) return campaignName;
  if (typeof planName === "string" && planName) return planName;
  return "";
}

function DropConfirmModal({
  enrollment,
  onClose,
  onDone,
}: {
  enrollment: CourseEnrollment;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refundAmount = refund ? Number(enrollment.remaining_lessons ?? 0) * Number(enrollment.unit_price) : 0;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-3 text-base font-semibold text-slate-800">退课</div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-slate-600">
            为 <span className="font-medium text-slate-800">{enrollment.student_name}</span>{" "}
            退课 (剩余 {enrollment.remaining_lessons ?? 0} 课时 × ¥{enrollment.unit_price})
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
            同时按剩余课时退还 <span className="font-medium text-amber-600">{formatCurrency(refundAmount)}</span> 到学员账户
          </label>
          <div>
            <label className="text-xs text-slate-500">退课原因</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如 搬家 / 时间冲突"
              className="mt-1 min-h-[64px] w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          {error && <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button onClick={onClose} disabled={submitting} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm">
            取消
          </button>
          <button
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await requestApproval({
                  type: "enrollment_drop",
                  title: `退课审批：${enrollment.student_name}`,
                  reason: reason.trim() || "未填写退课原因",
                  targetId: enrollment.enrollment_id,
                  targetLabel: enrollment.student_name,
                  amount: refundAmount,
                  payload: {
                    p_enrollment_id: enrollment.enrollment_id,
                    p_refund_remaining: refund,
                    p_reason: reason.trim() || null,
                  },
                });
                await onDone();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSubmitting(false);
              }
            }}
            className="h-9 rounded-md bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {submitting ? "提交中…" : "提交退课审批"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({
  enrollment,
  fromCourseId,
  onClose,
  onDone,
}: {
  enrollment: CourseEnrollment;
  fromCourseId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [courses, setCourses] = useState<ActiveCourseOption[]>([]);
  const [targetId, setTargetId] = useState("");
  const [carry, setCarry] = useState(String(enrollment.remaining_lessons ?? 0));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const opts = await listActiveCourseOptions(fromCourseId);
        setCourses(opts);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [fromCourseId]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-3 text-base font-semibold text-slate-800">转课</div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-slate-600">
            为 <span className="font-medium text-slate-800">{enrollment.student_name}</span>{" "}
            转课 (单价 ¥{enrollment.unit_price} 沿用，不发生账户变动)
          </p>
          <div>
            <label className="text-xs text-slate-500">目标课程</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 h-9 w-full rounded border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">请选择课程</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.subject ?? "—"} / {c.level ?? "—"})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">
              携带课时数 (剩余 {enrollment.remaining_lessons ?? 0})
            </label>
            <input
              type="number"
              min={1}
              max={enrollment.remaining_lessons ?? undefined}
              value={carry}
              onChange={(e) => setCarry(e.target.value)}
              className="mt-1 h-9 w-full rounded border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">转课原因</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 min-h-[60px] w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          {error && <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button onClick={onClose} disabled={submitting} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm">
            取消
          </button>
          <button
            disabled={submitting || !targetId || !Number(carry)}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await requestApproval({
                  type: "enrollment_transfer",
                  title: `转课审批：${enrollment.student_name}`,
                  reason: reason.trim() || "未填写转课原因",
                  targetId: enrollment.enrollment_id,
                  targetLabel: enrollment.student_name,
                  payload: {
                    p_source_enrollment_id: enrollment.enrollment_id,
                    p_target_course_id: targetId,
                    p_carry_lessons: Number(carry),
                    p_reason: reason.trim() || null,
                  },
                });
                await onDone();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSubmitting(false);
              }
            }}
            className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "提交中…" : "提交转课审批"}
          </button>
        </div>
      </div>
    </div>
  );
}
