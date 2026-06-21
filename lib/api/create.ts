"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

/**
 * MVP 阶段所有写操作直接调用 SECURITY DEFINER RPC。
 * Edge Function 仅保留给复杂场景（外部 API 调用、缓存、插件、复合表单）。
 */
async function callRpc(rpcName: string, args: Record<string, unknown>): Promise<unknown> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc(rpcName, args);
  if (error) throw new Error(error.message);
  return data;
}

// ============== 学员 ==============
export interface CreateStudentInput {
  p_name: string;
  p_phone?: string | null;
  p_gender?: string | null;
  p_birth_date?: string | null;
  p_email?: string | null;
  p_school?: string | null;
  p_grade?: string | null;
  p_source?: string | null;
  p_notes?: string | null;
  p_assigned_to?: string | null;
  p_department_id?: string | null;
  p_operator_id?: string | null;
  p_parent_name?: string | null;
  p_parent_phone?: string | null;
  p_parent_relation?: string | null;
}

export function createStudent(input: CreateStudentInput) {
  return callRpc("rpc_create_student", { ...input });
}

export function graduateStudent(input: { p_student_id: string; p_graduated_at: string; p_note?: string | null }) {
  return callRpc("rpc_graduate_student", { ...input });
}

export function reactivateStudent(input: { p_student_id: string; p_reason: string }) {
  return callRpc("rpc_reactivate_student", { ...input });
}

// ============== 课程 ==============
export interface CreateCourseInput {
  p_name: string;
  p_subject: string;
  p_level: string;
  p_description?: string | null;
  p_max_capacity?: number | null;
  p_fee?: number | null;
  p_start_date?: string | null;
  p_end_date?: string | null;
  p_schedule_info?: Record<string, unknown> | null;
  p_department_id?: string | null;
  p_operator_id?: string | null;
}

export function createCourse(input: CreateCourseInput) {
  return callRpc("rpc_create_course", { ...input });
}

// ============== 员工 / 部门 / 公司 ==============
export interface StaffInput {
  p_id?: string | null;
  p_display_name: string;
  p_phone?: string | null;
  p_email?: string | null;
  p_primary_role?: string | null;
  p_department_id?: string | null;
  p_permissions?: unknown;
}
export function upsertStaff(input: StaffInput) {
  return callRpc("rpc_upsert_staff", { ...input });
}
export function deleteStaff(p_id: string) {
  return callRpc("rpc_delete_staff", { p_id });
}

export interface DepartmentInput {
  p_id?: string | null;
  p_name: string;
  p_description?: string | null;
  p_parent_id?: string | null;
  p_manager_id?: string | null;
  p_sort_order?: number | null;
}
export function upsertDepartment(input: DepartmentInput) {
  return callRpc("rpc_upsert_department", { ...input });
}
export function deleteDepartment(p_id: string) {
  return callRpc("rpc_delete_department", { p_id });
}

export interface CompanyInput {
  p_name?: string | null;
  p_slogan?: string | null;
  p_contact_phone?: string | null;
  p_contact_email?: string | null;
  p_address?: string | null;
  p_logo_url?: string | null;
}
export function updateCompany(input: CompanyInput) {
  return callRpc("rpc_update_company", { ...input });
}

// ============== 学员生命周期 ==============
export interface RechargeInput {
  p_student_id: string;
  p_amount: number;
  p_payment_method: string;
  p_operator_id?: string | null;
  p_campaign_id?: string | null;
  p_bonus_amount?: number | null;
  p_notes?: string | null;
  p_payment_ref?: string | null;
}
export function recharge(input: RechargeInput) {
  return callRpc("rpc_recharge", { ...input });
}

export interface RefundInput {
  p_student_id: string;
  p_amount: number;
  p_reason: string;
  p_operator_id?: string | null;
}
export function refund(input: RefundInput) {
  return callRpc("rpc_refund", { ...input });
}

export interface ConsumeLessonInput {
  p_enrollment_id: string;
  p_lesson_count: number;
  p_unit_price?: number | null;
  p_operator_id?: string | null;
  p_attendance_id?: string | null;
}
export function consumeLesson(input: ConsumeLessonInput) {
  return callRpc("rpc_consume_lesson", { ...input });
}

export interface EnrollStudentInput {
  p_student_id: string;
  p_course_id: string;
  p_operator_id?: string | null;
  p_price_id?: string | null;
  p_campaign_id?: string | null;
  p_notes?: string | null;
  p_source?: string | null;
  p_custom_discount_type?: string | null;
  p_custom_discount_value?: number | null;
  p_discount_reason?: string | null;
  p_referrer_student_id?: string | null;
}
export function enrollStudent(input: EnrollStudentInput) {
  return callRpc("rpc_enroll_student_v2", { ...input });
}

export interface DropEnrollmentInput {
  p_enrollment_id: string;
  p_refund_remaining?: boolean;
  p_reason?: string | null;
  p_operator_id?: string | null;
}
export function dropEnrollment(input: DropEnrollmentInput) {
  return callRpc("rpc_drop_enrollment", { ...input });
}

export interface TransferEnrollmentInput {
  p_source_enrollment_id: string;
  p_target_course_id: string;
  p_carry_lessons: number;
  p_reason?: string | null;
  p_operator_id?: string | null;
}
export function transferEnrollment(input: TransferEnrollmentInput) {
  return callRpc("rpc_transfer_enrollment", { ...input });
}

export interface MarkAttendanceInput {
  p_enrollment_id: string;
  p_class_date: string;
  p_status: "present" | "absent" | "late" | "leave";
  p_operator_id?: string | null;
  p_trigger_consume?: boolean;
  p_notes?: string | null;
}
export function markAttendance(input: MarkAttendanceInput) {
  return callRpc("rpc_mark_attendance", { ...input });
}

export interface UpdateAttendanceInput {
  p_attendance_id: string;
  p_status: "present" | "absent" | "late" | "leave";
  p_notes?: string | null;
  p_trigger_consume?: boolean;
  p_operator_id?: string | null;
}
export function updateAttendance(input: UpdateAttendanceInput) {
  return callRpc("rpc_update_attendance", { ...input });
}

// ============== 跟进 ==============
export interface CreateFollowupInput {
  p_student_id: string;
  p_type: "phone" | "wechat" | "visit" | "other";
  p_content: string;
  p_result?: string | null;
  p_next_plan?: string | null;
  p_next_date?: string | null;
  p_operator_id?: string | null;
}
export function createFollowup(input: CreateFollowupInput) {
  return callRpc("rpc_create_followup", { ...input });
}
