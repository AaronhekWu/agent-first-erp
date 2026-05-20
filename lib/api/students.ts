import { createServerSupabase } from "@/lib/supabase/server";

export type { Counselor, Department, Role, Lookups } from "./lookups";
export { getLookups } from "./lookups";

export type StudentStatus = "active" | "inactive" | "graduated";

export interface StudentRow {
  id: string;
  student_code: string | null;
  name: string;
  phone: string | null;
  gender: string | null;
  status: StudentStatus;
  school: string | null;
  grade: string | null;
  source: string | null;
  department_id: string | null;
  department_name: string | null;
  assigned_to: string | null;
  counselor_name: string | null;
  balance: number;
  total_recharged: number;
  total_consumed: number;
  enrollment_count: number;
  active_enrollment_count: number;
  last_followup_at: string | null;
  last_followup_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentFilters {
  keyword?: string;
  status?: StudentStatus | "";
  counselorId?: string;
  school?: string;
  grade?: string;
  departmentId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface StudentListResult {
  rows: StudentRow[];
  total: number;
}

export interface StudentKPIs {
  total: { value: number; delta_pct: number | null };
  active: { value: number; ratio_pct: number | null };
  new_week: { value: number; delta: number };
  pending: { value: number; delta: number };
}

export async function listStudents(
  filters: StudentFilters,
  page: number,
  pageSize: number,
): Promise<StudentListResult> {
  const sb = createServerSupabase();
  let q = sb
    .from("v_student_overview")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.keyword) {
    const kw = `%${filters.keyword}%`;
    q = q.or(`name.ilike.${kw},phone.ilike.${kw}`);
  }
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.counselorId) q = q.eq("assigned_to", filters.counselorId);
  if (filters.school) q = q.eq("school", filters.school);
  if (filters.grade) q = q.eq("grade", filters.grade);
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  if (filters.createdFrom) q = q.gte("created_at", filters.createdFrom);
  if (filters.createdTo) q = q.lte("created_at", filters.createdTo);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await q.range(from, to);
  if (error) throw error;
  return { rows: (data ?? []) as StudentRow[], total: count ?? 0 };
}

export async function getStudentKpis(): Promise<StudentKPIs> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("rpc_get_student_query_kpis");
  if (error) throw error;
  return data as StudentKPIs;
}

// Counselors/departments/schools/grades 现统一来自 rpc_get_lookups (见 ./lookups)
