import { createServerSupabase } from "@/lib/supabase/server";

export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  parent_id: string | null;
  created_at: string;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: unknown;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export async function listDepartmentsFull(): Promise<DepartmentRow[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("acct_departments")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DepartmentRow[];
}

export async function listRoles(): Promise<RoleRow[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("acct_roles")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as RoleRow[];
}

export async function listProfiles(): Promise<ProfileRow[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("acct_profiles")
    .select("id, display_name, phone, avatar_url, is_active")
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}
