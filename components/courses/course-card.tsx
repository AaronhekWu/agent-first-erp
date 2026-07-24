"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, BookOpen, Calendar, CheckCircle2, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { CourseManageModal } from "./course-manage-modal";
import type { CourseRow } from "@/lib/api/courses";
import type { Department } from "@/lib/api/lookups";
import { canCompleteCourse, getCourseLifecycle, lessonProgress, type CourseLifecycle } from "@/lib/course-lifecycle";
import { completeCourse, deleteCourse, setCompletedCourseArchived } from "@/lib/api/courses-client";
import { Gate } from "@/lib/auth/permissions-context";

const STATUS: Record<CourseLifecycle, { label: string; cls: string; ring: string }> = {
  enrolling: { label: "招生中", cls: "bg-emerald-50 text-emerald-700", ring: "ring-emerald-200" },
  full: { label: "已满班", cls: "bg-red-50 text-red-700", ring: "ring-red-200" },
  ready_to_complete: { label: "待结课", cls: "bg-amber-50 text-amber-700", ring: "ring-amber-200" },
  paused: { label: "已暂停", cls: "bg-slate-100 text-slate-600", ring: "ring-slate-200" },
  completed: { label: "已结课", cls: "bg-blue-50 text-blue-700", ring: "ring-blue-200" },
};

export function CourseCard({ course, departments, initialOpen = false, initialTab, initialDate }: { course: CourseRow; departments: Department[]; initialOpen?: boolean; initialTab?: string; initialDate?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [busy, setBusy] = useState<"archive" | "delete" | "visibility" | null>(null);
  const cap = course.max_capacity ?? 0;
  const filled = course.active_enrolled ?? 0;
  const capPct = cap > 0 ? Math.min(100, Math.round((filled / cap) * 100)) : 0;
  const lifecycle = getCourseLifecycle(course);
  const st = STATUS[lifecycle];
  const progress = lessonProgress(course);
  const displayStatus = course.is_archived
    ? { label: "已归档", cls: "bg-slate-100 text-slate-600", ring: "ring-slate-200" }
    : st;
  const runCourseAction = async (type: "archive" | "delete") => {
    const label = type === "archive" ? "结课" : "删除";
    if (type === "delete" && !confirm(`确认删除课程「${course.course_name}」？历史报名会保留，但课程不再显示。`)) return;
    setBusy(type);
    try {
      if (type === "archive") await completeCourse(course.course_id);
      else await deleteCourse(course.course_id);
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleArchived = async () => {
    setBusy("visibility");
    try {
      await setCompletedCourseArchived(course.course_id, !course.is_archived);
      router.refresh();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="group flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md">
        <button type="button" onClick={() => setOpen(true)} className="flex flex-col gap-3 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-brand-500" />
                <h3 className="truncate text-base font-semibold text-slate-900 group-hover:text-brand-600">
                  {course.course_name}
                </h3>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">{course.subject ?? "未设科目"}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5">{course.level ?? "未设级别"}</span>
                {course.department_name && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{course.department_name}</span>
                )}
              </div>
            </div>
            <span className={cn("shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", displayStatus.cls, displayStatus.ring)}>
              {displayStatus.label}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {filled}/{cap || "∞"} 报名
            </span>
            <span className="font-medium text-slate-700">{capPct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
            <div
              className={cn(
                "h-full rounded",
                capPct >= 90 ? "bg-red-400" : capPct >= 70 ? "bg-amber-400" : "bg-emerald-400",
              )}
              style={{ width: `${capPct}%` }}
            />
          </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {course.start_date ? formatDate(course.start_date) : "未设置"}
            {course.end_date && ` 至 ${formatDate(course.end_date)}`}
          </span>
          <span className="font-semibold text-amber-600">{formatCurrency(course.fee)}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs">
          <div>
            <div className="font-semibold text-slate-800">{course.active_enrolled}</div>
            <div className="text-[11px] text-slate-500">在读</div>
          </div>
          <div>
            <div className="font-semibold text-slate-800">
              {progress.total == null ? `${progress.completed} 节` : `${progress.completed}/${progress.total}`}
            </div>
            <div className="text-[11px] text-slate-500">课程进度</div>
          </div>
          <div>
            <div className="font-semibold text-slate-800">{formatCurrency(course.total_revenue).replace("¥ ", "¥")}</div>
            <div className="text-[11px] text-slate-500">累计收入</div>
          </div>
          </div>
        </button>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          {lifecycle === "completed" ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={toggleArchived}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              {course.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {busy === "visibility" ? "处理中" : course.is_archived ? "取消归档" : "归档"}
            </button>
          ) : (
            <Gate keys="courses.archive">
              {(() => {
                const completable = canCompleteCourse(course);
                return (
                  <button
                    type="button"
                    disabled={busy !== null || !completable.ok}
                    title={completable.reason ?? undefined}
                    onClick={() => runCourseAction("archive")}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {busy === "archive" ? "提交中" : "结课"}
                  </button>
                );
              })()}
              <button
                type="button"
                disabled={busy !== null || filled > 0}
                title={filled > 0 ? "请先将课程内学员全部退课或转课后再删除" : undefined}
                onClick={() => runCourseAction("delete")}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-red-100 bg-red-50 px-2.5 text-xs text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {busy === "delete" ? "提交中" : "删除"}
              </button>
            </Gate>
          )}
        </div>
      </div>
      <CourseManageModal open={open} onClose={() => setOpen(false)} course={course} departments={departments} initialTab={initialTab} initialDate={initialDate} />
    </>
  );
}
