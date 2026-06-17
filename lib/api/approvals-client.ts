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
