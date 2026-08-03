import { NextResponse } from "next/server";
import { invokeAiEdge } from "@/lib/ai/edge-proxy";
import { validateCampusKpiRange } from "@/lib/campus-kpi-range";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求内容不是有效的 JSON" }, { status: 400 });
  }
  if (typeof body.from !== "string" || typeof body.to !== "string") {
    return NextResponse.json({ error: "请选择分析日期范围" }, { status: 400 });
  }
  const rangeError = validateCampusKpiRange(body.from, body.to);
  if (rangeError) {
    return NextResponse.json({ error: rangeError }, { status: 400 });
  }
  return invokeAiEdge({ action: "campus_analysis", from: body.from, to: body.to });
}
