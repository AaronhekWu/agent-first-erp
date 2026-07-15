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
 * 可结课判定 — 仅两种情况允许发起结课审批:
 *   (1) 学期结束 (end_date 已过) 且所有在读学员课时消完 (在读剩余课时合计为 0);
 *   (2) 课程内学员已全部退课 / 转课清空 (无在读报名)。
 */
export function canCompleteCourse(course: CourseRow): { ok: boolean; reason: string | null } {
  const today = new Date().toISOString().slice(0, 10);
  const ended = Boolean(course.end_date && course.end_date < today);
  const remaining = Number(course.enrolled_remaining_lessons ?? 0);
  if (course.active_enrolled === 0) return { ok: true, reason: null };
  if (ended && remaining <= 0) return { ok: true, reason: null };
  if (!ended && remaining > 0)
    return { ok: false, reason: `学期未结束且在读学员还剩 ${remaining} 课时未消` };
  if (!ended) return { ok: false, reason: "学期尚未结束（结束日期未到）" };
  return { ok: false, reason: `在读学员还剩 ${remaining} 课时未消，需消完或办理退课/转课` };
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
