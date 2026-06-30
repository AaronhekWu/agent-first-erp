"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { SUPABASE_PUBLIC_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

export interface BatchDeleteResult {
  requested: number;
  deleted: number;
  students?: Array<{ id: string; name?: string }>;
}

/**
 * 批量软删除学员 —— 走 RDS 边缘函数 student-delete (仅管理员)。
 * 网关用 anon key 鉴权; 用户身份走自定义头 x-user-jwt (函数内 rpc_get_me 校验 role=admin)。
 */
export async function batchDeleteStudents(ids: string[]): Promise<BatchDeleteResult> {
  if (ids.length === 0) return { requested: 0, deleted: 0 };
  const {
    data: { session },
  } = await getSupabaseBrowser().auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("登录已过期，请重新登录");

  const res = await fetch(`${SUPABASE_PUBLIC_URL}/functions/v1/student-delete`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "x-user-jwt": token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ student_ids: ids, dry_run: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data && (data.error || data.message)) || `删除失败 (HTTP ${res.status})`,
    );
  }
  return data as BatchDeleteResult;
}
