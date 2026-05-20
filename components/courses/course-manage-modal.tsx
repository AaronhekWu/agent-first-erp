"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Users, UserPlus, LogOut, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { listCourseEnrollments } from "@/lib/api/courses-client";
import type { CourseEnrollment, CourseRow } from "@/lib/api/courses";
import { RosterTab } from "./roster-tab";
import { EnrollTab } from "./enroll-tab";
import { AttendanceTab } from "./attendance-tab";

interface Props {
  open: boolean;
  onClose: () => void;
  course: CourseRow;
}

const TABS = [
  { key: "roster", label: "班级花名册", Icon: Users },
  { key: "enroll", label: "添加学员", Icon: UserPlus },
  { key: "attendance", label: "每日点名", Icon: CalendarCheck },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function CourseManageModal({ open, onClose, course }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("roster");
  const [classDate, setClassDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listCourseEnrollments(course.course_id, classDate);
      setEnrollments(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [open, course.course_id, classDate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleMutation = async () => {
    await reload();
    router.refresh();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 p-6">
      <div className="flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{course.course_name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {course.subject ?? "—"} · {course.level ?? "—"} · 容量 {course.active_enrolled}/
              {course.max_capacity ?? "∞"} · 学费 ¥{Number(course.fee).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-100 px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "relative inline-flex items-center gap-1.5 px-4 py-3 text-sm transition-colors",
                tab === t.key ? "text-brand-600 font-medium" : "text-slate-500 hover:text-slate-700",
              )}
            >
              <t.Icon className="h-4 w-4" />
              {t.label}
              {tab === t.key && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-brand-600" />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="grid place-items-center py-10 text-sm text-slate-400">加载中…</div>
          )}
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
          )}
          {!loading && !error && (
            <>
              {tab === "roster" && (
                <RosterTab
                  enrollments={enrollments}
                  course={course}
                  onMutate={handleMutation}
                />
              )}
              {tab === "enroll" && (
                <EnrollTab
                  course={course}
                  enrollments={enrollments}
                  onMutate={handleMutation}
                />
              )}
              {tab === "attendance" && (
                <AttendanceTab
                  enrollments={enrollments.filter((e) => e.status === "enrolled")}
                  classDate={classDate}
                  setClassDate={setClassDate}
                  onMutate={handleMutation}
                />
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-3 text-right">
          <button
            onClick={onClose}
            className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// Re-export for compat (other files may import from here)
export { LogOut };
