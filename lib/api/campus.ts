import { createServerSupabase } from "@/lib/supabase/server";

export interface StaffRow {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  primary_role: string | null;
  permissions: string[] | null;
  is_active: boolean;
  department_id: string | null;
  department_name: string | null;
  manager_id: string | null;
  is_dept_manager: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentDetail {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  manager_id: string | null;
  sort_order: number | null;
  created_at: string;
}

export async function listStaff(): Promise<StaffRow[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("v_staff_overview")
    .select("*")
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as StaffRow[];
}

export async function listDepartmentsDetail(): Promise<DepartmentDetail[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("acct_departments")
    .select("id, name, description, parent_id, manager_id, sort_order, created_at")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as DepartmentDetail[];
}
