// AI 推荐充值话术 / 金额 — 输入 student_id → 输出充值建议
import { NextResponse } from "next/server";

const CONTRACT = {
  endpoint: "/api/ai/recommend-recharge",
  methods: ["POST", "GET"],
  query: { student_id: "UUID" },
  upstream: {
    signals_rpc: "rpc_get_student_signals",
    note: "结合 finance.balance / burn_rate_30d / days_left_at_rate 给建议",
  },
  response: {
    schema: {
      suggested_amount: "number (¥)",
      suggested_bonus: "number (¥, optional 赠送)",
      pitch: "string (顾问可直接复用的话术, 80-150 字)",
      reasoning: "string",
      confidence: "0..1",
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
  return NextResponse.json(
    { message: "AI 充值推荐尚未接通，合约文档如下：", contract: CONTRACT },
    { status: 501 },
  );
}
