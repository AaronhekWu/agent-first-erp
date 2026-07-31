"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateAttendance } from "@/lib/api/create";
import { requestApproval } from "@/lib/api/approvals-client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { MonthCalendar, MonthCalendarDay } from "@/lib/api/signals";

const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: "到课", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  late: { label: "迟到", cls: "border-amber-300 bg-amber-50 text-amber-700" },
  absent: { label: "缺勤", cls: "border-red-300 bg-red-50 text-red-700" },
  leave: { label: "请假", cls: "border-slate-300 bg-slate-100 text-slate-700" },
};

export function AttendanceEditModal({
  day,
  eligibleEnrollments,
  onClose,
  onSaved,
}: {
  day: MonthCalendarDay;
  eligibleEnrollments: MonthCalendar["eligible_enrollments"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [index, setIndex] = useState(0);
  const current = day.slots[index] ?? null;
  const [status, setStatus] = useState(current?.status ?? "present");
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [lessonCount, setLessonCount] = useState(String(current?.lesson_count ?? 1));
  const [triggerConsume, setTriggerConsume] = useState(true);
  const [enrollmentId, setEnrollmentId] = useState(eligibleEnrollments[0]?.enrollment_id ?? "");
  const [lessons, setLessons] = useState("1");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setStatus(current.status);
    setNotes(current.notes ?? "");
    setLessonCount(String(current.lesson_count ?? 1));
  }, [current]);

  const isMakeup = current && ["absent", "leave"].includes(current.status) && ["present", "late"].includes(status);
  const isReverse = current && ["present", "late"].includes(current.status) && ["absent", "leave"].includes(status);

  const submitEdit = async () => {
    if (!current) return;
    const nextLessons = Number(lessonCount);
    if (!nextLessons || nextLessons <= 0 || !Number.isInteger(nextLessons * 2)) return setError("课时数必须大于 0 并按 0.5 递增");
    if ((status !== "present" || nextLessons % 1 !== 0 || isMakeup) && !notes.trim()) {
      return setError(status !== "present" ? "非到课状态必须填写原因" : "0.5 课时异常调整必须填写备注");
    }
    const quantityChanged = nextLessons !== Number(current.lesson_count ?? 1);
    setSubmitting(true);
    setError(null);
    try {
      await updateAttendance({
        p_attendance_id: current.attendance_id,
        p_status: status as "present" | "absent" | "late" | "leave",
        p_notes: notes.trim() || null,
        p_trigger_consume: Boolean((isMakeup && triggerConsume) || (quantityChanged && ["present", "late"].includes(status))),
        p_lesson_count: nextLessons,
      });
      onSaved();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitManual = async () => {
    const lessonCount = Number(lessons);
    const enrollment = eligibleEnrollments.find((item) => item.enrollment_id === enrollmentId);
    if (!enrollment) return setError("请选择补录课程");
    if (lessonCount <= 0 || !Number.isInteger(lessonCount * 2)) return setError("课时数必须大于 0 并按 0.5 递增");
    if (!reason.trim()) return setError("补录原因必填");
    setSubmitting(true);
    setError(null);
    try {
      await requestApproval({
        type: "finance_consume",
        title: `补录课消：${enrollment.course_name}`,
        reason: reason.trim(),
        targetId: enrollment.enrollment_id,
        targetLabel: `${enrollment.course_name} · ${day.date}`,
        amount: lessonCount * Number(enrollment.unit_price ?? 0),
        payload: {
          p_enrollment_id: enrollment.enrollment_id,
          p_lesson_count: lessonCount,
          p_unit_price: null,
          p_consume_date: day.date,
          p_reason: reason.trim(),
        },
      });
      onSaved();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div><h3 className="text-base font-semibold text-slate-800">{current ? "课消与考勤明细" : "补录课消"}</h3><p className="text-xs text-slate-500">{day.date}</p></div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {current ? (
          <>
            {day.slots.length > 1 && (
              <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2">
                {day.slots.map((slot, slotIndex) => (
                  <button key={slot.attendance_id} type="button" onClick={() => setIndex(slotIndex)} className={cn("shrink-0 rounded px-2 py-1 text-xs", slotIndex === index ? "bg-brand-100 font-medium text-brand-700" : "text-slate-500 hover:bg-slate-50")}>
                    {slot.course_name}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
                <Info label="课程" value={current.course_name} />
                <Info label="课消次数" value={`${current.consumption_count} 次`} />
                <Info label="课消价格" value={formatCurrency(current.amount)} />
                <Info label="平均单价" value={current.unit_price == null ? "未扣费" : formatCurrency(current.unit_price)} />
                <Info label="课消时间" value={current.consumed_at ? formatDate(current.consumed_at, true) : "未课消"} />
                <Info label="负责人" value={current.operator_name || "未记录"} />
                <Info label="考勤时间" value={formatDate(current.marked_at, true)} />
              </div>
              <div>
                <div className="mb-1.5 text-xs text-slate-500">考勤状态</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STATUS).map(([key, option]) => (
                    <button key={key} type="button" onClick={() => setStatus(key as typeof status)} className={cn("h-8 rounded-md border px-3 text-xs", status === key ? option.cls : "border-slate-200 bg-white text-slate-600")}>{option.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs text-slate-500">本次扣除课时</div>
                <input type="number" min={0.5} step={0.5} value={lessonCount} onChange={(event) => setLessonCount(event.target.value)} className="h-9 w-40 rounded border border-slate-200 px-3 text-sm" />
                {Number(lessonCount) % 1 !== 0 && <p className="mt-1 text-xs text-amber-600">0.5 课时属于异常调整，备注必填。</p>}
              </div>
              {isMakeup && (
                <label className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                  <input type="checkbox" checked={triggerConsume} onChange={(event) => setTriggerConsume(event.target.checked)} />
                  修改为到课/迟到时同时补扣所填课时
                </label>
              )}
              {isReverse && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  改为缺勤/请假会撤销当天关联课消，课时和余额按原批次退回。
                </div>
              )}
              <div><label className="text-xs text-slate-500">备注</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-20 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
            </div>
          </>
        ) : (
          <div className="space-y-4 px-5 py-4">
            {eligibleEnrollments.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">该学员当前没有可补录的在读课程</div>
            ) : (
              <>
                <div><label className="text-xs text-slate-500">课程</label><select value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-200 px-3 text-sm">
                  {eligibleEnrollments.map((item) => <option key={item.enrollment_id} value={item.enrollment_id}>{item.course_name}（剩余 {item.remaining_lessons} 课时）</option>)}
                </select></div>
                <div><label className="text-xs text-slate-500">补录课时</label><input type="number" min={0.5} step={0.5} value={lessons} onChange={(event) => setLessons(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-200 px-3 text-sm" />{Number(lessons) % 1 !== 0 && <p className="mt-1 text-xs text-amber-600">0.5 课时属于异常调整，请在下方写明具体情况。</p>}</div>
                <div><label className="text-xs text-slate-500">补录原因</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="如：补录该日期实际已上课程" className="mt-1 min-h-20 w-full rounded border border-slate-200 px-3 py-2 text-sm" /></div>
                <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">提交后进入手动课消审批，审批通过后才会扣减。</div>
              </>
            )}
          </div>
        )}
        {error && <div className="mx-5 mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={submitting} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm">取消</button>
          <button type="button" onClick={current ? submitEdit : submitManual} disabled={submitting || (!current && eligibleEnrollments.length === 0)} className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50">
            {submitting ? "提交中…" : current ? "保存考勤" : "提交补录审批"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-slate-400">{label}</div><div className="mt-1 font-medium text-slate-700">{value}</div></div>;
}
