import { getCourseLifecycle } from "@/lib/course-lifecycle";
import type { CourseRow } from "@/lib/api/courses";

export const COURSE_SORT_OPTIONS = [
  { value: "default", label: "默认：活跃优先 · 最新创建" },
  { value: "newest", label: "创建时间：最新在前" },
  { value: "oldest", label: "创建时间：最早在前" },
  { value: "name", label: "课程名称" },
  { value: "active_enrollments", label: "在读人数：从多到少" },
] as const;

export type CourseSort = (typeof COURSE_SORT_OPTIONS)[number]["value"];

export const STUDENT_SORT_OPTIONS = [
  { value: "default", label: "默认：在读优先 · 最新创建" },
  { value: "newest", label: "创建时间：最新在前" },
  { value: "oldest", label: "创建时间：最早在前" },
  { value: "name", label: "学员姓名" },
  { value: "active_courses", label: "在读课程：从多到少" },
] as const;

export type StudentSort = (typeof STUDENT_SORT_OPTIONS)[number]["value"];

export function parseCourseSort(value?: string): CourseSort {
  return COURSE_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as CourseSort)
    : "default";
}

export function parseStudentSort(value?: string): StudentSort {
  return STUDENT_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as StudentSort)
    : "default";
}

function createdAt(course: CourseRow) {
  const value = Date.parse(course.created_at);
  return Number.isFinite(value) ? value : 0;
}

function courseActivityPriority(course: CourseRow) {
  const lifecycle = getCourseLifecycle(course);
  if (lifecycle === "enrolling" || lifecycle === "full") return 0;
  if (lifecycle === "ready_to_complete" || lifecycle === "paused") return 1;
  return 2;
}

export function sortCourses(courses: CourseRow[], sort: CourseSort): CourseRow[] {
  return [...courses].sort((a, b) => {
    if (sort === "default") {
      const activity = courseActivityPriority(a) - courseActivityPriority(b);
      if (activity !== 0) return activity;
      return createdAt(b) - createdAt(a) || b.course_id.localeCompare(a.course_id);
    }
    if (sort === "newest") {
      return createdAt(b) - createdAt(a) || b.course_id.localeCompare(a.course_id);
    }
    if (sort === "oldest") {
      return createdAt(a) - createdAt(b) || a.course_id.localeCompare(b.course_id);
    }
    if (sort === "name") {
      return a.course_name.localeCompare(b.course_name, "zh-CN", { numeric: true })
        || createdAt(b) - createdAt(a);
    }
    return Number(b.active_enrolled ?? 0) - Number(a.active_enrolled ?? 0)
      || createdAt(b) - createdAt(a)
      || b.course_id.localeCompare(a.course_id);
  });
}
