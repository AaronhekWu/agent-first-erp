"use client";

import { createContext, useContext } from "react";
import { PERMISSION_CATALOG, ROLE_DEFAULTS } from "@/lib/permissions";

/**
 * 权限模型:
 *   layout.tsx (server) → getMe() 解析登录用户 → 注入 PermissionsProvider →
 *   前端按需 hide/disable. 后端 RLS + SECURITY DEFINER RPC 做真正鉴权.
 *
 * 无 user (未登录 / 登录页) → 访客, 零权限. 真正的页面访问由 middleware 守卫.
 */

export interface CurrentUser {
  id: string | null;
  display_name: string;
  primary_role: string | null;
  email?: string | null;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "系统管理员",
  counselor: "课程顾问",
  teacher: "教师",
  viewer: "只读用户",
};

interface PermissionsCtx {
  user: CurrentUser;
  permissions: Set<string>;
  has: (key: string) => boolean;
  hasAny: (...keys: string[]) => boolean;
  hasAll: (...keys: string[]) => boolean;
}

const Ctx = createContext<PermissionsCtx | null>(null);

const ALL_PERMISSIONS = new Set(PERMISSION_CATALOG.map((p) => p.key));

const GUEST_USER: CurrentUser = {
  id: null,
  display_name: "未登录",
  primary_role: null,
};

interface ProviderProps {
  children: React.ReactNode;
  user?: CurrentUser | null;
  permissions?: string[];
}

export function PermissionsProvider({ children, user, permissions }: ProviderProps) {
  const u = user ?? GUEST_USER;
  const role = u.primary_role;
  // admin → 全权限; 其他角色 → 显式权限优先, 否则回退角色默认; 访客 → 空
  const explicit = permissions ?? (role ? ROLE_DEFAULTS[role] ?? [] : []);
  const set = role === "admin" ? ALL_PERMISSIONS : new Set(explicit);
  const ctx: PermissionsCtx = {
    user: u,
    permissions: set,
    has: (k) => set.has(k),
    hasAny: (...ks) => ks.some((k) => set.has(k)),
    hasAll: (...ks) => ks.every((k) => set.has(k)),
  };
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function usePermissions(): PermissionsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}

/** Convenience: render `children` only when current user has all `keys`. */
export function Gate({
  keys,
  fallback = null,
  children,
}: {
  keys: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { hasAll } = usePermissions();
  const arr = Array.isArray(keys) ? keys : [keys];
  return hasAll(...arr) ? <>{children}</> : <>{fallback}</>;
}
