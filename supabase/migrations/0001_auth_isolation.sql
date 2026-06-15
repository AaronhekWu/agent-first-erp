-- 0001 — 认证接入 + 租户隔离加固 (Phase 0)
--
-- 背景: 单机构 ERP, "租户隔离" = 按角色 + 部门做数据隔离, 通过 base 表 RLS 实现.
--   admin/teacher/viewer 看全部学员; counselor 仅看自己负责/本部门; 财务仅 admin
--   及负责该学员的 counselor 可见. 写操作走 SECURITY DEFINER RPC.
--
-- 本次修复两处使隔离形同虚设的根因:
--   (1) 所有 v_* 报表视图未设 security_invoker → 以视图属主权限运行, 绕过 base 表
--       RLS, 任何人查 v_student_overview 都能看到全部学员.
--   (2) 应用无法一次性解析「当前登录用户」的角色/权限 → 新增 rpc_get_me().
--
-- 注意: anon 仍可读业务数据 (anon → viewer), 该锁定在 0002 中处理, 须等带登录的
--   前端发布后再执行, 否则当前无登录版本会立即读不到数据.

-- 1. 当前用户解析器: 供 app layout 注入前端权限上下文
create or replace function public.rpc_get_me()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'display_name', coalesce(p.display_name, split_part(u.email, '@', 1)),
    'role', public.get_my_role(),
    'department_ids', public.get_my_department_ids(),
    'permissions', coalesce(p.permissions, '[]'::jsonb),
    'is_active', coalesce(p.is_active, true)
  ) end
  from auth.users u
  left join public.acct_profiles p on p.id = u.id
  where u.id = auth.uid();
$$;

grant execute on function public.rpc_get_me() to authenticated;

-- 2. 关闭隔离漏洞: 所有报表视图改为以「调用者」权限执行, 从而真正套用 base 表 RLS.
--    (副作用: 非财务角色查 v_student_overview 时财务列因 RLS 返回 NULL, 符合最小权限.)
alter view public.v_student_overview      set (security_invoker = true);
alter view public.v_staff_overview        set (security_invoker = true);
alter view public.v_counselor_performance set (security_invoker = true);
alter view public.v_course_stats          set (security_invoker = true);
alter view public.v_followup_timeline     set (security_invoker = true);
alter view public.v_pending_followups     set (security_invoker = true);
alter view public.v_revenue_summary       set (security_invoker = true);
alter view public.v_balance_warnings      set (security_invoker = true);
alter view public.v_student_retention     set (security_invoker = true);
