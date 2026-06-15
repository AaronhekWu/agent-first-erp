-- 0002 — 锁定 anon 角色, 业务数据强制登录访问 (Phase 0)
--
-- ⚠️ 执行时机: 必须在「带登录的前端」发布上线后再执行.
--   原因: 当前线上版本无登录, 依赖 anon (→viewer) 直接读数据. 一旦提前 revoke,
--   旧版本会立刻 permission denied. 新版本要求登录后所有请求都以 authenticated 身份
--   携带用户 JWT, 不再走 anon.
--
-- 作用: 公开的 NEXT_PUBLIC_SUPABASE_ANON_KEY 任何人可拿到; 不锁定 anon 则可绕过前端
--   直接调 REST API 读取全部学员/财务数据. 内部 ERP 无任何公开页面需要匿名读数据.

do $$
declare r record;
begin
  -- 业务表 (按前缀) + 所有报表视图, 收回 anon 的 SELECT
  for r in
    select format('%I.%I', schemaname, tablename) as rel
      from pg_tables
     where schemaname = 'public'
       and tablename ~ '^(acct_|stu_|crs_|fin_|flup_|promo_|ai_|aud_|org_)'
    union all
    select format('%I.%I', schemaname, viewname)
      from pg_views
     where schemaname = 'public'
       and viewname ~ '^v_'
  loop
    execute format('revoke select on %s from anon', r.rel);
  end loop;
end $$;
