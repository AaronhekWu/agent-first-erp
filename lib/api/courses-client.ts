"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type {
  ActiveCourseOption,
  CourseEnrollment,
  StudentSearchResult,
} from "./courses";

export async function listCourseEnrollments(
  courseId: string,
  classDate?: string,
): Promise<CourseEnrollment[]> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_list_course_enrollments", {
    p_course_id: courseId,
    p_class_date: classDate ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as CourseEnrollment[];
}

export async function listActiveCourseOptions(excludeId?: string): Promise<ActiveCourseOption[]> {
  const sb = getSupabaseBrowser();
  let q = sb
    .from("crs_courses")
    .select("id, name, subject, level")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ActiveCourseOption[];
}

export async function updateCoursePlan(input: {
  courseId: string;
  totalLessons: number;
  startDate: string | null;
  endDate: string | null;
}) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_update_course_plan", {
    p_course_id: input.courseId,
    p_total_lessons: input.totalLessons,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function setCompletedCourseArchived(courseId: string, archived: boolean) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_set_completed_course_archived", {
    p_course_id: courseId,
    p_archived: archived,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function searchStudents(keyword: string, limit = 10): Promise<StudentSearchResult[]> {
  const sb = getSupabaseBrowser();
  const kw = `%${keyword}%`;
  const { data, error } = await sb
    .from("v_student_overview")
    .select("id, name, student_code, phone, status")
    .neq("status", "inactive")
    .or(`name.ilike.${kw},phone.ilike.${kw},student_code.ilike.${kw}`)
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as StudentSearchResult[];
}
