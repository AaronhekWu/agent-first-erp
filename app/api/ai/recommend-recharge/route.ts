import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }

async function handle(request: Request) {
  const studentId = new URL(request.url).searchParams.get("student_id");
  if (!studentId) return NextResponse.json({ error: "请选择需要分析的学员" }, { status: 400 });
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("rpc_get_student_ontology", { p_student_id: studentId });
  if (error) return NextResponse.json({ error: `读取学员智能档案失败：${error.message}` }, { status: 400 });
  return NextResponse.json({
    configured: Boolean(process.env.DEEPSEEK_API_KEY),
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    ontology: data,
    message: "充值建议功能已预留；当前只整理授权范围内的分析输入，不会自动调用外部模型。",
  }, { status: 501 });
}
