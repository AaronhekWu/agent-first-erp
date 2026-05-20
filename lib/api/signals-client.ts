"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { MonthCalendar, StudentSignals } from "./signals";

export async function getStudentSignalsClient(studentId: string): Promise<StudentSignals> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_get_student_signals", { p_student_id: studentId });
  if (error) throw new Error(error.message);
  return data as StudentSignals;
}

export async function getMonthlyCalendarClient(
  studentId: string,
  year: number,
  month: number,
): Promise<MonthCalendar> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_get_student_monthly_calendar", {
    p_student_id: studentId,
    p_year: year,
    p_month: month,
  });
  if (error) throw new Error(error.message);
  return data as MonthCalendar;
}
