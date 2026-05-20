import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { LayoutProvider } from "@/components/layout/layout-context";
import { PermissionsProvider } from "@/lib/auth/permissions-context";

export const metadata: Metadata = {
  title: "墨曦系统 — 教育机构 ERP 管理系统",
  description: "学员、课程、财务、跟进 全链路管理",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <PermissionsProvider>
          <LayoutProvider>
            <div className="flex min-h-screen items-start">
              <Sidebar />
              <div className="flex min-h-screen min-w-0 flex-1 flex-col">
                <Topbar />
                <main className="flex-1">{children}</main>
              </div>
            </div>
          </LayoutProvider>
        </PermissionsProvider>
      </body>
    </html>
  );
}
