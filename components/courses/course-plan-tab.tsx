"use client";

import { useEffect, useState } from "react";
import { CalendarRange, CheckCircle2, ChevronDown, ChevronUp, CircleDashed, MapPin, Save } from "lucide-react";
import { Field, inputCls } from "@/components/ui/form";
import { TimeRangeInput } from "@/components/courses/time-range-input";
import { listCourseSessions, updateCourseInfo, type CourseSessionSummary } from "@/lib/api/courses-client";
import { lessonProgress } from "@/lib/course-lifecycle";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatTimeRange, formatWeekday, isValidTimeRange, parseTimeRange } from "@/lib/schedule";
import type { CourseRow } from "@/lib/api/courses";
import type { Department, HomeroomTeacher } from "@/lib/api/lookups";

const WEEKDAYS = [
  { value: "mon", label: "周一" },
  { value: "tue", label: "周二" },
  { value: "wed", label: "周三" },
  { value: "thu", label: "周四" },
  { value: "fri", label: "周五" },
  { value: "sat", label: "周六" },
  { value: "sun", label: "周日" },
];

export function CoursePlanTab({ course, departments, homeroomTeachers, canEdit, onMutate }: { course: CourseRow; departments: Department[]; homeroomTeachers: HomeroomTeacher[]; canEdit: boolean; onMutate: () => Promise<void> }) {
  const progress = lessonProgress(course);
  const [totalLessons, setTotalLessons] = useState(String(course.total_lessons ?? ""));
  const [unitPrice, setUnitPrice] = useState(String(course.fee ?? ""));
  const [startDate, setStartDate] = useState(course.start_date ?? "");
  const [endDate, setEndDate] = useState(course.end_date ?? "");
  const [departmentId, setDepartmentId] = useState(course.department_id ?? "");
  const [weekdays, setWeekdays] = useState<string[]>(course.schedule_info?.weekdays ?? []);
  const initialTime = parseTimeRange(course.schedule_info?.time);
  const [startTime, setStartTime] = useState(initialTime.start);
  const [endTime, setEndTime] = useState(initialTime.end);
  const [teacherName, setTeacherName] = useState(course.schedule_info?.teacher_name ?? "");
  const [homeroomTeacherId, setHomeroomTeacherId] = useState(course.homeroom_teacher_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState<CourseSessionSummary[]>([]);

  useEffect(() => {
    setTotalLessons(String(course.total_lessons ?? ""));
    setUnitPrice(String(course.fee ?? ""));
    setStartDate(course.start_date ?? "");
    setEndDate(course.end_date ?? "");
    setDepartmentId(course.department_id ?? "");
    setWeekdays(course.schedule_info?.weekdays ?? []);
    const nextTime = parseTimeRange(course.schedule_info?.time);
    setStartTime(nextTime.start);
    setEndTime(nextTime.end);
    setTeacherName(course.schedule_info?.teacher_name ?? "");
    setHomeroomTeacherId(course.homeroom_teacher_id ?? "");
  }, [course]);

  useEffect(() => {
    void listCourseSessions(course.course_id).then(setSessions).catch(() => setSessions([]));
  }, [course.course_id, course.completed_sessions]);

  const toggleWeekday = (value: string) => {
    setWeekdays((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  };

  const save = async () => {
    const count = Number(totalLessons);
    const price = Number(unitPrice);
    if (!Number.isInteger(count) || count <= 0) return setError("计划课次必须是大于 0 的整数");
    if (count < progress.completed) return setError(`计划总课次不能少于已上课次（${progress.completed} 节）`);
    if (price <= 0) return setError("标准课时单价必须大于 0");
    if (!startDate || !endDate) return setError("课程开始日期和结束日期必填");
    if (endDate < startDate) return setError("结束日期不能早于开始日期");
    if (!isValidTimeRange(startTime, endTime)) return setError("请选择有效的开始和结束时间，结束时间必须晚于开始时间");
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateCourseInfo({
        courseId: course.course_id,
        totalLessons: count,
        unitPrice: price,
        startDate,
        endDate,
        departmentId: departmentId || null,
        weekdays,
        time: formatTimeRange(startTime, endTime),
        teacherName: teacherName.trim(),
        homeroomTeacherId: homeroomTeacherId || null,
      });
      setSaved(true);
      await onMutate();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric icon={CircleDashed} label="计划课次" value={progress.total == null ? "未设置" : `${progress.total} 节`} />
        <Metric icon={CheckCircle2} label="已上课次" value={`${progress.completed} 节`} />
        <Metric icon={CalendarRange} label="剩余课次" value={progress.remaining == null ? "待设置" : `${progress.remaining} 节`} />
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-800">课程进度</span>
          <span className="tabular-nums text-slate-500">
            {progress.total == null ? "设置计划课次后显示进度" : `${progress.completed} / ${progress.total}`}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-emerald-500" />已完成</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-slate-200" />未完成</span>
        </div>
        <div className="relative mt-5 h-3 rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.percentage}%` }} />
          {progress.total != null && Array.from({ length: progress.total }, (_, index) => {
            const left = ((index + 1) / Math.max(progress.total ?? 1, 1)) * 100;
            return <span key={`planned-${index}`} className="pointer-events-none absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/80" style={{ left: `${left}%` }} />;
          })}
          {sessions.map((session, index) => {
            const denominator = Math.max(progress.total ?? sessions.length, 1);
            const left = Math.min(100, Math.max(1, ((index + 1) / denominator) * 100));
            const tooltipPosition = index === 0
              ? "left-0"
              : index === sessions.length - 1
                ? "right-0"
                : "left-1/2 -translate-x-1/2";
            return (
              <span
                key={session.class_date}
                className="group absolute top-1/2 z-10 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-emerald-600 text-white shadow"
                style={{ left: `${left}%` }}
              >
                <MapPin className="h-2.5 w-2.5" />
                <span className={`pointer-events-none absolute bottom-7 z-30 hidden w-64 rounded-lg bg-slate-900 p-3 text-left text-xs font-normal leading-5 text-white shadow-xl group-hover:block ${tooltipPosition}`}>
                  <span className="block font-medium">{formatDate(session.class_date)}（{formatWeekday(session.class_date)}） · {course.schedule_info?.time || "时间未设"}</span>
                  <span className="mt-1 block text-slate-200">到课 {session.attended}/{session.headcount} 人（正常 {session.present ?? session.attended} · 迟到 {session.late ?? 0} · 缺席 {session.absent ?? 0} · 请假 {session.leave ?? 0}）</span>
                  <span className="block text-slate-200">消课 {session.consumed_lessons ?? 0} 课时 · {formatCurrency(session.consumed_amount ?? 0)}</span>
                  {session.student_names && <span className="mt-1 block border-t border-slate-700 pt-1 text-slate-300">记录：{session.student_names}</span>}
                </span>
              </span>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-slate-500">
          课程周期：{course.start_date ? formatDate(course.start_date) : "未设置"} 至 {course.end_date ? formatDate(course.end_date) : "未设置"}
        </div>
        {sessions.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {sessions.map((session, index) => (
              <div key={session.class_date} className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="font-medium text-slate-700">第 {index + 1} 节 · {formatDate(session.class_date)}（{formatWeekday(session.class_date)}）</div>
                <div className="mt-0.5 text-slate-500">{course.schedule_info?.time || "时间未设"} · 到课 {session.attended}/{session.headcount} 人 · 消课 {session.consumed_lessons ?? 0} 课时</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {course.status !== "archived" && canEdit && (
        <div className="rounded-lg border border-slate-200 p-4">
          <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between text-sm font-medium text-slate-800">
            <span>编辑课程信息</span>
            {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {expanded && <div className="mt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="计划总课次" required>
              <input type="number" min={Math.max(1, progress.completed)} step={1} className={inputCls} value={totalLessons} onChange={(event) => setTotalLessons(event.target.value)} />
            </Field>
            <Field label="标准课时单价" required>
              <input type="number" min={0.01} step="0.01" className={inputCls} value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} />
            </Field>
            <Field label="开始日期" required>
              <input type="date" className={inputCls} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label="结束日期" required>
              <input type="date" className={inputCls} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </Field>
            <Field label="所属部门" className="md:col-span-2">
              <select className={inputCls} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                <option value="">未指定</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </Field>
            <Field label="老师姓名" className="md:col-span-2">
              <input className={inputCls} value={teacherName} onChange={(event) => setTeacherName(event.target.value)} placeholder="请输入授课老师姓名" />
            </Field>
            <Field label="班主任" className="md:col-span-2">
              <select className={inputCls} value={homeroomTeacherId} onChange={(event) => setHomeroomTeacherId(event.target.value)}>
                <option value="">暂不分配</option>
                {homeroomTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.display_name}</option>)}
              </select>
            </Field>
            <Field label="上课星期" className="md:col-span-2">
              <div className="flex min-h-10 flex-wrap items-center gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = weekdays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWeekday(day.value)}
                      className={`h-8 rounded-md border px-3 text-xs transition ${active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="上课时段" className="md:col-span-2">
              <TimeRangeInput
                start={startTime}
                end={endTime}
                onChange={(nextStart, nextEnd) => {
                  setStartTime(nextStart);
                  setEndTime(nextEnd);
                }}
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            {error && <span className="mr-auto text-sm text-red-600">{error}</span>}
            {saved && <span className="mr-auto text-sm text-emerald-600">课程信息已保存</span>}
            <button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? "保存中" : "保存课程信息"}
            </button>
          </div>
          </div>}
        </div>
      )}
      {course.status !== "archived" && !canEdit && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          当前账号可查看课程信息，但没有编辑课程的权限。
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof CircleDashed; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-4">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-brand-50 text-brand-600"><Icon className="h-4 w-4" /></div>
      <div><div className="text-xs text-slate-500">{label}</div><div className="mt-0.5 font-semibold text-slate-900">{value}</div></div>
    </div>
  );
}
