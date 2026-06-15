"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { LayoutProvider } from "@/components/layout/layout-context";

/**
 * 登录页 (/login) 不渲染侧边栏 / 顶栏, 其余页面套用完整后台框架.
 * 路由守卫在 middleware, 这里只负责外观.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <LayoutProvider>
      <div className="flex min-h-screen items-start">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </LayoutProvider>
  );
}
