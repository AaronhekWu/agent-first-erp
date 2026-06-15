import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server-side Supabase client (App Router).
 * 读取请求里的会话 cookie → 后续 PostgREST 调用以登录用户身份执行 (auth.uid() 生效),
 * RLS 据此做角色/部门级隔离. 写 cookie 仅在 middleware / route handler / server action
 * 里有效; server component 内 set 会抛错, 故用 try/catch 吞掉 (会话刷新由 middleware 负责).
 */
export function createServerSupabase() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );
}
