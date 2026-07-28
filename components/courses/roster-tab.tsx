"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { LogOut, ArrowRightLeft, ChevronDown, ChevronUp, Lock, ArrowUpDown, Plus, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { requestApproval, getLockedTargets } from "@/lib/api/approvals-client";
import { addLessonLot, listActiveCourseOptions, updateLessonLot } from "@/lib/api/courses-client";
import { usePermissions } from "@/lib/auth/permissions-context";
import type { ActiveCourseOption, CourseEnrollment, CourseRow, LessonLot } from "@/lib/api/courses";

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
  onOpenEnrollment: () => void;
}

type RosterSort = "default" | "newest" | "name" | "remaining";

const ROSTER_SORT_OPTIONS: { value: RosterSort; label: string }[] = [
  { value: "default", label: "默认：在读优先 · 最新报名" },
  { value: "newest", label: "报名时间：最新在前" },
  { value: "name", label: "学员姓名" },
  { value: "remaining", label: "剩余课时：从多到少" },
];

export function RosterTab({ enrollments, course, onMutate, onOpenEnrollment }: Props) {
  const { has } = usePermissions();
  const [dropTarget, setDropTarget] = useState<CourseEnrollment | null>(null);
  const [transferTarget, setTransferTarget] = useState<CourseEnrollment | null>(null);
  const [pricingDetailId, setPricingDetailId] = useState<string | null>(null);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<RosterSort>("default");

  const sortedEnrollments = useMemo(() => [...enrollments].sort((a, b) => {
    const enrolledAt = (value: CourseEnrollment) => Date.parse(value.enrolled_at) || 0;
    if (sort === "default") {
      const statusPriority = (value: CourseEnrollment) => value.status === "enrolled" ? 0 : 1;
      return statusPriority(a) - statusPriority(b)
        || enrolledAt(b) - enrolledAt(a)
        || b.enrollment_id.localeCompare(a.enrollment_id);
    }
    if (sort === "newest") {
      return enrolledAt(b) - enrolledAt(a) || b.enrollment_id.localeCompare(a.enrollment_id);
    }
    if (sort === "name") {
      return a.student_name.localeCompare(b.student_name, "zh-CN", { numeric: true })
        || enrolledAt(b) - enrolledAt(a);
    }
    return Number(b.remaining_lessons ?? 0) - Number(a.remaining_lessons ?? 0)
      || enrolledAt(b) - enrolledAt(a);
  }), [enrollments, sort]);

  const refreshLocked = () => {
    void getLockedTargets().then(setLocked);
  };
  useEffect(refreshLocked, [enrollments]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div>
          共 <span className="font-medium text-slate-800">{enrollments.length}</span> 条报名 ·
          在读 <span className="font-medium text-emerald-600">{enrollments.filter((e) => e.status === "enrolled").length}</span>
        </div>
        <label className="inline-flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span>排序</span>
          <select
            aria-label="班级花名册排序"
            value={sort}
            onChange={(event) => setSort(event.target.value as RosterSort)}
            className="h-8 min-w-48 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-100"
          >
            {ROSTER_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">学员</th>
              <th className="px-3 py-2 text-left">编号</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-right">综合单价</th>
              <th className="px-3 py-2 text-center">课时 (已消/剩余/总)</th>
              <th className="px-3 py-2 text-right">合同金额</th>
              <th className="px-3 py-2 text-right">余额</th>
              <th className="px-3 py-2 text-right">操作</th>
              <th className="w-12 px-3 py-2 text-center">明细</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">
                  暂无学员，请前往「学员报名」
                </td>
              </tr>
            )}
            {sortedEnrollments.map((e) => {
              const st = STATUS_LABEL[e.status] ?? STATUS_LABEL.enrolled;
              const showPricing = pricingDetailId === e.enrollment_id;
              const totalLessons = Number(e.total_lessons ?? 0);
              const averageUnitPrice = totalLessons > 0 ? Number(e.total_amount ?? 0) / totalLessons : 0;
              const togglePricing = () => setPricingDetailId(showPricing ? null : e.enrollment_id);
              return (
                <Fragment key={e.enrollment_id}>
                <tr
                  className="cursor-pointer hover:bg-slate-50 focus-within:bg-brand-50/40"
                  onClick={togglePricing}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      togglePricing();
                    }
                  }}
                  tabIndex={0}
                  aria-expanded={showPricing}
                  title="点击整行查看课时付费明细"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{e.student_name}</div>
                    <div className="text-xs text-slate-400">{e.student_phone?.trim() || "未填写"}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{e.student_code ?? "无编号"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs ring-1 ring-inset", st.cls)}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" title="实际收款 ÷ 总课时">
                    {formatCurrency(averageUnitPrice)}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-700">
                    {e.consumed_lessons ?? 0} / <span className="font-medium text-amber-600">{e.remaining_lessons ?? "∞"}</span> / {e.total_lessons ?? "∞"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(e.total_amount)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      Number(e.balance) < 200 ? "text-red-500" : "text-slate-700",
                    )}
                  >
                    {formatCurrency(e.balance)}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                    {e.status === "enrolled" &&
                      (locked.has(e.enrollment_id) ? (
                        <span
                          title="该报名有待处理审批，已锁定以防冲突"
                          className="inline-flex h-7 items-center gap-1 rounded bg-amber-50 px-2 text-xs text-amber-600 ring-1 ring-inset ring-amber-200"
                        >
                          <Lock className="h-3 w-3" />
                          审批中
                        </span>
                      ) : (
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
                      ))}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-400">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        togglePricing();
                      }}
                      className="inline-grid h-7 w-7 place-items-center rounded-md hover:bg-brand-50 hover:text-brand-600"
                      aria-label={showPricing ? "收起课时付费明细" : "展开课时付费明细"}
                    >
                      {showPricing ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
                {showPricing && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                        <PricingItem label="综合单价（实收/总课时）" value={formatCurrency(averageUnitPrice)} />
                        <PricingItem label="合同原价" value={formatCurrency(e.gross_amount ?? e.total_amount)} />
                        <PricingItem label="优惠金额" value={`-${formatCurrency(e.discount_amount)}`} accent={Number(e.discount_amount) > 0} />
                        <PricingItem label="合同应收" value={formatCurrency(e.total_amount)} strong />
                        <PricingItem label="报名来源" value={sourceLabel(e.source)} />
                        <PricingItem label="优惠说明" value={e.discount_reason || snapshotLabel(e.price_snapshot) || "无优惠"} />
                      </div>
                      <LessonLotManager
                        enrollment={e}
                        course={course}
                        canEdit={e.status === "enrolled" && has("courses.pricing") && !locked.has(e.enrollment_id)}
                        lockedTargets={locked}
                        onMutate={onMutate}
                        onOpenEnrollment={onOpenEnrollment}
                        onApprovalSubmitted={refreshLocked}
                      />
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
            refreshLocked();
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
            refreshLocked();
          }}
        />
      )}
    </div>
  );
}

function LessonLotManager({
  enrollment,
  course,
  canEdit,
  lockedTargets,
  onMutate,
  onOpenEnrollment,
  onApprovalSubmitted,
}: {
  enrollment: CourseEnrollment;
  course: CourseRow;
  canEdit: boolean;
  lockedTargets: Set<string>;
  onMutate: () => Promise<void>;
  onOpenEnrollment: () => void;
  onApprovalSubmitted: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LessonLot | null>(null);
  const [sourceType, setSourceType] = useState<LessonLot["source_type"]>("paid");
  const [lessons, setLessons] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [enrolledAt, setEnrolledAt] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = enrollment.lesson_lots.find((lot) => lot.id === editingId);

  const startEdit = (lot: LessonLot) => {
    setEditingId(lot.id);
    setSourceType(lot.source_type);
    setLessons(String(lot.total_lessons));
    setPrice(String(lot.unit_price));
    setNote(lot.notes ?? "");
    setEnrolledAt(lot.enrolled_at.slice(0, 10));
    setError(null);
  };
  const startAdd = (type: LessonLot["source_type"]) => {
    setEditingId("new");
    setSourceType(type);
    setLessons("");
    setPrice(type === "gift" ? "0" : String(enrollment.unit_price ?? ""));
    setNote("");
    setEnrolledAt(new Date().toISOString().slice(0, 10));
    setError(null);
  };
  const save = async () => {
    const totalLessons = Number(lessons);
    const unitPrice = sourceType === "gift" ? 0 : Number(price);
    if (!Number.isInteger(totalLessons) || totalLessons <= 0) return setError("总课时必须是大于 0 的整数");
    if (sourceType !== "gift" && !(unitPrice > 0)) return setError("正常课时单价必须大于 0");
    if (sourceType === "gift" && !note.trim()) return setError("赠送课时备注必填");
    setSubmitting(true);
    setError(null);
    try {
      if (editingId === "new") {
        await addLessonLot({
          enrollmentId: enrollment.enrollment_id,
          totalLessons,
          unitPrice,
          sourceType,
          notes: note.trim(),
          enrolledAt,
        });
      } else if (editing) {
        await updateLessonLot({
          lotId: editing.id,
          totalLessons,
          unitPrice,
          notes: note.trim(),
          enrolledAt,
        });
      }
      setEditingId(null);
      await onMutate();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  const editor = editingId ? (
    <div className="grid gap-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-[11px] text-slate-500">批次类型<select value={sourceType} disabled className="mt-1 h-9 w-full rounded border border-slate-200 bg-slate-50 px-2 text-xs"><option value="paid">正常付费</option><option value="transfer">转课带入</option><option value="gift">赠送</option><option value="adjustment">调整</option></select></label>
      <label className="text-[11px] text-slate-500">总课时<input type="number" min={editing?.consumed_lessons ?? 1} step={1} value={lessons} onChange={(event) => setLessons(event.target.value)} className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs" /></label>
      <label className="text-[11px] text-slate-500">实际单价<input type="number" min={0} step="0.01" disabled={sourceType === "gift"} value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs" /></label>
      <label className="text-[11px] text-slate-500">报名日期<input type="date" value={enrolledAt} onChange={(event) => setEnrolledAt(event.target.value)} className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs" /></label>
      <label className="text-[11px] text-slate-500">备注{sourceType === "gift" && <span className="text-red-500"> *</span>}<input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs" /></label>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
        {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
        <button type="button" onClick={() => setEditingId(null)} className="ml-auto h-8 rounded border border-slate-200 bg-white px-3 text-xs">取消</button>
        <button type="button" onClick={save} disabled={submitting} className="inline-flex h-8 items-center gap-1 rounded bg-brand-600 px-3 text-xs font-medium text-white disabled:opacity-50"><Save className="h-3 w-3" />{submitting ? "保存中" : "保存批次"}</button>
      </div>
    </div>
  ) : null;

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-slate-700">课时批次明细</div>
          <div className="mt-0.5 text-[11px] text-slate-400">自动扣减顺序：正常课时按低单价、早报名优先；赠送课时最后。</div>
        </div>
        {canEdit && (
          <div className="flex gap-1.5">
            <button type="button" onClick={onOpenEnrollment} className="inline-flex h-8 items-center gap-1 rounded-md border border-brand-200 bg-white px-2.5 text-xs text-brand-700 hover:bg-brand-50"><Plus className="h-3 w-3" />新增付费报名</button>
            <button type="button" onClick={() => startAdd("gift")} className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs text-amber-700 hover:bg-amber-100"><Plus className="h-3 w-3" />赠送课时</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="px-2 py-2 text-left">类型</th><th className="px-2 py-2 text-right">实际单价</th><th className="px-2 py-2 text-center">已消 / 剩余 / 总课时</th><th className="px-2 py-2 text-right">批次总额</th><th className="px-2 py-2 text-right">锁定预付款</th><th className="px-2 py-2 text-left">报名时间</th><th className="px-2 py-2 text-left">备注</th>{canEdit && <th className="px-2 py-2 text-right">操作</th>}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollment.lesson_lots.map((lot) => (
              <Fragment key={lot.id}>
                <tr className={editingId === lot.id ? "bg-brand-50/30" : undefined}>
                  <td className="px-2 py-2">{lotTypeLabel(lot.source_type)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(lot.unit_price)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{lot.consumed_lessons} / <span className="font-medium text-amber-600">{lot.remaining_lessons}</span> / {lot.total_lessons}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(lot.total_amount)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span className={Number(lot.unfunded_amount ?? 0) > 0 ? "text-amber-600" : "text-blue-600"}>
                      {formatCurrency(lot.locked_amount ?? 0)}
                    </span>
                    {Number(lot.unfunded_amount ?? 0) > 0 && (
                      <div className="text-[10px] text-amber-600">
                        历史待补 {formatCurrency(lot.unfunded_amount)}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">{lot.enrolled_at.slice(0, 10)}</td>
                  <td className="max-w-56 truncate px-2 py-2 text-slate-500" title={lot.notes ?? ""}>{lot.notes || "—"}</td>
                  {canEdit && (
                    <td className="px-2 py-2 text-right">
                      {lockedTargets.has(lot.id) ? (
                        <span
                          title="该课时批次正在等待审批"
                          className="inline-flex items-center gap-1 whitespace-nowrap text-amber-600"
                        >
                          <Lock className="h-3 w-3" />
                          审批中
                        </span>
                      ) : (
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          <button type="button" onClick={() => startEdit(lot)} className="text-brand-600 hover:underline">
                            编辑
                          </button>
                          <button
                            type="button"
                            disabled={lot.consumed_lessons > 0}
                            onClick={() => setDeleteTarget(lot)}
                            title={lot.consumed_lessons > 0 ? "该批次已有消课记录，不能删除" : "提交删除审批"}
                            className="inline-flex items-center gap-0.5 text-red-500 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                          >
                            <Trash2 className="h-3 w-3" />
                            删除
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
                {editingId === lot.id && (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} className="bg-white px-2 py-2">{editor}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {editingId === "new" && <div className="mt-3">{editor}</div>}
      {deleteTarget && (
        <LessonLotDeleteModal
          enrollment={enrollment}
          course={course}
          lot={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={() => {
            setDeleteTarget(null);
            onApprovalSubmitted();
          }}
        />
      )}
    </div>
  );
}

function LessonLotDeleteModal({
  enrollment,
  course,
  lot,
  onClose,
  onDone,
}: {
  enrollment: CourseEnrollment;
  course: CourseRow;
  lot: LessonLot;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-3 text-base font-semibold text-slate-800">
          删除课时批次
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-slate-600">
            将为 <span className="font-medium text-slate-800">{enrollment.student_name}</span> 提交课时批次删除审批。
            审批通过后才会删除。
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
            <div><span className="text-slate-400">课程</span><div className="mt-1 text-slate-700">{course.course_name}</div></div>
            <div><span className="text-slate-400">批次类型</span><div className="mt-1 text-slate-700">{lotTypeLabel(lot.source_type)}</div></div>
            <div><span className="text-slate-400">课时</span><div className="mt-1 text-slate-700">{lot.total_lessons} 节</div></div>
            <div><span className="text-slate-400">释放锁定预付款</span><div className="mt-1 font-medium text-blue-600">{formatCurrency(lot.locked_amount ?? 0)}</div></div>
          </div>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            已产生消课的批次不能删除。若这是该报名最后一个批次，审批通过后报名状态会改为已退课；最高管理员仍可从审批记录中撤销并恢复。
          </div>
          <label className="block text-xs text-slate-500">
            删除原因 <span className="text-red-500">*</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="请填写删除该报名批次的具体原因"
              className="mt-1 min-h-[72px] w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </label>
          {error && <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting || !reason.trim()}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await requestApproval({
                  type: "lesson_lot_delete",
                  title: `课时批次删除审批：${enrollment.student_name}`,
                  reason: reason.trim(),
                  targetId: lot.id,
                  targetLabel: `${enrollment.student_name} · ${course.course_name} · ${lot.enrolled_at.slice(0, 10)}`,
                  amount: Number(lot.locked_amount ?? 0),
                  payload: {
                    p_lot_id: lot.id,
                    p_enrollment_id: enrollment.enrollment_id,
                    p_reason: reason.trim(),
                  },
                });
                onDone();
              } catch (caught) {
                setError((caught as Error).message);
              } finally {
                setSubmitting(false);
              }
            }}
            className="h-9 rounded-md bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {submitting ? "提交中…" : "提交删除审批"}
          </button>
        </div>
      </div>
    </div>
  );
}

function lotTypeLabel(value: LessonLot["source_type"]) {
  return ({ paid: "正常付费", transfer: "转课带入", gift: "赠送课时", adjustment: "调整批次" } as const)[value];
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const releasedPrepayment = enrollment.lesson_lots.reduce(
    (sum, lot) => sum + Number(lot.locked_amount ?? 0),
    0,
  );
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-3 text-base font-semibold text-slate-800">退课</div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-slate-600">
            为 <span className="font-medium text-slate-800">{enrollment.student_name}</span>{" "}
            退课 (剩余 {enrollment.remaining_lessons ?? 0} 课时 × ¥{enrollment.unit_price})
          </p>
          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
            退课后会释放锁定预付款 <span className="font-semibold">{formatCurrency(releasedPrepayment)}</span>{" "}
            回到可用余额，总余额不变。如需把资金退给家长，请退课完成后再到财务管理提交退费审批。
          </div>
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
            disabled={submitting || !reason.trim()}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await requestApproval({
                  type: "enrollment_drop",
                  title: `退课审批：${enrollment.student_name}`,
                  reason: reason.trim(),
                  targetId: enrollment.enrollment_id,
                  targetLabel: enrollment.student_name,
                  amount: releasedPrepayment,
                  payload: {
                    p_enrollment_id: enrollment.enrollment_id,
                    p_refund_remaining: true,
                    p_reason: reason.trim(),
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
                  {c.name} ({c.subject ?? "未设科目"} / {c.level ?? "未设级别"})
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
            disabled={submitting || !targetId || !Number(carry) || !reason.trim()}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await requestApproval({
                  type: "enrollment_transfer",
                  title: `转课审批：${enrollment.student_name}`,
                  reason: reason.trim(),
                  targetId: enrollment.enrollment_id,
                  targetLabel: enrollment.student_name,
                  payload: {
                    p_source_enrollment_id: enrollment.enrollment_id,
                    p_target_course_id: targetId,
                    p_carry_lessons: Number(carry),
                    p_reason: reason.trim(),
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
