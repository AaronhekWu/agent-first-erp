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
  // 已分配角色但主管尚未配置权限 → 只读态 (仅角色默认查看权限)
  const readonlyPending =
    !!me && !blocked && me.user.primary_role !== "admin" && !me.configured;

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
            <AppShell>
              {readonlyPending && (
                <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-800">
                  当前账号权限待主管配置，暂为只读模式：可查看数据，暂不能新增 / 编辑 / 删除。请联系主管在「校区管理 · 成员」中完成授权。
                </div>
              )}
              {children}
            </AppShell>
          )}
        </PermissionsProvider>
      </body>
    </html>
  );
}
