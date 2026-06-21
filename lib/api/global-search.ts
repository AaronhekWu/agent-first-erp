import { createServerSupabase } from "@/lib/supabase/server";
import { maskPhone } from "@/lib/format";

export type SearchKind = "student" | "course" | "staff" | "department";

export interface GlobalSearchItem {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  meta: string | null;
  href: string;
}

export interface GlobalSearchGroup {
  kind: SearchKind;
  label: string;
  total: number;
  items: GlobalSearchItem[];
}

export interface GlobalSearchResponse {
  query: string;
  total: number;
  groups: GlobalSearchGroup[];
}

interface StudentResult {
  id: string;
  name: string;
  student_code: string | null;
  phone: string | null;
  school: string | null;
  grade: string | null;
  counselor_name: string | null;
}

interface CourseResult {
  course_id: string;
  course_name: string;
  subject: string | null;
  level: string | null;
  department_name: string | null;
  status: string;
}

interface StaffResult {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  primary_role: string | null;
  department_name: string | null;
}

interface DepartmentResult {
  id: string;
  name: string;
  description: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "系统管理员",
  counselor: "课程顾问",
  teacher: "教师",
  viewer: "只读用户",
};

export async function globalSearch(rawQuery: string, limitPerGroup = 8, offset = 0): Promise<GlobalSearchResponse> {
  const query = rawQuery.trim().slice(0, 80);
  if (!query) return emptyResponse("");
  const safeQuery = query.replace(/[%_(),]/g, " ").trim();
  if (!safeQuery) return emptyResponse(query);
  const pattern = `%${safeQuery}%`;
  const sb = createServerSupabase();

  const [students, courses, staff, departments] = await Promise.all([
    sb
      .from("v_student_overview")
      .select("id, name, student_code, phone, school, grade, counselor_name", { count: "exact" })
      .neq("status", "inactive")
      .or(`name.ilike.${pattern},phone.ilike.${pattern},student_code.ilike.${pattern},school.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limitPerGroup - 1),
    sb
      .from("v_course_stats")
      .select("course_id, course_name, subject, level, department_name, status", { count: "exact" })
      .eq("is_archived", false)
      .or(`course_name.ilike.${pattern},subject.ilike.${pattern},level.ilike.${pattern},department_name.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limitPerGroup - 1),
    sb
      .from("v_staff_overview")
      .select("id, display_name, phone, email, primary_role, department_name", { count: "exact" })
      .eq("is_active", true)
      .or(`display_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},department_name.ilike.${pattern}`)
      .order("display_name")
      .range(offset, offset + limitPerGroup - 1),
    sb
      .from("acct_departments")
      .select("id, name, description", { count: "exact" })
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .order("sort_order")
      .range(offset, offset + limitPerGroup - 1),
  ]);

  const errors = [students.error, courses.error, staff.error, departments.error].filter(Boolean);
  if (errors.length > 0) {
    console.error("Global search failed", errors);
    throw new Error("搜索服务暂时不可用");
  }

  const groups: GlobalSearchGroup[] = [
    {
      kind: "student",
      label: "学员",
      total: students.count ?? 0,
      items: ((students.data ?? []) as StudentResult[]).map((row) => ({
        kind: "student",
        id: row.id,
        title: row.name,
        subtitle: [row.student_code, row.school, row.grade].filter(Boolean).join(" · ") || "学员资料",
        meta: row.counselor_name ? `顾问 ${row.counselor_name}` : null,
        href: `/students/${row.id}`,
      })),
    },
    {
      kind: "course",
      label: "课程",
      total: courses.count ?? 0,
      items: ((courses.data ?? []) as CourseResult[]).map((row) => ({
        kind: "course",
        id: row.course_id,
        title: row.course_name,
        subtitle: [row.subject, row.level, row.department_name].filter(Boolean).join(" · ") || "课程资料",
        meta: row.status === "archived" ? "已结课" : "课程管理",
        href: `/courses?course=${row.course_id}`,
      })),
    },
    {
      kind: "staff",
      label: "员工与顾问",
      total: staff.count ?? 0,
      items: ((staff.data ?? []) as StaffResult[]).map((row) => ({
        kind: "staff",
        id: row.id,
        title: row.display_name,
        subtitle: [ROLE_LABEL[row.primary_role ?? ""] ?? row.primary_role, row.department_name].filter(Boolean).join(" · ") || "员工资料",
        meta: row.phone ? maskPhone(row.phone) : row.email,
        href: `/campus?tab=staff&q=${encodeURIComponent(row.display_name)}`,
      })),
    },
    {
      kind: "department",
      label: "部门",
      total: departments.count ?? 0,
      items: ((departments.data ?? []) as DepartmentResult[]).map((row) => ({
        kind: "department",
        id: row.id,
        title: row.name,
        subtitle: row.description ?? "组织部门",
        meta: null,
        href: "/campus?tab=departments",
      })),
    },
  ];

  return {
    query,
    total: groups.reduce((sum, group) => sum + group.total, 0),
    groups,
  };
}

function emptyResponse(query: string): GlobalSearchResponse {
  return {
    query,
    total: 0,
    groups: [
      { kind: "student", label: "学员", total: 0, items: [] },
      { kind: "course", label: "课程", total: 0, items: [] },
      { kind: "staff", label: "员工与顾问", total: 0, items: [] },
      { kind: "department", label: "部门", total: 0, items: [] },
    ],
  };
}
