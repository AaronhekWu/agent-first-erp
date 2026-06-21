"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type {
  ActiveCourseOption,
  CourseEnrollment,
  CoursePricePlan,
  EnrollmentCampaign,
  StudentSearchResult,
} from "./courses";

export async function getEnrollmentPricingOptions(courseId: string) {
  const sb = getSupabaseBrowser();
  const today = new Date().toISOString().slice(0, 10);
  const [plans, campaigns] = await Promise.all([
    sb.from("crs_course_prices")
      .select("id, course_id, name, unit_price, total_lessons, total_price, is_default")
      .eq("course_id", courseId).eq("status", "active")
      .or(`effective_from.is.null,effective_from.lte.${today}`)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("is_default", { ascending: false }),
    sb.from("promo_campaigns")
      .select("id, name, type, description, discount_type, discount_value, gift_lessons, applicable_course_ids")
      .eq("status", "active")
      .in("type", ["enrollment_discount", "course_discount", "referral"])
      .or(`start_date.is.null,start_date.lte.${today}`)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("name"),
  ]);
  if (plans.error) throw new Error(plans.error.message);
  if (campaigns.error) throw new Error(campaigns.error.message);
  return {
    plans: (plans.data ?? []) as CoursePricePlan[],
    campaigns: ((campaigns.data ?? []) as EnrollmentCampaign[]).filter((campaign) => {
      const ids = campaign.applicable_course_ids ?? [];
      return ids.length === 0 || ids.includes(courseId);
    }),
  };
}

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
  unitPrice: number;
  startDate: string;
  endDate: string;
}) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_update_course_plan_v2", {
    p_course_id: input.courseId,
    p_total_lessons: input.totalLessons,
    p_unit_price: input.unitPrice,
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
    .eq("status", "active")
    .or(`name.ilike.${kw},phone.ilike.${kw},student_code.ilike.${kw}`)
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as StudentSearchResult[];
}
