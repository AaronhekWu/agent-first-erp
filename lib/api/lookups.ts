import { createServerSupabase } from "@/lib/supabase/server";

export interface Counselor {
  id: string;
  display_name: string;
  primary_role: string | null;
  department_id: string | null;
}

export interface Department {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface Lookups {
  counselors: Counselor[];
  departments: Department[];
  roles: Role[];
  schools: string[];
  grades: string[];
}

export async function getLookups(): Promise<Lookups> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("rpc_get_lookups");
  if (error) throw error;
  const v = (data ?? {}) as Partial<Lookups>;
  return {
    counselors: v.counselors ?? [],
    departments: v.departments ?? [],
    roles: v.roles ?? [],
    schools: v.schools ?? [],
    grades: v.grades ?? [],
  };
}
