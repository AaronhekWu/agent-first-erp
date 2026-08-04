-- 0033 - Registration attribution metrics and reversible student freeze lifecycle.

alter table public.crs_lesson_lots
  add column if not exists registration_kind varchar(24);

alter table public.crs_lesson_lots
  drop constraint if exists chk_crs_lesson_lots_registration_kind;
alter table public.crs_lesson_lots
  add constraint chk_crs_lesson_lots_registration_kind check (
    registration_kind is null
    or registration_kind in ('new_customer', 'expansion', 'renewal')
  );

comment on column public.crs_lesson_lots.registration_kind is
  '付费报名归因：new_customer 新客、expansion 拓客、renewal 同课程续费；赠送与转课不参与归因';

create or replace function public.reclassify_student_registration_lots(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  with ordered as (
    select
      lot.id,
      row_number() over (
        partition by enrollment.student_id
        order by coalesce(lot.enrolled_at, lot.created_at), lot.created_at, lot.id
      ) as student_sequence,
      row_number() over (
        partition by enrollment.student_id, enrollment.course_id
        order by coalesce(lot.enrolled_at, lot.created_at), lot.created_at, lot.id
      ) as course_sequence
    from public.crs_lesson_lots lot
    join public.crs_enrollments enrollment on enrollment.id = lot.enrollment_id
    where enrollment.student_id = p_student_id
      and lot.source_type = 'paid'
  )
  update public.crs_lesson_lots lot
     set registration_kind = case
       when ordered.course_sequence > 1 then 'renewal'
       when ordered.student_sequence = 1 then 'new_customer'
       else 'expansion'
     end,
         updated_at = case
           when lot.registration_kind is distinct from case
             when ordered.course_sequence > 1 then 'renewal'
             when ordered.student_sequence = 1 then 'new_customer'
             else 'expansion'
           end
           then now()
           else lot.updated_at
         end
    from ordered
   where lot.id = ordered.id
     and lot.registration_kind is distinct from case
       when ordered.course_sequence > 1 then 'renewal'
       when ordered.student_sequence = 1 then 'new_customer'
       else 'expansion'
     end;

  update public.crs_lesson_lots lot
     set registration_kind = null,
         updated_at = now()
    from public.crs_enrollments enrollment
   where enrollment.id = lot.enrollment_id
     and enrollment.student_id = p_student_id
     and lot.source_type <> 'paid'
     and lot.registration_kind is not null;
end;
$function$;

create or replace function public.guard_paid_registration_lot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student_id uuid;
  v_student_status varchar;
begin
  if new.source_type <> 'paid' then
    new.registration_kind := null;
    return new;
  end if;

  select enrollment.student_id, student.status
    into v_student_id, v_student_status
    from public.crs_enrollments enrollment
    join public.stu_students student on student.id = enrollment.student_id
   where enrollment.id = new.enrollment_id
     and student.deleted_at is null;

  if v_student_id is null then
    raise exception 'STUDENT_NOT_FOUND: 报名学员不存在';
  end if;
  if v_student_status <> 'active' then
    raise exception 'STUDENT_FROZEN: 只有在读学员可以新增付费报名';
  end if;

  -- The account row is already locked by the normal enrollment RPC. This lock also
  -- protects direct maintenance paths from classifying two first registrations at once.
  perform pg_advisory_xact_lock(hashtextextended(v_student_id::text, 0));
  return new;
end;
$function$;

create or replace function public.refresh_registration_attribution()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_student_id uuid;
  v_new_student_id uuid;
begin
  if tg_op <> 'INSERT' then
    select student_id into v_old_student_id
      from public.crs_enrollments where id = old.enrollment_id;
  end if;
  if tg_op <> 'DELETE' then
    select student_id into v_new_student_id
      from public.crs_enrollments where id = new.enrollment_id;
  end if;

  if v_old_student_id is not null then
    perform public.reclassify_student_registration_lots(v_old_student_id);
  end if;
  if v_new_student_id is not null and v_new_student_id is distinct from v_old_student_id then
    perform public.reclassify_student_registration_lots(v_new_student_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_paid_registration_lot on public.crs_lesson_lots;
create trigger trg_guard_paid_registration_lot
before insert or update of enrollment_id, source_type on public.crs_lesson_lots
for each row execute function public.guard_paid_registration_lot();

drop trigger if exists trg_refresh_registration_attribution_insert on public.crs_lesson_lots;
create trigger trg_refresh_registration_attribution_insert
after insert on public.crs_lesson_lots
for each row execute function public.refresh_registration_attribution();

drop trigger if exists trg_refresh_registration_attribution_update on public.crs_lesson_lots;
create trigger trg_refresh_registration_attribution_update
after update of enrollment_id, source_type, enrolled_at on public.crs_lesson_lots
for each row execute function public.refresh_registration_attribution();

drop trigger if exists trg_refresh_registration_attribution_delete on public.crs_lesson_lots;
create trigger trg_refresh_registration_attribution_delete
after delete on public.crs_lesson_lots
for each row execute function public.refresh_registration_attribution();

do $block$
declare
  v_student_id uuid;
begin
  for v_student_id in
    select distinct enrollment.student_id
      from public.crs_lesson_lots lot
      join public.crs_enrollments enrollment on enrollment.id = lot.enrollment_id
     where lot.source_type = 'paid'
  loop
    perform public.reclassify_student_registration_lots(v_student_id);
  end loop;
end;
$block$;

create or replace function public.annotate_registration_finance_transaction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kind varchar;
  v_label text;
begin
  if new.type <> 'prepayment_lock'
     or new.reference_type <> 'lesson_lot'
     or new.reference_id is null then
    return new;
  end if;

  select registration_kind into v_kind
    from public.crs_lesson_lots where id = new.reference_id;
  if v_kind is null then return new; end if;

  v_label := case v_kind
    when 'new_customer' then '新客'
    when 'expansion' then '拓客'
    when 'renewal' then '续费'
  end;
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'registration_kind', v_kind,
    'registration_kind_label', v_label
  );
  if position('报名归因：' in coalesce(new.description, '')) = 0 then
    new.description := concat_ws('；', nullif(new.description, ''), '报名归因：' || v_label);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_annotate_registration_finance_transaction on public.fin_transactions;
create trigger trg_annotate_registration_finance_transaction
before insert on public.fin_transactions
for each row execute function public.annotate_registration_finance_transaction();

create or replace function public.rpc_get_registration_metrics(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_can_manage boolean := public.get_my_role() = 'admin' or public.has_permission('campus.manage');
  v_total_count integer := 0;
  v_total_amount numeric(14,2) := 0;
  v_new_count integer := 0;
  v_new_amount numeric(14,2) := 0;
  v_expansion_count integer := 0;
  v_expansion_amount numeric(14,2) := 0;
  v_renewal_count integer := 0;
  v_renewal_amount numeric(14,2) := 0;
begin
  if not (public.has_permission('dashboard.view') or v_can_manage) then
    raise exception 'PERMISSION_DENIED: 无权查看报名经营指标';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'INVALID_DATE: 报名指标日期范围无效';
  end if;
  if p_to - p_from > 366 then
    raise exception 'INVALID_DATE: 报名指标日期范围不能超过 367 天';
  end if;

  select
    count(*)::integer,
    coalesce(sum(lot.total_amount), 0)::numeric(14,2),
    count(*) filter (where lot.registration_kind = 'new_customer')::integer,
    coalesce(sum(lot.total_amount) filter (where lot.registration_kind = 'new_customer'), 0)::numeric(14,2),
    count(*) filter (where lot.registration_kind = 'expansion')::integer,
    coalesce(sum(lot.total_amount) filter (where lot.registration_kind = 'expansion'), 0)::numeric(14,2),
    count(*) filter (where lot.registration_kind = 'renewal')::integer,
    coalesce(sum(lot.total_amount) filter (where lot.registration_kind = 'renewal'), 0)::numeric(14,2)
    into v_total_count, v_total_amount,
         v_new_count, v_new_amount,
         v_expansion_count, v_expansion_amount,
         v_renewal_count, v_renewal_amount
    from public.crs_lesson_lots lot
    join public.crs_enrollments enrollment on enrollment.id = lot.enrollment_id
    join public.stu_students student on student.id = enrollment.student_id
    join public.crs_courses course on course.id = enrollment.course_id
   where lot.source_type = 'paid'
     and lot.registration_kind is not null
     and coalesce(lot.enrolled_at, lot.created_at)::date between p_from and p_to
     and student.deleted_at is null
     and course.deleted_at is null
     and (
       v_can_manage
       or student.assigned_to = auth.uid()
       or course.teacher_id = auth.uid()
       or course.homeroom_teacher_id = auth.uid()
     );

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'total_count', v_total_count,
    'total_amount', v_total_amount,
    'new_customer', jsonb_build_object(
      'count', v_new_count,
      'rate', case when v_total_count = 0 then 0 else round(v_new_count::numeric / v_total_count * 100, 1) end,
      'amount', v_new_amount
    ),
    'expansion', jsonb_build_object(
      'count', v_expansion_count,
      'rate', case when v_total_count = 0 then 0 else round(v_expansion_count::numeric / v_total_count * 100, 1) end,
      'amount', v_expansion_amount
    ),
    'renewal', jsonb_build_object(
      'count', v_renewal_count,
      'rate', case when v_total_count = 0 then 0 else round(v_renewal_count::numeric / v_total_count * 100, 1) end,
      'amount', v_renewal_amount
    )
  );
end;
$function$;

revoke all on function public.rpc_get_registration_metrics(date,date) from public;
grant execute on function public.rpc_get_registration_metrics(date,date) to authenticated;

do $block$
begin
  if to_regprocedure('public.rpc_get_campus_kpis_base(date,date)') is null
     and to_regprocedure('public.rpc_get_campus_kpis(date,date)') is not null then
    alter function public.rpc_get_campus_kpis(date,date) rename to rpc_get_campus_kpis_base;
  end if;
end;
$block$;

revoke all on function public.rpc_get_campus_kpis_base(date,date) from public;
revoke all on function public.rpc_get_campus_kpis_base(date,date) from authenticated;

create or replace function public.rpc_get_campus_kpis(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_base jsonb;
begin
  v_base := public.rpc_get_campus_kpis_base(p_from, p_to);
  return v_base || jsonb_build_object(
    'registrations', public.rpc_get_registration_metrics(p_from, p_to)
  );
end;
$function$;

revoke all on function public.rpc_get_campus_kpis(date,date) from public;
grant execute on function public.rpc_get_campus_kpis(date,date) to authenticated;

alter table public.stu_students
  add column if not exists frozen_at date,
  add column if not exists freeze_note text,
  add column if not exists frozen_by uuid references public.acct_profiles(id);

alter table public.stu_students drop constraint if exists chk_stu_students_status;
alter table public.stu_students add constraint chk_stu_students_status check (
  status is null or status in ('active', 'inactive', 'frozen', 'graduated')
);

create or replace function public.guard_student_status_transition()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_balance numeric := 0;
  v_frozen numeric := 0;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'frozen' then
    if old.status <> 'active' then raise exception 'INVALID_STATUS: 只有在读学员可以冻结'; end if;
    if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权冻结学员'; end if;
    if new.frozen_at is null then raise exception 'FREEZE_DATE_REQUIRED: 冻结日期必填'; end if;
    if new.frozen_at > current_date then raise exception 'INVALID_FREEZE_DATE: 冻结日期不能晚于今天'; end if;
    if new.frozen_at < old.created_at::date then raise exception 'INVALID_FREEZE_DATE: 冻结日期不能早于建档日期'; end if;
    if nullif(trim(coalesce(new.freeze_note, '')), '') is null then
      raise exception 'FREEZE_REASON_REQUIRED: 冻结学员必须填写原因';
    end if;
  elsif old.status = 'frozen' and new.status = 'active' then
    if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权恢复学员在读状态'; end if;
    if new.reactivated_at is null or nullif(trim(coalesce(new.reactivation_note, '')), '') is null then
      raise exception 'REACTIVATION_REASON_REQUIRED: 恢复在读必须填写原因';
    end if;
  elsif old.status = 'frozen' then
    raise exception 'INVALID_STATUS: 冻结学员请先恢复在读状态';
  elsif new.status = 'graduated' then
    if old.status <> 'active' then raise exception 'INVALID_STATUS: 只有在读学员可以办理毕业'; end if;
    if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权办理学员毕业'; end if;
    if new.graduated_at is null then raise exception 'GRADUATION_DATE_REQUIRED: 毕业日期必填'; end if;
    if new.graduated_at > current_date then raise exception 'INVALID_GRADUATION_DATE: 毕业日期不能晚于今天'; end if;
    if new.graduated_at < old.created_at::date then raise exception 'INVALID_GRADUATION_DATE: 毕业日期不能早于建档日期'; end if;
    if exists (select 1 from public.crs_enrollments where student_id = new.id and status = 'enrolled') then
      raise exception 'STUDENT_HAS_ENROLLMENTS: 请先完成全部在读课程的结课、退课或转课';
    end if;
    select coalesce(balance, 0), coalesce(frozen_amount, 0)
      into v_balance, v_frozen from public.fin_accounts where student_id = new.id;
    if v_balance <> 0 or v_frozen <> 0 then
      raise exception 'STUDENT_ACCOUNT_NOT_SETTLED: 请先结清账户余额和冻结金额';
    end if;
    if exists (select 1 from public.aud_approvals where target_id = new.id and status = 'pending') then
      raise exception 'STUDENT_HAS_PENDING_APPROVAL: 请先处理该学员的待审批事项';
    end if;
  elsif old.status = 'graduated' and new.status = 'active' then
    if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权恢复学员在读状态'; end if;
    if new.reactivated_at is null or nullif(trim(coalesce(new.reactivation_note, '')), '') is null then
      raise exception 'REACTIVATION_REASON_REQUIRED: 恢复在读必须填写原因';
    end if;
  elsif old.status = 'graduated' then
    raise exception 'INVALID_STATUS: 已毕业学员请先恢复在读状态';
  end if;
  return new;
end;
$function$;

create or replace function public.rpc_freeze_student(
  p_student_id uuid,
  p_frozen_at date default current_date,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := auth.uid();
  v_student public.stu_students;
begin
  if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权冻结学员'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'FREEZE_REASON_REQUIRED: 冻结学员必须填写原因'; end if;

  update public.stu_students
     set status = 'frozen',
         frozen_at = p_frozen_at,
         freeze_note = trim(p_note),
         frozen_by = v_operator,
         reactivated_at = null,
         reactivation_note = null,
         reactivated_by = null,
         updated_at = now()
   where id = p_student_id and deleted_at is null and status = 'active'
  returning * into v_student;
  if not found then raise exception 'INVALID_STATUS: 学员不存在或当前不是在读状态'; end if;

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values(v_operator, 'freeze_student', 'student', p_student_id,
    jsonb_build_object('name', v_student.name, 'frozen_at', v_student.frozen_at, 'reason', v_student.freeze_note));
  return jsonb_build_object('message', '学员已冻结', 'student_id', p_student_id, 'status', 'frozen', 'frozen_at', v_student.frozen_at);
end;
$function$;

revoke all on function public.rpc_freeze_student(uuid,date,text) from public;
grant execute on function public.rpc_freeze_student(uuid,date,text) to authenticated;

create or replace function public.rpc_reactivate_student(p_student_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := auth.uid();
  v_student public.stu_students;
  v_previous_status varchar;
begin
  if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权恢复学员在读状态'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'REACTIVATION_REASON_REQUIRED: 恢复在读必须填写原因'; end if;

  select status into v_previous_status from public.stu_students
   where id = p_student_id and deleted_at is null for update;
  if v_previous_status not in ('frozen', 'graduated') then
    raise exception 'INVALID_STATUS: 学员不存在或当前不是冻结状态';
  end if;

  update public.stu_students
     set status = 'active',
         reactivated_at = now(),
         reactivation_note = trim(p_reason),
         reactivated_by = v_operator,
         frozen_at = case when v_previous_status = 'frozen' then null else frozen_at end,
         freeze_note = case when v_previous_status = 'frozen' then null else freeze_note end,
         frozen_by = case when v_previous_status = 'frozen' then null else frozen_by end,
         updated_at = now()
   where id = p_student_id
  returning * into v_student;

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values(v_operator, 'reactivate_student', 'student', p_student_id,
    jsonb_build_object('name', v_student.name, 'reason', v_student.reactivation_note, 'previous_status', v_previous_status));
  return jsonb_build_object('message', '已恢复在读', 'student_id', p_student_id, 'status', 'active');
end;
$function$;

revoke all on function public.rpc_reactivate_student(uuid,text) from public;
grant execute on function public.rpc_reactivate_student(uuid,text) to authenticated;

create or replace function public.guard_active_student_enrollment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status varchar;
begin
  select status into v_status from public.stu_students
   where id = new.student_id and deleted_at is null;
  if v_status = 'active' then return new; end if;
  if v_status = 'frozen' and new.source = 'transfer' and new.original_enrollment_id is not null then
    return new;
  end if;
  if v_status = 'frozen' then
    raise exception 'STUDENT_FROZEN: 冻结学员不能新增报名，只能办理转课或退课';
  end if;
  raise exception 'STUDENT_NOT_ACTIVE: 只有在读学员可以报名课程';
end;
$function$;

create or replace function public.guard_frozen_student_attendance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (
    select 1
      from public.crs_enrollments enrollment
      join public.stu_students student on student.id = enrollment.student_id
     where enrollment.id = new.enrollment_id
       and student.status = 'frozen'
  ) then
    raise exception 'STUDENT_FROZEN: 冻结学员不能点名或产生课消';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_frozen_student_attendance on public.crs_attendance;
create trigger trg_guard_frozen_student_attendance
before insert on public.crs_attendance
for each row execute function public.guard_frozen_student_attendance();

create or replace function public.guard_frozen_student_consumption()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (
    select 1
      from public.crs_enrollments enrollment
      join public.stu_students student on student.id = enrollment.student_id
     where enrollment.id = new.enrollment_id
       and student.status = 'frozen'
  ) then
    raise exception 'STUDENT_FROZEN: 冻结学员不能产生课消';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_frozen_student_consumption on public.fin_consumption_logs;
create trigger trg_guard_frozen_student_consumption
before insert on public.fin_consumption_logs
for each row execute function public.guard_frozen_student_consumption();

create or replace function public.rpc_list_course_enrollments(
  p_course_id uuid,
  p_class_date date default current_date
)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
select coalesce(jsonb_agg(row_to_json(item) order by item.student_name, item.enrolled_at), '[]'::jsonb)
from (
  select
    enrollment.id enrollment_id,
    enrollment.student_id,
    student.name student_name,
    student.student_code,
    parent_contacts.phone student_phone,
    student.status student_status,
    student.frozen_at student_frozen_at,
    student.freeze_note student_freeze_note,
    enrollment.status,
    enrollment.unit_price,
    enrollment.list_unit_price,
    enrollment.total_lessons,
    enrollment.consumed_lessons,
    enrollment.remaining_lessons,
    enrollment.gross_amount,
    enrollment.discount_amount,
    enrollment.total_amount,
    enrollment.discount_type,
    enrollment.discount_value,
    enrollment.discount_reason,
    enrollment.source,
    enrollment.notes,
    enrollment.price_snapshot,
    coalesce(account.balance, 0) balance,
    coalesce(account.frozen_amount, 0) frozen_amount,
    coalesce(account.balance, 0) - coalesce(account.frozen_amount, 0) available_balance,
    attendance.id today_attendance_id,
    attendance.status today_status,
    enrollment.created_at enrolled_at,
    coalesce(lots.items, '[]'::jsonb) lesson_lots
  from public.crs_enrollments enrollment
  join public.stu_students student on student.id = enrollment.student_id and student.deleted_at is null
  left join public.fin_accounts account on account.student_id = student.id
  left join public.crs_attendance attendance
    on attendance.enrollment_id = enrollment.id and attendance.class_date = p_class_date
  left join lateral (
    select string_agg(parent.phone, ' / ' order by parent.is_primary_contact desc, parent.created_at, parent.id) as phone
      from public.stu_parents parent
     where parent.student_id = student.id and nullif(trim(parent.phone), '') is not null
  ) parent_contacts on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', lot.id,
        'source_type', lot.source_type,
        'registration_kind', lot.registration_kind,
        'unit_price', lot.unit_price,
        'total_lessons', lot.total_lessons,
        'consumed_lessons', lot.consumed_lessons,
        'remaining_lessons', lot.remaining_lessons,
        'total_amount', lot.total_amount,
        'locked_amount', lot.locked_amount,
        'unfunded_amount', greatest(round(lot.remaining_lessons * lot.unit_price - lot.locked_amount, 2), 0),
        'notes', lot.notes,
        'enrolled_at', lot.enrolled_at
      )
      order by case when lot.source_type = 'gift' then 1 else 0 end,
               lot.unit_price, lot.enrolled_at, lot.created_at
    ) as items
      from public.crs_lesson_lots lot
     where lot.enrollment_id = enrollment.id
  ) lots on true
  where enrollment.course_id = p_course_id
    and enrollment.status in ('enrolled', 'completed', 'transferred', 'cancelled')
) item;
$function$;

revoke all on function public.rpc_list_course_enrollments(uuid,date) from public;
grant execute on function public.rpc_list_course_enrollments(uuid,date) to authenticated;

create or replace function public.rpc_list_frozen_course_actions()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_can_manage boolean := public.get_my_role() = 'admin' or public.has_permission('campus.manage');
  v_items jsonb;
begin
  if not (public.has_permission('dashboard.view') or public.has_permission('courses.view') or v_can_manage) then
    raise exception 'PERMISSION_DENIED: 无权查看冻结学员待办';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'enrollment_id', enrollment.id,
    'student_id', student.id,
    'student_name', student.name,
    'counselor_id', student.assigned_to,
    'counselor_name', counselor.display_name,
    'course_id', course.id,
    'course_name', course.name,
    'homeroom_teacher_id', course.homeroom_teacher_id,
    'homeroom_teacher_name', homeroom.display_name,
    'teacher_id', course.teacher_id,
    'teacher_name', teacher.display_name,
    'end_date', course.end_date,
    'course_status', course.status,
    'remaining_lessons', enrollment.remaining_lessons,
    'frozen_at', student.frozen_at,
    'freeze_note', student.freeze_note
  ) order by course.end_date nulls last, course.name, student.name), '[]'::jsonb)
    into v_items
    from public.crs_enrollments enrollment
    join public.stu_students student on student.id = enrollment.student_id
    join public.crs_courses course on course.id = enrollment.course_id
    left join public.acct_profiles counselor on counselor.id = student.assigned_to
    left join public.acct_profiles homeroom on homeroom.id = course.homeroom_teacher_id
    left join public.acct_profiles teacher on teacher.id = course.teacher_id
   where student.status = 'frozen'
     and student.deleted_at is null
     and enrollment.status = 'enrolled'
     and coalesce(enrollment.remaining_lessons, 0) <> 0
     and course.deleted_at is null
     and (course.end_date < current_date or course.status in ('completed', 'archived'))
     and (
       v_can_manage
       or student.assigned_to = auth.uid()
       or course.teacher_id = auth.uid()
       or course.homeroom_teacher_id = auth.uid()
     );
  return v_items;
end;
$function$;

revoke all on function public.rpc_list_frozen_course_actions() from public;
grant execute on function public.rpc_list_frozen_course_actions() to authenticated;

comment on function public.rpc_get_registration_metrics(date,date) is
  '按付费报名批次统计新客、拓客、续费的数量、占比和合同金额；赠送及转课不计入分母';
comment on function public.rpc_freeze_student(uuid,date,text) is
  '可逆冻结学员：保留班级与财务历史，禁止新增报名、点名和课消';

notify pgrst, 'reload schema';
