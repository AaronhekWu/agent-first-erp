"use client";

import { Bell, HelpCircle, Menu, Search } from "lucide-react";
import { useSelectedLayoutSegments } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLayout } from "./layout-context";
import { UserMenu } from "./user-menu";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "仪表盘",
  students: "学员管理",
  courses: "课程管理",
  finance: "财务管理",
  followups: "跟进记录",
  audits: "审批中心",
  campus: "校区管理",
  settings: "系统设置",
};

function buildBreadcrumb(segments: string[]): string[] {
  if (segments.length === 0) return ["仪表盘"];
  const first = segments[0];
  const root = SEGMENT_LABELS[first] ?? first;
  if (first === "students") {
    return segments[1] ? [root, "学员详情"] : [root, "学员查询"];
  }
  if (first === "courses") {
    return [root, "课程列表"];
  }
  return [root];
}

export function Topbar() {
  const segments = useSelectedLayoutSegments();
  const crumbs = buildBreadcrumb(segments);
  const { toggle } = useLayout();

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label="切换侧边栏"
        >
          <Menu className="h-5 w-5" />
        </button>
        <nav className="flex items-center gap-2 text-sm">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">/</span>}
              <span
                className={cn(
                  i === crumbs.length - 1
                    ? "font-medium text-slate-800"
                    : "text-slate-500",
                )}
              >
                {c}
              </span>
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="全局搜索"
            className="h-9 w-72 rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none"
          />
        </div>
        <button
          type="button"
          className="relative grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[10px] font-medium text-white">
            12
          </span>
        </button>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
