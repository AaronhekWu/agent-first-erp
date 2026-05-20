"use client";

import { useState } from "react";
import { BookOpen, Users, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { CourseManageModal } from "./course-manage-modal";
import type { CourseRow } from "@/lib/api/courses";

const STATUS: Record<string, { label: string; cls: string; ring: string }> = {
  active: { label: "招生中", cls: "bg-emerald-50 text-emerald-700", ring: "ring-emerald-200" },
  inactive: { label: "暂停", cls: "bg-slate-100 text-slate-600", ring: "ring-slate-200" },
  archived: { label: "已归档", cls: "bg-blue-50 text-blue-700", ring: "ring-blue-200" },
};

export function CourseCard({ course }: { course: CourseRow }) {
  const [open, setOpen] = useState(false);
  const cap = course.max_capacity ?? 0;
  const filled = course.active_enrolled ?? 0;
  const capPct = cap > 0 ? Math.min(100, Math.round((filled / cap) * 100)) : 0;
  const st = STATUS[course.status] ?? STATUS.active;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-brand-500" />
              <h3 className="truncate text-base font-semibold text-slate-900 group-hover:text-brand-600">
                {course.course_name}
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="rounded bg-slate-100 px-1.5 py-0.5">{course.subject ?? "—"}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5">{course.level ?? "—"}</span>
              {course.department_name && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{course.department_name}</span>
              )}
            </div>
          </div>
          <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", st.cls, st.ring)}>
            {st.label}
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
            {course.start_date ? formatDate(course.start_date) : "—"}
          </span>
          <span className="font-semibold text-amber-600">{formatCurrency(course.fee)}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs">
          <div>
            <div className="font-semibold text-slate-800">{course.active_enrolled}</div>
            <div className="text-[11px] text-slate-500">在读</div>
          </div>
          <div>
            <div className="font-semibold text-slate-800">{course.attendance_rate}%</div>
            <div className="text-[11px] text-slate-500">出勤率</div>
          </div>
          <div>
            <div className="font-semibold text-slate-800">{formatCurrency(course.total_revenue).replace("¥ ", "¥")}</div>
            <div className="text-[11px] text-slate-500">累计收入</div>
          </div>
        </div>
      </button>
      <CourseManageModal open={open} onClose={() => setOpen(false)} course={course} />
    </>
  );
}
