import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SUPABASE_SERVER_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_STORAGE_KEY,
} from "@/lib/supabase/config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * 会话刷新 + 路由守卫.
 *   - 未登录访问任何受保护页面 → 跳 /login
 *   - 已登录访问 /login → 跳首页
 *   - /api/* 与静态资源不经过此处 (见 matcher), 保证 SAE 健康检查 /api/health 公开可达
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    SUPABASE_SERVER_URL,
    SUPABASE_ANON_KEY,
    {
      auth: { storageKey: SUPABASE_STORAGE_KEY },
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: CookieToSet[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          list.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 必须用 getUser() (会向 auth 服务校验), 不能用 getSession() — 后者只读 cookie 不可信
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isLogin = path === "/login";

  if (!user && !isLogin) {
    const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // 排除 api、静态资源、带后缀的文件; 其余页面都走守卫
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
