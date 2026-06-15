import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { PermissionsProvider } from "@/lib/auth/permissions-context";
import { getMe } from "@/lib/auth/me";

export const metadata: Metadata = {
  title: "墨曦系统 — 教育机构 ERP 管理系统",
  description: "学员、课程、财务、跟进 全链路管理",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getMe();

  return (
    <html lang="zh-CN">
      <body>
        <PermissionsProvider user={me?.user} permissions={me?.permissions}>
          <AppShell>{children}</AppShell>
        </PermissionsProvider>
      </body>
    </html>
  );
}
