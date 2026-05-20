"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-50"
      >
        <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-pink-300 to-orange-300 text-xs font-medium text-white">
          张
        </div>
        <div className="text-right leading-tight">
          <div className="text-sm font-medium text-slate-800">张老师</div>
          <div className="text-[11px] text-slate-500">系统管理员</div>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-medium text-slate-800">张老师</div>
            <div className="mt-0.5 text-xs text-slate-500">zhang@moxi.edu</div>
            <div className="mt-1 inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">
              系统管理员
            </div>
          </div>
          <ul className="py-1 text-sm">
            <li>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                <User className="h-4 w-4 text-slate-400" />
                个人信息
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                <Settings className="h-4 w-4 text-slate-400" />
                系统设置
              </Link>
            </li>
            <li className="border-t border-slate-100">
              <button
                onClick={() => {
                  setOpen(false);
                  alert("退出登录功能即将上线");
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
