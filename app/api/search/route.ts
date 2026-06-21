import { NextRequest, NextResponse } from "next/server";
import { globalSearch } from "@/lib/api/global-search";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const result = await globalSearch(query, 3);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Search suggestions failed", error);
    return NextResponse.json({ message: "搜索服务暂时不可用" }, { status: 500 });
  }
}
