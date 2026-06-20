import type { CourseRow } from "@/lib/api/courses";

export type CourseLifecycle = "enrolling" | "full" | "ready_to_complete" | "paused" | "completed";

export function getCourseLifecycle(course: CourseRow): CourseLifecycle {
  if (course.status === "archived") return "completed";
  if (course.status === "inactive") return "paused";
  const totalLessons = course.total_lessons ?? 0;
  const completedSessions = course.completed_sessions ?? 0;
  const ended = Boolean(course.end_date && course.end_date < new Date().toISOString().slice(0, 10));
  if ((totalLessons > 0 && completedSessions >= totalLessons) || ended) return "ready_to_complete";
  if (course.max_capacity && course.active_enrolled >= course.max_capacity) return "full";
  return "enrolling";
}

export function lessonProgress(course: CourseRow) {
  const completed = course.completed_sessions ?? 0;
  const total = course.total_lessons ?? null;
  return {
    completed,
    total,
    remaining: total == null ? null : Math.max(0, total - completed),
    percentage: total && total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
  };
}
