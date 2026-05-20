import { createServerSupabase } from "@/lib/supabase/server";

export interface StudentSignals {
  student: { id: string; name: string; status: string; tenure_days: number };
  finance: {
    balance: number;
    low_balance: boolean;
    burn_rate_30d: number;
    days_left_at_rate: number | null;
    total_recharged: number;
    total_consumed: number;
  };
  attendance: {
    rate_30d: number | null;
    total_30d: number;
    present_count_30d: number;
    absent_count_30d: number;
    late_count_30d: number;
    last_class_at: string | null;
  };
  courses: Array<{
    enrollment_id: string;
    course_id: string;
    course_name: string;
    status: string;
    remaining_lessons: number | null;
    total_lessons: number | null;
    progress_pct: number;
  }>;
  followups: {
    last_followup_at: string | null;
    days_since_last: number | null;
    overdue_count: number;
  };
  risk_flags: string[];
}

export interface MonthCalendarDay {
  date: string;
  slots: Array<{
    attendance_id: string;
    enrollment_id: string;
    course_id: string;
    course_name: string;
    status: "present" | "absent" | "late" | "leave";
    notes: string | null;
    marked_at: string;
  }>;
}

export interface MonthCalendar {
  year: number;
  month: number;
  days: MonthCalendarDay[];
}

// ---------- server (Server Components) ----------

export async function getStudentSignals(studentId: string): Promise<StudentSignals> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("rpc_get_student_signals", { p_student_id: studentId });
  if (error) throw error;
  return data as StudentSignals;
}

export async function getMonthlyCalendar(
  studentId: string,
  year: number,
  month: number,
): Promise<MonthCalendar> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("rpc_get_student_monthly_calendar", {
    p_student_id: studentId,
    p_year: year,
    p_month: month,
  });
  if (error) throw error;
  return data as MonthCalendar;
}
