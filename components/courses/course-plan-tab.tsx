"use client";

import { useEffect, useState } from "react";
import { CalendarRange, CheckCircle2, CircleDashed, Save } from "lucide-react";
import { Field, inputCls } from "@/components/ui/form";
import { updateCourseInfo } from "@/lib/api/courses-client";
import { lessonProgress } from "@/lib/course-lifecycle";
import { formatDate } from "@/lib/format";
import type { CourseRow } from "@/lib/api/courses";
import type { Department } from "@/lib/api/lookups";

const WEEKDAYS = [
  { value: "mon", label: "周一" },
  { value: "tue", label: "周二" },
  { value: "wed", label: "周三" },
  { value: "thu", label: "周四" },
  { value: "fri", label: "周五" },
  { value: "sat", label: "周六" },
  { value: "sun", label: "周日" },
];

export function CoursePlanTab({ course, departments, canEdit, onMutate }: { course: CourseRow; departments: Department[]; canEdit: boolean; onMutate: () => Promise<void> }) {
  const progress = lessonProgress(course);
  const [totalLessons, setTotalLessons] = useState(String(course.total_lessons ?? ""));
  const [unitPrice, setUnitPrice] = useState(String(course.fee ?? ""));
  const [startDate, setStartDate] = useState(course.start_date ?? "");
  const [endDate, setEndDate] = useState(course.end_date ?? "");
  const [departmentId, setDepartmentId] = useState(course.department_id ?? "");
  const [weekdays, setWeekdays] = useState<string[]>(course.schedule_info?.weekdays ?? []);
  const [classTime, setClassTime] = useState(course.schedule_info?.time ?? "");
  const [teacherName, setTeacherName] = useState(course.schedule_info?.teacher_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTotalLessons(String(course.total_lessons ?? ""));
    setUnitPrice(String(course.fee ?? ""));
    setStartDate(course.start_date ?? "");
    setEndDate(course.end_date ?? "");
    setDepartmentId(course.department_id ?? "");
    setWeekdays(course.schedule_info?.weekdays ?? []);
    setClassTime(course.schedule_info?.time ?? "");
    setTeacherName(course.schedule_info?.teacher_name ?? "");
  }, [course]);

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
        time: classTime.trim(),
        teacherName: teacherName.trim(),
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
        <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full rounded bg-brand-500 transition-all" style={{ width: `${progress.percentage}%` }} />
        </div>
        <div className="mt-2 text-xs text-slate-500">
          课程周期：{course.start_date ? formatDate(course.start_date) : "未设置"} 至 {course.end_date ? formatDate(course.end_date) : "未设置"}
        </div>
      </div>

      {course.status !== "archived" && canEdit && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="mb-4 text-sm font-medium text-slate-800">编辑课程信息</h3>
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
              <input className={inputCls} value={classTime} onChange={(event) => setClassTime(event.target.value)} placeholder="如 18:00-20:00" />
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
