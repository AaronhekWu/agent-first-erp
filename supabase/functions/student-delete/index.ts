// 学员删除边缘函数 (RDS Edge Function, Deno, 监听 :8000) — 仅管理员可调用
//
// 鉴权: Kong 网关只接受 anon/service key 作为 apikey/Authorization, 用户 JWT 放这里会被
//   拒 ("not a valid API key or JWT")。故网关用 anon, 用户身份走自定义头 x-user-jwt;
//   函数用它调 rpc_get_me 解析角色, 必须 role=admin 才放行。
//   前端调用: headers { apikey: anon, Authorization: Bearer anon, "x-user-jwt": <用户access_token> }
//
// POST body:
//   { "student_id": "<uuid>" }              单个
//   { "student_ids": ["<uuid>", ...] }       批量
//   "dry_run": true|false (默认 true, 显式 false 才真删)
//
// 内置密钥: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY

const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SB_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// 用调用者的 user JWT (x-user-jwt) 解析其角色 (rpc_get_me 内部按 auth.uid() + get_my_role 解析)
async function resolveCallerRole(userJwt: string): Promise<string | null> {
  const tok = userJwt.replace(/^Bearer\s+/i, "").trim();
  if (!tok) return null;
  const res = await fetch(`${SB_URL}/rest/v1/rpc/rpc_get_me`, {
    method: "POST",
    headers: {
      apikey: SB_ANON_KEY,
      authorization: `Bearer ${tok}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) return null;
  const me = await res.json().catch(() => null);
  return me && typeof me.role === "string" ? me.role : null;
}

Deno.serve({ port: 8000 }, async (req: Request): Promise<Response> => {
  if (req.method === "GET") {
    return json({ ok: true, fn: "student-delete", admin_only: true });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SB_URL || !SB_SERVICE_KEY) {
    return json({ error: "missing built-in secrets SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  // —— 管理员鉴权 (用户身份走 x-user-jwt) ——
  const role = await resolveCallerRole(req.headers.get("x-user-jwt") ?? "");
  if (role !== "admin") {
    return json({ error: "forbidden: 仅管理员可执行删除", role: role ?? "anonymous" }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const ids: string[] = Array.isArray(body.student_ids)
    ? (body.student_ids as unknown[]).filter((x): x is string => typeof x === "string")
    : typeof body.student_id === "string"
      ? [body.student_id]
      : [];
  const dryRun = body.dry_run !== false;
  if (ids.length === 0) return json({ error: "student_id or student_ids required" }, 400);

  const svc = {
    apikey: SB_SERVICE_KEY,
    authorization: `Bearer ${SB_SERVICE_KEY}`,
    "content-type": "application/json",
    prefer: "return=representation",
  };
  const inList = ids.map((id) => encodeURIComponent(id)).join(",");

  // 1) 仅取「未删除」的目标
  const getRes = await fetch(
    `${SB_URL}/rest/v1/stu_students?id=in.(${inList})&deleted_at=is.null&select=id,name,student_code`,
    { headers: svc },
  );
  if (!getRes.ok) {
    return json({ error: "lookup failed", status: getRes.status, detail: await getRes.text() }, 502);
  }
  const targets = (await getRes.json()) as Array<Record<string, unknown>>;

  if (dryRun) {
    return json({
      dry_run: true,
      requested: ids.length,
      deletable: targets.length,
      would_delete: targets,
      message: "dry run — 未执行删除",
    });
  }

  // 2) 批量软删除 (仅 deleted_at is null 的)
  const patchRes = await fetch(
    `${SB_URL}/rest/v1/stu_students?id=in.(${inList})&deleted_at=is.null`,
    {
      method: "PATCH",
      headers: svc,
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  );
  if (!patchRes.ok) {
    return json({ error: "delete failed", status: patchRes.status, detail: await patchRes.text() }, 502);
  }
  const deleted = (await patchRes.json()) as Array<Record<string, unknown>>;
  return json({
    requested: ids.length,
    deleted: Array.isArray(deleted) ? deleted.length : 0,
    students: deleted,
    message: "soft-deleted (deleted_at set)",
    by_role: role,
  });
});
