import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  SUPABASE_SERVER_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_STORAGE_KEY,
} from "./config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server-side Supabase client (App Router).
 * 用 VPC 内网地址访问 (容器在 VPC 内, 公网 IP hairpin 不通); 固定 storageKey 与浏览器
 * 共享会话 cookie. 写 cookie 仅在 middleware/route handler/server action 内有效,
 * server component 内 set 会抛错, 用 try/catch 吞掉 (会话刷新由 middleware 负责).
 */
export function createServerSupabase() {
  const store = cookies();
  return createServerClient(SUPABASE_SERVER_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: SUPABASE_STORAGE_KEY },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieToSet[]) => {
        try {
          list.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // server component 内无法写 cookie — 忽略, 由 middleware 刷新会话
        }
      },
    },
  });
}
