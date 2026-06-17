"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { Bell, CheckSquare, Clock, HelpCircle, Menu, Search, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchStudents } from "@/lib/api/courses-client";
import { useLayout } from "./layout-context";
import { UserMenu } from "./user-menu";
import type { StudentSearchResult } from "@/lib/api/courses";

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

interface Crumb {
  label: string;
  href: string;
}

function buildBreadcrumb(segments: string[]): Crumb[] {
  if (segments.length === 0) return [{ label: "仪表盘", href: "/dashboard" }];
  const first = segments[0];
  const root = SEGMENT_LABELS[first] ?? first;
  const rootHref = `/${first}`;
  if (first === "students") {
    return segments[1]
      ? [
          { label: root, href: rootHref },
          { label: "学员详情", href: `/students/${segments[1]}` },
        ]
      : [
          { label: root, href: rootHref },
          { label: "学员查询", href: rootHref },
        ];
  }
  if (first === "courses") {
    return [
      { label: root, href: rootHref },
      { label: "课程列表", href: rootHref },
    ];
  }
  return [{ label: root, href: rootHref }];
}

export function Topbar() {
  const segments = useSelectedLayoutSegments();
  const router = useRouter();
  const crumbs = buildBreadcrumb(segments);
  const { toggle } = useLayout();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNoticeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchStudents(query.trim(), 6);
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const goSearch = () => {
    const q = query.trim();
    if (!q) return;
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

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
            <span key={`${c.href}-${i}`} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">/</span>}
              {i === crumbs.length - 1 ? (
                <span className="font-medium text-slate-800">{c.label}</span>
              ) : (
                <Link href={c.href} className="text-slate-500 hover:text-brand-600">
                  {c.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") goSearch();
            }}
            placeholder="全局搜索"
            className="h-9 w-72 rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none"
          />
          {searchOpen && (
            <div className="absolute right-0 top-11 z-30 w-96 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              <div className="px-2 py-1.5 text-xs text-slate-400">
                搜索学员姓名、手机号或编号
              </div>
              {query.trim() === "" ? (
                <div className="px-2 py-6 text-center text-sm text-slate-400">
                  输入关键词开始搜索
                </div>
              ) : results.length === 0 ? (
                <button
                  type="button"
                  onClick={goSearch}
                  className="w-full rounded-md px-2 py-3 text-left text-sm text-slate-600 hover:bg-slate-50"
                >
                  查看「{query.trim()}」的完整搜索结果
                </button>
              ) : (
                <div className="space-y-1">
                  {results.map((s) => (
                    <Link
                      key={s.id}
                      href={`/students/${s.id}`}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-slate-50"
                    >
                      <span>
                        <span className="text-sm font-medium text-slate-800">{s.name}</span>
                        <span className="ml-2 font-mono text-[11px] text-slate-400">
                          {s.student_code ?? "—"}
                        </span>
                      </span>
                      <span className="text-xs text-slate-400">{s.status}</span>
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={goSearch}
                    className="w-full rounded-md px-2 py-2 text-left text-xs text-brand-600 hover:bg-brand-50"
                  >
                    查看全部结果
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setNoticeOpen((v) => !v)}
          className="relative grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label="通知"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[10px] font-medium text-white">3</span>
        </button>
        {noticeOpen && <NotificationsPanel />}
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

function NotificationsPanel() {
  const items = [
    { href: "/audits", Icon: CheckSquare, title: "待审批操作", desc: "退费、退课、删除等高风险操作将在审批中心处理" },
    { href: "/followups", Icon: Clock, title: "跟进到期提醒", desc: "查看到期未跟进学员与跟进时间线" },
    { href: "/finance", Icon: Wallet, title: "余额预警", desc: "检查低余额学员并发起充值建议" },
  ];
  return (
    <div className="absolute right-20 top-14 z-30 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
      <div className="flex items-center justify-between px-2 py-2">
        <div className="text-sm font-medium text-slate-800">通知</div>
        <div className="text-xs text-slate-400">数据源接入中</div>
      </div>
      <div className="space-y-1">
        {items.map(({ href, Icon, title, desc }) => (
          <Link key={href} href={href} className="flex gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
            <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-slate-500">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800">{title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">{desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
