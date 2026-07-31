import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { SUPABASE_ANON_KEY, SUPABASE_SERVER_URL } from "@/lib/supabase/config";

const EDGE_FUNCTION_URL = `${SUPABASE_SERVER_URL.replace(/\/$/, "")}/functions/v1/ai-assistant`;

export async function invokeAiEdge(body: Record<string, unknown>) {
  const sb = createServerSupabase();
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "x-user-jwt": token,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ error: "AI Edge Function 返回了无法识别的内容" }));
    return NextResponse.json(payload, { status: response.status });
  } catch (caught) {
    const message = caught instanceof Error && caught.name === "TimeoutError"
      ? "AI 分析超时，请稍后重试"
      : "AI Edge Function 暂时不可用";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function getAiEdgeStatus() {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ ok: false, configured: false }));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ ok: false, configured: false, error: "AI Edge Function 暂时不可用" }, { status: 503 });
  }
}
