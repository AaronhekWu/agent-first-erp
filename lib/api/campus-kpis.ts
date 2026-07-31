import { createServerSupabase } from "@/lib/supabase/server";

export interface CampusStaffKpi {
  staff_id: string;
  name: string;
  role: string;
  assigned_students: number;
  followup_actions: number;
  homeroom_courses: number;
  attendance_actions: number;
  actual_person_times: number;
  consumed_lessons: number;
  consumed_amount: number;
  attendance_rate: number | null;
}

export interface CampusCourseKpi {
  course_id: string;
  course_name: string;
  homeroom_teacher: string | null;
  active_enrolled: number;
  completed_sessions: number;
  actual_person_times: number;
  consumed_lessons: number;
  consumed_amount: number;
  attendance_rate: number | null;
}

export interface CampusDailyKpi {
  day: string;
  followups: number;
  attendance_actions: number;
  actual_person_times: number;
  consumed_lessons: number;
  consumed_amount: number;
}

export interface CampusKpis {
  period: { from: string; to: string };
  staff: CampusStaffKpi[];
  courses: CampusCourseKpi[];
  daily: CampusDailyKpi[];
  source_updated_at: string;
}

export async function getCampusKpis(from: string, to: string): Promise<CampusKpis> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("rpc_get_campus_kpis", { p_from: from, p_to: to });
  if (error) throw error;
  const value = data as Partial<CampusKpis>;
  return {
    period: value.period ?? { from, to },
    staff: value.staff ?? [],
    courses: value.courses ?? [],
    daily: value.daily ?? [],
    source_updated_at: value.source_updated_at ?? new Date().toISOString(),
  };
}
