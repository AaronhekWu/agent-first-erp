"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export type ApprovalType =
  | "student_delete"
  | "course_archive"
  | "course_delete"
  | "enrollment_drop"
  | "enrollment_transfer"
  | "finance_refund"
  | "finance_consume"
  | "finance_txn_delete"
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
    const message = error.message;
    throw new Error(
      message.includes("Could not find the function")
        ? "审批后端尚未部署：缺少 rpc_create_approval_request，未执行原始操作。"
        : message.includes("only active students")
          ? "该学员已停用，不能重复提交删除审批。"
          : message.includes("already pending")
            ? "该对象已有待处理审批，请勿重复提交。"
            : message.includes(":")
              ? message.split(":").slice(1).join(":").trim()
              : message,
    );
  }
  return data;
}

/**
 * 拉取所有「待审批」对象的 target_id (学员/报名/课程等), 供前端把相关操作按钮置灰,
 * 防止多人对同一对象并发冲突操作。失败时返回空集 (不阻塞操作)。
 */
export async function getLockedTargets(): Promise<Set<string>> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_get_locked_targets");
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data as string[]);
}

export interface ReviewApprovalResult {
  ok: boolean;
  status: "approved" | "rejected" | "pending";
  error?: string;
  execution?: Record<string, unknown>;
}

export async function reviewApproval(
  id: string,
  status: "approved" | "rejected",
  reviewerNote?: string,
) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_review_approval", {
    p_id: id,
    p_status: status,
    p_reviewer_note: reviewerNote?.trim() || null,
  });
  if (error) throw new Error(error.message);

  const result = data as ReviewApprovalResult;
  if (!result.ok) {
    throw new Error(result.error || "审批执行失败，申请仍保持待审批状态");
  }
  return result;
}

export async function reverseApproval(id: string, reason: string) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_reverse_approval", {
    p_id: id,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data;
}
