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

/**
 * 可结课判定：课程已经上完或到达结束日期，并且所有未退课、未转课学员的剩余课时均为 0。
 * 结课后直接归档，不再进入审批流程。
 */
export function canCompleteCourse(course: CourseRow): { ok: boolean; reason: string | null } {
  const today = new Date().toISOString().slice(0, 10);
  const ended = Boolean(course.end_date && course.end_date < today);
  const lessonsFinished = Boolean(course.total_lessons && course.completed_sessions >= course.total_lessons);
  const unsettled = Number(course.unsettled_enrollment_count ?? (Number(course.enrolled_remaining_lessons) === 0 ? 0 : 1));
  if (!ended && !lessonsFinished) return { ok: false, reason: "课程尚未上完（未到结束日期且计划课次未完成）" };
  if (unsettled > 0) return { ok: false, reason: `还有 ${unsettled} 名学员的剩余课时不为 0` };
  return { ok: true, reason: null };
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
