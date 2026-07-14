-- 0019 — 教师入职默认只读
--
-- 需求: 通过入职/核验流程创建的教师账号登录后应为「只读」, 直到主管在「校区管理」里
-- 显式配置权限后才能操作 (点名/报名等)。
-- 机制: has_permission 在 permissions 为空时回退到角色默认集。原教师默认集含 courses.attendance
-- (写操作), 使未配置教师即可点名。此处将教师默认集收敛为纯查看权限;
-- 主管在成员编辑弹窗勾选「课程点名」等 = 写入显式权限 = 完成授权后即可操作。
-- (客户端 ROLE_DEFAULTS.teacher 同步收敛, 保持前后端一致。)

create or replace function public.has_permission(p_key text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_permissions jsonb;
begin
  if auth.uid() is null then return false; end if;
  select coalesce(p.primary_role, public.get_my_role()), coalesce(p.permissions, '[]'::jsonb)
    into v_role, v_permissions
    from public.acct_profiles p
   where p.id = auth.uid() and p.is_active is not false;
  if v_role = 'admin' then return true; end if;
  if jsonb_array_length(v_permissions) > 0 then return v_permissions ? p_key; end if;
  return case v_role
    when 'counselor' then p_key = any(array[
      'students.view','students.create','students.update','courses.view','courses.enroll',
      'finance.view','finance.recharge','followups.view','followups.create'
    ])
    -- 教师未配置权限时: 仅查看 (点名等写操作须主管显式授权)
    when 'teacher' then p_key = any(array[
      'students.view','courses.view','followups.view'
    ])
    when 'viewer' then p_key = any(array[
      'students.view','courses.view','finance.view','followups.view','audits.view'
    ])
    else false
  end;
end;
$function$;
