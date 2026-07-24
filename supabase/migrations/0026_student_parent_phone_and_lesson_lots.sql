-- 0026 — 学员资料编辑、家长电话、精确收款与分批课时台账

create table if not exists public.crs_lesson_lots (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.crs_enrollments(id) on delete cascade,
  source_type text not null default 'paid'
    check (source_type in ('paid','transfer','gift','adjustment')),
  unit_price numeric(10,2) not null default 0 check (unit_price >= 0),
  total_lessons integer not null check (total_lessons > 0),
  consumed_lessons integer not null default 0 check (consumed_lessons >= 0),
  remaining_lessons integer not null check (remaining_lessons >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  notes text,
  enrolled_at timestamptz not null default now(),
  created_by uuid references public.acct_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (consumed_lessons + remaining_lessons = total_lessons),
  check ((source_type = 'gift' and unit_price = 0) or source_type <> 'gift')
);

create index if not exists crs_lesson_lots_enrollment_priority_idx
  on public.crs_lesson_lots (
    enrollment_id,
    (case when source_type = 'gift' then 1 else 0 end),
    unit_price,
    enrolled_at,
    created_at
  );

alter table public.crs_lesson_lots enable row level security;
drop policy if exists crs_lesson_lots_authenticated_select on public.crs_lesson_lots;
create policy crs_lesson_lots_authenticated_select on public.crs_lesson_lots
for select to authenticated
using (
  public.has_permission('courses.view')
  or public.has_permission('students.view')
);

alter table public.fin_consumption_logs
  add column if not exists lesson_lot_id uuid references public.crs_lesson_lots(id);
create index if not exists fin_consumption_logs_lesson_lot_idx
  on public.fin_consumption_logs(lesson_lot_id);

-- 每条历史报名先转换为一个批次；历史课消关联到该批次。
insert into public.crs_lesson_lots (
  enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
  remaining_lessons, total_amount, notes, enrolled_at, created_by
)
select
  e.id,
  case when e.source = 'transfer' then 'transfer' else 'paid' end,
  greatest(coalesce(e.unit_price, 0), 0),
  greatest(coalesce(e.total_lessons, 0), 1),
  least(greatest(coalesce(e.consumed_lessons, 0), 0), greatest(coalesce(e.total_lessons, 0), 1)),
  greatest(greatest(coalesce(e.total_lessons, 0), 1) - greatest(coalesce(e.consumed_lessons, 0), 0), 0),
  greatest(coalesce(e.total_amount, round(coalesce(e.unit_price, 0) * greatest(coalesce(e.total_lessons, 0), 1), 2)), 0),
  coalesce(e.notes, '历史报名迁移批次'),
  coalesce(e.enrolled_at, e.created_at, now()),
  e.created_by
from public.crs_enrollments e
where not exists (
  select 1 from public.crs_lesson_lots l where l.enrollment_id = e.id
);

update public.fin_consumption_logs f
set lesson_lot_id = l.id
from public.crs_lesson_lots l
where f.enrollment_id = l.enrollment_id
  and f.lesson_lot_id is null
  and l.id = (
    select l2.id
    from public.crs_lesson_lots l2
    where l2.enrollment_id = f.enrollment_id
    order by l2.enrolled_at, l2.created_at
    limit 1
  );

create or replace function public.sync_enrollment_lot_totals(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer;
  v_consumed integer;
  v_remaining integer;
  v_amount numeric(12,2);
  v_paid_lessons integer;
  v_paid_amount numeric(12,2);
  v_overdraft integer;
begin
  select
    coalesce(sum(total_lessons), 0),
    coalesce(sum(consumed_lessons), 0),
    coalesce(sum(remaining_lessons), 0),
    coalesce(sum(total_amount), 0),
    coalesce(sum(total_lessons) filter (where source_type <> 'gift'), 0),
    coalesce(sum(total_amount) filter (where source_type <> 'gift'), 0)
  into v_total, v_consumed, v_remaining, v_amount, v_paid_lessons, v_paid_amount
  from public.crs_lesson_lots
  where enrollment_id = p_enrollment_id;

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
      unit_price = case
        when v_paid_lessons > 0 then round(v_paid_amount / v_paid_lessons, 2)
        else 0
      end,
      updated_at = now()
  where id = p_enrollment_id;
end;
$function$;

revoke all on function public.sync_enrollment_lot_totals(uuid) from public;
revoke all on function public.sync_enrollment_lot_totals(uuid) from authenticated;

do $block$
declare v_id uuid;
begin
  for v_id in select id from public.crs_enrollments loop
    perform public.sync_enrollment_lot_totals(v_id);
  end loop;
end
$block$;

create or replace function public.rpc_update_student(
  p_student_id uuid,
  p_name text,
  p_gender text default null,
  p_birth_date date default null,
  p_school text default null,
  p_grade text default null,
  p_source text default null,
  p_notes text default null,
  p_assigned_to uuid default null,
  p_department_id uuid default null,
  p_parent_name text default null,
  p_parent_relation text default null,
  p_parent_phones text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_parent_ids uuid[];
  v_phone text;
  v_index integer := 0;
  v_parent_id uuid;
begin
  if not public.has_permission('students.update') then
    raise exception 'PERMISSION_DENIED: 无权编辑学员';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'INVALID_NAME: 学员姓名必填';
  end if;
  if p_gender is not null and p_gender not in ('male','female') then
    raise exception 'INVALID_GENDER: 性别参数无效';
  end if;

  update public.stu_students
  set name = trim(p_name),
      gender = p_gender,
      birth_date = p_birth_date,
      school = nullif(trim(coalesce(p_school, '')), ''),
      grade = nullif(trim(coalesce(p_grade, '')), ''),
      source = nullif(trim(coalesce(p_source, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      assigned_to = p_assigned_to,
      department_id = p_department_id,
      updated_at = now()
  where id = p_student_id and deleted_at is null;
  if not found then raise exception 'STUDENT_NOT_FOUND: 学员不存在'; end if;

  select coalesce(array_agg(id order by is_primary_contact desc, created_at, id), array[]::uuid[])
  into v_parent_ids
  from public.stu_parents
  where student_id = p_student_id;

  foreach v_phone in array coalesce(p_parent_phones, array[]::text[]) loop
    v_phone := regexp_replace(coalesce(v_phone, ''), '\s+', '', 'g');
    if v_phone = '' then continue; end if;
    v_index := v_index + 1;
    if v_index > 2 then exit; end if;
    v_parent_id := v_parent_ids[v_index];
    if v_parent_id is null then
      insert into public.stu_parents(
        student_id, name, relationship, phone, is_primary_contact
      ) values (
        p_student_id,
        coalesce(nullif(trim(coalesce(p_parent_name,'')), ''), '家长'),
        nullif(trim(coalesce(p_parent_relation,'')), ''),
        v_phone,
        v_index = 1
      );
    else
      update public.stu_parents
      set name = coalesce(nullif(trim(coalesce(p_parent_name,'')), ''), name, '家长'),
          relationship = coalesce(nullif(trim(coalesce(p_parent_relation,'')), ''), relationship),
          phone = v_phone,
          is_primary_contact = v_index = 1,
          updated_at = now()
      where id = v_parent_id;
    end if;
  end loop;

  if v_index = 0 then
    delete from public.stu_parents where student_id = p_student_id;
  elsif coalesce(array_length(v_parent_ids, 1), 0) > v_index then
    delete from public.stu_parents
    where student_id = p_student_id
      and id = any(v_parent_ids[v_index + 1:array_length(v_parent_ids, 1)]);
  end if;

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    auth.uid(), 'update_student', 'student', p_student_id,
    jsonb_build_object('name', trim(p_name), 'parent_phone_count', v_index)
  );
  return jsonb_build_object('student_id', p_student_id, 'updated', true);
end;
$function$;

grant execute on function public.rpc_update_student(
  uuid,text,text,date,text,text,text,text,uuid,uuid,text,text,text[]
) to authenticated;

create or replace view public.v_student_overview as
select
  s.id,
  s.student_code,
  s.name,
  coalesce(parent_contacts.phone, s.phone::text)::varchar as phone,
  s.gender,
  s.status,
  s.school,
  s.grade,
  s.source,
  s.department_id,
  d.name as department_name,
  s.assigned_to,
  p.display_name as counselor_name,
  coalesce(fa.balance, 0.00) as balance,
  coalesce(fa.total_recharged, 0.00) as total_recharged,
  coalesce(fa.total_consumed, 0.00) as total_consumed,
  coalesce(enroll_stats.enrollment_count, 0::bigint) as enrollment_count,
  coalesce(enroll_stats.active_enrollment_count, 0::bigint) as active_enrollment_count,
  last_followup.last_followup_at,
  last_followup.last_followup_type,
  s.created_at,
  s.updated_at
from public.stu_students s
left join public.acct_departments d on d.id = s.department_id
left join public.acct_profiles p on p.id = s.assigned_to
left join public.fin_accounts fa on fa.student_id = s.id
left join lateral (
  select string_agg(sp.phone, ' / ' order by sp.is_primary_contact desc, sp.created_at, sp.id) as phone
  from public.stu_parents sp
  where sp.student_id = s.id and nullif(trim(sp.phone), '') is not null
) parent_contacts on true
left join lateral (
  select count(*) as enrollment_count,
    count(*) filter (where e.status = 'enrolled') as active_enrollment_count
  from public.crs_enrollments e
  where e.student_id = s.id
) enroll_stats on true
left join lateral (
  select f.created_at as last_followup_at, f.type as last_followup_type
  from public.flup_records f
  where f.student_id = s.id
  order by f.created_at desc
  limit 1
) last_followup on true
where s.deleted_at is null;

alter view public.v_student_overview set (security_invoker = true);

create or replace function public.rpc_recharge(
  p_student_id uuid,
  p_amount numeric,
  p_payment_method varchar,
  p_operator_id uuid default null,
  p_campaign_id uuid default null,
  p_bonus_amount numeric default 0.00,
  p_notes text default null,
  p_payment_ref varchar default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account_id uuid;
  v_balance numeric(12,2);
  v_recharge_id uuid;
  v_txn_id uuid;
  v_op uuid := coalesce(p_operator_id, auth.uid());
  v_amount numeric(12,2) := round(p_amount, 2);
  v_bonus numeric(12,2) := round(coalesce(p_bonus_amount, 0), 2);
  v_total numeric(12,2);
begin
  if v_amount is null or v_amount <= 0 then
    raise exception 'INVALID_AMOUNT: 充值金额必须大于零';
  end if;
  if p_payment_method not in (
    'shouqianba','digital_wallet','cash','corporate_transfer',
    'wechat','alipay','bank_transfer','other'
  ) then
    raise exception 'INVALID_INPUT: 收款方式无效';
  end if;
  v_total := round(v_amount + v_bonus, 2);
  if not exists (
    select 1 from public.stu_students where id = p_student_id and deleted_at is null
  ) then raise exception 'STUDENT_NOT_FOUND: 学员不存在'; end if;

  select id, round(balance, 2) into v_account_id, v_balance
  from public.fin_accounts
  where student_id = p_student_id
  for update;
  if not found then
    insert into public.fin_accounts(student_id, balance)
    values (p_student_id, 0)
    returning id, balance into v_account_id, v_balance;
  end if;

  insert into public.fin_recharges(
    account_id, amount, payment_method, payment_ref, campaign_id,
    bonus_amount, notes, created_by
  ) values (
    v_account_id, v_amount, p_payment_method, p_payment_ref, p_campaign_id,
    v_bonus, p_notes, v_op
  ) returning id into v_recharge_id;

  update public.fin_accounts
  set balance = round(balance + v_total, 2),
      total_recharged = round(total_recharged + v_amount, 2),
      updated_at = now()
  where id = v_account_id
  returning balance into v_balance;

  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, created_by
  ) values (
    v_account_id, 'recharge', v_total, round(v_balance - v_total, 2), v_balance,
    'recharge', v_recharge_id,
    format('充值 %s', v_amount::text)
      || case when v_bonus > 0 then format(' + 赠送 %s', v_bonus::text) else '' end,
    v_op
  ) returning id into v_txn_id;

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    v_op, 'recharge', 'account', v_account_id,
    jsonb_build_object(
      'amount', v_amount, 'bonus', v_bonus,
      'payment_method', p_payment_method, 'new_balance', v_balance
    )
  );
  return jsonb_build_object(
    'message','充值成功','recharge_id',v_recharge_id,
    'transaction_id',v_txn_id,'new_balance',v_balance
  );
end;
$function$;

create or replace function public.rpc_add_lesson_lot(
  p_enrollment_id uuid,
  p_total_lessons integer,
  p_unit_price numeric,
  p_source_type text default 'paid',
  p_notes text default null,
  p_enrolled_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lot public.crs_lesson_lots;
begin
  if not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权维护学员课时批次';
  end if;
  if p_total_lessons is null or p_total_lessons <= 0 then
    raise exception 'INVALID_LESSONS: 课时必须大于零';
  end if;
  if p_source_type not in ('paid','transfer','gift','adjustment') then
    raise exception 'INVALID_SOURCE: 批次类型无效';
  end if;
  if p_source_type = 'gift' and nullif(trim(coalesce(p_notes,'')), '') is null then
    raise exception 'INVALID_NOTE: 赠送课时必须填写备注';
  end if;
  if p_source_type <> 'gift' and coalesce(p_unit_price, 0) <= 0 then
    raise exception 'INVALID_PRICE: 正常课时单价必须大于零';
  end if;
  if not exists (
    select 1 from public.crs_enrollments
    where id = p_enrollment_id and status = 'enrolled'
  ) then raise exception 'ENROLLMENT_NOT_FOUND: 在读报名不存在'; end if;

  insert into public.crs_lesson_lots(
    enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
    remaining_lessons, total_amount, notes, enrolled_at, created_by
  ) values (
    p_enrollment_id, p_source_type,
    case when p_source_type = 'gift' then 0 else round(p_unit_price, 2) end,
    p_total_lessons, 0, p_total_lessons,
    case when p_source_type = 'gift' then 0 else round(p_unit_price * p_total_lessons, 2) end,
    nullif(trim(coalesce(p_notes,'')), ''), coalesce(p_enrolled_at, now()), auth.uid()
  ) returning * into v_lot;
  perform public.sync_enrollment_lot_totals(p_enrollment_id);

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'add_lesson_lot', 'enrollment', p_enrollment_id, to_jsonb(v_lot));
  return to_jsonb(v_lot);
end;
$function$;

grant execute on function public.rpc_add_lesson_lot(uuid,integer,numeric,text,text,timestamptz)
to authenticated;

create or replace function public.rpc_update_lesson_lot(
  p_lot_id uuid,
  p_total_lessons integer,
  p_unit_price numeric,
  p_notes text,
  p_enrolled_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lot public.crs_lesson_lots;
begin
  if not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权维护学员课时批次';
  end if;
  select * into v_lot from public.crs_lesson_lots where id = p_lot_id for update;
  if not found then raise exception 'LOT_NOT_FOUND: 课时批次不存在'; end if;
  if p_total_lessons < v_lot.consumed_lessons or p_total_lessons <= 0 then
    raise exception 'INVALID_LESSONS: 总课时不能少于已消课时';
  end if;
  if v_lot.source_type = 'gift' and nullif(trim(coalesce(p_notes,'')), '') is null then
    raise exception 'INVALID_NOTE: 赠送课时必须填写备注';
  end if;
  if v_lot.source_type <> 'gift' and coalesce(p_unit_price, 0) <= 0 then
    raise exception 'INVALID_PRICE: 正常课时单价必须大于零';
  end if;
  update public.crs_lesson_lots
  set total_lessons = p_total_lessons,
      remaining_lessons = p_total_lessons - consumed_lessons,
      unit_price = case when source_type = 'gift' then 0 else round(p_unit_price, 2) end,
      total_amount = case when source_type = 'gift' then 0 else round(p_unit_price * p_total_lessons, 2) end,
      notes = nullif(trim(coalesce(p_notes,'')), ''),
      enrolled_at = coalesce(p_enrolled_at, enrolled_at),
      updated_at = now()
  where id = p_lot_id
  returning * into v_lot;
  perform public.sync_enrollment_lot_totals(v_lot.enrollment_id);
  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (auth.uid(), 'update_lesson_lot', 'lesson_lot', p_lot_id, to_jsonb(v_lot));
  return to_jsonb(v_lot);
end;
$function$;

grant execute on function public.rpc_update_lesson_lot(uuid,integer,numeric,text,timestamptz)
to authenticated;

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
  v_operator uuid := coalesce(p_operator_id, auth.uid());
  v_enrollment public.crs_enrollments;
  v_account public.fin_accounts;
  v_lot public.crs_lesson_lots;
  v_log public.fin_consumption_logs;
  v_tx public.fin_transactions;
  v_need integer := p_lesson_count;
  v_take integer;
  v_amount numeric(12,2);
  v_total_amount numeric(12,2) := 0;
  v_lot_consumed_amount numeric(12,2);
  v_price numeric(10,2);
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_log_ids jsonb := '[]'::jsonb;
  v_first_log_id uuid;
  v_overdraft integer := 0;
begin
  if p_attendance_id is null and not public.has_permission('finance.consume') then
    raise exception 'PERMISSION_DENIED: 无权手动消课';
  end if;
  if p_attendance_id is not null and not public.has_permission('courses.attendance') then
    raise exception 'PERMISSION_DENIED: 无权通过点名消课';
  end if;
  if p_lesson_count is null or p_lesson_count <= 0 then
    raise exception 'INVALID_LESSONS: 消课数量必须大于零';
  end if;
  if p_unit_price is not null and not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权覆盖课时单价';
  end if;

  select * into v_enrollment
  from public.crs_enrollments
  where id = p_enrollment_id and status = 'enrolled'
  for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在或状态无效'; end if;

  -- 兼容迁移后新产生、但尚无批次的旧 RPC 报名。
  if not exists (select 1 from public.crs_lesson_lots where enrollment_id = p_enrollment_id) then
    insert into public.crs_lesson_lots(
      enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
      remaining_lessons, total_amount, notes, enrolled_at, created_by
    ) values (
      p_enrollment_id,
      case when v_enrollment.source = 'transfer' then 'transfer' else 'paid' end,
      greatest(coalesce(v_enrollment.unit_price, 0), 0),
      greatest(coalesce(v_enrollment.total_lessons, 0), 1),
      least(greatest(coalesce(v_enrollment.consumed_lessons, 0), 0), greatest(coalesce(v_enrollment.total_lessons, 0), 1)),
      greatest(greatest(coalesce(v_enrollment.total_lessons, 0), 1) - greatest(coalesce(v_enrollment.consumed_lessons, 0), 0), 0),
      greatest(coalesce(v_enrollment.total_amount, round(coalesce(v_enrollment.unit_price, 0) * greatest(coalesce(v_enrollment.total_lessons, 0), 1), 2)), 0),
      '自动补建报名批次',
      coalesce(v_enrollment.enrolled_at, now()),
      v_operator
    );
  end if;

  select * into v_account
  from public.fin_accounts
  where student_id = v_enrollment.student_id
  for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND: 学员财务账户不存在'; end if;
  v_balance_before := round(v_account.balance, 2);

  for v_lot in
    select *
    from public.crs_lesson_lots
    where enrollment_id = p_enrollment_id and remaining_lessons > 0
    order by
      case when source_type = 'gift' then 1 else 0 end,
      unit_price asc,
      enrolled_at asc,
      created_at asc,
      id asc
    for update
  loop
    exit when v_need <= 0;
    v_take := least(v_need, v_lot.remaining_lessons);
    v_price := coalesce(p_unit_price, v_lot.unit_price);
    if p_unit_price is null and v_take = v_lot.remaining_lessons then
      select coalesce(sum(amount), 0) into v_lot_consumed_amount
      from public.fin_consumption_logs
      where lesson_lot_id = v_lot.id;
      v_amount := greatest(0, round(v_lot.total_amount - v_lot_consumed_amount, 2));
    else
      v_amount := round(v_price * v_take, 2);
    end if;

    update public.crs_lesson_lots
    set consumed_lessons = consumed_lessons + v_take,
        remaining_lessons = remaining_lessons - v_take,
        updated_at = now()
    where id = v_lot.id;
    insert into public.fin_consumption_logs(
      enrollment_id, attendance_id, lesson_lot_id, lesson_count,
      unit_price, amount, type, notes, created_by
    ) values (
      p_enrollment_id, p_attendance_id, v_lot.id, v_take,
      case when v_take > 0 then round(v_amount / v_take, 2) else v_price end,
      v_amount,
      case when v_lot.source_type = 'gift' then 'gift' else 'normal' end,
      v_lot.notes,
      v_operator
    ) returning * into v_log;
    if v_first_log_id is null then v_first_log_id := v_log.id; end if;
    v_log_ids := v_log_ids || jsonb_build_array(v_log.id);
    v_total_amount := v_total_amount + v_amount;
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    v_overdraft := v_need;
    select coalesce(
      p_unit_price,
      min(unit_price) filter (where source_type <> 'gift' and unit_price > 0),
      v_enrollment.unit_price,
      0
    ) into v_price
    from public.crs_lesson_lots
    where enrollment_id = p_enrollment_id;
    v_amount := round(v_price * v_need, 2);
    insert into public.fin_consumption_logs(
      enrollment_id, attendance_id, lesson_lot_id, lesson_count,
      unit_price, amount, type, notes, created_by
    ) values (
      p_enrollment_id, p_attendance_id, null, v_need,
      v_price, v_amount, 'overdraft', '课时不足，按规则透支课消', v_operator
    ) returning * into v_log;
    if v_first_log_id is null then v_first_log_id := v_log.id; end if;
    v_log_ids := v_log_ids || jsonb_build_array(v_log.id);
    v_total_amount := v_total_amount + v_amount;
    v_need := 0;
  end if;

  v_total_amount := round(v_total_amount, 2);
  v_balance_after := round(v_balance_before - v_total_amount, 2);
  update public.fin_accounts
  set balance = v_balance_after,
      total_consumed = round(total_consumed + v_total_amount, 2),
      updated_at = now()
  where id = v_account.id;
  perform public.sync_enrollment_lot_totals(p_enrollment_id);

  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, metadata, created_by
  ) values (
    v_account.id, 'consume', v_total_amount, v_balance_before, v_balance_after,
    'consumption_log', v_first_log_id,
    '课消 ' || p_lesson_count || ' 课时（按课时批次自动分配）',
    jsonb_build_object(
      'consumption_log_ids', v_log_ids,
      'attendance_id', p_attendance_id,
      'overdraft_lessons', v_overdraft
    ),
    v_operator
  ) returning * into v_tx;

  return jsonb_build_object(
    'consumption_log_id', v_first_log_id,
    'consumption_log_ids', v_log_ids,
    'transaction_id', v_tx.id,
    'amount', v_total_amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'remaining_before', v_enrollment.remaining_lessons,
    'remaining_lessons', (
      select remaining_lessons from public.crs_enrollments where id = p_enrollment_id
    ),
    'lesson_count', p_lesson_count,
    'overdraft_lessons', v_overdraft
  );
end;
$function$;

grant execute on function public.rpc_consume_lesson(uuid,uuid,uuid,integer,numeric)
to authenticated;

create or replace function public.rpc_list_course_enrollments(
  p_course_id uuid,
  p_class_date date default current_date
)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
select coalesce(jsonb_agg(row_to_json(t) order by t.student_name, t.enrolled_at), '[]'::jsonb)
from (
  select
    e.id enrollment_id,
    e.student_id,
    s.name student_name,
    s.student_code,
    parent_contacts.phone student_phone,
    e.status,
    e.unit_price,
    e.list_unit_price,
    e.total_lessons,
    e.consumed_lessons,
    e.remaining_lessons,
    e.gross_amount,
    e.discount_amount,
    e.total_amount,
    e.discount_type,
    e.discount_value,
    e.discount_reason,
    e.source,
    e.notes,
    e.price_snapshot,
    coalesce(fa.balance, 0) balance,
    a.id today_attendance_id,
    a.status today_status,
    e.created_at enrolled_at,
    coalesce(lots.items, '[]'::jsonb) lesson_lots
  from public.crs_enrollments e
  join public.stu_students s on s.id = e.student_id and s.deleted_at is null
  left join public.fin_accounts fa on fa.student_id = s.id
  left join public.crs_attendance a
    on a.enrollment_id = e.id and a.class_date = p_class_date
  left join lateral (
    select string_agg(sp.phone, ' / ' order by sp.is_primary_contact desc, sp.created_at, sp.id) as phone
    from public.stu_parents sp
    where sp.student_id = s.id and nullif(trim(sp.phone), '') is not null
  ) parent_contacts on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'source_type', l.source_type,
        'unit_price', l.unit_price,
        'total_lessons', l.total_lessons,
        'consumed_lessons', l.consumed_lessons,
        'remaining_lessons', l.remaining_lessons,
        'total_amount', l.total_amount,
        'notes', l.notes,
        'enrolled_at', l.enrolled_at
      )
      order by
        case when l.source_type = 'gift' then 1 else 0 end,
        l.unit_price,
        l.enrolled_at,
        l.created_at
    ) as items
    from public.crs_lesson_lots l
    where l.enrollment_id = e.id
  ) lots on true
  where e.course_id = p_course_id
    and e.status in ('enrolled','completed','transferred','cancelled')
) t;
$function$;

grant execute on function public.rpc_list_course_enrollments(uuid,date) to authenticated;

create or replace function public.rpc_get_student_monthly_calendar(
  p_student_id uuid,
  p_year integer,
  p_month integer
)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
with bounds as (
  select
    make_date(p_year, p_month, 1) as start_date,
    (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date as end_date
),
days as (
  select d::date as day
  from generate_series(
    (select start_date from bounds),
    (select end_date from bounds),
    interval '1 day'
  ) d
),
attendance_rows as (
  select
    a.class_date,
    jsonb_build_object(
      'attendance_id', a.id,
      'enrollment_id', a.enrollment_id,
      'course_id', c.id,
      'course_name', c.name,
      'status', a.status,
      'notes', a.notes,
      'marked_at', a.created_at,
      'consumption_count', coalesce(consumption.lesson_count, 0),
      'amount', coalesce(consumption.amount, 0),
      'unit_price', consumption.unit_price,
      'consumed_at', consumption.consumed_at,
      'operator_name', coalesce(consumption.operator_name, marker.display_name)
    ) as slot
  from public.crs_attendance a
  join public.crs_enrollments e on e.id = a.enrollment_id
  join public.crs_courses c on c.id = e.course_id
  left join public.acct_profiles marker on marker.id = a.marked_by
  left join lateral (
    select
      coalesce(sum(f.lesson_count), 0)::integer as lesson_count,
      coalesce(sum(f.amount), 0)::numeric(12,2) as amount,
      case when sum(f.lesson_count) > 0
        then round(sum(f.amount) / sum(f.lesson_count), 2)
        else null
      end as unit_price,
      max(f.created_at) as consumed_at,
      string_agg(distinct coalesce(op.display_name, '系统'), ' / ') as operator_name
    from public.fin_consumption_logs f
    left join public.acct_profiles op on op.id = f.created_by
    where f.attendance_id = a.id
  ) consumption on true
  where e.student_id = p_student_id
    and a.class_date between (select start_date from bounds) and (select end_date from bounds)
),
eligible as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'enrollment_id', e.id,
    'course_id', c.id,
    'course_name', c.name,
    'remaining_lessons', e.remaining_lessons,
    'unit_price', e.unit_price
  ) order by c.name), '[]'::jsonb) as items
  from public.crs_enrollments e
  join public.crs_courses c on c.id = e.course_id and c.deleted_at is null
  where e.student_id = p_student_id and e.status = 'enrolled'
)
select jsonb_build_object(
  'year', p_year,
  'month', p_month,
  'eligible_enrollments', (select items from eligible),
  'days', coalesce(jsonb_agg(
    jsonb_build_object('date', d.day, 'slots', day_slots.slots)
    order by d.day
  ), '[]'::jsonb)
)
from days d
left join lateral (
  select coalesce(jsonb_agg(ar.slot order by ar.slot->>'course_name'), '[]'::jsonb) as slots
  from attendance_rows ar
  where ar.class_date = d.day
) day_slots on true;
$function$;

grant execute on function public.rpc_get_student_monthly_calendar(uuid,integer,integer)
to authenticated;

create or replace function public.rpc_enroll_student_v3(
  p_student_id uuid,
  p_course_id uuid,
  p_price_id uuid default null,
  p_campaign_id uuid default null,
  p_source text default 'normal',
  p_custom_discount_type text default null,
  p_custom_discount_value numeric default null,
  p_discount_reason text default null,
  p_referrer_student_id uuid default null,
  p_notes text default null,
  p_lessons_override integer default null,
  p_gift_lessons integer default 0,
  p_gift_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := auth.uid();
  v_course public.crs_courses;
  v_plan public.crs_course_prices;
  v_campaign public.promo_campaigns;
  v_enrollment public.crs_enrollments;
  v_paid_lot public.crs_lesson_lots;
  v_base_lessons integer;
  v_campaign_gifts integer := 0;
  v_total_gifts integer := 0;
  v_list_unit numeric(10,2);
  v_gross numeric(12,2);
  v_discount_type text;
  v_discount_value numeric(12,4) := 0;
  v_discount numeric(12,2) := 0;
  v_net numeric(12,2);
  v_effective_unit numeric(10,2);
  v_enrolled_count integer;
  v_snapshot jsonb;
  v_gift_note text;
begin
  if not public.has_permission('courses.enroll') then
    raise exception 'PERMISSION_DENIED: 无权办理报名';
  end if;
  if p_source not in ('normal','campaign','referral','custom') then
    raise exception 'INVALID_SOURCE: 报名类型无效';
  end if;
  if coalesce(p_gift_lessons, 0) < 0 then
    raise exception 'INVALID_GIFT: 赠送课时不能小于零';
  end if;
  if coalesce(p_gift_lessons, 0) > 0
     and nullif(trim(coalesce(p_gift_note,'')), '') is null then
    raise exception 'INVALID_GIFT_NOTE: 赠送课时必须填写备注';
  end if;
  if not exists (
    select 1 from public.stu_students
    where id = p_student_id and deleted_at is null and status <> 'inactive'
  ) then raise exception 'STUDENT_NOT_FOUND: 学员不存在或已停用'; end if;

  select * into v_course
  from public.crs_courses
  where id = p_course_id and deleted_at is null
  for update;
  if not found or v_course.status <> 'active' then
    raise exception 'COURSE_UNAVAILABLE: 课程不存在或当前不可报名';
  end if;
  if exists (
    select 1 from public.crs_enrollments
    where student_id = p_student_id and course_id = p_course_id
      and status in ('enrolled','completed')
  ) then raise exception 'DUPLICATE_ENROLLMENT: 该学员已报名此课程，请在花名册中新增课时批次'; end if;
  select count(*) into v_enrolled_count
  from public.crs_enrollments
  where course_id = p_course_id and status = 'enrolled';
  if v_course.max_capacity is not null and v_enrolled_count >= v_course.max_capacity then
    raise exception 'COURSE_FULL: 课程已满员';
  end if;

  v_base_lessons := nullif(v_course.schedule_info->>'total_lessons','')::integer;
  v_list_unit := v_course.fee;
  if v_base_lessons is null or v_base_lessons <= 0 or v_list_unit is null or v_list_unit <= 0 then
    raise exception 'PRICE_INCOMPLETE: 课程尚未完整设置课时与标准单价';
  end if;
  v_gross := round(v_list_unit * v_base_lessons, 2);

  if p_price_id is not null then
    select * into v_plan
    from public.crs_course_prices
    where id = p_price_id and course_id = p_course_id and status = 'active'
      and (effective_from is null or effective_from <= current_date)
      and (effective_to is null or effective_to >= current_date);
    if not found then raise exception 'INVALID_PRICE_PLAN: 价格方案无效或已过期'; end if;
    v_base_lessons := coalesce(v_plan.total_lessons, v_base_lessons);
    v_gross := coalesce(
      v_plan.total_price,
      round(coalesce(v_plan.unit_price, v_list_unit) * v_base_lessons, 2)
    );
  end if;
  if p_lessons_override is not null then
    if p_lessons_override <= 0 then raise exception 'INVALID_LESSONS: 报名课时必须大于零'; end if;
    v_gross := round((v_gross / v_base_lessons) * p_lessons_override, 2);
    v_base_lessons := p_lessons_override;
  end if;

  if p_campaign_id is not null then
    select * into v_campaign
    from public.promo_campaigns
    where id = p_campaign_id and status = 'active'
      and type in ('enrollment_discount','course_discount','referral')
      and (start_date is null or start_date <= current_date)
      and (end_date is null or end_date >= current_date)
      and (max_usage is null or used_count < max_usage)
      and (
        jsonb_array_length(coalesce(applicable_course_ids,'[]'::jsonb)) = 0
        or applicable_course_ids ? p_course_id::text
      )
    for update;
    if not found then
      raise exception 'INVALID_CAMPAIGN: 优惠组合无效、不适用于本课程或已过期';
    end if;
    v_discount_type := v_campaign.discount_type;
    v_discount_value := coalesce(v_campaign.discount_value, 0);
    v_campaign_gifts := coalesce(v_campaign.gift_lessons, 0);
  elsif p_custom_discount_type is not null then
    if not public.has_permission('courses.pricing') then
      raise exception 'PERMISSION_DENIED: 自定义优惠需要价格权限';
    end if;
    if nullif(trim(coalesce(p_discount_reason,'')), '') is null then
      raise exception 'INVALID_REASON: 自定义优惠必须填写原因';
    end if;
    v_discount_type := p_custom_discount_type;
    v_discount_value := coalesce(p_custom_discount_value, 0);
  end if;

  if p_source = 'normal' and (p_campaign_id is not null or p_custom_discount_type is not null) then
    raise exception 'INVALID_SOURCE: 正常报名不能附带优惠';
  elsif p_source = 'campaign' and p_campaign_id is null then
    raise exception 'INVALID_CAMPAIGN: 优惠报名必须选择优惠组合';
  elsif p_source = 'custom' and p_custom_discount_type is null then
    raise exception 'INVALID_DISCOUNT: 自定义优惠缺少优惠类型';
  end if;

  if v_discount_type in ('fixed','amount') then
    v_discount := least(v_gross, greatest(v_discount_value, 0));
  elsif v_discount_type in ('percentage','percent') then
    if v_discount_value < 0 or v_discount_value > 100 then
      raise exception 'INVALID_DISCOUNT: 折扣百分比必须在 0 到 100 之间';
    end if;
    v_discount := round(v_gross * v_discount_value / 100, 2);
  elsif v_discount_type is not null and v_discount_type <> 'gift_lessons' then
    raise exception 'INVALID_DISCOUNT: 不支持的优惠类型';
  end if;

  v_total_gifts := v_campaign_gifts + coalesce(p_gift_lessons, 0);
  v_net := greatest(0, round(v_gross - v_discount, 2));
  v_effective_unit := round(v_net / v_base_lessons, 2);
  v_gift_note := nullif(trim(coalesce(
    p_gift_note,
    case when v_campaign_gifts > 0 then '优惠组合赠送：' || v_campaign.name end,
    ''
  )), '');
  v_snapshot := jsonb_build_object(
    'version', 2,
    'lot_model', 'v2',
    'course_name', v_course.name,
    'list_unit_price', v_list_unit,
    'paid_lessons', v_base_lessons,
    'gift_lessons', v_total_gifts,
    'gross_amount', v_gross,
    'discount_type', v_discount_type,
    'discount_value', v_discount_value,
    'discount_amount', v_discount,
    'discount_reason', p_discount_reason,
    'net_amount', v_net,
    'effective_unit_price', v_effective_unit,
    'price_plan_id', p_price_id,
    'price_plan_name', v_plan.name,
    'campaign_id', p_campaign_id,
    'campaign_name', v_campaign.name,
    'source', p_source,
    'gift_note', v_gift_note,
    'quoted_at', now()
  );

  insert into public.crs_enrollments(
    student_id, course_id, price_id, campaign_id, notes, source, unit_price,
    total_lessons, consumed_lessons, remaining_lessons, total_amount, paid_amount,
    discount_amount, list_unit_price, gross_amount, discount_type, discount_value,
    discount_reason, referrer_student_id, price_snapshot, created_by
  ) values (
    p_student_id, p_course_id, p_price_id, p_campaign_id, p_notes, p_source,
    v_effective_unit, v_base_lessons + v_total_gifts, 0,
    v_base_lessons + v_total_gifts, v_net, 0, v_discount, v_list_unit, v_gross,
    v_discount_type, v_discount_value, p_discount_reason, p_referrer_student_id,
    v_snapshot, v_operator
  ) returning * into v_enrollment;

  insert into public.crs_lesson_lots(
    enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
    remaining_lessons, total_amount, notes, enrolled_at, created_by
  ) values (
    v_enrollment.id, 'paid', v_effective_unit, v_base_lessons, 0,
    v_base_lessons, v_net, coalesce(p_notes, p_discount_reason),
    coalesce(v_enrollment.enrolled_at, now()), v_operator
  ) returning * into v_paid_lot;
  if v_total_gifts > 0 then
    insert into public.crs_lesson_lots(
      enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
      remaining_lessons, total_amount, notes, enrolled_at, created_by
    ) values (
      v_enrollment.id, 'gift', 0, v_total_gifts, 0, v_total_gifts, 0,
      coalesce(v_gift_note, '报名赠送课时'),
      coalesce(v_enrollment.enrolled_at, now()), v_operator
    );
  end if;
  perform public.sync_enrollment_lot_totals(v_enrollment.id);

  insert into public.crs_enrollment_price_history(enrollment_id, action, snapshot, changed_by)
  values (v_enrollment.id, 'created', v_snapshot, v_operator);
  if p_campaign_id is not null then
    update public.promo_campaigns
    set used_count = used_count + 1, updated_at = now()
    where id = p_campaign_id;
  end if;
  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (v_operator, 'enroll_student', 'enrollment', v_enrollment.id, v_snapshot);
  return jsonb_build_object(
    'message','报名成功',
    'enrollment_id',v_enrollment.id,
    'pricing',v_snapshot,
    'paid_lot_id',v_paid_lot.id
  );
end;
$function$;

grant execute on function public.rpc_enroll_student_v3(
  uuid,uuid,uuid,uuid,text,text,numeric,text,uuid,text,integer,integer,text
) to authenticated;

create or replace function public.rpc_update_attendance(
  p_attendance_id uuid,
  p_status varchar,
  p_notes text default null,
  p_trigger_consume boolean default false,
  p_operator_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := coalesce(p_operator_id, auth.uid());
  v_att public.crs_attendance;
  v_enrollment public.crs_enrollments;
  v_old_status text;
  v_account public.fin_accounts;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_reverse_amount numeric(12,2) := 0;
  v_reverse_lessons integer := 0;
  v_first_log_id uuid;
  v_tx public.fin_transactions;
  v_log public.fin_consumption_logs;
  v_consume_result jsonb := null;
begin
  if not public.has_permission('courses.attendance') then
    raise exception 'PERMISSION_DENIED: 无权修改考勤';
  end if;
  if p_status not in ('present','absent','late','leave') then
    raise exception 'INVALID_INPUT: 考勤状态无效';
  end if;
  select * into v_att from public.crs_attendance
  where id = p_attendance_id for update;
  if not found then raise exception 'ATTENDANCE_NOT_FOUND: 考勤记录不存在'; end if;
  v_old_status := v_att.status;
  select * into v_enrollment from public.crs_enrollments
  where id = v_att.enrollment_id for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在'; end if;

  if v_old_status in ('absent','leave')
     and p_status in ('present','late')
     and p_trigger_consume then
    if nullif(trim(coalesce(p_notes,'')), '') is null then
      raise exception 'INVALID_NOTE: 补课消必须填写备注';
    end if;
    update public.crs_attendance
    set status = p_status, notes = p_notes, marked_by = v_operator, updated_at = now()
    where id = p_attendance_id;
    v_consume_result := public.rpc_consume_lesson(
      p_enrollment_id => v_att.enrollment_id,
      p_operator_id => v_operator,
      p_attendance_id => p_attendance_id,
      p_lesson_count => 1
    );
  elsif v_old_status in ('present','late') and p_status in ('absent','leave') then
    select id into v_first_log_id
    from public.fin_consumption_logs
    where attendance_id = p_attendance_id
    order by created_at, id
    limit 1;
    if v_first_log_id is not null then
      select coalesce(sum(amount),0), coalesce(sum(lesson_count),0)
      into v_reverse_amount, v_reverse_lessons
      from public.fin_consumption_logs
      where attendance_id = p_attendance_id;
      select * into v_account from public.fin_accounts
      where student_id = v_enrollment.student_id for update;
      v_balance_before := v_account.balance;
      v_balance_after := round(v_balance_before + v_reverse_amount, 2);
      update public.fin_accounts
      set balance = v_balance_after,
          total_consumed = greatest(0, round(total_consumed - v_reverse_amount, 2)),
          updated_at = now()
      where id = v_account.id;

      for v_log in
        select * from public.fin_consumption_logs
        where attendance_id = p_attendance_id
        order by created_at, id
        for update
      loop
        if v_log.lesson_lot_id is not null then
          update public.crs_lesson_lots
          set consumed_lessons = greatest(0, consumed_lessons - v_log.lesson_count),
              remaining_lessons = remaining_lessons + v_log.lesson_count,
              updated_at = now()
          where id = v_log.lesson_lot_id;
        end if;
      end loop;

      select * into v_tx
      from public.fin_transactions
      where reference_type = 'consumption_log'
        and reference_id = v_first_log_id
      order by created_at desc
      limit 1
      for update;
      if v_tx.id is not null then
        update public.fin_transactions
        set balance_before = balance_before + v_reverse_amount,
            balance_after = balance_after + v_reverse_amount
        where account_id = v_tx.account_id
          and created_at > v_tx.created_at
          and id <> v_tx.id;
        delete from public.fin_transactions where id = v_tx.id;
      end if;
      delete from public.fin_consumption_logs where attendance_id = p_attendance_id;
      perform public.sync_enrollment_lot_totals(v_enrollment.id);
    end if;
    update public.crs_attendance
    set status = p_status,
        notes = coalesce(p_notes, notes),
        marked_by = v_operator,
        updated_at = now()
    where id = p_attendance_id;
  else
    update public.crs_attendance
    set status = p_status,
        notes = coalesce(p_notes, notes),
        marked_by = v_operator,
        updated_at = now()
    where id = p_attendance_id;
  end if;

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    v_operator, 'update_attendance', 'attendance', p_attendance_id,
    jsonb_build_object(
      'from',v_old_status,'to',p_status,
      'trigger_consume',p_trigger_consume,
      'reverse_amount',v_reverse_amount,
      'reverse_lessons',v_reverse_lessons
    )
  );
  return jsonb_build_object(
    'attendance_id',p_attendance_id,
    'from_status',v_old_status,
    'to_status',p_status,
    'consume_result',v_consume_result,
    'reverse_amount',v_reverse_amount
  );
end;
$function$;

grant execute on function public.rpc_update_attendance(uuid,varchar,text,boolean,uuid)
to authenticated;

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
  v_ids jsonb;
begin
  v_result := public.rpc_consume_lesson(
    p_enrollment_id => (p_payload->>'p_enrollment_id')::uuid,
    p_operator_id => p_operator,
    p_attendance_id => null,
    p_lesson_count => (p_payload->>'p_lesson_count')::integer,
    p_unit_price => nullif(p_payload->>'p_unit_price','')::numeric
  );
  v_ids := coalesce(
    v_result->'consumption_log_ids',
    jsonb_build_array(v_result->>'consumption_log_id')
  );
  update public.fin_consumption_logs
  set created_at = v_date::timestamp at time zone 'Asia/Hong_Kong',
      notes = v_reason
  where id in (
    select value::uuid from jsonb_array_elements_text(v_ids)
  );
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

do $block$
begin
  if to_regprocedure('public.rpc_reverse_approval_base_0025(uuid,text)') is null
     and to_regprocedure('public.rpc_reverse_approval(uuid,text)') is not null then
    alter function public.rpc_reverse_approval(uuid,text)
      rename to rpc_reverse_approval_base_0025;
  end if;
end
$block$;

create or replace function public.rpc_reverse_approval(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_approval public.aud_approvals%rowtype;
  v_result_data jsonb;
  v_log_ids jsonb;
  v_tx public.fin_transactions;
  v_log public.fin_consumption_logs;
  v_enrollment_id uuid;
  v_restored_lessons integer := 0;
  v_restored_amount numeric(12,2) := 0;
  v_result jsonb;
begin
  select * into v_approval
  from public.aud_approvals
  where id = p_id;
  if not found or v_approval.type <> 'finance_consume' then
    return public.rpc_reverse_approval_base_0025(p_id, p_reason);
  end if;
  if auth.uid() is null or public.get_my_role() <> 'admin' then
    raise exception 'PERMISSION_DENIED: 仅最高管理员可以撤销已执行审批';
  end if;
  if nullif(trim(coalesce(p_reason,'')), '') is null then
    raise exception 'INVALID_REASON: 撤销原因必填';
  end if;
  select * into v_approval
  from public.aud_approvals
  where id = p_id
  for update;
  if v_approval.status <> 'approved' or v_approval.execution_status <> 'succeeded' then
    raise exception 'APPROVAL_NOT_REVERSIBLE: 仅能撤销已通过且执行成功的审批';
  end if;
  if v_approval.reversed_at is not null then
    raise exception 'APPROVAL_ALREADY_REVERSED: 该审批已经撤销';
  end if;

  v_result_data := v_approval.execution_result->'result';
  v_log_ids := coalesce(
    v_result_data->'consumption_log_ids',
    jsonb_build_array(v_result_data->>'consumption_log_id')
  );
  select * into v_tx
  from public.fin_transactions
  where id = (v_result_data->>'transaction_id')::uuid
  for update;
  if not found then raise exception 'REVERSAL_SOURCE_MISSING: 原消课流水不存在'; end if;

  for v_log in
    select *
    from public.fin_consumption_logs
    where id in (select value::uuid from jsonb_array_elements_text(v_log_ids))
    order by created_at, id
    for update
  loop
    v_enrollment_id := coalesce(v_enrollment_id, v_log.enrollment_id);
    v_restored_lessons := v_restored_lessons + v_log.lesson_count;
    v_restored_amount := v_restored_amount + v_log.amount;
    if v_log.lesson_lot_id is not null then
      update public.crs_lesson_lots
      set consumed_lessons = greatest(0, consumed_lessons - v_log.lesson_count),
          remaining_lessons = remaining_lessons + v_log.lesson_count,
          updated_at = now()
      where id = v_log.lesson_lot_id;
    end if;
  end loop;
  if v_enrollment_id is null then
    raise exception 'REVERSAL_SOURCE_MISSING: 原消课明细不存在';
  end if;

  update public.fin_accounts
  set balance = round(balance + v_tx.amount, 2),
      total_consumed = greatest(0, round(total_consumed - v_tx.amount, 2)),
      updated_at = now()
  where id = v_tx.account_id;
  update public.fin_transactions
  set balance_before = round(balance_before + v_tx.amount, 2),
      balance_after = round(balance_after + v_tx.amount, 2)
  where account_id = v_tx.account_id
    and created_at > v_tx.created_at
    and id <> v_tx.id;
  delete from public.fin_transactions where id = v_tx.id;
  delete from public.fin_consumption_logs
  where id in (select value::uuid from jsonb_array_elements_text(v_log_ids));
  perform public.sync_enrollment_lot_totals(v_enrollment_id);

  v_result := jsonb_build_object(
    'restored_amount', v_restored_amount,
    'restored_lessons', v_restored_lessons,
    'restored_enrollment_id', v_enrollment_id
  );
  update public.aud_approvals
  set status = 'rejected',
      execution_status = 'not_required',
      reversed_at = now(),
      reversed_by = auth.uid(),
      reversal_note = trim(p_reason),
      reversal_result = v_result
  where id = p_id;
  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    auth.uid(), 'reverse_approval', 'approval', p_id,
    jsonb_build_object(
      'type','finance_consume','reason',trim(p_reason),'result',v_result
    )
  );
  return jsonb_build_object('ok',true,'status','rejected','reversal',v_result);
end;
$function$;

grant execute on function public.rpc_reverse_approval(uuid,text) to authenticated;

create or replace function public.rpc_transfer_enrollment(
  p_source_enrollment_id uuid,
  p_target_course_id uuid,
  p_carry_lessons integer,
  p_reason text default null,
  p_operator_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := coalesce(p_operator_id, auth.uid());
  v_src public.crs_enrollments;
  v_course public.crs_courses;
  v_new_id uuid;
  v_active_count integer;
  v_need integer := p_carry_lessons;
  v_take integer;
  v_lot public.crs_lesson_lots;
begin
  select * into v_src from public.crs_enrollments
  where id = p_source_enrollment_id for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 源报名不存在'; end if;
  if v_src.status <> 'enrolled' then raise exception 'INVALID_STATE: 仅能转课进行中的报名'; end if;
  if p_carry_lessons is null or p_carry_lessons <= 0 then
    raise exception 'INVALID_INPUT: 携带课时数必须为正整数';
  end if;
  if p_carry_lessons > v_src.remaining_lessons then
    raise exception 'INVALID_INPUT: 携带课时不得超过剩余 % 课时', v_src.remaining_lessons;
  end if;
  select * into v_course from public.crs_courses
  where id = p_target_course_id and deleted_at is null;
  if not found or v_course.status <> 'active' then
    raise exception 'COURSE_UNAVAILABLE: 目标课程不存在或不可报名';
  end if;
  if v_course.id = v_src.course_id then
    raise exception 'INVALID_INPUT: 目标课程与源课程相同';
  end if;
  select count(*) into v_active_count from public.crs_enrollments
  where course_id = p_target_course_id and status = 'enrolled';
  if v_course.max_capacity is not null and v_active_count >= v_course.max_capacity then
    raise exception 'COURSE_FULL: 目标课程已满员';
  end if;

  update public.crs_enrollments
  set status = 'transferred',
      completed_at = now(),
      notes = coalesce(notes, '') || E'\n[转课 ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || coalesce(p_reason, ''),
      updated_at = now()
  where id = p_source_enrollment_id;

  insert into public.crs_enrollments(
    student_id, course_id, status, unit_price, total_lessons, consumed_lessons,
    remaining_lessons, total_amount, paid_amount, discount_amount, source,
    original_enrollment_id, created_by, notes, price_snapshot
  ) values (
    v_src.student_id, p_target_course_id, 'enrolled', v_src.unit_price,
    p_carry_lessons, 0, p_carry_lessons,
    round(p_carry_lessons * coalesce(v_src.unit_price, 0), 2),
    0, 0, 'transfer', p_source_enrollment_id, v_operator,
    '由 ' || v_src.id::text || ' 转入：' || coalesce(p_reason, ''),
    jsonb_build_object('version',2,'lot_model','v2','source','transfer','original_enrollment_id',v_src.id)
  ) returning id into v_new_id;

  for v_lot in
    select * from public.crs_lesson_lots
    where enrollment_id = p_source_enrollment_id and remaining_lessons > 0
    order by
      case when source_type = 'gift' then 1 else 0 end,
      unit_price, enrolled_at, created_at, id
  loop
    exit when v_need <= 0;
    v_take := least(v_need, v_lot.remaining_lessons);
    insert into public.crs_lesson_lots(
      enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
      remaining_lessons, total_amount, notes, enrolled_at, created_by
    ) values (
      v_new_id,
      case when v_lot.source_type = 'gift' then 'gift' else 'transfer' end,
      v_lot.unit_price,
      v_take, 0, v_take,
      round(v_lot.unit_price * v_take, 2),
      concat_ws('；', v_lot.notes, '由报名 ' || p_source_enrollment_id::text || ' 转入'),
      now(), v_operator
    );
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then
    insert into public.crs_lesson_lots(
      enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
      remaining_lessons, total_amount, notes, enrolled_at, created_by
    ) values (
      v_new_id, 'transfer', coalesce(v_src.unit_price, 0), v_need, 0, v_need,
      round(coalesce(v_src.unit_price, 0) * v_need, 2),
      '旧报名转入补建批次', now(), v_operator
    );
  end if;
  perform public.sync_enrollment_lot_totals(v_new_id);

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    v_operator, 'transfer_enrollment', 'enrollment', p_source_enrollment_id,
    jsonb_build_object(
      'target_course_id',p_target_course_id,
      'new_enrollment_id',v_new_id,
      'carry_lessons',p_carry_lessons,
      'reason',p_reason
    )
  );
  return v_new_id;
end;
$function$;

grant execute on function public.rpc_transfer_enrollment(uuid,uuid,integer,text,uuid)
to authenticated;
