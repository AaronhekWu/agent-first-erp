-- 半课时结算、班主任职责、智能跟进画像与校区 KPI。
-- 人次按考勤记录计数；财务收入按实际消耗课时（允许 0.5 递增）结算。

drop view if exists public.v_negative_lesson_warnings;
drop view if exists public.v_course_stats;

alter table public.crs_enrollments
  alter column total_lessons type numeric(8,2) using total_lessons::numeric,
  alter column consumed_lessons type numeric(8,2) using consumed_lessons::numeric,
  alter column remaining_lessons type numeric(8,2) using remaining_lessons::numeric;

alter table public.crs_lesson_lots
  alter column total_lessons type numeric(8,2) using total_lessons::numeric,
  alter column consumed_lessons type numeric(8,2) using consumed_lessons::numeric,
  alter column remaining_lessons type numeric(8,2) using remaining_lessons::numeric;

alter table public.fin_consumption_logs
  alter column lesson_count type numeric(8,2) using lesson_count::numeric;

alter table public.crs_attendance
  add column if not exists lesson_count numeric(8,2) not null default 1;

alter table public.crs_courses
  add column if not exists homeroom_teacher_id uuid
    references public.acct_profiles(id) on delete set null;

alter table public.crs_enrollments
  drop constraint if exists crs_enrollments_half_lesson_check;
alter table public.crs_enrollments
  add constraint crs_enrollments_half_lesson_check check (
    mod(total_lessons * 2, 1) = 0
    and mod(consumed_lessons * 2, 1) = 0
    and mod(remaining_lessons * 2, 1) = 0
  );

alter table public.crs_lesson_lots
  drop constraint if exists crs_lesson_lots_half_lesson_check;
alter table public.crs_lesson_lots
  add constraint crs_lesson_lots_half_lesson_check check (
    mod(total_lessons * 2, 1) = 0
    and mod(consumed_lessons * 2, 1) = 0
    and mod(remaining_lessons * 2, 1) = 0
  );

alter table public.fin_consumption_logs
  drop constraint if exists fin_consumption_logs_half_lesson_check;
alter table public.fin_consumption_logs
  add constraint fin_consumption_logs_half_lesson_check check (
    lesson_count > 0 and mod(lesson_count * 2, 1) = 0
  );

alter table public.crs_attendance
  drop constraint if exists crs_attendance_half_lesson_check;
alter table public.crs_attendance
  add constraint crs_attendance_half_lesson_check check (
    lesson_count > 0 and mod(lesson_count * 2, 1) = 0
  );

create index if not exists idx_crs_courses_homeroom_teacher
  on public.crs_courses(homeroom_teacher_id)
  where deleted_at is null;

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
    then round(att.present_count::numeric / att.total_attendance::numeric * 100, 1)
    else 0::numeric end as attendance_rate,
  coalesce(rev.total_revenue, 0.00) as total_revenue,
  c.start_date,
  c.end_date,
  c.created_at,
  coalesce(att.completed_sessions, 0::bigint) as completed_sessions,
  nullif(c.schedule_info ->> 'total_lessons', '')::integer as total_lessons,
  coalesce((c.schedule_info ->> 'is_archived')::boolean, false) as is_archived,
  coalesce(es.enrolled_remaining_lessons, 0::numeric) as enrolled_remaining_lessons,
  c.description,
  c.schedule_info,
  coalesce(es.unsettled_enrollment_count, 0::bigint) as unsettled_enrollment_count,
  c.homeroom_teacher_id,
  hp.display_name as homeroom_teacher_name
from public.crs_courses c
left join public.acct_departments d on d.id = c.department_id
left join public.acct_profiles hp on hp.id = c.homeroom_teacher_id
left join lateral (
  select count(*) as total_enrolled,
    count(*) filter (where e.status = 'enrolled') as active_enrolled,
    count(*) filter (where e.status = 'completed') as completed_count,
    coalesce(sum(e.remaining_lessons) filter (where e.status = 'enrolled'), 0::numeric) as enrolled_remaining_lessons,
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
grant select on public.v_course_stats to authenticated;

create or replace view public.v_negative_lesson_warnings as
select e.id as enrollment_id, e.student_id, s.name as student_name,
       e.course_id, c.name as course_name, e.remaining_lessons,
       e.updated_at
from public.crs_enrollments e
join public.stu_students s on s.id = e.student_id and s.deleted_at is null
join public.crs_courses c on c.id = e.course_id and c.deleted_at is null
where e.status = 'enrolled' and e.remaining_lessons < 0;

alter view public.v_negative_lesson_warnings set (security_invoker = true);
grant select on public.v_negative_lesson_warnings to authenticated;

create or replace function public.sync_enrollment_lot_totals(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total numeric(8,2);
  v_consumed numeric(8,2);
  v_remaining numeric(8,2);
  v_amount numeric(12,2);
  v_paid_lessons numeric(8,2);
  v_paid_amount numeric(12,2);
  v_overdraft numeric(8,2);
begin
  select coalesce(sum(total_lessons), 0),
    coalesce(sum(consumed_lessons), 0),
    coalesce(sum(remaining_lessons), 0),
    coalesce(sum(total_amount), 0),
    coalesce(sum(total_lessons) filter (where source_type <> 'gift'), 0),
    coalesce(sum(total_amount) filter (where source_type <> 'gift'), 0)
  into v_total, v_consumed, v_remaining, v_amount, v_paid_lessons, v_paid_amount
  from public.crs_lesson_lots where enrollment_id = p_enrollment_id;

  select coalesce(sum(lesson_count), 0)
    into v_overdraft
    from public.fin_consumption_logs
   where enrollment_id = p_enrollment_id
     and lesson_lot_id is null
     and type = 'overdraft';

  update public.crs_enrollments
     set total_lessons = v_total,
         consumed_lessons = v_consumed + v_overdraft,
         remaining_lessons = v_remaining - v_overdraft,
         total_amount = round(v_amount, 2),
         unit_price = case when v_paid_lessons > 0
           then round(v_paid_amount / v_paid_lessons, 2) else 0 end,
         updated_at = now()
   where id = p_enrollment_id;
end;
$function$;

revoke all on function public.sync_enrollment_lot_totals(uuid) from public, authenticated;

drop function if exists public.rpc_consume_lesson(uuid,uuid,uuid,integer,numeric);
create or replace function public.rpc_consume_lesson(
  p_enrollment_id uuid,
  p_operator_id uuid default null,
  p_attendance_id uuid default null,
  p_lesson_count numeric default 1,
  p_unit_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := coalesce(p_operator_id, auth.uid());
  v_enrollment public.crs_enrollments;
  v_course public.crs_courses;
  v_account public.fin_accounts;
  v_lot public.crs_lesson_lots;
  v_log public.fin_consumption_logs;
  v_tx public.fin_transactions;
  v_need numeric(8,2) := p_lesson_count;
  v_take numeric(8,2);
  v_amount numeric(12,2);
  v_total_amount numeric(12,2) := 0;
  v_lot_consumed_amount numeric(12,2);
  v_price numeric(10,2);
  v_release numeric(12,2);
  v_total_released numeric(12,2) := 0;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_frozen_before numeric(12,2);
  v_frozen_after numeric(12,2);
  v_available_before numeric(12,2);
  v_log_ids jsonb := '[]'::jsonb;
  v_breakdown jsonb := '[]'::jsonb;
  v_first_log_id uuid;
  v_overdraft numeric(8,2) := 0;
begin
  if p_attendance_id is null and not public.has_permission('finance.consume') then
    raise exception 'PERMISSION_DENIED: 无权手动消课';
  end if;
  if p_attendance_id is not null and not public.has_permission('courses.attendance') then
    raise exception 'PERMISSION_DENIED: 无权通过点名消课';
  end if;
  if p_lesson_count is null or p_lesson_count <= 0 or mod(p_lesson_count * 2, 1) <> 0 then
    raise exception 'INVALID_LESSONS: 消课数量必须大于零并按 0.5 递增';
  end if;
  if mod(p_lesson_count, 1) <> 0 then
    if p_attendance_id is not null and not exists (
      select 1 from public.crs_attendance a
       where a.id = p_attendance_id
         and nullif(trim(coalesce(a.notes, '')), '') is not null
    ) then
      raise exception 'HALF_LESSON_REASON_REQUIRED: 0.5 课时属于异常调整，必须填写备注说明';
    end if;
    if p_attendance_id is null and not exists (
      select 1 from public.aud_approvals approval
       where approval.type = 'finance_consume'
         and approval.execution_status = 'running'
         and nullif(trim(coalesce(approval.payload->>'p_reason', '')), '') is not null
         and nullif(approval.payload->>'p_enrollment_id', '')::uuid = p_enrollment_id
    ) then
      raise exception 'HALF_LESSON_REASON_REQUIRED: 0.5 课时异常调整必须通过带原因的手动消课审批';
    end if;
  end if;
  if p_unit_price is not null and not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权覆盖课时单价';
  end if;

  select * into v_enrollment from public.crs_enrollments
   where id = p_enrollment_id and status = 'enrolled' for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在或状态无效'; end if;
  select * into v_course from public.crs_courses where id = v_enrollment.course_id;
  select * into v_account from public.fin_accounts
   where student_id = v_enrollment.student_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND: 学员财务账户不存在'; end if;
  v_balance_before := round(v_account.balance, 2);
  v_frozen_before := round(v_account.frozen_amount, 2);
  v_available_before := round(v_account.balance - v_account.frozen_amount, 2);

  for v_lot in
    select * from public.crs_lesson_lots
     where enrollment_id = p_enrollment_id and remaining_lessons > 0
     order by case when source_type = 'gift' then 1 else 0 end,
       unit_price asc, enrolled_at asc, created_at asc, id asc
     for update
  loop
    exit when v_need <= 0;
    v_take := least(v_need, v_lot.remaining_lessons);
    v_price := case when v_lot.source_type = 'gift' then 0
      else coalesce(p_unit_price, v_lot.unit_price) end;
    if v_lot.source_type = 'gift' then
      v_amount := 0;
    elsif p_unit_price is null and v_take = v_lot.remaining_lessons then
      select coalesce(sum(amount), 0) into v_lot_consumed_amount
        from public.fin_consumption_logs where lesson_lot_id = v_lot.id;
      v_amount := greatest(0, round(v_lot.total_amount - v_lot_consumed_amount, 2));
    else
      v_amount := round(v_price * v_take, 2);
    end if;
    v_release := case when v_lot.source_type = 'gift' then 0
      when v_take = v_lot.remaining_lessons then v_lot.locked_amount
      else least(v_lot.locked_amount, v_amount) end;
    v_release := round(greatest(v_release, 0), 2);

    update public.crs_lesson_lots
       set consumed_lessons = consumed_lessons + v_take,
           remaining_lessons = remaining_lessons - v_take,
           locked_amount = greatest(0, locked_amount - v_release), updated_at = now()
     where id = v_lot.id;
    insert into public.fin_consumption_logs(
      enrollment_id,attendance_id,lesson_lot_id,lesson_count,unit_price,
      amount,prepaid_released,type,notes,created_by
    ) values (
      p_enrollment_id,p_attendance_id,v_lot.id,v_take,
      case when v_take > 0 then round(v_amount / v_take,2) else v_price end,
      v_amount,v_release,case when v_lot.source_type='gift' then 'gift' else 'normal' end,
      v_lot.notes,v_operator
    ) returning * into v_log;
    if v_first_log_id is null then v_first_log_id := v_log.id; end if;
    v_log_ids := v_log_ids || jsonb_build_array(v_log.id);
    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'lesson_lot_id',v_lot.id,'source_type',v_lot.source_type,
      'lesson_count',v_take,'unit_price',case when v_take > 0 then round(v_amount/v_take,2) else v_price end,
      'amount',v_amount,'prepaid_released',v_release,'notes',v_lot.notes
    ));
    v_total_amount := v_total_amount + v_amount;
    v_total_released := v_total_released + v_release;
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    v_overdraft := v_need;
    select coalesce(p_unit_price,
      min(unit_price) filter (where source_type <> 'gift' and unit_price > 0),
      v_enrollment.unit_price,0) into v_price
      from public.crs_lesson_lots where enrollment_id = p_enrollment_id;
    v_amount := round(v_price * v_need,2);
    insert into public.fin_consumption_logs(
      enrollment_id,attendance_id,lesson_lot_id,lesson_count,unit_price,
      amount,prepaid_released,type,notes,created_by
    ) values (p_enrollment_id,p_attendance_id,null,v_need,v_price,v_amount,0,'overdraft',
      '课时不足，按规则透支课消',v_operator) returning * into v_log;
    if v_first_log_id is null then v_first_log_id := v_log.id; end if;
    v_log_ids := v_log_ids || jsonb_build_array(v_log.id);
    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'lesson_lot_id',null,'source_type','overdraft','lesson_count',v_need,
      'unit_price',v_price,'amount',v_amount,'prepaid_released',0,
      'notes','课时不足，按规则透支课消'));
    v_total_amount := v_total_amount + v_amount;
    v_need := 0;
  end if;

  v_total_amount := round(v_total_amount,2);
  v_total_released := round(v_total_released,2);
  v_balance_after := round(v_balance_before - v_total_amount,2);
  update public.fin_accounts set balance=v_balance_after,
    total_consumed=round(total_consumed+v_total_amount,2),updated_at=now()
   where id=v_account.id;
  perform public.sync_enrollment_lot_totals(p_enrollment_id);
  select frozen_amount into v_frozen_after from public.fin_accounts where id=v_account.id;

  insert into public.fin_transactions(
    account_id,type,amount,balance_before,balance_after,reference_type,reference_id,
    description,metadata,created_by
  ) values (
    v_account.id,'consume',v_total_amount,v_balance_before,v_balance_after,
    'consumption_log',v_first_log_id,
    format('课消：%s；%s 课时；实收 %s；释放预付款 %s%s',v_course.name,
      p_lesson_count,v_total_amount,v_total_released,
      case when v_overdraft>0 then format('；透支 %s 课时',v_overdraft) else '' end),
    jsonb_build_object('domain','income','event','lesson_consumption',
      'student_id',v_enrollment.student_id,'course_id',v_enrollment.course_id,
      'course_name',v_course.name,'enrollment_id',p_enrollment_id,
      'consumption_log_ids',v_log_ids,'attendance_id',p_attendance_id,
      'lesson_count',p_lesson_count,'overdraft_lessons',v_overdraft,
      'prepaid_released',v_total_released,'breakdown',v_breakdown,
      'frozen_before',v_frozen_before,'frozen_after',v_frozen_after,
      'available_before',v_available_before,
      'available_after',round(v_balance_after-v_frozen_after,2)),v_operator
  ) returning * into v_tx;

  return jsonb_build_object('consumption_log_id',v_first_log_id,
    'consumption_log_ids',v_log_ids,'transaction_id',v_tx.id,'amount',v_total_amount,
    'prepaid_released',v_total_released,'balance_before',v_balance_before,
    'balance_after',v_balance_after,'frozen_before',v_frozen_before,'frozen_after',v_frozen_after,
    'available_balance',round(v_balance_after-v_frozen_after,2),
    'remaining_before',v_enrollment.remaining_lessons,
    'remaining_lessons',(select remaining_lessons from public.crs_enrollments where id=p_enrollment_id),
    'lesson_count',p_lesson_count,'overdraft_lessons',v_overdraft,'breakdown',v_breakdown);
end;
$function$;

revoke all on function public.rpc_consume_lesson(uuid,uuid,uuid,numeric,numeric) from public;
grant execute on function public.rpc_consume_lesson(uuid,uuid,uuid,numeric,numeric) to authenticated;

drop function if exists public.rpc_mark_attendance(uuid,date,varchar,uuid,boolean,text);
create or replace function public.rpc_mark_attendance(
  p_enrollment_id uuid,
  p_class_date date,
  p_status varchar,
  p_operator_id uuid default null,
  p_trigger_consume boolean default false,
  p_notes text default null,
  p_lesson_count numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := coalesce(p_operator_id,auth.uid());
  v_enrollment public.crs_enrollments;
  v_attendance public.crs_attendance;
  v_consume_result jsonb;
begin
  if not public.has_permission('courses.attendance') then
    raise exception 'PERMISSION_DENIED: 无权进行每日点名';
  end if;
  if p_status not in ('present','absent','late','leave') then
    raise exception 'INVALID_INPUT: 考勤状态无效';
  end if;
  if (p_status <> 'present' or mod(p_lesson_count,1)<>0)
     and nullif(trim(coalesce(p_notes,'')),'') is null then
    raise exception 'INVALID_REASON: 非到课状态或 0.5 课时异常调整必须填写原因';
  end if;
  if p_lesson_count is null or p_lesson_count <= 0 or mod(p_lesson_count*2,1)<>0 then
    raise exception 'INVALID_LESSONS: 本次课时必须大于零并按 0.5 递增';
  end if;
  select * into v_enrollment from public.crs_enrollments
   where id=p_enrollment_id and status='enrolled';
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在或状态无效'; end if;
  if exists(select 1 from public.crs_attendance where enrollment_id=p_enrollment_id and class_date=p_class_date) then
    raise exception 'DUPLICATE_ATTENDANCE: 该日期已有考勤记录';
  end if;
  insert into public.crs_attendance(enrollment_id,class_date,status,notes,marked_by,lesson_count)
  values(p_enrollment_id,p_class_date,p_status,nullif(trim(coalesce(p_notes,'')),''),v_operator,p_lesson_count)
  returning * into v_attendance;
  if p_trigger_consume and p_status in ('present','late') then
    v_consume_result := public.rpc_consume_lesson(p_enrollment_id,v_operator,v_attendance.id,p_lesson_count,null);
  end if;
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(v_operator,'mark_attendance','attendance',v_attendance.id,
    jsonb_build_object('enrollment_id',p_enrollment_id,'class_date',p_class_date,
      'status',p_status,'lesson_count',p_lesson_count,'reason',p_notes));
  return jsonb_build_object('attendance_id',v_attendance.id,'enrollment_id',p_enrollment_id,
    'class_date',p_class_date,'status',p_status,'lesson_count',p_lesson_count,
    'consume_triggered',p_trigger_consume and p_status in ('present','late'),
    'consume_result',v_consume_result);
end;
$function$;

revoke all on function public.rpc_mark_attendance(uuid,date,varchar,uuid,boolean,text,numeric) from public;
grant execute on function public.rpc_mark_attendance(uuid,date,varchar,uuid,boolean,text,numeric) to authenticated;

drop function if exists public.rpc_update_attendance(uuid,varchar,text,boolean,uuid);
create or replace function public.rpc_update_attendance(
  p_attendance_id uuid,
  p_status varchar,
  p_notes text default null,
  p_trigger_consume boolean default false,
  p_operator_id uuid default null,
  p_lesson_count numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := coalesce(p_operator_id,auth.uid());
  v_attendance public.crs_attendance;
  v_enrollment public.crs_enrollments;
  v_old_status text;
  v_old_lessons numeric(8,2);
  v_new_lessons numeric(8,2);
  v_reverse_amount numeric(12,2):=0;
  v_reverse_lessons numeric(8,2):=0;
  v_first_log_id uuid;
  v_transaction public.fin_transactions;
  v_log public.fin_consumption_logs;
  v_consume_result jsonb:=null;
  v_reversal jsonb:=null;
  v_reason text;
  v_old_attended boolean;
  v_new_attended boolean;
  v_needs_reconsume boolean;
  v_has_consumption boolean;
begin
  if not public.has_permission('courses.attendance') then raise exception 'PERMISSION_DENIED: 无权修改考勤'; end if;
  if p_status not in ('present','absent','late','leave') then raise exception 'INVALID_INPUT: 考勤状态无效'; end if;
  if p_status <> 'present' and nullif(trim(coalesce(p_notes,'')),'') is null then
    raise exception 'INVALID_REASON: 非到课状态必须填写原因';
  end if;
  select * into v_attendance from public.crs_attendance where id=p_attendance_id for update;
  if not found then raise exception 'ATTENDANCE_NOT_FOUND: 考勤记录不存在'; end if;
  v_old_status:=v_attendance.status;
  v_old_lessons:=coalesce(v_attendance.lesson_count,1);
  v_new_lessons:=coalesce(p_lesson_count,v_old_lessons,1);
  if v_new_lessons<=0 or mod(v_new_lessons*2,1)<>0 then
    raise exception 'INVALID_LESSONS: 本次课时必须大于零并按 0.5 递增';
  end if;
  if mod(v_new_lessons,1)<>0 and nullif(trim(coalesce(p_notes,'')),'') is null then
    raise exception 'HALF_LESSON_REASON_REQUIRED: 0.5 课时属于异常调整，必须填写备注说明';
  end if;
  select * into v_enrollment from public.crs_enrollments where id=v_attendance.enrollment_id for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在'; end if;
  v_old_attended:=v_old_status in ('present','late');
  v_new_attended:=p_status in ('present','late');
  select exists(select 1 from public.fin_consumption_logs where attendance_id=p_attendance_id)
    into v_has_consumption;
  v_needs_reconsume:=v_old_attended and (not v_new_attended or v_new_lessons<>v_old_lessons);

  if v_needs_reconsume then
    select id into v_first_log_id from public.fin_consumption_logs
     where attendance_id=p_attendance_id order by created_at,id limit 1;
    if v_first_log_id is not null then
      select coalesce(sum(amount),0),coalesce(sum(lesson_count),0)
        into v_reverse_amount,v_reverse_lessons from public.fin_consumption_logs
       where attendance_id=p_attendance_id;
      for v_log in select * from public.fin_consumption_logs
        where attendance_id=p_attendance_id order by created_at,id for update
      loop
        if v_log.lesson_lot_id is not null then
          update public.crs_lesson_lots set
            consumed_lessons=greatest(0,consumed_lessons-v_log.lesson_count),
            remaining_lessons=remaining_lessons+v_log.lesson_count,updated_at=now()
           where id=v_log.lesson_lot_id;
        end if;
      end loop;
      select * into v_transaction from public.fin_transactions
       where reference_type='consumption_log' and reference_id=v_first_log_id
       order by created_at desc limit 1 for update;
      if found then
        v_reason:=coalesce(nullif(trim(coalesce(p_notes,'')),''),'调整考勤状态或课时，撤销原课消');
        v_reversal:=public._void_finance_transaction(v_transaction.id,v_reason,v_operator,null);
      end if;
      delete from public.fin_consumption_logs where attendance_id=p_attendance_id;
      perform public.sync_enrollment_lot_totals(v_enrollment.id);
      v_has_consumption:=false;
    end if;
  end if;

  update public.crs_attendance set status=p_status,
    notes=nullif(trim(coalesce(p_notes,'')),''),lesson_count=v_new_lessons,
    marked_by=v_operator,updated_at=now() where id=p_attendance_id;

  if v_new_attended and p_trigger_consume and not v_has_consumption then
    if not v_old_attended and nullif(trim(coalesce(p_notes,'')),'') is null and v_old_status in ('absent','leave') then
      raise exception 'INVALID_REASON: 补充课消必须填写原因';
    end if;
    v_consume_result:=public.rpc_consume_lesson(v_enrollment.id,v_operator,p_attendance_id,v_new_lessons,null);
  end if;

  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(v_operator,'update_attendance','attendance',p_attendance_id,
    jsonb_build_object('from_status',v_old_status,'to_status',p_status,
      'from_lessons',v_old_lessons,'to_lessons',v_new_lessons,'reason',p_notes,
      'reverse_amount',v_reverse_amount,'reverse_lessons',v_reverse_lessons,'reversal',v_reversal));
  return jsonb_build_object('attendance_id',p_attendance_id,'from_status',v_old_status,
    'to_status',p_status,'lesson_count',v_new_lessons,'consume_result',v_consume_result,
    'reverse_amount',v_reverse_amount,'reverse_lessons',v_reverse_lessons,'reversal',v_reversal);
end;
$function$;

revoke all on function public.rpc_update_attendance(uuid,varchar,text,boolean,uuid,numeric) from public;
grant execute on function public.rpc_update_attendance(uuid,varchar,text,boolean,uuid,numeric) to authenticated;

create or replace function public._exec_approved_consume(p_payload jsonb,p_operator uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_result jsonb; v_date date:=(p_payload->>'p_consume_date')::date;
  v_reason text:=trim(p_payload->>'p_reason'); v_ids jsonb;
begin
  v_result:=public.rpc_consume_lesson((p_payload->>'p_enrollment_id')::uuid,p_operator,null,
    (p_payload->>'p_lesson_count')::numeric,nullif(p_payload->>'p_unit_price','')::numeric);
  v_ids:=coalesce(v_result->'consumption_log_ids',jsonb_build_array(v_result->>'consumption_log_id'));
  update public.fin_consumption_logs set created_at=v_date::timestamp at time zone 'Asia/Hong_Kong',notes=v_reason
   where id in(select value::uuid from jsonb_array_elements_text(v_ids));
  update public.fin_transactions set created_at=v_date::timestamp at time zone 'Asia/Hong_Kong',
    description=description||'；手动补录原因：'||v_reason,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('manual',true,'consume_date',v_date,'reason',v_reason)
   where id=(v_result->>'transaction_id')::uuid;
  return v_result||jsonb_build_object('consume_date',v_date,'reason',v_reason);
end;
$function$;

do $block$
begin
  if to_regprocedure('public.validate_approval_request_base_0032(text,uuid,jsonb)') is null then
    alter function public.validate_approval_request(text,uuid,jsonb) rename to validate_approval_request_base_0032;
  end if;
end $block$;

create or replace function public.validate_approval_request(p_type text,p_target_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_lesson_count numeric;
begin
  if p_type<>'finance_consume' then
    perform public.validate_approval_request_base_0032(p_type,p_target_id,coalesce(p_payload,'{}'::jsonb)); return;
  end if;
  if not public.has_permission('finance.consume') then raise exception 'PERMISSION_DENIED: 无权发起手动消课'; end if;
  if nullif(p_payload->>'p_enrollment_id','')::uuid is distinct from p_target_id then
    raise exception 'APPROVAL_TARGET_MISMATCH: 报名参数与审批目标不一致'; end if;
  v_lesson_count:=nullif(p_payload->>'p_lesson_count','')::numeric;
  if v_lesson_count is null or v_lesson_count<=0 or mod(v_lesson_count*2,1)<>0 then
    raise exception 'INVALID_LESSONS: 消课数量必须大于零并按 0.5 递增'; end if;
  if nullif(p_payload->>'p_consume_date','')::date is null then raise exception 'INVALID_DATE: 消课日期必填'; end if;
  if nullif(trim(coalesce(p_payload->>'p_reason','')),'') is null then raise exception 'INVALID_REASON: 手动消课原因必填'; end if;
  perform 1 from public.crs_enrollments where id=p_target_id and status='enrolled';
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 在读报名不存在'; end if;
end;
$function$;

revoke all on function public.validate_approval_request_base_0032(text,uuid,jsonb) from public,authenticated;
revoke all on function public.validate_approval_request(text,uuid,jsonb) from public,authenticated;

do $block$
begin
  if to_regprocedure('public.rpc_reverse_approval_base_0032(uuid,text)') is null then
    alter function public.rpc_reverse_approval(uuid,text) rename to rpc_reverse_approval_base_0032;
  end if;
end $block$;

create or replace function public.rpc_reverse_approval(p_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_approval public.aud_approvals%rowtype; v_result_data jsonb; v_log_ids jsonb;
  v_tx public.fin_transactions%rowtype; v_log public.fin_consumption_logs%rowtype;
  v_enrollment_id uuid; v_restored_lessons numeric(8,2):=0;
  v_restored_amount numeric(12,2):=0; v_reversal jsonb; v_result jsonb;
begin
  select * into v_approval from public.aud_approvals where id=p_id;
  if not found then raise exception 'APPROVAL_NOT_FOUND: 审批记录不存在'; end if;
  if v_approval.type<>'finance_consume' then return public.rpc_reverse_approval_base_0032(p_id,p_reason); end if;
  if auth.uid() is null or public.get_my_role()<>'admin' then raise exception 'PERMISSION_DENIED: 仅最高管理员可以撤销已执行审批'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'INVALID_REASON: 撤销原因必填'; end if;
  select * into v_approval from public.aud_approvals where id=p_id for update;
  if v_approval.status<>'approved' or v_approval.execution_status<>'succeeded' then
    raise exception 'APPROVAL_NOT_REVERSIBLE: 仅能撤销已通过且执行成功的审批'; end if;
  if v_approval.reversed_at is not null then raise exception 'APPROVAL_ALREADY_REVERSED: 该审批已经撤销'; end if;
  v_result_data:=v_approval.execution_result->'result';
  select * into v_tx from public.fin_transactions where id=(v_result_data->>'transaction_id')::uuid for update;
  if not found then raise exception 'REVERSAL_SOURCE_MISSING: 原消课流水不存在'; end if;
  v_log_ids:=coalesce(v_result_data->'consumption_log_ids',case
    when nullif(v_result_data->>'consumption_log_id','') is null then '[]'::jsonb
    else jsonb_build_array(v_result_data->>'consumption_log_id') end);
  for v_log in select * from public.fin_consumption_logs
    where id in(select value::uuid from jsonb_array_elements_text(v_log_ids))
    order by created_at,id for update
  loop
    v_enrollment_id:=coalesce(v_enrollment_id,v_log.enrollment_id);
    v_restored_lessons:=v_restored_lessons+v_log.lesson_count;
    v_restored_amount:=v_restored_amount+v_log.amount;
    if v_log.lesson_lot_id is not null then
      update public.crs_lesson_lots set
        consumed_lessons=greatest(0,consumed_lessons-v_log.lesson_count),
        remaining_lessons=remaining_lessons+v_log.lesson_count,updated_at=now()
       where id=v_log.lesson_lot_id;
    end if;
  end loop;
  if v_enrollment_id is null then raise exception 'REVERSAL_SOURCE_MISSING: 原消课明细不存在'; end if;
  v_reversal:=public._void_finance_transaction(v_tx.id,trim(p_reason),auth.uid(),p_id);
  delete from public.fin_consumption_logs where id in(select value::uuid from jsonb_array_elements_text(v_log_ids));
  perform public.sync_enrollment_lot_totals(v_enrollment_id);
  v_result:=jsonb_build_object('restored_amount',v_restored_amount,'restored_lessons',v_restored_lessons,
    'restored_enrollment_id',v_enrollment_id,'ledger_reversal',v_reversal);
  update public.aud_approvals set status='rejected',execution_status='not_required',
    reversed_at=now(),reversed_by=auth.uid(),reversal_note=trim(p_reason),reversal_result=v_result where id=p_id;
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(auth.uid(),'reverse_approval','approval',p_id,jsonb_build_object('type','finance_consume','reason',trim(p_reason),'result',v_result));
  return jsonb_build_object('ok',true,'status','rejected','reversal',v_result);
end;
$function$;

revoke all on function public.rpc_reverse_approval_base_0032(uuid,text) from public,authenticated;
revoke all on function public.rpc_reverse_approval(uuid,text) from public;
grant execute on function public.rpc_reverse_approval(uuid,text) to authenticated;

drop function if exists public.rpc_update_course_info(uuid,integer,numeric,date,date,uuid,text[],text,text);
create or replace function public.rpc_update_course_info(
  p_course_id uuid,p_total_lessons integer,p_unit_price numeric,p_start_date date,p_end_date date,
  p_department_id uuid,p_weekdays text[],p_class_time text,p_teacher_name text,
  p_homeroom_teacher_id uuid default null
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_operator uuid:=auth.uid(); v_course public.crs_courses; v_completed_sessions bigint;
  v_days text[]:=coalesce(p_weekdays,array[]::text[]);
begin
  if not(public.has_permission('courses.update') or public.has_permission('courses.plan')) then raise exception 'PERMISSION_DENIED: 无权编辑课程信息'; end if;
  if p_total_lessons is null or p_total_lessons<=0 then raise exception '计划总课时必须大于 0'; end if;
  if p_unit_price is null or p_unit_price<=0 then raise exception '标准课时单价必须大于 0'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception '课程日期范围无效'; end if;
  if not(v_days<@array['mon','tue','wed','thu','fri','sat','sun']::text[]) then raise exception '上课星期格式不正确'; end if;
  if p_department_id is not null and not exists(select 1 from public.acct_departments where id=p_department_id) then raise exception '所选部门不存在'; end if;
  if p_homeroom_teacher_id is not null and not exists(select 1 from public.acct_profiles where id=p_homeroom_teacher_id and is_active=true) then raise exception '所选班主任不存在或已停用'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_course_id::text,0));
  select count(distinct a.class_date) into v_completed_sessions from public.crs_attendance a
    join public.crs_enrollments e on e.id=a.enrollment_id where e.course_id=p_course_id;
  if p_total_lessons<v_completed_sessions then raise exception '计划总课时不能少于已上课时（% 节）',v_completed_sessions; end if;
  update public.crs_courses set schedule_info=coalesce(schedule_info,'{}'::jsonb)||jsonb_build_object(
      'total_lessons',p_total_lessons,'weekdays',to_jsonb(v_days),'time',nullif(trim(p_class_time),''),
      'teacher_name',nullif(trim(p_teacher_name),'')),fee=p_unit_price,start_date=p_start_date,end_date=p_end_date,
      department_id=p_department_id,homeroom_teacher_id=p_homeroom_teacher_id,updated_at=now()
   where id=p_course_id and deleted_at is null and status<>'archived' returning * into v_course;
  if v_course.id is null then raise exception '课程不存在或已经结课'; end if;
  update public.crs_course_prices set is_default=false,updated_at=now() where course_id=p_course_id and is_default=true;
  insert into public.crs_course_prices(course_id,name,price_type,unit_price,total_lessons,total_price,discount_rate,is_default,effective_from,effective_to,status,created_by)
  values(p_course_id,'标准价格 '||to_char(now(),'YYYY-MM-DD HH24:MI'),'per_lesson',p_unit_price,p_total_lessons,
    round(p_unit_price*p_total_lessons,2),1,true,p_start_date,p_end_date,'active',v_operator);
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(v_operator,'update_course_info','course',p_course_id,jsonb_build_object('unit_price',p_unit_price,
    'total_lessons',p_total_lessons,'start_date',p_start_date,'end_date',p_end_date,'department_id',p_department_id,
    'weekdays',v_days,'time',p_class_time,'teacher_name',p_teacher_name,'homeroom_teacher_id',p_homeroom_teacher_id));
  return jsonb_build_object('course_id',p_course_id,'updated',true,'homeroom_teacher_id',p_homeroom_teacher_id);
end;
$function$;
grant execute on function public.rpc_update_course_info(uuid,integer,numeric,date,date,uuid,text[],text,text,uuid) to authenticated;

drop function if exists public.rpc_create_course(varchar,varchar,varchar,text,integer,numeric,date,date,jsonb,uuid,uuid);
create or replace function public.rpc_create_course(
  p_name varchar,p_subject varchar default null,p_level varchar default null,p_description text default null,
  p_max_capacity integer default null,p_fee numeric default null,p_start_date date default null,p_end_date date default null,
  p_schedule_info jsonb default '{}'::jsonb,p_department_id uuid default null,p_operator_id uuid default null,
  p_homeroom_teacher_id uuid default null
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_operator uuid:=coalesce(p_operator_id,auth.uid()); v_course public.crs_courses; v_total_lessons integer;
begin
  if not public.has_permission('courses.create') then raise exception 'PERMISSION_DENIED: 无权创建课程'; end if;
  v_total_lessons:=nullif(p_schedule_info->>'total_lessons','')::integer;
  if nullif(trim(p_name),'') is null then raise exception '课程名称不能为空'; end if;
  if nullif(trim(p_subject),'') is null then raise exception '学科不能为空'; end if;
  if nullif(trim(p_level),'') is null then raise exception '年级不能为空'; end if;
  if v_total_lessons is null or v_total_lessons<=0 then raise exception '计划总课时必须大于 0'; end if;
  if p_fee is null or p_fee<=0 then raise exception '标准课时单价必须大于 0'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception '课程日期范围无效'; end if;
  if p_homeroom_teacher_id is not null and not exists(select 1 from public.acct_profiles where id=p_homeroom_teacher_id and is_active=true) then raise exception '所选班主任不存在或已停用'; end if;
  insert into public.crs_courses(name,subject,level,description,max_capacity,fee,start_date,end_date,
    schedule_info,department_id,created_by,homeroom_teacher_id)
  values(trim(p_name),trim(p_subject),trim(p_level),p_description,p_max_capacity,p_fee,p_start_date,p_end_date,
    p_schedule_info,p_department_id,v_operator,p_homeroom_teacher_id) returning * into v_course;
  insert into public.crs_course_prices(course_id,name,price_type,unit_price,total_lessons,total_price,discount_rate,is_default,effective_from,effective_to,status,created_by)
  values(v_course.id,'标准价格','per_lesson',p_fee,v_total_lessons,round(p_fee*v_total_lessons,2),1,true,p_start_date,p_end_date,'active',v_operator);
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(v_operator,'create','course',v_course.id,jsonb_build_object('name',v_course.name,'unit_price',p_fee,
    'total_lessons',v_total_lessons,'homeroom_teacher_id',p_homeroom_teacher_id));
  return jsonb_build_object('course_id',v_course.id,'name',v_course.name,'status',v_course.status);
end;
$function$;
grant execute on function public.rpc_create_course(varchar,varchar,varchar,text,integer,numeric,date,date,jsonb,uuid,uuid,uuid) to authenticated;

create or replace function public.rpc_get_lookups()
returns jsonb language sql security definer set search_path to 'public'
as $function$
select jsonb_build_object(
  'counselors',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,
    'primary_role',p.primary_role,'department_id',p.department_id) order by p.display_name)
    from public.acct_profiles p where p.is_active=true),'[]'::jsonb),
  'homeroom_teachers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,
    'primary_role',p.primary_role,'department_id',p.department_id) order by p.display_name)
    from public.acct_profiles p where p.is_active=true and p.primary_role in ('teacher','admin')),'[]'::jsonb),
  'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'parent_id',d.parent_id,
    'sort_order',d.sort_order) order by d.sort_order) from public.acct_departments d),'[]'::jsonb),
  'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'description',r.description) order by r.name)
    from public.acct_roles r),'[]'::jsonb),
  'schools',coalesce((select jsonb_agg(distinct school order by school) from public.stu_students where deleted_at is null and school is not null),'[]'::jsonb),
  'grades',coalesce((select jsonb_agg(distinct grade order by grade) from public.stu_students where deleted_at is null and grade is not null),'[]'::jsonb)
);
$function$;
grant execute on function public.rpc_get_lookups() to authenticated;

create or replace function public.rpc_get_student_monthly_calendar(p_student_id uuid,p_year integer,p_month integer)
returns jsonb language sql security definer set search_path to 'public'
as $function$
with bounds as(select make_date(p_year,p_month,1) start_date,(make_date(p_year,p_month,1)+interval '1 month - 1 day')::date end_date),
days as(select d::date as class_day from generate_series((select start_date from bounds),(select end_date from bounds),interval '1 day') d),
attendance_rows as(
  select a.class_date,jsonb_build_object('attendance_id',a.id,'enrollment_id',a.enrollment_id,
    'course_id',c.id,'course_name',c.name,'status',a.status,'notes',a.notes,'lesson_count',a.lesson_count,
    'marked_at',a.created_at,'consumption_count',coalesce(consumption.lesson_count,0),'amount',coalesce(consumption.amount,0),
    'unit_price',consumption.unit_price,'consumed_at',consumption.consumed_at,
    'operator_name',coalesce(consumption.operator_name,marker.display_name)) slot
  from public.crs_attendance a join public.crs_enrollments e on e.id=a.enrollment_id
  join public.crs_courses c on c.id=e.course_id left join public.acct_profiles marker on marker.id=a.marked_by
  left join lateral(select coalesce(sum(f.lesson_count),0) lesson_count,coalesce(sum(f.amount),0)::numeric(12,2) amount,
    case when sum(f.lesson_count)>0 then round(sum(f.amount)/sum(f.lesson_count),2) end unit_price,
    max(f.created_at) consumed_at,string_agg(distinct coalesce(op.display_name,'系统'),' / ') operator_name
    from public.fin_consumption_logs f left join public.acct_profiles op on op.id=f.created_by where f.attendance_id=a.id) consumption on true
  where e.student_id=p_student_id and a.class_date between(select start_date from bounds) and(select end_date from bounds)),
eligible as(select coalesce(jsonb_agg(jsonb_build_object('enrollment_id',e.id,'course_id',c.id,'course_name',c.name,
  'remaining_lessons',e.remaining_lessons,'unit_price',e.unit_price) order by c.name),'[]'::jsonb) items
  from public.crs_enrollments e join public.crs_courses c on c.id=e.course_id and c.deleted_at is null
  where e.student_id=p_student_id and e.status='enrolled')
select jsonb_build_object('year',p_year,'month',p_month,'eligible_enrollments',(select items from eligible),
  'days',coalesce(jsonb_agg(jsonb_build_object('date',d.class_day,'slots',day_slots.slots) order by d.class_day),'[]'::jsonb))
from days d left join lateral(select coalesce(jsonb_agg(ar.slot order by ar.slot->>'course_name'),'[]'::jsonb) slots
  from attendance_rows ar where ar.class_date=d.class_day) day_slots on true;
$function$;
grant execute on function public.rpc_get_student_monthly_calendar(uuid,integer,integer) to authenticated;

create or replace function public.rpc_get_student_ontology(p_student_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_signals jsonb; v_followups jsonb; v_batches jsonb;
begin
  if not(public.has_permission('students.view') or public.has_permission('followups.view')) then raise exception 'PERMISSION_DENIED: 无权查看学员智能档案'; end if;
  if not exists (
    select 1 from public.stu_students student
     where student.id=p_student_id and student.deleted_at is null
       and (
         public.get_my_role()='admin'
         or student.assigned_to=auth.uid()
         or student.department_id=any(public.get_my_department_ids())
         or student.department_id=(select profile.department_id from public.acct_profiles profile where profile.id=auth.uid())
         or exists (
           select 1 from public.crs_enrollments enrollment
           join public.crs_courses course on course.id=enrollment.course_id
            where enrollment.student_id=student.id
              and (course.teacher_id=auth.uid() or course.homeroom_teacher_id=auth.uid())
         )
       )
  ) then raise exception 'PERMISSION_DENIED: 该学员不在当前账号的数据查看范围内'; end if;
  v_signals:=public.rpc_get_student_signals(p_student_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'type',f.type,'content',f.content,'result',f.result,
    'next_plan',f.next_plan,'next_date',f.next_date,'created_at',f.created_at,'operator',p.display_name)
    order by f.created_at desc),'[]'::jsonb) into v_followups
  from(select * from public.flup_records where student_id=p_student_id order by created_at desc limit 20) f
  left join public.acct_profiles p on p.id=f.created_by;
  select coalesce(jsonb_agg(jsonb_build_object('course_id',c.id,'course_name',c.name,'enrollment_id',e.id,
    'lot_id',l.id,'source_type',l.source_type,'total_lessons',l.total_lessons,'remaining_lessons',l.remaining_lessons,
    'unit_price',l.unit_price,'total_amount',l.total_amount,'enrolled_at',l.enrolled_at,'notes',l.notes)
    order by l.enrolled_at desc),'[]'::jsonb) into v_batches
  from public.crs_enrollments e join public.crs_courses c on c.id=e.course_id
  join public.crs_lesson_lots l on l.enrollment_id=e.id where e.student_id=p_student_id;
  return jsonb_build_object('schema_version','1.0','model_target','deepseek-v4-flash','generated_at',now(),
    'student_id',p_student_id,'signals',v_signals,'lesson_batches',v_batches,'followup_history',v_followups,
    'graph',jsonb_build_object('root','student','relations',jsonb_build_array(
      jsonb_build_object('from','student','to','finance','type','拥有账户'),
      jsonb_build_object('from','student','to','courses','type','报名课程'),
      jsonb_build_object('from','student','to','attendance','type','产生考勤'),
      jsonb_build_object('from','student','to','followups','type','跟进记录'),
      jsonb_build_object('from','signals','to','risk_flags','type','形成风险'))));
end;
$function$;
revoke all on function public.rpc_get_student_ontology(uuid) from public;
grant execute on function public.rpc_get_student_ontology(uuid) to authenticated;

create or replace function public.rpc_get_campus_kpis(p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_staff jsonb; v_courses jsonb; v_daily jsonb;
begin
  if not public.has_permission('campus.manage') then raise exception 'PERMISSION_DENIED: 无权查看校区 KPI'; end if;
  if p_from is null or p_to is null or p_to<p_from then raise exception 'INVALID_DATE: KPI 日期范围无效'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('staff_id',p.id,'name',p.display_name,'role',p.primary_role,
    'assigned_students',(select count(*) from public.stu_students s where s.assigned_to=p.id and s.deleted_at is null),
    'followup_actions',(select count(*) from public.flup_records f where f.created_by=p.id and f.created_at::date between p_from and p_to),
    'homeroom_courses',(select count(*) from public.crs_courses c where c.homeroom_teacher_id=p.id and c.deleted_at is null and c.status<>'archived'),
    'attendance_actions',(select count(*) from public.crs_attendance a where a.marked_by=p.id and coalesce(a.updated_at,a.created_at)::date between p_from and p_to),
    'actual_person_times',(select count(*) from public.crs_attendance a join public.crs_enrollments e on e.id=a.enrollment_id
      join public.crs_courses c on c.id=e.course_id where c.homeroom_teacher_id=p.id and a.status in('present','late') and a.class_date between p_from and p_to),
    'consumed_lessons',(select coalesce(sum(l.lesson_count),0) from public.fin_consumption_logs l join public.crs_enrollments e on e.id=l.enrollment_id
      join public.crs_courses c on c.id=e.course_id where c.homeroom_teacher_id=p.id and l.created_at::date between p_from and p_to),
    'consumed_amount',(select coalesce(sum(l.amount),0) from public.fin_consumption_logs l join public.crs_enrollments e on e.id=l.enrollment_id
      join public.crs_courses c on c.id=e.course_id where c.homeroom_teacher_id=p.id and l.created_at::date between p_from and p_to),
    'attendance_rate',(select case when count(*)>0 then round(count(*) filter(where a.status in('present','late'))::numeric/count(*)*100,1) end
      from public.crs_attendance a join public.crs_enrollments e on e.id=a.enrollment_id join public.crs_courses c on c.id=e.course_id
      where c.homeroom_teacher_id=p.id and a.class_date between p_from and p_to)) order by p.display_name),'[]'::jsonb)
    into v_staff from public.acct_profiles p where p.is_active=true and p.primary_role in('teacher','counselor','admin');
  select coalesce(jsonb_agg(jsonb_build_object('course_id',c.id,'course_name',c.name,'homeroom_teacher',hp.display_name,
    'active_enrolled',(select count(*) from public.crs_enrollments e where e.course_id=c.id and e.status='enrolled'),
    'completed_sessions',(select count(distinct a.class_date) from public.crs_attendance a join public.crs_enrollments e on e.id=a.enrollment_id
      where e.course_id=c.id and a.class_date between p_from and p_to),
    'actual_person_times',(select count(*) from public.crs_attendance a join public.crs_enrollments e on e.id=a.enrollment_id
      where e.course_id=c.id and a.status in('present','late') and a.class_date between p_from and p_to),
    'consumed_lessons',(select coalesce(sum(l.lesson_count),0) from public.fin_consumption_logs l join public.crs_enrollments e on e.id=l.enrollment_id
      where e.course_id=c.id and l.created_at::date between p_from and p_to),
    'consumed_amount',(select coalesce(sum(l.amount),0) from public.fin_consumption_logs l join public.crs_enrollments e on e.id=l.enrollment_id
      where e.course_id=c.id and l.created_at::date between p_from and p_to),
    'attendance_rate',(select case when count(*)>0 then round(count(*) filter(where a.status in('present','late'))::numeric/count(*)*100,1) end
      from public.crs_attendance a join public.crs_enrollments e on e.id=a.enrollment_id where e.course_id=c.id and a.class_date between p_from and p_to))
    order by c.name),'[]'::jsonb) into v_courses from public.crs_courses c left join public.acct_profiles hp on hp.id=c.homeroom_teacher_id
    where c.deleted_at is null and c.status<>'archived';
  select coalesce(jsonb_agg(jsonb_build_object('day',d.metric_day,
    'followups',(select count(*) from public.flup_records f where f.created_at::date=d.metric_day),
    'attendance_actions',(select count(*) from public.crs_attendance a where coalesce(a.updated_at,a.created_at)::date=d.metric_day),
    'actual_person_times',(select count(*) from public.crs_attendance a where a.class_date=d.metric_day and a.status in('present','late')),
    'consumed_lessons',(select coalesce(sum(l.lesson_count),0) from public.fin_consumption_logs l where l.created_at::date=d.metric_day),
    'consumed_amount',(select coalesce(sum(l.amount),0) from public.fin_consumption_logs l where l.created_at::date=d.metric_day)) order by d.metric_day),'[]'::jsonb)
    into v_daily from(select generate_series(p_from,p_to,interval '1 day')::date as metric_day)d;
  return jsonb_build_object('period',jsonb_build_object('from',p_from,'to',p_to),
    'staff',v_staff,'courses',v_courses,'daily',v_daily,'source_updated_at',now());
end;
$function$;
revoke all on function public.rpc_get_campus_kpis(date,date) from public;
grant execute on function public.rpc_get_campus_kpis(date,date) to authenticated;

comment on column public.crs_attendance.lesson_count is '本次实际扣除课时，按 0.5 递增；人次统计仍按一条到课或迟到考勤计一人次';
comment on column public.crs_courses.homeroom_teacher_id is '班主任负责班级日常点名与学员联系，区别于授课教师与学员课程顾问';
comment on function public.rpc_get_campus_kpis(date,date) is '管理人员校区行为与绩效 KPI，所有指标使用业务表真实数据并返回明确日期区间';
