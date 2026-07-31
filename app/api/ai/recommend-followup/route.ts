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
  const configured = Boolean(process.env.DEEPSEEK_API_KEY);
  return NextResponse.json({
    configured,
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    api_key_placeholder: "DEEPSEEK_API_KEY=sk-...",
    ontology: data,
    message: configured
      ? "学员知识图谱已整理；模型调用入口已预留，当前未自动发送学员数据。"
      : "学员知识图谱已整理；请在服务端配置 DeepSeek API Key 后再启用话术生成。",
  }, { status: 501 });
}
