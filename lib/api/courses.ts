import { createServerSupabase } from "@/lib/supabase/server";

// ---------- 类型 (服务端 / 客户端共用) ----------

export interface CourseRow {
  course_id: string;
  course_name: string;
  subject: string | null;
  level: string | null;
  status: string;
  max_capacity: number | null;
  fee: number;
  department_id: string | null;
  department_name: string | null;
  total_enrolled: number;
  active_enrolled: number;
  completed_count: number;
  total_attendance: number;
  present_count: number;
  attendance_rate: number;
  completed_sessions: number;
  total_lessons: number | null;
  is_archived: boolean;
  total_revenue: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface CourseEnrollment {
  enrollment_id: string;
  student_id: string;
  student_name: string;
  student_code: string | null;
  student_phone: string | null;
  status: "enrolled" | "completed" | "transferred" | "cancelled";
  unit_price: number;
  total_lessons: number | null;
  consumed_lessons: number | null;
  remaining_lessons: number | null;
  balance: number;
  today_attendance_id: string | null;
  today_status: string | null;
  enrolled_at: string;
}

export interface ActiveCourseOption {
  id: string;
  name: string;
  subject: string | null;
  level: string | null;
}

export interface StudentSearchResult {
  id: string;
  name: string;
  student_code: string | null;
  phone: string | null;
  status: string;
}

// ---------- 服务端 ----------

export async function listCourses(): Promise<CourseRow[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("v_course_stats")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CourseRow[];
}
