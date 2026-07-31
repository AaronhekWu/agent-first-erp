import { createServerSupabase } from "@/lib/supabase/server";

export interface Counselor {
  id: string;
  display_name: string;
  primary_role: string | null;
  department_id: string | null;
}

export type HomeroomTeacher = Counselor;

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
  homeroomTeachers: HomeroomTeacher[];
  departments: Department[];
  roles: Role[];
  schools: string[];
  grades: string[];
}

export async function getLookups(): Promise<Lookups> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("rpc_get_lookups");
  if (error) throw error;
  const v = (data ?? {}) as Partial<Lookups> & { homeroom_teachers?: HomeroomTeacher[] };
  return {
    counselors: v.counselors ?? [],
    homeroomTeachers: v.homeroom_teachers ?? v.homeroomTeachers ?? [],
    // 顶层(根)部门是公司主体, 不作为学员/课程的归属选项展示
    departments: (v.departments ?? []).filter((d) => d.parent_id !== null),
    roles: v.roles ?? [],
    schools: v.schools ?? [],
    grades: v.grades ?? [],
  };
}
