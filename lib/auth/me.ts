import { createServerSupabase } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth/permissions-context";

export interface MeResult {
  user: CurrentUser;
  /** 显式权限 (dot 格式). 为空时由 PermissionsProvider 回退到角色默认权限. */
  permissions?: string[];
  /** 账号是否启用 */
  isActive: boolean;
  /** 是否已分配角色 (无角色 → 待管理员分配, 无任何数据访问) */
  hasRole: boolean;
}

interface RpcMe {
  id: string;
  email: string | null;
  display_name: string;
  role: string | null;
  department_ids: string[];
  permissions: string[];
  is_active: boolean;
}

/**
 * 解析当前登录用户. 返回 null 仅代表「无会话」.
 * 已登录但 未分配角色 / 已停用 的情况由 isActive / hasRole 标记, 交给 layout 显示待审批页.
 * 角色来自 rpc_get_me (DB 内 get_my_role 解析 acct_user_roles / JWT).
 */
export async function getMe(): Promise<MeResult | null> {
  const sb = createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb.rpc("rpc_get_me");
  if (error || !data) return null;
  const me = data as RpcMe;

  const explicit = Array.isArray(me.permissions) ? me.permissions : [];
  return {
    user: {
      id: me.id,
      display_name: me.display_name,
      primary_role: me.role,
      email: me.email,
    },
    permissions: explicit.length > 0 ? explicit : undefined,
    isActive: me.is_active !== false,
    hasRole: !!me.role,
  };
}
