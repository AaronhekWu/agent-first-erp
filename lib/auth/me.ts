import { createServerSupabase } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth/permissions-context";

export interface MeResult {
  user: CurrentUser;
  /** 显式权限 (dot 格式). 为空时由 PermissionsProvider 回退到角色默认权限. */
  permissions?: string[];
  email: string | null;
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
 * 解析当前登录用户 (供 layout 注入前端权限上下文). 未登录或停用 → null.
 * 角色来自 rpc_get_me (DB 内 get_my_role 解析 acct_user_roles / JWT);
 * permissions 为 acct_profiles.permissions 的逐人覆盖, 为空则交给前端按角色取默认.
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
  if (me.is_active === false) return null;

  const explicit = Array.isArray(me.permissions) ? me.permissions : [];
  return {
    user: {
      id: me.id,
      display_name: me.display_name,
      primary_role: me.role,
      email: me.email,
    },
    permissions: explicit.length > 0 ? explicit : undefined,
    email: me.email,
  };
}
