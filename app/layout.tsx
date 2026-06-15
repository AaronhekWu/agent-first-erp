import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { PermissionsProvider } from "@/lib/auth/permissions-context";
import { PendingApproval } from "@/components/auth/pending-approval";
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
  // 已登录但 停用 / 未分配角色 → 待审批页 (DB 层已无数据访问权)
  const blocked = !!me && (!me.isActive || !me.user.primary_role);

  return (
    <html lang="zh-CN">
      <body>
        <PermissionsProvider user={me?.user} permissions={me?.permissions}>
          {blocked ? (
            <PendingApproval
              name={me!.user.display_name}
              reason={!me!.isActive ? "inactive" : "norole"}
            />
          ) : (
            <AppShell>{children}</AppShell>
          )}
        </PermissionsProvider>
      </body>
    </html>
  );
}
