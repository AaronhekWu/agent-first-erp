"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export type CampaignType = "enrollment_discount" | "course_discount" | "referral";
export type CampaignDiscountType = "fixed" | "percentage" | "gift_lessons";

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  description: string | null;
  discount_type: CampaignDiscountType | null;
  discount_value: number | null;
  gift_lessons: number;
  applicable_course_ids: string[] | null;
  start_date: string | null;
  end_date: string | null;
  max_usage: number | null;
  used_count: number;
  status: "active" | "inactive";
  created_at: string;
}

export interface CampaignInput {
  name: string;
  type: CampaignType;
  description?: string | null;
  discount_type?: CampaignDiscountType | null;
  discount_value?: number | null;
  gift_lessons?: number;
  applicable_course_ids?: string[];
  start_date?: string | null;
  end_date?: string | null;
  max_usage?: number | null;
}

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  enrollment_discount: "报名优惠",
  course_discount: "课程优惠",
  referral: "老带新 / 转介绍",
};

export const CAMPAIGN_DISCOUNT_LABELS: Record<CampaignDiscountType, string> = {
  fixed: "固定减免",
  percentage: "折扣百分比",
  gift_lessons: "赠送课时",
};

export async function listCampaigns(): Promise<Campaign[]> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("promo_campaigns")
    .select(
      "id, name, type, description, discount_type, discount_value, gift_lessons, applicable_course_ids, start_date, end_date, max_usage, used_count, status, created_at",
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Campaign[];
}

function toRpcArgs(input: CampaignInput) {
  return {
    p_name: input.name.trim(),
    p_type: input.type,
    p_description: input.description?.trim() || null,
    p_discount_type: input.discount_type ?? null,
    p_discount_value: input.discount_type === "gift_lessons" ? null : input.discount_value ?? null,
    p_gift_lessons: input.discount_type === "gift_lessons" ? input.gift_lessons ?? 0 : input.gift_lessons ?? 0,
    p_applicable_course_ids: input.applicable_course_ids ?? [],
    p_start_date: input.start_date || null,
    p_end_date: input.end_date || null,
    p_max_usage: input.max_usage ?? null,
  };
}

export async function createCampaign(input: CampaignInput) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_create_campaign", toRpcArgs(input));
  if (error) throw new Error(cleanErr(error.message));
  return data;
}

export async function updateCampaign(id: string, input: CampaignInput) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_update_campaign", { p_id: id, ...toRpcArgs(input) });
  if (error) throw new Error(cleanErr(error.message));
  return data;
}

export async function setCampaignStatus(id: string, status: "active" | "inactive") {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_set_campaign_status", { p_id: id, p_status: status });
  if (error) throw new Error(cleanErr(error.message));
  return data;
}

function cleanErr(message: string): string {
  if (message.includes("PERMISSION_DENIED")) return "无权管理优惠组合，请联系管理员开通课程定价权限。";
  return message.includes(":") ? message.split(":").slice(1).join(":").trim() : message;
}
