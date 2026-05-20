// 健康检查 — SAE / Docker HEALTHCHECK / 定时预热共用
// 故意不查数据库，只验证 Node runtime 存活，避免 DB 抖动把容器拖死
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    ts: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
  });
}
