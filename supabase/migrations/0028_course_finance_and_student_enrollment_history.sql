-- Keep course contract changes, lesson lots, finance ledgers, and student
-- enrollment history in one transactional chain.

alter table public.fin_transactions
  drop constraint if exists chk_fin_transactions_type;
alter table public.fin_transactions
  add constraint chk_fin_transactions_type
  check (type in (
    'recharge','consume','refund','transfer_out','transfer_in',
    'gift','adjustment','enrollment','lesson_purchase'
  ));

create or replace function public._record_course_finance_event(
  p_student_id uuid,
  p_type text,
  p_amount numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_description text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default null,
  p_created_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account public.fin_accounts;
  v_transaction_id uuid;
  v_event_key text := nullif(p_metadata->>'event_key', '');
begin
  if p_type not in (
    'enrollment','lesson_purchase','gift','adjustment','transfer_in','transfer_out'
  ) then
    raise exception 'INVALID_FINANCE_EVENT: 不支持的课程财务事件 %', p_type;
  end if;

  select * into v_account
  from public.fin_accounts
  where student_id = p_student_id
  for update;
  if not found then
    insert into public.fin_accounts(student_id, balance)
    values (p_student_id, 0)
    returning * into v_account;
  end if;

  if v_event_key is not null then
    select id into v_transaction_id
    from public.fin_transactions
    where account_id = v_account.id
      and metadata->>'event_key' = v_event_key
    limit 1;
    if found then return v_transaction_id; end if;
  end if;

  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, metadata, created_by, created_at
  ) values (
    v_account.id,
    p_type,
    round(coalesce(p_amount, 0), 2),
    round(v_account.balance, 2),
    round(v_account.balance, 2),
    p_reference_type,
    p_reference_id,
    p_description,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'domain', 'course_contract',
      'wallet_balance_changed', false
    ),
    p_created_by,
    coalesce(p_created_at, now())
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$function$;

revoke all on function public._record_course_finance_event(
  uuid,text,numeric,text,uuid,text,jsonb,uuid,timestamptz
) from public, authenticated;

create or replace function public._capture_course_finance_audit(
  p_action text,
  p_resource_id uuid,
  p_changes jsonb,
  p_user_id uuid,
  p_audit_id uuid,
  p_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lot record;
  v_enrollment public.crs_enrollments;
  v_target public.crs_enrollments;
  v_course_name text;
  v_source_course_name text;
  v_target_course_name text;
  v_lot_id uuid;
  v_target_id uuid;
begin
  if p_action = 'enroll_student' then
    select e.* into v_enrollment
    from public.crs_enrollments e
    where e.id = p_resource_id;
    if not found then return; end if;

    select name into v_course_name from public.crs_courses where id = v_enrollment.course_id;
    for v_lot in
      select * from public.crs_lesson_lots where enrollment_id = p_resource_id
    loop
      perform public._record_course_finance_event(
        v_enrollment.student_id,
        case when v_lot.source_type = 'gift' then 'gift' else 'enrollment' end,
        case when v_lot.source_type = 'gift' then 0 else v_lot.total_amount end,
        'lesson_lot',
        v_lot.id,
        case
          when v_lot.source_type = 'gift'
            then format('报课赠送：%s，%s 课时', v_course_name, v_lot.total_lessons)
          else format('课程报名：%s，%s 课时，合同金额 %s', v_course_name, v_lot.total_lessons, v_lot.total_amount)
        end,
        jsonb_build_object(
          'event_key', format('audit:%s:lot:%s', p_audit_id, v_lot.id),
          'event', 'enrollment',
          'audit_id', p_audit_id,
          'enrollment_id', p_resource_id,
          'course_id', v_enrollment.course_id,
          'lesson_lot_id', v_lot.id,
          'source_type', v_lot.source_type,
          'total_lessons', v_lot.total_lessons,
          'unit_price', v_lot.unit_price
        ),
        p_user_id,
        p_created_at
      );
    end loop;

  elsif p_action = 'add_lesson_lot' then
    v_lot_id := nullif(p_changes->>'id', '')::uuid;
    select l.*, e.student_id, e.course_id, c.name as course_name
      into v_lot
    from public.crs_lesson_lots l
    join public.crs_enrollments e on e.id = l.enrollment_id
    join public.crs_courses c on c.id = e.course_id
    where l.id = v_lot_id;
    if not found then return; end if;

    perform public._record_course_finance_event(
      v_lot.student_id,
      case
        when v_lot.source_type = 'gift' then 'gift'
        when v_lot.source_type = 'transfer' then 'transfer_in'
        when v_lot.source_type = 'adjustment' then 'adjustment'
        else 'lesson_purchase'
      end,
      case when v_lot.source_type = 'gift' then 0 else v_lot.total_amount end,
      'lesson_lot',
      v_lot.id,
      case
        when v_lot.source_type = 'gift'
          then format('赠送课时：%s，%s 课时；%s', v_lot.course_name, v_lot.total_lessons, coalesce(v_lot.notes, '无备注'))
        else format('新增课时付费：%s，%s 课时 × %s；%s', v_lot.course_name, v_lot.total_lessons, v_lot.unit_price, coalesce(v_lot.notes, '无备注'))
      end,
      jsonb_build_object(
        'event_key', format('audit:%s:lot:%s', p_audit_id, v_lot.id),
        'event', 'lesson_lot_added',
        'audit_id', p_audit_id,
        'enrollment_id', v_lot.enrollment_id,
        'course_id', v_lot.course_id,
        'lesson_lot_id', v_lot.id,
        'source_type', v_lot.source_type,
        'total_lessons', v_lot.total_lessons,
        'unit_price', v_lot.unit_price
      ),
      p_user_id,
      p_created_at
    );

  elsif p_action = 'transfer_enrollment' then
    v_target_id := nullif(p_changes->>'new_enrollment_id', '')::uuid;
    select * into v_enrollment
    from public.crs_enrollments where id = p_resource_id;
    select * into v_target
    from public.crs_enrollments where id = v_target_id;
    if v_enrollment.id is null or v_target.id is null then return; end if;

    select name into v_source_course_name from public.crs_courses where id = v_enrollment.course_id;
    select name into v_target_course_name from public.crs_courses where id = v_target.course_id;

    perform public._record_course_finance_event(
      v_enrollment.student_id,
      'transfer_out',
      v_target.total_amount,
      'enrollment',
      v_enrollment.id,
      format('课程转出：%s → %s，携带 %s 课时', v_source_course_name, v_target_course_name, v_target.total_lessons),
      jsonb_build_object(
        'event_key', format('audit:%s:transfer_out', p_audit_id),
        'event', 'enrollment_transfer_out',
        'audit_id', p_audit_id,
        'source_enrollment_id', v_enrollment.id,
        'target_enrollment_id', v_target.id,
        'source_course_id', v_enrollment.course_id,
        'target_course_id', v_target.course_id,
        'carry_lessons', v_target.total_lessons
      ),
      p_user_id,
      p_created_at
    );

    perform public._record_course_finance_event(
      v_target.student_id,
      'transfer_in',
      v_target.total_amount,
      'enrollment',
      v_target.id,
      format('课程转入：%s → %s，携带 %s 课时', v_source_course_name, v_target_course_name, v_target.total_lessons),
      jsonb_build_object(
        'event_key', format('audit:%s:transfer_in', p_audit_id),
        'event', 'enrollment_transfer_in',
        'audit_id', p_audit_id,
        'source_enrollment_id', v_enrollment.id,
        'target_enrollment_id', v_target.id,
        'source_course_id', v_enrollment.course_id,
        'target_course_id', v_target.course_id,
        'carry_lessons', v_target.total_lessons
      ),
      p_user_id,
      p_created_at
    );
  end if;
end;
$function$;

revoke all on function public._capture_course_finance_audit(
  text,uuid,jsonb,uuid,uuid,timestamptz
) from public, authenticated;

create or replace function public.capture_course_finance_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._capture_course_finance_audit(
    new.action, new.resource_id, coalesce(new.changes, '{}'::jsonb),
    new.user_id, new.id, new.created_at
  );
  return new;
end;
$function$;

drop trigger if exists trg_capture_course_finance_audit on public.aud_operation_logs;
create trigger trg_capture_course_finance_audit
after insert on public.aud_operation_logs
for each row
when (new.action in ('enroll_student','add_lesson_lot','transfer_enrollment'))
execute function public.capture_course_finance_audit_trigger();

create or replace function public.capture_lesson_lot_finance_adjustment_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student_id uuid;
  v_course_id uuid;
  v_course_name text;
  v_amount numeric(12,2);
begin
  select e.student_id, e.course_id, c.name
    into v_student_id, v_course_id, v_course_name
  from public.crs_enrollments e
  join public.crs_courses c on c.id = e.course_id
  where e.id = new.enrollment_id;

  v_amount := round(coalesce(new.total_amount, 0) - coalesce(old.total_amount, 0), 2);
  perform public._record_course_finance_event(
    v_student_id,
    case when new.source_type = 'gift' then 'gift' else 'adjustment' end,
    case when new.source_type = 'gift' then 0 else v_amount end,
    'lesson_lot',
    new.id,
    format(
      '课时批次修改：%s，课时 %s → %s，单价 %s → %s，合同金额变化 %s',
      v_course_name, old.total_lessons, new.total_lessons,
      old.unit_price, new.unit_price, v_amount
    ),
    jsonb_build_object(
      'event_key', format('lot-update:%s', gen_random_uuid()),
      'event', 'lesson_lot_updated',
      'enrollment_id', new.enrollment_id,
      'course_id', v_course_id,
      'lesson_lot_id', new.id,
      'source_type', new.source_type,
      'amount_delta', v_amount,
      'before', jsonb_build_object(
        'total_lessons', old.total_lessons,
        'unit_price', old.unit_price,
        'total_amount', old.total_amount,
        'enrolled_at', old.enrolled_at,
        'notes', old.notes
      ),
      'after', jsonb_build_object(
        'total_lessons', new.total_lessons,
        'unit_price', new.unit_price,
        'total_amount', new.total_amount,
        'enrolled_at', new.enrolled_at,
        'notes', new.notes
      )
    ),
    coalesce(auth.uid(), new.created_by),
    now()
  );
  return new;
end;
$function$;

drop trigger if exists trg_capture_lesson_lot_finance_adjustment on public.crs_lesson_lots;
create trigger trg_capture_lesson_lot_finance_adjustment
after update of total_lessons, unit_price, notes, enrolled_at
on public.crs_lesson_lots
for each row
when (
  old.total_lessons is distinct from new.total_lessons
  or old.unit_price is distinct from new.unit_price
  or old.notes is distinct from new.notes
  or old.enrolled_at is distinct from new.enrolled_at
)
execute function public.capture_lesson_lot_finance_adjustment_trigger();

-- Backfill the currently active dataset from the immutable operation audit.
do $block$
declare
  v_audit public.aud_operation_logs;
begin
  for v_audit in
    select *
    from public.aud_operation_logs
    where action in ('enroll_student','add_lesson_lot','transfer_enrollment')
    order by created_at, id
  loop
    perform public._capture_course_finance_audit(
      v_audit.action, v_audit.resource_id, coalesce(v_audit.changes, '{}'::jsonb),
      v_audit.user_id, v_audit.id, v_audit.created_at
    );
  end loop;
end;
$block$;

create or replace function public.rpc_get_student_lifecycle(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_student jsonb;
  v_parents jsonb;
  v_tags jsonb;
  v_account jsonb;
  v_enrollments jsonb;
  v_enrollment_events jsonb;
  v_followups jsonb;
  v_transactions jsonb;
begin
  select to_jsonb(sub) into v_student
  from (
    select s.*, d.name as department_name, p.display_name as counselor_name
    from public.stu_students s
    left join public.acct_departments d on d.id = s.department_id
    left join public.acct_profiles p on p.id = s.assigned_to
    where s.id = p_student_id
  ) sub;
  if v_student is null then
    raise exception 'STUDENT_NOT_FOUND: 学员不存在';
  end if;

  select coalesce(jsonb_agg(to_jsonb(sp) order by sp.is_primary_contact desc, sp.created_at), '[]'::jsonb)
    into v_parents
  from public.stu_parents sp
  where sp.student_id = p_student_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'color', t.color, 'category', t.category
  )), '[]'::jsonb)
    into v_tags
  from public.stu_student_tags st
  join public.stu_tags t on t.id = st.tag_id
  where st.student_id = p_student_id;

  select to_jsonb(fa) into v_account
  from public.fin_accounts fa
  where fa.student_id = p_student_id;

  select coalesce(jsonb_agg(to_jsonb(enrollment_row) order by enrollment_row.enrolled_at desc), '[]'::jsonb)
    into v_enrollments
  from (
    select
      e.*,
      c.name as course_name,
      c.subject,
      original_course.name as original_course_name,
      coalesce(lots.items, '[]'::jsonb) as lesson_lots
    from public.crs_enrollments e
    join public.crs_courses c on c.id = e.course_id
    left join public.crs_enrollments original_enrollment on original_enrollment.id = e.original_enrollment_id
    left join public.crs_courses original_course on original_course.id = original_enrollment.course_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', lot.id,
          'source_type', lot.source_type,
          'unit_price', lot.unit_price,
          'total_lessons', lot.total_lessons,
          'consumed_lessons', lot.consumed_lessons,
          'remaining_lessons', lot.remaining_lessons,
          'total_amount', lot.total_amount,
          'notes', lot.notes,
          'enrolled_at', lot.enrolled_at
        )
        order by
          case when lot.source_type = 'gift' then 1 else 0 end,
          lot.unit_price, lot.enrolled_at, lot.created_at, lot.id
      ) as items
      from public.crs_lesson_lots lot
      where lot.enrollment_id = e.id
    ) lots on true
    where e.student_id = p_student_id
  ) enrollment_row;

  select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.event_at desc), '[]'::jsonb)
    into v_enrollment_events
  from (
    select
      e.id as enrollment_id,
      case when e.source = 'transfer' then 'transfer' else 'enrollment' end as event_type,
      coalesce(e.enrolled_at, e.created_at) as event_at,
      e.course_id,
      c.name as course_name,
      original_enrollment.course_id as original_course_id,
      original_course.name as original_course_name,
      e.total_lessons,
      e.total_amount,
      e.status,
      e.notes
    from public.crs_enrollments e
    join public.crs_courses c on c.id = e.course_id
    left join public.crs_enrollments original_enrollment on original_enrollment.id = e.original_enrollment_id
    left join public.crs_courses original_course on original_course.id = original_enrollment.course_id
    where e.student_id = p_student_id
  ) event_row;

  select coalesce(jsonb_agg(to_jsonb(followup_row) order by followup_row.created_at desc), '[]'::jsonb)
    into v_followups
  from (
    select f.*, p.display_name as creator_name
    from public.flup_records f
    left join public.acct_profiles p on p.id = f.created_by
    where f.student_id = p_student_id
    order by f.created_at desc
    limit 20
  ) followup_row;

  select coalesce(jsonb_agg(to_jsonb(transaction_row) order by transaction_row.created_at desc), '[]'::jsonb)
    into v_transactions
  from (
    select txn.*
    from public.fin_transactions txn
    join public.fin_accounts account on account.id = txn.account_id
    where account.student_id = p_student_id
    order by txn.created_at desc
    limit 100
  ) transaction_row;

  return jsonb_build_object(
    'student', v_student,
    'parents', v_parents,
    'tags', v_tags,
    'account', v_account,
    'enrollments', v_enrollments,
    'enrollment_events', v_enrollment_events,
    'followups', v_followups,
    'transactions', v_transactions
  );
end;
$function$;

grant execute on function public.rpc_get_student_lifecycle(uuid) to authenticated;

notify pgrst, 'reload schema';
