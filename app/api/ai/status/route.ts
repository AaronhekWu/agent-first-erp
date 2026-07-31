import { getAiEdgeStatus } from "@/lib/ai/edge-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return getAiEdgeStatus();
}
