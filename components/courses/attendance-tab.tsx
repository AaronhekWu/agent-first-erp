"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Clock, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";
import { markAttendance } from "@/lib/api/create";
import type { CourseEnrollment } from "@/lib/api/courses";
import { formatCurrency } from "@/lib/format";

const STATUS_OPTIONS: Array<{
  key: "present" | "absent" | "late" | "leave";
  label: string;
  Icon: typeof CheckCircle2;
  cls: string;
  activeCls: string;
}> = [
  { key: "present", label: "到课", Icon: CheckCircle2, cls: "text-emerald-600", activeCls: "bg-emerald-50 border-emerald-300 text-emerald-700" },
  { key: "late",    label: "迟到", Icon: Clock,         cls: "text-amber-600",   activeCls: "bg-amber-50 border-amber-300 text-amber-700" },
  { key: "absent",  label: "缺勤", Icon: AlertCircle,   cls: "text-red-500",     activeCls: "bg-red-50 border-red-300 text-red-700" },
  { key: "leave",   label: "请假", Icon: Coffee,        cls: "text-slate-500",   activeCls: "bg-slate-100 border-slate-300 text-slate-700" },
];

type StatusKey = (typeof STATUS_OPTIONS)[number]["key"];

interface Props {
  enrollments: CourseEnrollment[];
  classDate: string;
  setClassDate: (d: string) => void;
  lessonLimitReached: boolean;
  onMutate: () => Promise<void>;
}

export function AttendanceTab({ enrollments, classDate, setClassDate, lessonLimitReached, onMutate }: Props) {
  const [picks, setPicks] = useState<Map<string, StatusKey>>(new Map());
  const [lessonCounts, setLessonCounts] = useState<Map<string, number>>(new Map());
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    // 同步今日已有记录 (来自 today_attendance_id)
    const init = new Map<string, StatusKey>();
    for (const e of enrollments) {
      if (e.today_status) init.set(e.enrollment_id, e.today_status as StatusKey);
    }
    setPicks(init);
    setLessonCounts(new Map(enrollments.map((enrollment) => [enrollment.enrollment_id, 1])));
    setNotes(new Map());
    setDoneCount(0);
    setError(null);
  }, [classDate, enrollments]);

  const setOne = (id: string, s: StatusKey) =>
    setPicks((cur) => {
      const next = new Map(cur);
      next.set(id, s);
      return next;
    });

  const allPresent = () => {
    const next = new Map<string, StatusKey>();
    for (const e of enrollments) {
      if (e.today_attendance_id || e.student_status === "frozen") continue; // 已点过名或冻结学员跳过
      next.set(e.enrollment_id, "present");
    }
    setPicks((cur) => {
      const m = new Map(cur);
      next.forEach((v, k) => m.set(k, v));
      return m;
    });
  };

  const submit = async () => {
    for (const enrollment of enrollments) {
      if (enrollment.today_attendance_id || enrollment.student_status === "frozen") continue;
      const status = picks.get(enrollment.enrollment_id);
      if (!status) continue;
      const lessonCount = lessonCounts.get(enrollment.enrollment_id) ?? 1;
      const reason = notes.get(enrollment.enrollment_id)?.trim() ?? "";
      if (status !== "present" && !reason) {
        setError(`${enrollment.student_name}不是到课状态，必须填写原因`);
        return;
      }
      if (lessonCount % 1 !== 0 && !reason) {
        setError(`${enrollment.student_name}使用 0.5 课时异常调整，必须填写备注`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    setDoneCount(0);
    let failedMsg: string | null = null;
    let success = 0;
    for (const e of enrollments) {
      if (e.today_attendance_id || e.student_status === "frozen") continue;
      const s = picks.get(e.enrollment_id);
      if (!s) continue;
      const lessonCount = lessonCounts.get(e.enrollment_id) ?? 1;
      const note = notes.get(e.enrollment_id)?.trim() ?? "";
      try {
        await markAttendance({
          p_enrollment_id: e.enrollment_id,
          p_class_date: classDate,
          p_status: s,
          p_trigger_consume: s === "present" || s === "late",
          p_lesson_count: lessonCount,
          p_notes: note || null,
        });
        success += 1;
        setDoneCount(success);
      } catch (err) {
        failedMsg = (err as Error).message;
        break;
      }
    }
    setSubmitting(false);
    if (failedMsg) setError(failedMsg);
    if (success > 0) await onMutate();
  };

  const pendingCount = enrollments.filter((e) => !e.today_attendance_id && e.student_status !== "frozen").length;
  const frozenCount = enrollments.filter((e) => e.student_status === "frozen").length;

  return (
    <div className="space-y-4">
      {lessonLimitReached && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          课程已达到计划总课次，不能新增上课日期。请前往“课程进度”调整计划或申请结课。
        </div>
      )}
      {frozenCount > 0 && (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          当前班级有 {frozenCount} 名冻结学员，已自动排除点名与课消；报名关系和剩余课时仍保留。
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-4">
        <label className="text-sm text-slate-600">上课日期</label>
        <input
          type="date"
          value={classDate}
          onChange={(e) => setClassDate(e.target.value)}
          className="h-9 rounded border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={allPresent}
          disabled={pendingCount === 0 || lessonLimitReached}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          一键全到课 ({pendingCount} 人未点)
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">学员</th>
              <th className="px-3 py-2 text-right">余额</th>
              <th className="px-3 py-2 text-center">剩余课时</th>
              <th className="px-3 py-2 text-center">本次课时</th>
              <th className="px-3 py-2 text-left">考勤</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-400">
                  暂无在读学员
                </td>
              </tr>
            )}
            {enrollments.map((e) => {
              const isMarked = !!e.today_attendance_id;
              const isFrozen = e.student_status === "frozen";
              const cur = picks.get(e.enrollment_id);
              return (
                <tr key={e.enrollment_id} className={cn(isMarked && "bg-slate-50/60", isFrozen && "bg-cyan-50/50")}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      {e.student_name}
                      {isFrozen && <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[11px] font-normal text-cyan-700">已冻结</span>}
                    </div>
                    <div className="text-xs text-slate-400">{e.student_code ?? "无编号"}</div>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      Number(e.balance) < 200 ? "text-red-500" : "text-slate-700",
                    )}
                  >
                    {formatCurrency(e.balance)}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-700">
                    {e.remaining_lessons ?? "∞"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <select
                      value={lessonCounts.get(e.enrollment_id) ?? 1}
                      disabled={isMarked || isFrozen || lessonLimitReached}
                      onChange={(event) => setLessonCounts((current) => {
                        const next = new Map(current);
                        next.set(e.enrollment_id, Number(event.target.value));
                        return next;
                      })}
                      className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 disabled:opacity-60"
                    >
                      {[0.5, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value} 课时</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_OPTIONS.map((o) => {
                        const active = cur === o.key;
                        return (
                          <button
                            key={o.key}
                            type="button"
                            disabled={isMarked || isFrozen || lessonLimitReached}
                            onClick={() => setOne(e.enrollment_id, o.key)}
                            className={cn(
                              "inline-flex h-7 items-center gap-1 rounded border px-2 text-xs transition",
                              active ? o.activeCls : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                              (isMarked || isFrozen) && "opacity-60",
                            )}
                          >
                            <o.Icon className="h-3 w-3" />
                            {o.label}
                          </button>
                        );
                      })}
                      {isMarked && (
                        <span className="ml-1 self-center text-[11px] text-slate-400">已记录</span>
                      )}
                      {isFrozen && (
                        <span className="ml-1 self-center text-[11px] text-cyan-700">冻结期间不能点名或课消</span>
                      )}
                    </div>
                    {!isMarked && !isFrozen && cur && (cur !== "present" || (lessonCounts.get(e.enrollment_id) ?? 1) % 1 !== 0) && (
                      <input
                        value={notes.get(e.enrollment_id) ?? ""}
                        onChange={(event) => setNotes((current) => {
                          const next = new Map(current);
                          next.set(e.enrollment_id, event.target.value);
                          return next;
                        })}
                        placeholder={cur !== "present" ? "必填：说明迟到/缺勤/请假原因" : "必填：说明 0.5 课时异常情况"}
                        className="mt-2 h-8 w-full min-w-56 rounded border border-amber-200 bg-amber-50/50 px-2 text-xs outline-none focus:border-amber-400"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
        <div className="text-xs text-slate-500">
          到课/迟到按所选课时扣减 · 非到课状态和 0.5 课时异常调整必须备注
          {doneCount > 0 && <span className="ml-3 text-emerald-600">已成功 {doneCount} 条</span>}
          {error && <span className="ml-3 text-red-600">错误：{error}</span>}
        </div>
        <button
          onClick={submit}
          disabled={submitting || pendingCount === 0 || lessonLimitReached}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-slate-300"
        >
          {submitting ? "保存中…" : "保存点名"}
        </button>
      </div>
    </div>
  );
}
