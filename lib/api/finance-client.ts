"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { ActiveEnrollment } from "./finance";

export async function listActiveEnrollmentsClient(studentId: string): Promise<ActiveEnrollment[]> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("crs_enrollments")
    .select("id, course_id, unit_price, remaining_lessons, crs_courses!inner(name)")
    .eq("student_id", studentId)
    .eq("status", "enrolled");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{
    id: string;
    course_id: string;
    unit_price: number;
    remaining_lessons: number | null;
    crs_courses: { name: string };
  }>).map((r) => ({
    id: r.id,
    course_id: r.course_id,
    course_name: r.crs_courses.name,
    unit_price: r.unit_price,
    remaining_lessons: r.remaining_lessons,
  }));
}
