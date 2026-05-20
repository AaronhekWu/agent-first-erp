import { createServerSupabase } from "@/lib/supabase/server";

export interface StudentDetail {
  student: {
    id: string;
    name: string;
    student_code?: string | null;
    phone?: string | null;
    email?: string | null;
    gender?: string | null;
    birth_date?: string | null;
    school?: string | null;
    grade?: string | null;
    status: string;
    source?: string | null;
    notes?: string | null;
    counselor_name?: string | null;
    department_name?: string | null;
    created_at: string;
    updated_at: string;
  };
  account: {
    id: string;
    balance: number;
    total_recharged: number;
    total_consumed: number;
    total_refunded: number;
    frozen_amount: number;
    status: string;
  } | null;
  parents: Array<{
    id: string;
    name?: string | null;
    phone?: string | null;
    relation?: string | null;
  }>;
  enrollments: Array<{
    id: string;
    course_id: string;
    course_name?: string | null;
    status: string;
    created_at: string;
    total_lessons?: number | null;
    used_lessons?: number | null;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balance_before: number;
    balance_after: number;
    description?: string | null;
    created_at: string;
  }>;
  followups: Array<{
    id: string;
    type: string;
    content?: string | null;
    result?: string | null;
    next_plan?: string | null;
    next_date?: string | null;
    creator_name?: string | null;
    created_at: string;
  }>;
}

export async function getStudentDetail(id: string): Promise<StudentDetail | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("rpc_get_student_lifecycle", {
    p_student_id: id,
  });
  if (error) throw error;
  return (data as StudentDetail | null) ?? null;
}
