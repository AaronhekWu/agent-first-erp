"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Wallet,
  ClipboardList,
  CheckSquare,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "./layout-context";

interface NavItem {
  href: string;
  label: string;
  Icon: typeof Users;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "仪表盘", Icon: LayoutDashboard },
  { href: "/students", label: "学员管理", Icon: Users },
  { href: "/courses", label: "课程管理", Icon: BookOpen },
  { href: "/finance", label: "财务管理", Icon: Wallet },
  { href: "/followups", label: "跟进记录", Icon: ClipboardList },
  { href: "/audits", label: "审批中心", Icon: CheckSquare },
  { href: "/campus", label: "校区管理", Icon: Building2 },
  { href: "/settings", label: "系统设置", Icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useLayout();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-text transition-[width] duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 py-5",
          collapsed ? "justify-center px-0" : "px-5",
        )}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <span className="truncate text-lg font-semibold tracking-wide text-white">
            墨曦系统
          </span>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {NAV.map(({ href, label, Icon }) => {
            const active =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors",
                    collapsed ? "justify-center px-0" : "px-3",
                    active
                      ? "bg-sidebar-active text-white font-medium"
                      : "text-sidebar-text hover:bg-sidebar-hover hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex items-center gap-2 border-t border-sidebar-border py-4 text-sm text-sidebar-muted hover:text-white",
          collapsed ? "justify-center px-0" : "px-5",
        )}
      >
        <ToggleIcon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>收起菜单</span>}
      </button>
    </aside>
  );
}
