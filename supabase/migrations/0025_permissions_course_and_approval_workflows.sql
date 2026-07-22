-- 0025 — Permission consistency, course lifecycle, negative-balance warnings,
-- manual-consumption approval and reversible approval history.

create or replace function public.has_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
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
      'dashboard.view','students.view','students.create','students.update',
      'courses.view','courses.enroll','finance.view','finance.recharge',
      'followups.view','followups.create'
    ])
    when 'teacher' then p_key = any(array[
      'dashboard.view','students.view','courses.view','followups.view'
    ])
    when 'viewer' then p_key = any(array[
      'dashboard.view','students.view','courses.view','finance.view',
      'followups.view','audits.view'
    ])
    else false
  end;
end;
$function$;

create or replace function public.can_view_student_finance(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.has_permission('finance.view') and exists (
    select 1
      from public.stu_students s
     where s.id = p_student_id
       and s.deleted_at is null
       and (
         public.get_my_role() = 'admin'
         or s.assigned_to = auth.uid()
         or s.department_id = any(public.get_my_department_ids())
         or s.department_id = (select p.department_id from public.acct_profiles p where p.id = auth.uid())
         or exists (
           select 1 from public.crs_enrollments e
           join public.crs_courses c on c.id = e.course_id
           where e.student_id = s.id and c.teacher_id = auth.uid()
         )
       )
  );
$function$;

revoke all on function public.can_view_student_finance(uuid) from public;
grant execute on function public.can_view_student_finance(uuid) to authenticated;

drop policy if exists fin_accounts_authenticated_select on public.fin_accounts;
create policy fin_accounts_authenticated_select on public.fin_accounts
for select to authenticated
using (public.can_view_student_finance(student_id));

drop policy if exists fin_transactions_authenticated_select on public.fin_transactions;
create policy fin_transactions_authenticated_select on public.fin_transactions
for select to authenticated
using (exists (
  select 1 from public.fin_accounts a
  where a.id = fin_transactions.account_id
    and public.can_view_student_finance(a.student_id)
));

drop policy if exists fin_recharges_authenticated_select on public.fin_recharges;
create policy fin_recharges_authenticated_select on public.fin_recharges
for select to authenticated
using (exists (
  select 1 from public.fin_accounts a
  where a.id = fin_recharges.account_id
    and public.can_view_student_finance(a.student_id)
));

drop policy if exists fin_consumption_logs_authenticated_select on public.fin_consumption_logs;
create policy fin_consumption_logs_authenticated_select on public.fin_consumption_logs
for select to authenticated
using (exists (
  select 1 from public.crs_enrollments e
  where e.id = fin_consumption_logs.enrollment_id
    and public.can_view_student_finance(e.student_id)
));

drop policy if exists fin_transfers_authenticated_select on public.fin_transfers;
create policy fin_transfers_authenticated_select on public.fin_transfers
for select to authenticated
using (public.can_view_student_finance(student_id));

drop policy if exists aud_approvals_select on public.aud_approvals;
create policy aud_approvals_select on public.aud_approvals
for select to authenticated
using (public.has_permission('audits.view') or requested_by = auth.uid());

create or replace function public.rpc_batch_assign_students(
  p_student_ids uuid[],
  p_counselor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_updated integer;
begin
  if not public.has_permission('students.update') then
    raise exception 'PERMISSION_DENIED: 无权批量转移顾问';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0 then
    raise exception 'INVALID_INPUT: 请选择学员';
  end if;
  if not exists (
    select 1 from public.acct_profiles
     where id = p_counselor_id and is_active is not false
       and primary_role in ('counselor','admin')
  ) then raise exception 'INVALID_COUNSELOR: 目标顾问不存在或已停用'; end if;

  update public.stu_students
     set assigned_to = p_counselor_id, updated_at = now()
   where id = any(p_student_ids) and deleted_at is null;
  get diagnostics v_updated = row_count;

  insert into public.aud_operation_logs(user_id, action, resource_type, changes)
  values (auth.uid(), 'batch_assign_counselor', 'student',
    jsonb_build_object('student_ids', p_student_ids, 'counselor_id', p_counselor_id, 'updated', v_updated));
  return jsonb_build_object('updated', v_updated);
end;
$function$;

grant execute on function public.rpc_batch_assign_students(uuid[],uuid) to authenticated;

create or replace function public.rpc_remove_staff_from_department(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_previous uuid;
begin
  if not public.has_permission('campus.manage') then
    raise exception 'PERMISSION_DENIED: 无权移除部门成员';
  end if;
  select department_id into v_previous from public.acct_profiles where id = p_id for update;
  if not found then raise exception 'STAFF_NOT_FOUND: 成员不存在'; end if;
  update public.acct_profiles set department_id = null, updated_at = now() where id = p_id;
  update public.acct_departments set manager_id = null, updated_at = now() where manager_id = p_id;
  delete from public.acct_user_departments where user_id = p_id;
  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'remove_from_department', 'staff', p_id,
    jsonb_build_object('previous_department_id', v_previous));
  return jsonb_build_object('staff_id', p_id, 'previous_department_id', v_previous, 'removed', true);
end;
$function$;

grant execute on function public.rpc_remove_staff_from_department(uuid) to authenticated;

create or replace function public.set_default_student_department()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  select id into new.department_id
    from public.acct_departments
   where trim(name) = '教学部'
   order by created_at
   limit 1;
  return new;
end;
$function$;

drop trigger if exists trg_default_student_department on public.stu_students;
create trigger trg_default_student_department
before insert or update of department_id on public.stu_students
for each row execute function public.set_default_student_department();

create or replace function public.prevent_negative_balance_enrollment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_balance numeric;
begin
  if new.status = 'enrolled' and coalesce(new.source, 'normal') <> 'transfer' then
    select balance into v_balance from public.fin_accounts where student_id = new.student_id for update;
    if found and v_balance < 0 then
      raise exception 'ACCOUNT_IN_DEBT: 学员当前余额为 %，请先充值后再报名新课', v_balance;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_prevent_negative_balance_enrollment on public.crs_enrollments;
create trigger trg_prevent_negative_balance_enrollment
before insert on public.crs_enrollments
for each row execute function public.prevent_negative_balance_enrollment();

create or replace function public.rpc_list_course_sessions(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.has_permission('courses.view') then
    raise exception 'PERMISSION_DENIED: 无权查看课程进度';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.class_date), '[]'::jsonb)
    into v_result from (
    select a.class_date,
           count(*)::integer as headcount,
           count(*) filter (where a.status in ('present','late'))::integer as attended
      from public.crs_attendance a
      join public.crs_enrollments e on e.id = a.enrollment_id
     where e.course_id = p_course_id
     group by a.class_date
  ) t;
  return v_result;
end;
$function$;

grant execute on function public.rpc_list_course_sessions(uuid) to authenticated;

create or replace function public.rpc_update_enrollment_unit_price(
  p_enrollment_id uuid,
  p_unit_price numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_enrollment public.crs_enrollments;
  v_consumed_amount numeric;
  v_snapshot jsonb;
begin
  if not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权设置学员单独价格';
  end if;
  if p_unit_price is null or p_unit_price <= 0 then raise exception 'INVALID_PRICE: 单价必须大于 0'; end if;
  if nullif(trim(coalesce(p_reason,'')), '') is null then raise exception 'INVALID_REASON: 调价原因必填'; end if;
  select * into v_enrollment from public.crs_enrollments
   where id = p_enrollment_id and status = 'enrolled' for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 在读报名不存在'; end if;
  select coalesce(sum(amount),0) into v_consumed_amount
    from public.fin_consumption_logs where enrollment_id = p_enrollment_id;
  v_snapshot := to_jsonb(v_enrollment) || jsonb_build_object(
    'new_unit_price', p_unit_price, 'reason', trim(p_reason), 'changed_at', now()
  );
  update public.crs_enrollments
     set unit_price = p_unit_price,
         total_amount = round(v_consumed_amount + p_unit_price * coalesce(remaining_lessons,0), 2),
         price_snapshot = coalesce(price_snapshot,'{}'::jsonb) || jsonb_build_object(
           'manual_unit_price', p_unit_price, 'manual_price_reason', trim(p_reason), 'manual_price_at', now()
         ),
         updated_at = now()
   where id = p_enrollment_id;
  insert into public.crs_enrollment_price_history(enrollment_id, action, snapshot, changed_by)
  values (p_enrollment_id, 'manual_unit_price', v_snapshot, auth.uid());
  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'update_enrollment_unit_price', 'enrollment', p_enrollment_id,
    jsonb_build_object('from', v_enrollment.unit_price, 'to', p_unit_price, 'reason', trim(p_reason)));
  return jsonb_build_object('enrollment_id', p_enrollment_id, 'unit_price', p_unit_price);
end;
$function$;

grant execute on function public.rpc_update_enrollment_unit_price(uuid,numeric,text) to authenticated;

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
  c.schedule_info,
  coalesce(es.unsettled_enrollment_count, 0::bigint) as unsettled_enrollment_count
from public.crs_courses c
left join public.acct_departments d on d.id = c.department_id
left join lateral (
  select count(*) as total_enrolled,
    count(*) filter (where e.status = 'enrolled') as active_enrolled,
    count(*) filter (where e.status = 'completed') as completed_count,
    coalesce(sum(e.remaining_lessons) filter (where e.status = 'enrolled'), 0)::bigint as enrolled_remaining_lessons,
    count(*) filter (
      where e.status not in ('cancelled','transferred')
        and e.remaining_lessons is distinct from 0
    ) as unsettled_enrollment_count
  from public.crs_enrollments e where e.course_id = c.id
) es on true
left join lateral (
  select count(*) as total_attendance,
    count(*) filter (where a.status in ('present','late')) as present_count,
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

create or replace function public.rpc_complete_course(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_course public.crs_courses;
  v_completed bigint;
  v_total integer;
  v_unsettled bigint;
  v_finished boolean;
begin
  if not public.has_permission('courses.archive') then
    raise exception 'PERMISSION_DENIED: 无权结课';
  end if;
  select * into v_course from public.crs_courses
   where id = p_course_id and deleted_at is null for update;
  if not found then raise exception 'COURSE_NOT_FOUND: 课程不存在'; end if;
  if v_course.status = 'archived' then raise exception 'COURSE_ARCHIVED: 课程已经结课'; end if;
  select count(distinct a.class_date) into v_completed
    from public.crs_attendance a
    join public.crs_enrollments e on e.id = a.enrollment_id
   where e.course_id = p_course_id;
  v_total := nullif(v_course.schedule_info->>'total_lessons','')::integer;
  v_finished := (v_total is not null and v_total > 0 and v_completed >= v_total)
    or (v_course.end_date is not null and v_course.end_date < current_date);
  if not v_finished then
    raise exception 'COURSE_NOT_FINISHED: 课程尚未上完或未到结束日期';
  end if;
  select count(*) into v_unsettled from public.crs_enrollments
   where course_id = p_course_id and status not in ('cancelled','transferred')
     and remaining_lessons is distinct from 0;
  if v_unsettled > 0 then
    raise exception 'ENROLLMENTS_UNSETTLED: 仍有 % 名学员剩余课时不为 0', v_unsettled;
  end if;
  update public.crs_courses
     set status = 'archived',
         schedule_info = coalesce(schedule_info,'{}'::jsonb) || jsonb_build_object('is_archived', true),
         updated_at = now()
   where id = p_course_id;
  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'complete_and_archive_course', 'course', p_course_id,
    jsonb_build_object('completed_sessions', v_completed, 'total_lessons', v_total));
  return jsonb_build_object('course_id', p_course_id, 'status', 'archived', 'is_archived', true);
end;
$function$;

grant execute on function public.rpc_complete_course(uuid) to authenticated;

create or replace function public.rpc_delete_course(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_permission('courses.archive') then
    raise exception 'PERMISSION_DENIED: 无权删除课程';
  end if;
  if exists (
    select 1 from public.crs_enrollments where course_id = p_course_id and status = 'enrolled'
  ) then raise exception 'COURSE_HAS_ACTIVE_STUDENTS: 请先将班级内在读学员退课或转课'; end if;
  update public.crs_courses set deleted_at = now(), updated_at = now()
   where id = p_course_id and deleted_at is null;
  if not found then raise exception 'COURSE_NOT_FOUND: 课程不存在'; end if;
  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'soft_delete_course', 'course', p_course_id, jsonb_build_object('deleted_at', now()));
  return jsonb_build_object('course_id', p_course_id, 'deleted', true);
end;
$function$;

grant execute on function public.rpc_delete_course(uuid) to authenticated;

create or replace function public.rpc_consume_lesson(
  p_enrollment_id uuid,
  p_operator_id uuid default null,
  p_attendance_id uuid default null,
  p_lesson_count integer default 1,
  p_unit_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := auth.uid();
  v_enrollment public.crs_enrollments;
  v_account public.fin_accounts;
  v_actual_price numeric(10,2);
  v_consume_amount numeric(12,2);
  v_consumed_amount numeric(12,2);
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_remaining_after integer;
  v_consumption public.fin_consumption_logs;
  v_tx public.fin_transactions;
begin
  if p_attendance_id is null and not public.has_permission('finance.consume') then
    raise exception 'PERMISSION_DENIED: 无权手动消课';
  end if;
  if p_attendance_id is not null and not public.has_permission('courses.attendance') then
    raise exception 'PERMISSION_DENIED: 无权通过点名消课';
  end if;
  if p_lesson_count <= 0 then raise exception '消课数量必须大于零'; end if;
  select * into v_enrollment from public.crs_enrollments
   where id = p_enrollment_id and status = 'enrolled' for update;
  if not found then raise exception '报名记录不存在或状态无效'; end if;
  if p_unit_price is not null and not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权覆盖报名课时单价';
  end if;
  v_actual_price := coalesce(p_unit_price, v_enrollment.unit_price, 0);
  v_consume_amount := round(v_actual_price * p_lesson_count, 2);
  if v_enrollment.remaining_lessons is not null
     and v_enrollment.remaining_lessons > 0
     and p_lesson_count = v_enrollment.remaining_lessons
     and v_enrollment.total_amount is not null then
    select coalesce(sum(amount),0) into v_consumed_amount
      from public.fin_consumption_logs where enrollment_id = p_enrollment_id;
    v_consume_amount := greatest(0, v_enrollment.total_amount - v_consumed_amount);
    v_actual_price := round(v_consume_amount / p_lesson_count, 2);
  end if;
  select * into v_account from public.fin_accounts
   where student_id = v_enrollment.student_id for update;
  if not found then raise exception '学员财务账户不存在'; end if;
  v_balance_before := v_account.balance;
  v_balance_after := v_balance_before - v_consume_amount;
  v_remaining_after := case when v_enrollment.remaining_lessons is null then null
    else v_enrollment.remaining_lessons - p_lesson_count end;
  update public.fin_accounts
     set balance = v_balance_after,
         total_consumed = total_consumed + v_consume_amount,
         updated_at = now()
   where id = v_account.id;
  update public.crs_enrollments
     set consumed_lessons = coalesce(consumed_lessons,0) + p_lesson_count,
         remaining_lessons = v_remaining_after,
         status = status,
         completed_at = completed_at,
         updated_at = now()
   where id = p_enrollment_id;
  insert into public.fin_consumption_logs(
    enrollment_id, attendance_id, lesson_count, unit_price, amount, type, created_by
  ) values (
    p_enrollment_id, p_attendance_id, p_lesson_count, v_actual_price, v_consume_amount, 'normal', v_operator
  ) returning * into v_consumption;
  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after, reference_type,
    reference_id, description, created_by
  ) values (
    v_account.id, 'consume', v_consume_amount, v_balance_before, v_balance_after,
    'consumption_log', v_consumption.id,
    '课消 '||p_lesson_count||' 课时，报名单价 '||v_actual_price, v_operator
  ) returning * into v_tx;
  return jsonb_build_object(
    'consumption_log_id',v_consumption.id,'transaction_id',v_tx.id,
    'amount',v_consume_amount,'unit_price',v_actual_price,
    'balance_before',v_balance_before,'balance_after',v_balance_after,
    'remaining_before',v_enrollment.remaining_lessons,'remaining_lessons',v_remaining_after,
    'lesson_count',p_lesson_count
  );
end;
$function$;

revoke all on function public.rpc_consume_lesson(uuid,uuid,uuid,integer,numeric) from public;
grant execute on function public.rpc_consume_lesson(uuid,uuid,uuid,integer,numeric) to authenticated;

create or replace view public.v_negative_lesson_warnings as
select e.id as enrollment_id, e.student_id, s.name as student_name,
       e.course_id, c.name as course_name, e.remaining_lessons,
       e.updated_at
from public.crs_enrollments e
join public.stu_students s on s.id = e.student_id and s.deleted_at is null
join public.crs_courses c on c.id = e.course_id and c.deleted_at is null
where e.status = 'enrolled' and e.remaining_lessons < 0;

alter view public.v_negative_lesson_warnings set (security_invoker = true);

alter table public.aud_approvals
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid,
  add column if not exists reversal_note text,
  add column if not exists reversal_result jsonb;

create or replace function public.validate_approval_request(
  p_type text,
  p_target_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_balance numeric;
  v_lesson_count integer;
begin
  if p_type = 'finance_consume' then
    if not public.has_permission('finance.consume') then
      raise exception 'PERMISSION_DENIED: 无权发起手动消课';
    end if;
    if (p_payload->>'p_enrollment_id')::uuid is distinct from p_target_id then
      raise exception 'APPROVAL_TARGET_MISMATCH: 报名参数与审批目标不一致';
    end if;
    v_lesson_count := (p_payload->>'p_lesson_count')::integer;
    if v_lesson_count is null or v_lesson_count <= 0 then
      raise exception 'INVALID_LESSONS: 消课数量必须大于 0';
    end if;
    if (p_payload->>'p_consume_date')::date is null then
      raise exception 'INVALID_DATE: 消课日期必填';
    end if;
    if nullif(trim(coalesce(p_payload->>'p_reason','')), '') is null then
      raise exception 'INVALID_REASON: 手动消课原因必填';
    end if;
    perform 1 from public.crs_enrollments where id = p_target_id and status = 'enrolled';
    if not found then raise exception 'ENROLLMENT_NOT_FOUND: 在读报名不存在'; end if;
    return;
  end if;

  perform public.validate_approval_request_base(p_type, p_target_id, p_payload);
  if p_type = 'student_delete' then
    if exists (
      select 1 from public.crs_enrollments
       where student_id = p_target_id and status = 'enrolled'
    ) then raise exception 'STUDENT_HAS_ENROLLMENTS: 请先完成退课或转课'; end if;
    select balance into v_balance from public.fin_accounts
     where student_id = p_target_id for update;
    if found and v_balance <> 0 then
      raise exception 'STUDENT_HAS_BALANCE: 请先结清学员账户余额';
    end if;
  end if;
end;
$function$;

revoke all on function public.validate_approval_request(text,uuid,jsonb) from public;
revoke all on function public.validate_approval_request(text,uuid,jsonb) from authenticated;

drop index if exists public.aud_approvals_one_pending_target_idx;
create unique index aud_approvals_one_pending_target_idx
  on public.aud_approvals (
    (case
      when type in ('student_delete','finance_refund') then 'student'
      when type in ('course_archive','course_delete') then 'course'
      when type in ('enrollment_drop','enrollment_transfer','finance_consume') then 'enrollment'
      when type = 'department_delete' then 'department'
      when type = 'staff_deactivate' then 'staff'
      when type = 'finance_txn_delete' then 'finance_txn'
      else type
    end), target_id
  ) where status = 'pending' and target_id is not null;

create or replace function public.rpc_create_approval_request(
  p_type text,
  p_title text,
  p_reason text default null,
  p_target_id uuid default null,
  p_target_label text default null,
  p_amount numeric default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_scope text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'approval title is required'; end if;
  perform public.validate_approval_request(p_type, p_target_id, coalesce(p_payload,'{}'::jsonb));
  if p_type = 'finance_refund'
     and p_amount is distinct from (p_payload->>'p_amount')::numeric then
    raise exception 'APPROVAL_AMOUNT_MISMATCH: 展示金额与执行金额不一致';
  end if;
  v_scope := case
    when p_type in ('student_delete','finance_refund') then 'student'
    when p_type in ('course_archive','course_delete') then 'course'
    when p_type in ('enrollment_drop','enrollment_transfer','finance_consume') then 'enrollment'
    when p_type = 'department_delete' then 'department'
    when p_type = 'staff_deactivate' then 'staff'
    when p_type = 'finance_txn_delete' then 'finance_txn'
    else p_type
  end;
  perform pg_advisory_xact_lock(hashtextextended(v_scope || ':' || p_target_id::text, 0));
  if exists (
    select 1 from public.aud_approvals
     where target_id = p_target_id and status = 'pending'
       and case
         when type in ('student_delete','finance_refund') then 'student'
         when type in ('course_archive','course_delete') then 'course'
         when type in ('enrollment_drop','enrollment_transfer','finance_consume') then 'enrollment'
         when type = 'department_delete' then 'department'
         when type = 'staff_deactivate' then 'staff'
         when type = 'finance_txn_delete' then 'finance_txn'
         else type end = v_scope
  ) then raise exception 'APPROVAL_ALREADY_PENDING: 该对象已有待处理审批'; end if;
  begin
    insert into public.aud_approvals(
      type,title,reason,target_id,target_label,amount,payload,requested_by
    ) values (
      p_type,p_title,nullif(trim(coalesce(p_reason,'')),''),p_target_id,
      p_target_label,p_amount,coalesce(p_payload,'{}'::jsonb),auth.uid()
    ) returning id into v_id;
  exception when unique_violation then
    raise exception 'APPROVAL_ALREADY_PENDING: 该对象已有待处理审批';
  end;
  return v_id;
end;
$function$;

grant execute on function public.rpc_create_approval_request(text,text,text,uuid,text,numeric,jsonb) to authenticated;

create or replace function public._exec_approved_consume(p_payload jsonb, p_operator uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_date date := (p_payload->>'p_consume_date')::date;
  v_reason text := trim(p_payload->>'p_reason');
begin
  v_result := public.rpc_consume_lesson(
    p_enrollment_id => (p_payload->>'p_enrollment_id')::uuid,
    p_operator_id => p_operator,
    p_attendance_id => null,
    p_lesson_count => (p_payload->>'p_lesson_count')::integer,
    p_unit_price => (p_payload->>'p_unit_price')::numeric
  );
  update public.fin_consumption_logs
     set created_at = v_date::timestamp at time zone 'Asia/Hong_Kong',
         notes = v_reason
   where id = (v_result->>'consumption_log_id')::uuid;
  update public.fin_transactions
     set created_at = v_date::timestamp at time zone 'Asia/Hong_Kong',
         description = description || '；手动补录原因：' || v_reason,
         metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
           'manual', true, 'consume_date', v_date, 'reason', v_reason
         )
   where id = (v_result->>'transaction_id')::uuid;
  return v_result || jsonb_build_object('consume_date',v_date,'reason',v_reason);
end;
$function$;

revoke all on function public._exec_approved_consume(jsonb,uuid) from public;
revoke all on function public._exec_approved_consume(jsonb,uuid) from authenticated;

create or replace function public.rpc_review_approval(
  p_id uuid,
  p_status text,
  p_reviewer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_approval public.aud_approvals%rowtype;
  v_reviewer uuid := auth.uid();
  v_result jsonb;
  v_action_result jsonb;
  v_before jsonb;
  v_new_id uuid;
begin
  if v_reviewer is null then raise exception 'login required'; end if;
  if public.get_my_role() <> 'admin' then raise exception 'only admin can review approvals'; end if;
  if p_status not in ('approved','rejected') then
    raise exception 'review status must be approved or rejected';
  end if;
  select * into v_approval from public.aud_approvals where id = p_id for update;
  if not found or v_approval.status <> 'pending' then
    raise exception 'pending approval not found';
  end if;
  if p_status = 'rejected' then
    update public.aud_approvals
       set status='rejected', reviewed_by=v_reviewer,
           reviewer_note=nullif(trim(coalesce(p_reviewer_note,'')),''),
           reviewed_at=now(), execution_status='not_required',
           execution_error=null,
           execution_result=jsonb_build_object('message','request rejected'),
           executed_at=null
     where id=p_id;
    return jsonb_build_object('ok',true,'status','rejected');
  end if;
  update public.aud_approvals
     set execution_status='running', execution_error=null, execution_result=null
   where id=p_id;
  begin
    perform public.validate_approval_request(v_approval.type,v_approval.target_id,v_approval.payload);
    case v_approval.type
      when 'finance_consume' then
        select to_jsonb(e) into v_before from public.crs_enrollments e
         where e.id=(v_approval.payload->>'p_enrollment_id')::uuid;
        v_action_result := public._exec_approved_consume(v_approval.payload,v_reviewer);
        v_result := jsonb_build_object('operation','finance_consume','before',v_before,'result',v_action_result);
      when 'finance_refund' then
        select to_jsonb(a) into v_before from public.fin_accounts a
         where a.student_id=(v_approval.payload->>'p_student_id')::uuid;
        v_action_result := public.rpc_refund(
          p_student_id=>(v_approval.payload->>'p_student_id')::uuid,
          p_amount=>(v_approval.payload->>'p_amount')::numeric,
          p_reason=>v_approval.payload->>'p_reason',p_operator_id=>v_reviewer);
        v_result := jsonb_build_object('operation','finance_refund','before',v_before,'result',v_action_result);
      when 'finance_txn_delete' then
        select to_jsonb(t) into v_before from public.fin_transactions t
         where t.id=(v_approval.payload->>'p_txn_id')::uuid;
        v_action_result := public._exec_finance_txn_delete((v_approval.payload->>'p_txn_id')::uuid);
        v_result := jsonb_build_object('operation','finance_txn_delete','before',v_before,'result',v_action_result);
      when 'enrollment_drop' then
        select to_jsonb(e) into v_before from public.crs_enrollments e
         where e.id=(v_approval.payload->>'p_enrollment_id')::uuid;
        v_action_result := public.rpc_drop_enrollment(
          p_enrollment_id=>(v_approval.payload->>'p_enrollment_id')::uuid,
          p_refund_remaining=>coalesce((v_approval.payload->>'p_refund_remaining')::boolean,false),
          p_reason=>v_approval.payload->>'p_reason',p_operator_id=>v_reviewer);
        v_result := jsonb_build_object('operation','enrollment_drop','before',v_before,'result',v_action_result);
      when 'enrollment_transfer' then
        select to_jsonb(e) into v_before from public.crs_enrollments e
         where e.id=(v_approval.payload->>'p_source_enrollment_id')::uuid;
        v_new_id := public.rpc_transfer_enrollment(
          p_source_enrollment_id=>(v_approval.payload->>'p_source_enrollment_id')::uuid,
          p_target_course_id=>(v_approval.payload->>'p_target_course_id')::uuid,
          p_carry_lessons=>(v_approval.payload->>'p_carry_lessons')::integer,
          p_reason=>v_approval.payload->>'p_reason',p_operator_id=>v_reviewer);
        v_result := jsonb_build_object('operation','enrollment_transfer','before',v_before,
          'result',jsonb_build_object('new_enrollment_id',v_new_id));
      when 'department_delete' then
        select to_jsonb(d) into v_before from public.acct_departments d
         where d.id=(v_approval.payload->>'p_id')::uuid;
        perform public.rpc_delete_department((v_approval.payload->>'p_id')::uuid);
        v_result := jsonb_build_object('operation','department_delete','before',v_before,'result',jsonb_build_object('deleted',true));
      when 'staff_deactivate' then
        select to_jsonb(p) into v_before from public.acct_profiles p
         where p.id=(v_approval.payload->>'p_id')::uuid;
        perform public.rpc_delete_staff((v_approval.payload->>'p_id')::uuid);
        v_result := jsonb_build_object('operation','staff_deactivate','before',v_before,'result',jsonb_build_object('deactivated',true));
      when 'student_delete' then
        select to_jsonb(s) into v_before from public.stu_students s
         where s.id=(v_approval.payload->>'p_student_id')::uuid;
        update public.stu_students set status='inactive',updated_at=now()
         where id=(v_approval.payload->>'p_student_id')::uuid and status='active';
        if not found then raise exception 'STUDENT_INACTIVE: 学员已经停用'; end if;
        v_result := jsonb_build_object('operation','student_delete','before',v_before,'result',jsonb_build_object('status','inactive'));
      when 'course_archive' then
        select to_jsonb(c) into v_before from public.crs_courses c
         where c.id=(v_approval.payload->>'p_course_id')::uuid;
        update public.crs_courses set status='archived',updated_at=now()
         where id=(v_approval.payload->>'p_course_id')::uuid and status<>'archived';
        if not found then raise exception 'COURSE_ARCHIVED: 课程已经归档'; end if;
        v_result := jsonb_build_object('operation','course_archive','before',v_before,'result',jsonb_build_object('status','archived'));
      when 'course_delete' then
        select to_jsonb(c) into v_before from public.crs_courses c
         where c.id=(v_approval.payload->>'p_course_id')::uuid;
        delete from public.crs_courses where id=(v_approval.payload->>'p_course_id')::uuid;
        if not found then raise exception 'COURSE_NOT_FOUND: 课程不存在'; end if;
        v_result := jsonb_build_object('operation','course_delete','before',v_before,'result',jsonb_build_object('deleted',true));
      else
        raise exception 'UNSUPPORTED_APPROVAL: 不支持的审批类型 %',v_approval.type;
    end case;
    update public.aud_approvals
       set status='approved',reviewed_by=v_reviewer,
           reviewer_note=nullif(trim(coalesce(p_reviewer_note,'')),''),
           reviewed_at=now(),execution_status='succeeded',execution_error=null,
           execution_result=v_result,executed_at=now()
     where id=p_id;
    return jsonb_build_object('ok',true,'status','approved','execution',v_result);
  exception when others then
    update public.aud_approvals
       set execution_status='failed',execution_error=sqlerrm,
           execution_result=jsonb_build_object('sqlstate',sqlstate),
           reviewed_by=v_reviewer,
           reviewer_note=nullif(trim(coalesce(p_reviewer_note,'')),''),reviewed_at=now()
     where id=p_id;
    return jsonb_build_object('ok',false,'status','pending','error',sqlerrm);
  end;
end;
$function$;

grant execute on function public.rpc_review_approval(uuid,text,text) to authenticated;

create or replace function public.rpc_reverse_approval(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_approval public.aud_approvals%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_tx public.fin_transactions;
  v_log public.fin_consumption_logs;
  v_amount numeric := 0;
  v_new_enrollment_id uuid;
  v_student_id uuid;
  v_delta numeric := 0;
begin
  if auth.uid() is null or public.get_my_role() <> 'admin' then
    raise exception 'PERMISSION_DENIED: 仅最高管理员可以撤销已执行审批';
  end if;
  if nullif(trim(coalesce(p_reason,'')), '') is null then
    raise exception 'INVALID_REASON: 撤销原因必填';
  end if;
  select * into v_approval from public.aud_approvals where id=p_id for update;
  if not found then raise exception 'APPROVAL_NOT_FOUND: 审批记录不存在'; end if;
  if v_approval.status <> 'approved' or v_approval.execution_status <> 'succeeded' then
    raise exception 'APPROVAL_NOT_REVERSIBLE: 仅能撤销已通过且执行成功的审批';
  end if;
  if v_approval.reversed_at is not null then raise exception 'APPROVAL_ALREADY_REVERSED: 该审批已经撤销'; end if;
  v_before := v_approval.execution_result->'before';

  case v_approval.type
    when 'finance_consume' then
      select * into v_tx from public.fin_transactions
       where id=(v_approval.execution_result->'result'->>'transaction_id')::uuid for update;
      select * into v_log from public.fin_consumption_logs
       where id=(v_approval.execution_result->'result'->>'consumption_log_id')::uuid for update;
      if v_tx.id is null or v_log.id is null then raise exception 'REVERSAL_SOURCE_MISSING: 原消课流水不存在'; end if;
      update public.fin_accounts
         set balance=balance+v_tx.amount,
             total_consumed=greatest(0,total_consumed-v_tx.amount),updated_at=now()
       where id=v_tx.account_id;
      update public.fin_transactions
         set balance_before=balance_before+v_tx.amount,balance_after=balance_after+v_tx.amount
       where account_id=v_tx.account_id and created_at>v_tx.created_at and id<>v_tx.id;
      update public.crs_enrollments
         set consumed_lessons=greatest(0,coalesce(consumed_lessons,0)-v_log.lesson_count),
             remaining_lessons=case when remaining_lessons is null then null else remaining_lessons+v_log.lesson_count end,
             status=coalesce(v_before->>'status','enrolled'),
             completed_at=(v_before->>'completed_at')::timestamptz,updated_at=now()
       where id=v_log.enrollment_id;
      delete from public.fin_transactions where id=v_tx.id;
      delete from public.fin_consumption_logs where id=v_log.id;
      v_result := jsonb_build_object('restored_amount',v_tx.amount,'restored_lessons',v_log.lesson_count);

    when 'finance_refund' then
      select * into v_tx from public.fin_transactions
       where id=(v_approval.execution_result->'result'->>'transaction_id')::uuid for update;
      if v_tx.id is null then raise exception 'REVERSAL_SOURCE_MISSING: 原退费流水不存在'; end if;
      update public.fin_accounts
         set balance=balance+v_tx.amount,
             total_refunded=greatest(0,total_refunded-v_tx.amount),updated_at=now()
       where id=v_tx.account_id;
      update public.fin_transactions
         set balance_before=balance_before+v_tx.amount,balance_after=balance_after+v_tx.amount
       where account_id=v_tx.account_id and created_at>v_tx.created_at and id<>v_tx.id;
      delete from public.fin_transactions where id=v_tx.id;
      v_result := jsonb_build_object('restored_amount',v_tx.amount);

    when 'enrollment_drop' then
      v_amount := coalesce((v_approval.execution_result->'result'->>'refunded_amount')::numeric,0);
      v_student_id := (v_before->>'student_id')::uuid;
      if v_amount > 0 then
        select t.* into v_tx from public.fin_transactions t
         join public.fin_accounts a on a.id=t.account_id
         where a.student_id=v_student_id and t.reference_type='enrollment_drop'
           and t.reference_id=v_approval.target_id
         order by t.created_at desc limit 1 for update of t;
        update public.fin_accounts
           set balance=balance-v_amount,total_refunded=greatest(0,total_refunded-v_amount),updated_at=now()
         where student_id=v_student_id;
        if v_tx.id is not null then
          update public.fin_transactions
             set balance_before=balance_before-v_amount,balance_after=balance_after-v_amount
           where account_id=v_tx.account_id and created_at>v_tx.created_at and id<>v_tx.id;
          delete from public.fin_transactions where id=v_tx.id;
        end if;
      end if;
      update public.crs_enrollments
         set status=v_before->>'status',completed_at=(v_before->>'completed_at')::timestamptz,
             notes=v_before->>'notes',updated_at=now()
       where id=v_approval.target_id;
      v_result := jsonb_build_object('restored_enrollment_id',v_approval.target_id,'reversed_refund',v_amount);

    when 'enrollment_transfer' then
      v_new_enrollment_id := (v_approval.execution_result->'result'->>'new_enrollment_id')::uuid;
      if exists (select 1 from public.crs_attendance where enrollment_id=v_new_enrollment_id)
         or exists (select 1 from public.fin_consumption_logs where enrollment_id=v_new_enrollment_id) then
        raise exception 'TRANSFER_ALREADY_USED: 转入报名已有点名或消课，不能直接撤销';
      end if;
      delete from public.crs_enrollments where id=v_new_enrollment_id;
      update public.crs_enrollments
         set status=v_before->>'status',completed_at=(v_before->>'completed_at')::timestamptz,
             notes=v_before->>'notes',updated_at=now()
       where id=v_approval.target_id;
      v_result := jsonb_build_object('deleted_transfer_enrollment_id',v_new_enrollment_id,'restored_source_id',v_approval.target_id);

    when 'student_delete' then
      update public.stu_students set status=v_before->>'status',updated_at=now()
       where id=v_approval.target_id;
      v_result := jsonb_build_object('restored_status',v_before->>'status');

    when 'staff_deactivate' then
      update public.acct_profiles
         set is_active=coalesce((v_before->>'is_active')::boolean,true),updated_at=now()
       where id=v_approval.target_id;
      v_result := jsonb_build_object('restored_active',true);

    when 'department_delete' then
      insert into public.acct_departments
      select * from jsonb_populate_record(null::public.acct_departments,v_before);
      v_result := jsonb_build_object('restored_department_id',v_approval.target_id);

    when 'course_archive' then
      update public.crs_courses
         set status=v_before->>'status',schedule_info=coalesce(v_before->'schedule_info','{}'::jsonb),updated_at=now()
       where id=v_approval.target_id;
      v_result := jsonb_build_object('restored_status',v_before->>'status');

    when 'course_delete' then
      insert into public.crs_courses
      select * from jsonb_populate_record(null::public.crs_courses,v_before);
      v_result := jsonb_build_object('restored_course_id',v_approval.target_id);

    when 'finance_txn_delete' then
      v_tx := jsonb_populate_record(null::public.fin_transactions,v_before);
      v_delta := case v_tx.type when 'recharge' then v_tx.amount when 'consume' then -v_tx.amount when 'refund' then -v_tx.amount else 0 end;
      update public.fin_accounts
         set balance=balance+v_delta,
             total_recharged=total_recharged+case when v_tx.type='recharge' then v_tx.amount else 0 end,
             total_consumed=total_consumed+case when v_tx.type='consume' then v_tx.amount else 0 end,
             total_refunded=total_refunded+case when v_tx.type='refund' then v_tx.amount else 0 end,
             updated_at=now()
       where id=v_tx.account_id;
      update public.fin_transactions
         set balance_before=balance_before+v_delta,balance_after=balance_after+v_delta
       where account_id=v_tx.account_id and created_at>v_tx.created_at;
      insert into public.fin_transactions select v_tx.*;
      v_result := jsonb_build_object('restored_transaction_id',v_tx.id,'balance_delta',v_delta);

    else
      raise exception 'REVERSAL_UNSUPPORTED: 暂不支持撤销该审批类型 %',v_approval.type;
  end case;

  update public.aud_approvals
     set status='rejected',execution_status='not_required',reversed_at=now(),
         reversed_by=auth.uid(),reversal_note=trim(p_reason),reversal_result=v_result
   where id=p_id;
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values (auth.uid(),'reverse_approval','approval',p_id,
    jsonb_build_object('type',v_approval.type,'reason',trim(p_reason),'result',v_result));
  return jsonb_build_object('ok',true,'status','rejected','reversal',v_result);
end;
$function$;

grant execute on function public.rpc_reverse_approval(uuid,text) to authenticated;

create or replace function public.rpc_get_notifications()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('items','[]'::jsonb,'unread',0); end if;
  if public.has_permission('audits.view') then
    v_items := v_items || coalesce((
      select jsonb_agg(jsonb_build_object(
        'id','apv_'||a.id::text,'kind','approval','title',a.title,
        'subtitle',coalesce(a.target_label,a.type)||' · '||coalesce(a.reason,'待处理'),
        'href','/audits','at',a.created_at
      ) order by a.created_at desc)
      from (select * from public.aud_approvals where status='pending' order by created_at desc limit 5) a
    ),'[]'::jsonb);
  end if;
  if public.has_permission('finance.view') then
    v_items := v_items || coalesce((
      select jsonb_agg(jsonb_build_object(
        'id','bal_'||b.student_id::text,'kind','balance','title','余额预警：'||b.name,
        'subtitle','余额 '||coalesce(b.balance,0)::text||' · 预计可用 '||coalesce(b.days_left,0)::text||' 天',
        'href','/students/'||b.student_id::text,'at',now()
      ) order by b.balance asc)
      from (select * from public.v_balance_warnings order by balance asc limit 5) b
    ),'[]'::jsonb);
  end if;
  if public.has_permission('courses.view') then
    v_items := v_items || coalesce((
      select jsonb_agg(jsonb_build_object(
        'id','les_'||w.enrollment_id::text,'kind','lessons','title','课时不足：'||w.student_name,
        'subtitle',w.course_name||' · 剩余课时 '||w.remaining_lessons::text,
        'href','/courses?course='||w.course_id::text,'at',w.updated_at
      ) order by w.remaining_lessons asc)
      from (select * from public.v_negative_lesson_warnings order by remaining_lessons asc limit 5) w
    ),'[]'::jsonb);
  end if;
  if public.has_permission('followups.view') then
    v_items := v_items || coalesce((
      select jsonb_agg(jsonb_build_object(
        'id','flw_'||f.followup_id::text,'kind','followup','title','待跟进：'||f.student_name,
        'subtitle',coalesce(f.next_plan,f.last_followup_type,'计划跟进'),
        'href','/followups','at',f.next_date
      ) order by f.next_date asc nulls last)
      from (select * from public.v_pending_followups order by next_date asc nulls last limit 5) f
    ),'[]'::jsonb);
  end if;
  return jsonb_build_object('items',v_items,'unread',jsonb_array_length(v_items));
end;
$function$;

grant execute on function public.rpc_get_notifications() to authenticated;

-- 系统设置只保留给管理员。历史配置中曾批量勾选给普通成员的值一并清理；
-- 个人资料维护仍可通过员工页的本人编辑能力完成。
update public.acct_profiles p
   set permissions = coalesce((
     select jsonb_agg(permission order by ordinality)
       from jsonb_array_elements_text(coalesce(p.permissions,'[]'::jsonb))
            with ordinality item(permission, ordinality)
      where permission <> 'settings.manage'
   ), '[]'::jsonb),
       updated_at = now()
 where coalesce(p.primary_role,'') <> 'admin'
   and coalesce(p.permissions,'[]'::jsonb) ? 'settings.manage';

select pg_notify('pgrst','reload schema');
