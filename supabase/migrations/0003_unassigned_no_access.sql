-- 0003 — 未分配角色的登录用户默认「无任何数据访问」(配合 SMS 自助注册)
--
-- 原 get_my_role() 对无角色用户回退 'viewer', 而 viewer 可读全部学员.
-- 一旦开放 SMS 自助注册, 任何人注册后即成 viewer → 看到全部学员/数据.
-- 改为: 无显式角色 → 返回 NULL → 所有 RLS 策略均不匹配 → 零数据访问.
-- 须由管理员在「员工管理」显式分配角色后, 用户才能访问对应数据.
--
-- 影响: 已有无角色用户 (如 chatbi) 及未登录 anon 都将读不到业务数据 (符合预期/更安全).

create or replace function public.get_my_role()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
    v_role text;
begin
    -- 优先取 JWT app_metadata.role
    v_role := current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role';
    if v_role is not null then
        return v_role;
    end if;
    -- 回退到 acct_user_roles (取最高权角色)
    select r.name into v_role
    from acct_roles r
    join acct_user_roles ur on ur.role_id = r.id
    where ur.user_id = auth.uid()
    order by case r.name
        when 'admin' then 1 when 'teacher' then 2 when 'counselor' then 3 else 4
    end
    limit 1;
    -- 无角色 → NULL (原为 COALESCE(v_role,'viewer')); NULL 角色对所有 RLS 即无访问权
    return v_role;
end;
$function$;
