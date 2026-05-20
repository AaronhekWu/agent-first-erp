// AI 推荐跟进 — 输入 student_id → 输出建议跟进话术 / next_plan / next_date
//
// 当前 MVP 阶段：501 Not Implemented + 合约说明
// 真实实现位置：supabase/functions/ai-followup-suggest/index.ts (待接入 Claude / GPT)
//
// 该路由不做鉴权 (前端 PermissionsProvider 已 gate UI)
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const CONTRACT = {
  endpoint: "/api/ai/recommend-followup",
  methods: ["POST", "GET"],
  query: { student_id: "UUID" },
  upstream: {
    signals_rpc: "rpc_get_student_signals(p_student_id)",
    note: "把 signals JSON 传给 AI agent, 输出格式见 response.schema",
  },
  response: {
    schema: {
      suggested_type: "phone | wechat | visit | other",
      suggested_content: "string (建议跟进话术, 第一人称, 60-200 字)",
      suggested_next_plan: "string",
      suggested_next_date: "ISO datetime",
      reasoning: "string (AI 给出建议的依据, 用于审计/可解释)",
      confidence: "0..1",
      model: "claude-sonnet-4.7 / gpt-5 / ...",
    },
  },
};

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("student_id");
  if (!studentId) {
    return NextResponse.json({ error: "INVALID_INPUT: student_id required", contract: CONTRACT }, { status: 400 });
  }
  // 上游 signals 已就绪 —— 验证一下 (顺便给后续 AI 接入提供输入)
  let signals: unknown = null;
  try {
    const sb = createServerSupabase();
    const { data } = await sb.rpc("rpc_get_student_signals", { p_student_id: studentId });
    signals = data;
  } catch {
    // ignore
  }
  return NextResponse.json(
    {
      message: "AI 推荐尚未接通；signals 已就绪，等待接入 Claude/GPT。",
      contract: CONTRACT,
      signals_ready: signals !== null,
      signals_preview: signals,
    },
    { status: 501 },
  );
}
