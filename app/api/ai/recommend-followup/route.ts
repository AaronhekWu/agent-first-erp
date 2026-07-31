import { NextResponse } from "next/server";
import { invokeAiEdge } from "@/lib/ai/edge-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const studentId = new URL(request.url).searchParams.get("student_id");
  if (!studentId) return NextResponse.json({ error: "请选择需要分析的学员" }, { status: 400 });
  return invokeAiEdge({ action: "followup_suggest", student_id: studentId });
}
