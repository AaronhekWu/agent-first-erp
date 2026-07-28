import { createServerSupabase } from "@/lib/supabase/server";
import type { LessonLot } from "@/lib/api/courses";

export interface StudentEnrollment {
  id: string;
  course_id: string;
  course_name?: string | null;
  subject?: string | null;
  status: string;
  source?: string | null;
  original_enrollment_id?: string | null;
  original_course_name?: string | null;
  created_at: string;
  enrolled_at?: string | null;
  unit_price?: number | null;
  list_unit_price?: number | null;
  total_amount?: number | null;
  gross_amount?: number | null;
  discount_amount?: number | null;
  discount_reason?: string | null;
  total_lessons?: number | null;
  consumed_lessons?: number | null;
  remaining_lessons?: number | null;
  notes?: string | null;
  lesson_lots: LessonLot[];
}

export interface StudentEnrollmentEvent {
  enrollment_id: string;
  event_type: "enrollment" | "transfer";
  event_at: string;
  course_id: string;
  course_name: string;
  original_course_id?: string | null;
  original_course_name?: string | null;
  total_lessons?: number | null;
  total_amount?: number | null;
  status: string;
  notes?: string | null;
}

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
    graduated_at?: string | null;
    graduation_note?: string | null;
    reactivated_at?: string | null;
    reactivation_note?: string | null;
    source?: string | null;
    notes?: string | null;
    counselor_name?: string | null;
    department_name?: string | null;
    assigned_to?: string | null;
    department_id?: string | null;
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
    relationship?: string | null;
    is_primary_contact?: boolean | null;
  }>;
  enrollments: StudentEnrollment[];
  enrollment_events: StudentEnrollmentEvent[];
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balance_before: number;
    balance_after: number;
    description?: string | null;
    reference_type?: string | null;
    reference_id?: string | null;
    metadata?: Record<string, unknown> | null;
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
  financial_profile?: StudentFinancialProfile | null;
}

export interface StudentFinancialBatch {
  id: string;
  source_type: LessonLot["source_type"];
  total_lessons: number;
  consumed_lessons: number;
  remaining_lessons: number;
  unit_price: number;
  total_amount: number;
  locked_amount: number;
  unfunded_amount: number;
  notes: string | null;
  enrolled_at: string;
}

export interface StudentFinancialCourse {
  enrollment_id: string;
  course_id: string;
  course_name: string;
  status: string;
  total_lessons: number;
  consumed_lessons: number;
  remaining_lessons: number;
  contract_amount: number;
  locked_amount: number;
  remaining_value: number;
  historical_unfunded: number;
  batches: StudentFinancialBatch[];
}

export interface StudentFinancialProfile {
  account: {
    balance: number;
    frozen_amount: number;
    available_balance: number;
    total_recharged: number;
    total_consumed: number;
    total_refunded: number;
    historical_unfunded: number;
  };
  courses: StudentFinancialCourse[];
}

export async function getStudentDetail(id: string): Promise<StudentDetail | null> {
  const sb = createServerSupabase();
  const [lifecycle, profile] = await Promise.all([
    sb.rpc("rpc_get_student_lifecycle", { p_student_id: id }),
    sb.rpc("rpc_get_student_financial_profile", { p_student_id: id }),
  ]);
  if (lifecycle.error) throw lifecycle.error;
  if (profile.error) throw profile.error;
  const detail = (lifecycle.data as StudentDetail | null) ?? null;
  if (!detail) return null;
  const financialProfile = (profile.data as StudentFinancialProfile | null) ?? null;
  const financialByEnrollment = new Map(
    (financialProfile?.courses ?? []).map((course) => [course.enrollment_id, course]),
  );
  let transactions = detail.transactions;
  if (detail.account?.id) {
    const ledger = await sb
      .from("fin_transactions")
      .select(
        "id, type, amount, balance_before, balance_after, description, reference_type, reference_id, metadata, created_at",
      )
      .eq("account_id", detail.account.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (ledger.error) throw ledger.error;
    transactions = (ledger.data ?? []) as StudentDetail["transactions"];
  }
  return {
    ...detail,
    enrollments: detail.enrollments.map((enrollment) => ({
      ...enrollment,
      lesson_lots: (financialByEnrollment.get(enrollment.id)?.batches ?? enrollment.lesson_lots)
        .map((batch) => ({
          ...batch,
          unfunded_amount: enrollment.status === "enrolled"
            ? Number(batch.unfunded_amount ?? 0)
            : 0,
        })),
    })),
    transactions: transactions.filter(
      (transaction) => !["enrollment", "lesson_purchase"].includes(transaction.type)
        && transaction.metadata?.domain !== "course_contract",
    ),
    financial_profile: financialProfile,
  };
}
