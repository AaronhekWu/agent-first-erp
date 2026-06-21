-- 0011 - Enrollment pricing snapshots, lesson-by-lesson billing, and backend permissions.

create or replace function public.has_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
    when 'teacher' then p_key = any(array[
      'students.view','courses.view','courses.attendance','followups.view'
    ])
    when 'viewer' then p_key = any(array[
      'students.view','courses.view','finance.view','followups.view','audits.view'
    ])
    else false
  end;
end;
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- Preserve customized staff permission lists while moving legacy course editing
-- rights to the new, narrower capabilities.
update public.acct_profiles
set permissions = (coalesce(permissions, '[]'::jsonb) - 'courses.update') || '"courses.attendance"'::jsonb,
    updated_at = now()
where primary_role = 'teacher'
  and jsonb_array_length(coalesce(permissions, '[]'::jsonb)) > 0
  and not coalesce(permissions, '[]'::jsonb) ? 'courses.attendance';

update public.acct_profiles
set permissions = coalesce(permissions, '[]'::jsonb) || '"courses.enroll"'::jsonb,
    updated_at = now()
where primary_role = 'counselor'
  and jsonb_array_length(coalesce(permissions, '[]'::jsonb)) > 0
  and not coalesce(permissions, '[]'::jsonb) ? 'courses.enroll';

alter table public.crs_enrollments
  add column if not exists list_unit_price numeric(10,2),
  add column if not exists gross_amount numeric(12,2),
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(12,4),
  add column if not exists discount_reason text,
  add column if not exists referrer_student_id uuid,
  add column if not exists price_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.crs_enrollment_price_history (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.crs_enrollments(id) on delete cascade,
  action text not null default 'created',
  snapshot jsonb not null,
  changed_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.crs_enrollment_price_history enable row level security;
drop policy if exists crs_enrollment_price_history_select on public.crs_enrollment_price_history;
create policy crs_enrollment_price_history_select on public.crs_enrollment_price_history
for select to authenticated using (public.has_permission('courses.view'));

create or replace function public.rpc_create_course(
  p_name character varying,
  p_subject character varying default null,
  p_level character varying default null,
  p_description text default null,
  p_max_capacity integer default null,
  p_fee numeric default null,
  p_start_date date default null,
  p_end_date date default null,
  p_schedule_info jsonb default '{}'::jsonb,
  p_department_id uuid default null,
  p_operator_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_operator uuid := auth.uid();
  v_course public.crs_courses;
  v_total_lessons integer;
begin
  if not public.has_permission('courses.create') then raise exception 'PERMISSION_DENIED: 无权创建课程'; end if;
  v_total_lessons := nullif(p_schedule_info->>'total_lessons', '')::integer;
  if p_name is null or trim(p_name) = '' then raise exception '课程名称不能为空'; end if;
  if p_subject is null or trim(p_subject) = '' then raise exception '学科不能为空'; end if;
  if p_level is null or trim(p_level) = '' then raise exception '年级不能为空'; end if;
  if v_total_lessons is null or v_total_lessons <= 0 then raise exception '计划总课时必须大于 0'; end if;
  if p_fee is null or p_fee <= 0 then raise exception '标准课时单价必须大于 0'; end if;
  if p_start_date is null or p_end_date is null then raise exception '课程开始和结束日期必填'; end if;
  if p_end_date < p_start_date then raise exception '结束日期不能早于开始日期'; end if;

  insert into public.crs_courses (
    name, subject, level, description, max_capacity, fee, start_date, end_date,
    schedule_info, department_id, created_by
  ) values (
    trim(p_name), trim(p_subject), trim(p_level), p_description, p_max_capacity, p_fee,
    p_start_date, p_end_date, p_schedule_info, p_department_id, v_operator
  ) returning * into v_course;

  insert into public.crs_course_prices (
    course_id, name, price_type, unit_price, total_lessons, total_price,
    discount_rate, is_default, effective_from, effective_to, status, created_by
  ) values (
    v_course.id, '标准价格', 'per_lesson', p_fee, v_total_lessons,
    round(p_fee * v_total_lessons, 2), 1, true, p_start_date, p_end_date, 'active', v_operator
  );

  insert into public.aud_operation_logs (user_id, action, resource_type, resource_id, changes)
  values (v_operator, 'create', 'course', v_course.id,
    jsonb_build_object('name', v_course.name, 'unit_price', p_fee, 'total_lessons', v_total_lessons));
  return jsonb_build_object('course_id', v_course.id, 'name', v_course.name, 'status', v_course.status);
end;
$$;

revoke all on function public.rpc_create_course(character varying,character varying,character varying,text,integer,numeric,date,date,jsonb,uuid,uuid) from public;
grant execute on function public.rpc_create_course(character varying,character varying,character varying,text,integer,numeric,date,date,jsonb,uuid,uuid) to authenticated;

create or replace function public.rpc_update_course_plan_v2(
  p_course_id uuid,
  p_total_lessons integer,
  p_unit_price numeric,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_operator uuid := auth.uid();
  v_course public.crs_courses;
  v_completed_sessions bigint;
begin
  if not public.has_permission('courses.plan') then raise exception 'PERMISSION_DENIED: 仅管理员或授权教务可修改课程计划'; end if;
  if p_total_lessons is null or p_total_lessons <= 0 then raise exception '计划总课时必须大于 0'; end if;
  if p_unit_price is null or p_unit_price <= 0 then raise exception '标准课时单价必须大于 0'; end if;
  if p_start_date is null or p_end_date is null then raise exception '课程开始和结束日期必填'; end if;
  if p_end_date < p_start_date then raise exception '结束日期不能早于开始日期'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_course_id::text, 0));
  select count(distinct a.class_date) into v_completed_sessions
    from public.crs_attendance a join public.crs_enrollments e on e.id = a.enrollment_id
   where e.course_id = p_course_id;
  if p_total_lessons < v_completed_sessions then
    raise exception '计划总课时不能少于已上课时（% 节）', v_completed_sessions;
  end if;
  update public.crs_courses
     set schedule_info = coalesce(schedule_info, '{}'::jsonb) || jsonb_build_object('total_lessons', p_total_lessons),
         fee = p_unit_price, start_date = p_start_date, end_date = p_end_date, updated_at = now()
   where id = p_course_id and deleted_at is null and status <> 'archived'
  returning * into v_course;
  if v_course.id is null then raise exception '课程不存在或已经结课'; end if;

  update public.crs_course_prices set is_default = false, updated_at = now()
   where course_id = p_course_id and is_default = true;
  insert into public.crs_course_prices (
    course_id, name, price_type, unit_price, total_lessons, total_price,
    discount_rate, is_default, effective_from, effective_to, status, created_by
  ) values (
    p_course_id, '标准价格 ' || to_char(now(), 'YYYY-MM-DD'), 'per_lesson', p_unit_price,
    p_total_lessons, round(p_unit_price * p_total_lessons, 2), 1, true,
    p_start_date, p_end_date, 'active', v_operator
  );
  insert into public.aud_operation_logs (user_id, action, resource_type, resource_id, changes)
  values (v_operator, 'update_plan', 'course', p_course_id,
    jsonb_build_object('total_lessons', p_total_lessons, 'unit_price', p_unit_price,
      'start_date', p_start_date, 'end_date', p_end_date));
  return jsonb_build_object('course_id', p_course_id, 'total_lessons', p_total_lessons,
    'unit_price', p_unit_price, 'start_date', p_start_date, 'end_date', p_end_date);
end;
$$;

grant execute on function public.rpc_update_course_plan_v2(uuid, integer, numeric, date, date) to authenticated;
revoke all on function public.rpc_update_course_plan_v2(uuid, integer, numeric, date, date) from public;
revoke execute on function public.rpc_update_course_plan(uuid, integer, date, date) from public, authenticated;

create or replace function public.rpc_enroll_student_v2(
  p_student_id uuid,
  p_course_id uuid,
  p_price_id uuid default null,
  p_campaign_id uuid default null,
  p_source text default 'normal',
  p_custom_discount_type text default null,
  p_custom_discount_value numeric default null,
  p_discount_reason text default null,
  p_referrer_student_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_operator uuid := auth.uid();
  v_course public.crs_courses;
  v_plan public.crs_course_prices;
  v_campaign public.promo_campaigns;
  v_enrollment public.crs_enrollments;
  v_lessons integer;
  v_gift_lessons integer := 0;
  v_list_unit numeric(10,2);
  v_gross numeric(12,2);
  v_discount_type text;
  v_discount_value numeric(12,4) := 0;
  v_discount numeric(12,2) := 0;
  v_net numeric(12,2);
  v_effective_unit numeric(10,2);
  v_enrolled_count integer;
  v_snapshot jsonb;
begin
  if not public.has_permission('courses.enroll') then raise exception 'PERMISSION_DENIED: 无权办理报名'; end if;
  if p_source not in ('normal','campaign','referral','custom') then raise exception '报名类型无效'; end if;
  if not exists (select 1 from public.stu_students where id=p_student_id and deleted_at is null and status <> 'inactive') then
    raise exception '学员不存在或已停用';
  end if;
  select * into v_course from public.crs_courses where id=p_course_id and deleted_at is null for update;
  if not found or v_course.status <> 'active' then raise exception '课程不存在或当前不可报名'; end if;
  if exists (select 1 from public.crs_enrollments where student_id=p_student_id and course_id=p_course_id and status in ('enrolled','completed')) then
    raise exception '该学员已报名此课程';
  end if;
  select count(*) into v_enrolled_count from public.crs_enrollments where course_id=p_course_id and status='enrolled';
  if v_course.max_capacity is not null and v_enrolled_count >= v_course.max_capacity then raise exception '课程已满员'; end if;

  v_lessons := nullif(v_course.schedule_info->>'total_lessons','')::integer;
  v_list_unit := v_course.fee;
  if v_lessons is null or v_lessons <= 0 or v_list_unit is null or v_list_unit <= 0 then
    raise exception '课程尚未完整设置课时与标准单价';
  end if;
  v_gross := round(v_list_unit * v_lessons, 2);

  if p_price_id is not null then
    select * into v_plan from public.crs_course_prices
     where id=p_price_id and course_id=p_course_id and status='active'
       and (effective_from is null or effective_from <= current_date)
       and (effective_to is null or effective_to >= current_date);
    if not found then raise exception '价格方案无效或已过期'; end if;
    v_lessons := coalesce(v_plan.total_lessons, v_lessons);
    v_gross := coalesce(v_plan.total_price, round(coalesce(v_plan.unit_price,v_list_unit) * v_lessons,2));
  end if;

  if p_campaign_id is not null then
    select * into v_campaign from public.promo_campaigns
     where id=p_campaign_id and status='active'
       and type in ('enrollment_discount','course_discount','referral')
       and (start_date is null or start_date <= current_date)
       and (end_date is null or end_date >= current_date)
       and (max_usage is null or used_count < max_usage)
       and (jsonb_array_length(coalesce(applicable_course_ids,'[]'::jsonb))=0 or applicable_course_ids ? p_course_id::text)
     for update;
    if not found then raise exception '优惠活动无效、不适用于本课程或已过期'; end if;
    v_discount_type := v_campaign.discount_type;
    v_discount_value := coalesce(v_campaign.discount_value,0);
    v_gift_lessons := coalesce(v_campaign.gift_lessons,0);
  elsif p_custom_discount_type is not null then
    if not public.has_permission('courses.pricing') then raise exception 'PERMISSION_DENIED: 自定义优惠需要管理员权限'; end if;
    if nullif(trim(coalesce(p_discount_reason,'')),'') is null then raise exception '自定义优惠必须填写原因'; end if;
    v_discount_type := p_custom_discount_type;
    v_discount_value := coalesce(p_custom_discount_value,0);
  end if;

  if p_source = 'normal' and (p_campaign_id is not null or p_custom_discount_type is not null) then
    raise exception '正常报名不能附带活动或自定义优惠';
  elsif p_source = 'campaign' and (p_campaign_id is null or v_campaign.type = 'referral') then
    raise exception '活动报名必须选择非老带新的有效活动';
  elsif p_source = 'referral' and (p_campaign_id is null or v_campaign.type <> 'referral') then
    raise exception '老带新报名必须选择有效的老带新活动';
  elsif p_source = 'custom' and p_custom_discount_type is null then
    raise exception '自定义优惠缺少优惠类型';
  end if;

  if v_discount_type = 'fixed' then
    v_discount := least(v_gross, greatest(v_discount_value,0));
  elsif v_discount_type = 'percentage' then
    if v_discount_value < 0 or v_discount_value > 100 then raise exception '折扣百分比必须在 0 到 100 之间'; end if;
    v_discount := round(v_gross * v_discount_value / 100, 2);
  elsif v_discount_type is not null and v_discount_type <> 'gift_lessons' then
    raise exception '不支持的优惠类型';
  end if;
  v_lessons := v_lessons + v_gift_lessons;
  v_net := greatest(0, v_gross - v_discount);
  v_effective_unit := round(v_net / v_lessons, 2);
  v_snapshot := jsonb_build_object(
    'version',1,'course_name',v_course.name,'list_unit_price',v_list_unit,
    'total_lessons',v_lessons,'gift_lessons',v_gift_lessons,'gross_amount',v_gross,
    'discount_type',v_discount_type,'discount_value',v_discount_value,
    'discount_amount',v_discount,'discount_reason',p_discount_reason,
    'net_amount',v_net,'effective_unit_price',v_effective_unit,
    'price_plan_id',p_price_id,'price_plan_name',v_plan.name,
    'campaign_id',p_campaign_id,'campaign_name',v_campaign.name,
    'source',p_source,'referrer_student_id',p_referrer_student_id,'quoted_at',now()
  );

  insert into public.crs_enrollments (
    student_id,course_id,price_id,campaign_id,notes,source,unit_price,total_lessons,
    consumed_lessons,remaining_lessons,total_amount,paid_amount,discount_amount,
    list_unit_price,gross_amount,discount_type,discount_value,discount_reason,
    referrer_student_id,price_snapshot,created_by
  ) values (
    p_student_id,p_course_id,p_price_id,p_campaign_id,p_notes,p_source,v_effective_unit,v_lessons,
    0,v_lessons,v_net,0,v_discount,v_list_unit,v_gross,v_discount_type,v_discount_value,
    p_discount_reason,p_referrer_student_id,v_snapshot,v_operator
  ) returning * into v_enrollment;

  insert into public.crs_enrollment_price_history(enrollment_id,action,snapshot,changed_by)
  values(v_enrollment.id,'created',v_snapshot,v_operator);
  if p_campaign_id is not null then
    update public.promo_campaigns set used_count=used_count+1,updated_at=now() where id=p_campaign_id;
  end if;
  if p_source='referral' then
    if p_referrer_student_id is null or p_referrer_student_id=p_student_id then raise exception '老带新必须选择其他推荐学员'; end if;
    insert into public.promo_referrals(campaign_id,referrer_student_id,referred_student_id,status)
    values(p_campaign_id,p_referrer_student_id,p_student_id,'applied');
  end if;
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(v_operator,'enroll_student','enrollment',v_enrollment.id,v_snapshot);
  return jsonb_build_object('message','报名成功','enrollment_id',v_enrollment.id,'pricing',v_snapshot);
end;
$$;

grant execute on function public.rpc_enroll_student_v2(uuid,uuid,uuid,uuid,text,text,numeric,text,uuid,text) to authenticated;
revoke all on function public.rpc_enroll_student_v2(uuid,uuid,uuid,uuid,text,text,numeric,text,uuid,text) from public;
revoke execute on function public.rpc_enroll_student(uuid,uuid,uuid,uuid,uuid,text,character varying) from public, authenticated;

create or replace function public.guard_attendance_permission()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is not null and not public.has_permission('courses.attendance') then raise exception 'PERMISSION_DENIED: 无权操作点名'; end if;
  return new;
end;
$$;

drop trigger if exists crs_attendance_permission on public.crs_attendance;
create trigger crs_attendance_permission before insert or update on public.crs_attendance
for each row execute function public.guard_attendance_permission();

create or replace function public.rpc_consume_lesson(
  p_enrollment_id uuid,
  p_operator_id uuid default null,
  p_attendance_id uuid default null,
  p_lesson_count integer default 1,
  p_unit_price numeric default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_operator uuid := auth.uid();
  v_enrollment public.crs_enrollments;
  v_account public.fin_accounts;
  v_actual_price numeric(10,2);
  v_consume_amount numeric(12,2);
  v_consumed_amount numeric(12,2);
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_consumption public.fin_consumption_logs;
  v_tx public.fin_transactions;
begin
  if p_attendance_id is null and not public.has_permission('finance.consume') then raise exception 'PERMISSION_DENIED: 无权手动消课'; end if;
  if p_attendance_id is not null and not public.has_permission('courses.attendance') then raise exception 'PERMISSION_DENIED: 无权通过点名消课'; end if;
  if p_lesson_count <= 0 then raise exception '消课数量必须大于零'; end if;
  select * into v_enrollment from public.crs_enrollments where id=p_enrollment_id and status='enrolled' for update;
  if not found then raise exception '报名记录不存在或状态无效'; end if;
  if v_enrollment.remaining_lessons is not null and p_lesson_count > v_enrollment.remaining_lessons then raise exception '剩余课时不足'; end if;
  if p_unit_price is not null and not public.has_permission('courses.pricing') then raise exception 'PERMISSION_DENIED: 无权覆盖报名课时单价'; end if;
  v_actual_price := coalesce(p_unit_price,v_enrollment.unit_price,0);
  v_consume_amount := round(v_actual_price*p_lesson_count,2);
  if v_enrollment.remaining_lessons is not null and p_lesson_count=v_enrollment.remaining_lessons and v_enrollment.total_amount is not null then
    select coalesce(sum(amount),0) into v_consumed_amount from public.fin_consumption_logs where enrollment_id=p_enrollment_id;
    v_consume_amount := greatest(0,v_enrollment.total_amount-v_consumed_amount);
    v_actual_price := round(v_consume_amount/p_lesson_count,2);
  end if;
  select * into v_account from public.fin_accounts where student_id=v_enrollment.student_id for update;
  if not found then raise exception '学员财务账户不存在'; end if;
  if v_account.balance < v_consume_amount then raise exception '余额不足：本次需扣 %，当前余额 %',v_consume_amount,v_account.balance; end if;
  v_balance_before:=v_account.balance; v_balance_after:=v_balance_before-v_consume_amount;
  update public.fin_accounts set balance=v_balance_after,total_consumed=total_consumed+v_consume_amount,updated_at=now() where id=v_account.id;
  update public.crs_enrollments set consumed_lessons=coalesce(consumed_lessons,0)+p_lesson_count,
    remaining_lessons=case when remaining_lessons is null then null else remaining_lessons-p_lesson_count end,
    status=case when remaining_lessons is not null and remaining_lessons-p_lesson_count<=0 then 'completed' else status end,
    completed_at=case when remaining_lessons is not null and remaining_lessons-p_lesson_count<=0 then now() else completed_at end,
    updated_at=now() where id=p_enrollment_id;
  insert into public.fin_consumption_logs(enrollment_id,attendance_id,lesson_count,unit_price,amount,type,created_by)
  values(p_enrollment_id,p_attendance_id,p_lesson_count,v_actual_price,v_consume_amount,'normal',v_operator) returning * into v_consumption;
  insert into public.fin_transactions(account_id,type,amount,balance_before,balance_after,reference_type,reference_id,description,created_by)
  values(v_account.id,'consume',v_consume_amount,v_balance_before,v_balance_after,'consumption_log',v_consumption.id,
    '课消 '||p_lesson_count||' 课时，报名单价 '||v_actual_price,v_operator) returning * into v_tx;
  return jsonb_build_object('consumption_log_id',v_consumption.id,'transaction_id',v_tx.id,
    'amount',v_consume_amount,'unit_price',v_actual_price,'balance_after',v_balance_after,
    'remaining_lessons',case when v_enrollment.remaining_lessons is null then null else v_enrollment.remaining_lessons-p_lesson_count end);
end;
$$;

revoke all on function public.rpc_consume_lesson(uuid,uuid,uuid,integer,numeric) from public;
grant execute on function public.rpc_consume_lesson(uuid,uuid,uuid,integer,numeric) to authenticated;

create or replace function public.rpc_list_course_enrollments(p_course_id uuid,p_class_date date default current_date)
returns jsonb language sql security definer set search_path to 'public'
as $$
select coalesce(jsonb_agg(row_to_json(t) order by t.student_name),'[]'::jsonb)
from (
  select e.id enrollment_id,e.student_id,s.name student_name,s.student_code,s.phone student_phone,
    e.status,e.unit_price,e.list_unit_price,e.total_lessons,e.consumed_lessons,e.remaining_lessons,
    e.gross_amount,e.discount_amount,e.total_amount,e.discount_type,e.discount_value,e.discount_reason,
    e.source,e.notes,e.price_snapshot,coalesce(fa.balance,0) balance,
    a.id today_attendance_id,a.status today_status,e.created_at enrolled_at
  from public.crs_enrollments e
  join public.stu_students s on s.id=e.student_id and s.deleted_at is null
  left join public.fin_accounts fa on fa.student_id=s.id
  left join public.crs_attendance a on a.enrollment_id=e.id and a.class_date=p_class_date
  where e.course_id=p_course_id and e.status in ('enrolled','completed','transferred','cancelled')
) t;
$$;

revoke all on function public.rpc_list_course_enrollments(uuid,date) from public;
grant execute on function public.rpc_list_course_enrollments(uuid,date) to authenticated;

insert into public.crs_course_prices(
  course_id,name,price_type,unit_price,total_lessons,total_price,discount_rate,is_default,
  effective_from,effective_to,status,created_by
)
select c.id,'标准价格','per_lesson',c.fee,nullif(c.schedule_info->>'total_lessons','')::integer,
  round(c.fee*nullif(c.schedule_info->>'total_lessons','')::integer,2),1,true,c.start_date,c.end_date,'active',c.created_by
from public.crs_courses c
where c.deleted_at is null and c.fee>0 and nullif(c.schedule_info->>'total_lessons','')::integer>0
  and not exists(select 1 from public.crs_course_prices p where p.course_id=c.id and p.is_default=true);

notify pgrst,'reload schema';
