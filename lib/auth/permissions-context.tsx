"use client";

import { createContext, useContext } from "react";
import { PERMISSION_CATALOG, ROLE_DEFAULTS } from "@/lib/permissions";

/**
 * 权限模型 (MVP):
 *   登录页 → 拉一次用户权限 → 注入 PermissionsProvider → 前端按需 hide/disable
 *   后端 RPC 不做每次鉴权 (SECURITY DEFINER + 角色级 GRANT 即可)
 *
 * 当前未接入登录, 默认注入「系统管理员」全权限. 后续在 layout.tsx 把
 * value 从 auth.getUser() + acct_profiles.permissions 解出来即可.
 */

export interface CurrentUser {
  id: string | null;
  display_name: string;
  primary_role: string | null;
}

interface PermissionsCtx {
  user: CurrentUser;
  permissions: Set<string>;
  has: (key: string) => boolean;
  hasAny: (...keys: string[]) => boolean;
  hasAll: (...keys: string[]) => boolean;
}

const Ctx = createContext<PermissionsCtx | null>(null);

const ALL_PERMISSIONS = new Set(PERMISSION_CATALOG.map((p) => p.key));

const DEFAULT_USER: CurrentUser = {
  id: null,
  display_name: "张老师",
  primary_role: "admin",
};

interface ProviderProps {
  children: React.ReactNode;
  user?: CurrentUser;
  permissions?: string[];
}

export function PermissionsProvider({ children, user, permissions }: ProviderProps) {
  const u = user ?? DEFAULT_USER;
  const explicit = permissions ?? ROLE_DEFAULTS[u.primary_role ?? "admin"] ?? [];
  const set = u.primary_role === "admin" ? ALL_PERMISSIONS : new Set(explicit);
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
