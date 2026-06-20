"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export type NotificationKind = "approval" | "balance" | "followup";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  subtitle: string;
  href: string;
  at: string | null;
}

export interface NotificationData {
  items: NotificationItem[];
  unread: number;
}

/** 拉取当前用户可见通知 (待审批 / 余额预警 / 待跟进). 失败时静默返回空. */
export async function getNotifications(): Promise<NotificationData> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.rpc("rpc_get_notifications");
  if (error || !data) return { items: [], unread: 0 };
  const d = data as Partial<NotificationData>;
  return { items: d.items ?? [], unread: d.unread ?? 0 };
}
