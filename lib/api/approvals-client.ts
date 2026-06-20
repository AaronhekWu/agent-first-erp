"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export type ApprovalType =
  | "student_delete"
  | "course_archive"
  | "course_delete"
  | "enrollment_drop"
  | "enrollment_transfer"
  | "finance_refund"
  | "department_delete"
  | "staff_deactivate";

export interface ApprovalRequestInput {
  type: ApprovalType;
  title: string;
  reason: string;
  targetId?: string | null;
  targetLabel?: string | null;
  amount?: number | null;
  payload?: Record<string, unknown>;
}

export async function requestApproval(input: ApprovalRequestInput) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_create_approval_request", {
    p_type: input.type,
    p_title: input.title,
    p_reason: input.reason,
    p_target_id: input.targetId ?? null,
    p_target_label: input.targetLabel ?? null,
    p_amount: input.amount ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) {
    throw new Error(
      error.message.includes("Could not find the function")
        ? "审批后端尚未部署：缺少 rpc_create_approval_request，未执行原始操作。"
        : error.message,
    );
  }
  return data;
}

/**
 * 审批 (仅管理员). 「通过」时后端 rpc_review_approval 按类型立即执行对应破坏性操作;
 * 「驳回」仅记录状态、不执行。
 */
export async function reviewApproval(
  id: string,
  status: "approved" | "rejected",
  note?: string,
) {
  const sb = getSupabaseBrowser();
  const { error } = await sb.rpc("rpc_review_approval", {
    p_id: id,
    p_status: status,
    p_reviewer_note: note ?? null,
  });
  if (error) {
    throw new Error(
      error.message.includes("Could not find the function")
        ? "审批后端尚未部署：缺少 rpc_review_approval。"
        : error.message,
    );
  }
}
