// Supabase 连接配置
//
// 关键: 浏览器与服务端访问 Supabase 用「不同地址」——
//   - 浏览器(用户机器): 必须公网地址 NEXT_PUBLIC_SUPABASE_URL
//   - 服务端(SAE 容器在 VPC 内): 必须内网地址. 公网 IP 在同 VPC 内 hairpin 不通,
//     直连会 Connect Timeout (登录卡死的根因).
//
// 同时, 二者必须共享同一个 cookie storageKey: 默认 key 由 URL host 推导, 两个地址
// 会得到不同 key → 服务端读不到浏览器写的会话 cookie. 显式固定即可共享.

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** 浏览器用 — 公网地址 */
export const SUPABASE_PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** 服务端用 — 优先 VPC 内网地址 (SUPABASE_SERVER_URL), 本地开发缺省回退公网 */
export const SUPABASE_SERVER_URL =
  process.env.SUPABASE_SERVER_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** 固定 cookie 名, 使浏览器(公网URL)与服务端(内网URL)共享同一会话 */
export const SUPABASE_STORAGE_KEY = "sb-moxi-auth-token";
