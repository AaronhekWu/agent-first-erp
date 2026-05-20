"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateAttendance } from "@/lib/api/create";
import type { MonthCalendarDay } from "@/lib/api/signals";

const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: "到课", cls: "bg-emerald-50 border-emerald-300 text-emerald-700" },
  late: { label: "迟到", cls: "bg-amber-50 border-amber-300 text-amber-700" },
  absent: { label: "缺勤", cls: "bg-red-50 border-red-300 text-red-700" },
  leave: { label: "请假", cls: "bg-slate-100 border-slate-300 text-slate-700" },
};

interface Props {
  day: MonthCalendarDay;
  onClose: () => void;
  onSaved: () => void;
}

export function AttendanceEditModal({ day, onClose, onSaved }: Props) {
  const [idx, setIdx] = useState(0);
  const current = day.slots[idx];
  const [status, setStatus] = useState(current.status);
  const [notes, setNotes] = useState(current.notes ?? "");
  const [triggerConsume, setTriggerConsume] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMakeup = current.status === "absent" && status === "present";
  const isReverse = (current.status === "present" || current.status === "late") && status === "absent";

  const switchSlot = (i: number) => {
    const s = day.slots[i];
    setIdx(i);
    setStatus(s.status);
    setNotes(s.notes ?? "");
    setError(null);
  };

  const submit = async () => {
    if (isMakeup && !notes.trim()) {
      setError("INVALID_INPUT: 补课必须填写备注");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateAttendance({
        p_attendance_id: current.attendance_id,
        p_status: status as "present" | "absent" | "late" | "leave",
        p_notes: notes.trim() || null,
        p_trigger_consume: isMakeup && triggerConsume,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800">编辑考勤</h3>
            <p className="text-xs text-slate-500">{day.date}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {day.slots.length > 1 && (
          <div className="flex gap-1 border-b border-slate-100 px-4 py-2">
            {day.slots.map((s, i) => (
              <button
                key={s.attendance_id}
                onClick={() => switchSlot(i)}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  i === idx ? "bg-brand-100 text-brand-700 font-medium" : "text-slate-500 hover:bg-slate-50",
                )}
              >
                {s.course_name}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4 px-5 py-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">课程</div>
            <div className="mt-1 font-medium text-slate-800">{current.course_name}</div>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-slate-500">考勤状态</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setStatus(k as "present" | "absent" | "late" | "leave")}
                  className={cn(
                    "h-8 rounded-md border px-3 text-xs transition",
                    status === k ? v.cls : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              当前状态: <span className="font-medium text-slate-600">{STATUS[current.status]?.label}</span>
            </div>
          </div>

          {isMakeup && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                正在执行「缺勤补课」
              </div>
              <p className="mt-1">本次操作会把考勤改为到课，并 {triggerConsume ? "扣 1 课时" : "不扣课时"}。备注必填。</p>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={triggerConsume}
                  onChange={(e) => setTriggerConsume(e.target.checked)}
                />
                同时补扣 1 课时
              </label>
            </div>
          )}

          {isReverse && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                正在改为「缺勤」
              </div>
              <p className="mt-1">系统会回滚关联课消，把课时返还给学员账户。</p>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500">
              备注 {isMakeup && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isMakeup ? "补课原因 / 时间 / 上的什么课" : "可选"}
              className="mt-1 min-h-[80px] w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          {error && <div className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button onClick={onClose} disabled={submitting} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm">
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
