-- 0023 — 课程完整信息编辑 + 登录角色来源一致性

-- 员工管理维护的 acct_profiles.primary_role 是当前产品的角色主数据。
-- 登录/RLS 也必须优先读取它，避免员工页显示“系统管理员”，登录却仍被判定为无角色。
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
  select p.primary_role into v_role
    from public.acct_profiles p
   where p.id = auth.uid() and p.is_active is not false;
  if v_role is not null then return v_role; end if;

  select r.name into v_role
    from public.acct_roles r
    join public.acct_user_roles ur on ur.role_id = r.id
      and ur.user_id = auth.uid()
   order by case r.name
     when 'admin' then 1 when 'teacher' then 2 when 'counselor' then 3 else 4
   end
   limit 1;
  if v_role is not null then return v_role; end if;

  return current_setting('request.jwt.claims', true)::jsonb
    -> 'app_metadata' ->> 'role';
end;
$function$;

-- 员工保存时同步角色关联表。非管理员仍只能修改自己的基础资料，不能借此修改角色/权限。
create or replace function public.rpc_upsert_staff(
  p_id uuid,
  p_display_name text,
  p_phone text default null,
  p_email text default null,
  p_primary_role text default null,
  p_department_id uuid default null,
  p_permissions jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_existing public.acct_profiles;
  v_can_manage boolean := public.has_permission('campus.manage');
begin
  if p_display_name is null or trim(p_display_name) = '' then
    raise exception 'INVALID_INPUT: 姓名必填';
  end if;
  if p_phone is not null and p_phone <> '' and p_phone !~ '^[0-9]{6,15}$' then
    raise exception 'INVALID_INPUT: 手机号必须为 6-15 位数字';
  end if;

  if p_id is null then
    if not v_can_manage then raise exception 'PERMISSION_DENIED: 无权新增成员'; end if;
    insert into public.acct_profiles (
      id, display_name, phone, email, primary_role, department_id, permissions, is_active
    ) values (
      gen_random_uuid(), trim(p_display_name), nullif(p_phone, ''), nullif(trim(p_email), ''),
      nullif(p_primary_role, ''), p_department_id, coalesce(p_permissions, '[]'::jsonb), true
    ) returning id into v_id;
  else
    select * into v_existing from public.acct_profiles where id = p_id for update;
    if v_existing.id is null then raise exception 'STAFF_NOT_FOUND: 成员不存在'; end if;

    if not v_can_manage then
      if auth.uid() is distinct from p_id
        or p_primary_role is distinct from v_existing.primary_role
        or p_department_id is distinct from v_existing.department_id
        or p_permissions is not null then
        raise exception 'PERMISSION_DENIED: 只能修改自己的基础资料';
      end if;
    end if;

    update public.acct_profiles
       set display_name = trim(p_display_name),
           phone = nullif(p_phone, ''),
           email = nullif(trim(p_email), ''),
           primary_role = nullif(p_primary_role, ''),
           department_id = p_department_id,
           permissions = coalesce(p_permissions, permissions),
           updated_at = now()
     where id = p_id
     returning id into v_id;
  end if;

  if exists (select 1 from auth.users where id = v_id) then
    delete from public.acct_user_roles where user_id = v_id;
    if nullif(p_primary_role, '') is not null then
      insert into public.acct_user_roles (user_id, role_id)
      select v_id, r.id from public.acct_roles r where r.name = p_primary_role
      on conflict do nothing;
    end if;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.rpc_upsert_staff(uuid,text,text,text,text,uuid,jsonb) from public;
grant execute on function public.rpc_upsert_staff(uuid,text,text,text,text,uuid,jsonb) to authenticated;

-- 课程卡片需要把完整排课信息带到编辑弹窗。
create or replace view public.v_course_stats as
select c.id as course_id,
  c.name as course_name,
  c.subject,
  c.level,
  c.status,
  c.max_capacity,
  c.fee,
  c.department_id,
  d.name as department_name,
  coalesce(es.total_enrolled, 0::bigint) as total_enrolled,
  coalesce(es.active_enrolled, 0::bigint) as active_enrolled,
  coalesce(es.completed_count, 0::bigint) as completed_count,
  coalesce(att.total_attendance, 0::bigint) as total_attendance,
  coalesce(att.present_count, 0::bigint) as present_count,
  case when coalesce(att.total_attendance, 0::bigint) > 0
    then round(att.present_count::numeric / att.total_attendance::numeric * 100::numeric, 1)
    else 0::numeric end as attendance_rate,
  coalesce(rev.total_revenue, 0.00) as total_revenue,
  c.start_date,
  c.end_date,
  c.created_at,
  coalesce(att.completed_sessions, 0::bigint) as completed_sessions,
  nullif(c.schedule_info ->> 'total_lessons', '')::integer as total_lessons,
  coalesce((c.schedule_info ->> 'is_archived')::boolean, false) as is_archived,
  coalesce(es.enrolled_remaining_lessons, 0::bigint) as enrolled_remaining_lessons,
  c.description,
  c.schedule_info
from public.crs_courses c
left join public.acct_departments d on d.id = c.department_id
left join lateral (
  select count(*) as total_enrolled,
    count(*) filter (where e.status::text = 'enrolled') as active_enrolled,
    count(*) filter (where e.status::text = 'completed') as completed_count,
    coalesce(sum(greatest(e.remaining_lessons, 0)) filter (where e.status::text = 'enrolled'), 0)::bigint as enrolled_remaining_lessons
  from public.crs_enrollments e where e.course_id = c.id
) es on true
left join lateral (
  select count(*) as total_attendance,
    count(*) filter (where a.status::text = any (array['present'::text, 'late'::text])) as present_count,
    count(distinct a.class_date) as completed_sessions
  from public.crs_attendance a
  join public.crs_enrollments e on e.id = a.enrollment_id
  where e.course_id = c.id
) att on true
left join lateral (
  select sum(cl.amount) as total_revenue
  from public.fin_consumption_logs cl
  join public.crs_enrollments e on e.id = cl.enrollment_id
  where e.course_id = c.id
) rev on true
where c.deleted_at is null;

alter view public.v_course_stats set (security_invoker = true);

create or replace function public.rpc_update_course_info(
  p_course_id uuid,
  p_total_lessons integer,
  p_unit_price numeric,
  p_start_date date,
  p_end_date date,
  p_department_id uuid,
  p_weekdays text[],
  p_class_time text,
  p_teacher_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := auth.uid();
  v_course public.crs_courses;
  v_completed_sessions bigint;
  v_days text[] := coalesce(p_weekdays, array[]::text[]);
begin
  if not (public.has_permission('courses.update') or public.has_permission('courses.plan')) then
    raise exception 'PERMISSION_DENIED: 无权编辑课程信息';
  end if;
  if p_total_lessons is null or p_total_lessons <= 0 then raise exception '计划总课时必须大于 0'; end if;
  if p_unit_price is null or p_unit_price <= 0 then raise exception '标准课时单价必须大于 0'; end if;
  if p_start_date is null or p_end_date is null then raise exception '课程开始和结束日期必填'; end if;
  if p_end_date < p_start_date then raise exception '结束日期不能早于开始日期'; end if;
  if not (v_days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]) then
    raise exception '上课星期格式不正确';
  end if;
  if p_department_id is not null and not exists (
    select 1 from public.acct_departments where id = p_department_id
  ) then raise exception '所选部门不存在'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_course_id::text, 0));
  select count(distinct a.class_date) into v_completed_sessions
    from public.crs_attendance a
    join public.crs_enrollments e on e.id = a.enrollment_id
   where e.course_id = p_course_id;
  if p_total_lessons < v_completed_sessions then
    raise exception '计划总课时不能少于已上课时（% 节）', v_completed_sessions;
  end if;

  update public.crs_courses
     set schedule_info = coalesce(schedule_info, '{}'::jsonb) || jsonb_build_object(
           'total_lessons', p_total_lessons,
           'weekdays', to_jsonb(v_days),
           'time', nullif(trim(p_class_time), ''),
           'teacher_name', nullif(trim(p_teacher_name), '')
         ),
         fee = p_unit_price,
         start_date = p_start_date,
         end_date = p_end_date,
         department_id = p_department_id,
         updated_at = now()
   where id = p_course_id and deleted_at is null and status <> 'archived'
   returning * into v_course;
  if v_course.id is null then raise exception '课程不存在或已经结课'; end if;

  update public.crs_course_prices set is_default = false, updated_at = now()
   where course_id = p_course_id and is_default = true;
  insert into public.crs_course_prices (
    course_id, name, price_type, unit_price, total_lessons, total_price,
    discount_rate, is_default, effective_from, effective_to, status, created_by
  ) values (
    p_course_id, '标准价格 ' || to_char(now(), 'YYYY-MM-DD HH24:MI'), 'per_lesson',
    p_unit_price, p_total_lessons, round(p_unit_price * p_total_lessons, 2),
    1, true, p_start_date, p_end_date, 'active', v_operator
  );

  insert into public.aud_operation_logs (user_id, action, resource_type, resource_id, changes)
  values (v_operator, 'update_course_info', 'course', p_course_id,
    jsonb_build_object(
      'unit_price', p_unit_price, 'total_lessons', p_total_lessons,
      'start_date', p_start_date, 'end_date', p_end_date,
      'department_id', p_department_id, 'weekdays', v_days,
      'time', nullif(trim(p_class_time), ''), 'teacher_name', nullif(trim(p_teacher_name), '')
    ));

  return jsonb_build_object('course_id', p_course_id, 'updated', true);
end;
$function$;

revoke all on function public.rpc_update_course_info(uuid,integer,numeric,date,date,uuid,text[],text,text) from public;
grant execute on function public.rpc_update_course_info(uuid,integer,numeric,date,date,uuid,text[],text,text) to authenticated;
