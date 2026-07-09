import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  SUPABASE_SERVER_URL,
  SUPABASE_ANON_KEY,
} from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/**
 * 批量删除学员 —— 同源代理到 RDS 边缘函数 student-delete。
 * 为什么要代理: 浏览器直调 Supabase 网关跨域, 且带自定义头 x-user-jwt 触发 OPTIONS 预检,
 * 而 Kong 对不带 apikey 的预检一律 401 → 前端 "Failed to fetch"。
 * 走本路由则同源无预检; 服务端从会话 cookie 取用户 token, 经 VPC 内网调函数。
 * 权限: 边缘函数内用 x-user-jwt 调 rpc_get_me 校验 role=admin, 非管理员 403。
 */
export async function POST(req: Request) {
  const sb = createServerSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
  }

  let body: { student_ids?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const ids = Array.isArray(body.student_ids)
    ? body.student_ids.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "student_ids required" }, { status: 400 });
  }

  const res = await fetch(`${SUPABASE_SERVER_URL}/functions/v1/student-delete`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "x-user-jwt": token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ student_ids: ids, dry_run: false }),
    // 边缘函数冷启动可能较慢
    signal: AbortSignal.timeout(60_000),
  }).catch((e: unknown) => {
    throw new Error(`边缘函数不可达: ${(e as Error).message}`);
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
