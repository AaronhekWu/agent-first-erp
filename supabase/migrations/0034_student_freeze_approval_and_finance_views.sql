-- 0034 - Student freeze approval workflow and finance registration attribution visibility.
--
-- Freezing is no longer a directly callable student action. The request enters the
-- standard approval queue, executes only after approval, and supports an audited
-- reversal. Existing and future prepayment-lock ledger entries are annotated with
-- the paid registration kind used by the finance UI.

drop index if exists public.aud_approvals_one_pending_target_idx;
create unique index aud_approvals_one_pending_target_idx
  on public.aud_approvals (
    (case
      when type in ('student_delete', 'student_freeze', 'finance_refund') then 'student'
      when type in ('course_archive', 'course_delete') then 'course'
      when type in ('enrollment_drop', 'enrollment_transfer', 'finance_consume') then 'enrollment'
      when type = 'department_delete' then 'department'
      when type = 'staff_deactivate' then 'staff'
      when type = 'finance_txn_delete' then 'finance_txn'
      else type
    end),
    target_id
  )
  where status = 'pending' and target_id is not null;

do $block$
begin
  if to_regprocedure('public.validate_approval_request_base_0034(text,uuid,jsonb)') is null
     and to_regprocedure('public.validate_approval_request(text,uuid,jsonb)') is not null then
    alter function public.validate_approval_request(text,uuid,jsonb)
      rename to validate_approval_request_base_0034;
  end if;
end
$block$;

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
  v_student public.stu_students%rowtype;
  v_frozen_at date;
begin
  if p_type <> 'student_freeze' then
    perform public.validate_approval_request_base_0034(
      p_type,
      p_target_id,
      coalesce(p_payload, '{}'::jsonb)
    );
    return;
  end if;

  if not public.has_permission('students.graduate') then
    raise exception 'PERMISSION_DENIED: 无权发起学员冻结审批';
  end if;
  if p_target_id is null
     or nullif(p_payload->>'p_student_id', '')::uuid is distinct from p_target_id then
    raise exception 'APPROVAL_TARGET_MISMATCH: 学员参数与审批目标不一致';
  end if;
  if nullif(trim(coalesce(p_payload->>'p_note', '')), '') is null then
    raise exception 'FREEZE_REASON_REQUIRED: 冻结原因必填';
  end if;

  v_frozen_at := nullif(p_payload->>'p_frozen_at', '')::date;
  if v_frozen_at is null then
    raise exception 'FREEZE_DATE_REQUIRED: 冻结日期必填';
  end if;
  if v_frozen_at > current_date then
    raise exception 'INVALID_FREEZE_DATE: 冻结日期不能晚于今天';
  end if;

  select *
    into v_student
    from public.stu_students
   where id = p_target_id
     and deleted_at is null
     and status = 'active';
  if not found then
    raise exception 'INVALID_STATUS: 学员不存在或当前不是在读状态';
  end if;
  if v_frozen_at < v_student.created_at::date then
    raise exception 'INVALID_FREEZE_DATE: 冻结日期不能早于建档日期';
  end if;
end;
$function$;

revoke all on function public.validate_approval_request_base_0034(text,uuid,jsonb)
  from public, authenticated;
revoke all on function public.validate_approval_request(text,uuid,jsonb)
  from public, authenticated;

do $block$
begin
  if to_regprocedure('public.rpc_review_approval_base_0034(uuid,text,text)') is null
     and to_regprocedure('public.rpc_review_approval(uuid,text,text)') is not null then
    alter function public.rpc_review_approval(uuid,text,text)
      rename to rpc_review_approval_base_0034;
  end if;
end
$block$;

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
  v_before jsonb;
  v_action_result jsonb;
  v_result jsonb;
begin
  select * into v_approval from public.aud_approvals where id = p_id;
  if not found or v_approval.type <> 'student_freeze' then
    return public.rpc_review_approval_base_0034(p_id, p_status, p_reviewer_note);
  end if;

  if v_reviewer is null then
    raise exception 'LOGIN_REQUIRED: 请先登录';
  end if;
  if public.get_my_role() <> 'admin' then
    raise exception 'PERMISSION_DENIED: 仅最高管理员可以审批';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'INVALID_REVIEW_STATUS: 审批结果必须是通过或驳回';
  end if;

  select *
    into v_approval
    from public.aud_approvals
   where id = p_id
   for update;
  if not found or v_approval.status <> 'pending' then
    raise exception 'APPROVAL_NOT_PENDING: 待审批记录不存在';
  end if;

  if p_status = 'rejected' then
    update public.aud_approvals
       set status = 'rejected',
           reviewed_by = v_reviewer,
           reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
           reviewed_at = now(),
           execution_status = 'not_required',
           execution_error = null,
           execution_result = jsonb_build_object('message', '审批已驳回'),
           executed_at = null
     where id = p_id;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.aud_approvals
     set execution_status = 'running',
         execution_error = null,
         execution_result = null
   where id = p_id;

  begin
    perform public.validate_approval_request(
      v_approval.type,
      v_approval.target_id,
      v_approval.payload
    );

    select to_jsonb(student)
      into v_before
      from public.stu_students student
     where student.id = v_approval.target_id;

    v_action_result := public.rpc_freeze_student(
      v_approval.target_id,
      (v_approval.payload->>'p_frozen_at')::date,
      v_approval.payload->>'p_note'
    );
    v_result := jsonb_build_object(
      'operation', 'student_freeze',
      'before', v_before,
      'result', v_action_result
    );

    update public.aud_approvals
       set status = 'approved',
           reviewed_by = v_reviewer,
           reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
           reviewed_at = now(),
           execution_status = 'succeeded',
           execution_error = null,
           execution_result = v_result,
           executed_at = now()
     where id = p_id;

    return jsonb_build_object(
      'ok', true,
      'status', 'approved',
      'execution', v_result
    );
  exception when others then
    update public.aud_approvals
       set execution_status = 'failed',
           execution_error = sqlerrm,
           execution_result = jsonb_build_object('sqlstate', sqlstate),
           reviewed_by = v_reviewer,
           reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
           reviewed_at = now()
     where id = p_id;
    return jsonb_build_object(
      'ok', false,
      'status', 'pending',
      'error', sqlerrm
    );
  end;
end;
$function$;

revoke all on function public.rpc_review_approval_base_0034(uuid,text,text)
  from public, authenticated;
revoke all on function public.rpc_review_approval(uuid,text,text) from public;
grant execute on function public.rpc_review_approval(uuid,text,text) to authenticated;

do $block$
begin
  if to_regprocedure('public.rpc_reverse_approval_base_0034(uuid,text)') is null
     and to_regprocedure('public.rpc_reverse_approval(uuid,text)') is not null then
    alter function public.rpc_reverse_approval(uuid,text)
      rename to rpc_reverse_approval_base_0034;
  end if;
end
$block$;

create or replace function public.rpc_reverse_approval(
  p_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_approval public.aud_approvals%rowtype;
  v_before jsonb;
  v_action_result jsonb;
  v_result jsonb;
begin
  select * into v_approval from public.aud_approvals where id = p_id;
  if not found then
    raise exception 'APPROVAL_NOT_FOUND: 审批记录不存在';
  end if;
  if v_approval.type <> 'student_freeze' then
    return public.rpc_reverse_approval_base_0034(p_id, p_reason);
  end if;

  if auth.uid() is null or public.get_my_role() <> 'admin' then
    raise exception 'PERMISSION_DENIED: 仅最高管理员可以撤销已执行审批';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'INVALID_REASON: 撤销原因必填';
  end if;

  select *
    into v_approval
    from public.aud_approvals
   where id = p_id
   for update;
  if v_approval.status <> 'approved'
     or v_approval.execution_status <> 'succeeded' then
    raise exception 'APPROVAL_NOT_REVERSIBLE: 仅能撤销已通过且执行成功的审批';
  end if;
  if v_approval.reversed_at is not null then
    raise exception 'APPROVAL_ALREADY_REVERSED: 该审批已经撤销';
  end if;

  v_before := v_approval.execution_result->'before';
  v_action_result := public.rpc_reactivate_student(
    v_approval.target_id,
    '撤销冻结审批：' || trim(p_reason)
  );

  -- Restore the pre-freeze lifecycle metadata after the guarded status transition.
  update public.stu_students
     set frozen_at = (v_before->>'frozen_at')::date,
         freeze_note = v_before->>'freeze_note',
         frozen_by = (v_before->>'frozen_by')::uuid,
         reactivated_at = (v_before->>'reactivated_at')::timestamptz,
         reactivation_note = v_before->>'reactivation_note',
         reactivated_by = (v_before->>'reactivated_by')::uuid,
         updated_at = now()
   where id = v_approval.target_id
     and status = 'active';

  v_result := jsonb_build_object(
    'restored_status', 'active',
    'student_id', v_approval.target_id,
    'reactivation', v_action_result
  );

  update public.aud_approvals
     set status = 'rejected',
         execution_status = 'not_required',
         reversed_at = now(),
         reversed_by = auth.uid(),
         reversal_note = trim(p_reason),
         reversal_result = v_result
   where id = p_id;

  insert into public.aud_operation_logs(
    user_id, action, resource_type, resource_id, changes
  )
  values (
    auth.uid(),
    'reverse_approval',
    'approval',
    p_id,
    jsonb_build_object(
      'type', 'student_freeze',
      'reason', trim(p_reason),
      'result', v_result
    )
  );

  return jsonb_build_object('ok', true, 'status', 'rejected', 'reversal', v_result);
end;
$function$;

revoke all on function public.rpc_reverse_approval_base_0034(uuid,text)
  from public, authenticated;
revoke all on function public.rpc_reverse_approval(uuid,text) from public;
grant execute on function public.rpc_reverse_approval(uuid,text) to authenticated;

-- Direct freeze execution is intentionally private to the approval executor.
revoke execute on function public.rpc_freeze_student(uuid,date,text)
  from public, authenticated;

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
     or coalesce(new.reference_type, '') not in ('lesson_lot', 'lesson_lot_delete')
     or new.reference_id is null then
    return new;
  end if;

  select registration_kind
    into v_kind
    from public.crs_lesson_lots
   where id = new.reference_id;
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

update public.fin_transactions transaction
   set metadata = coalesce(transaction.metadata, '{}'::jsonb) || jsonb_build_object(
         'registration_kind', lot.registration_kind,
         'registration_kind_label', case lot.registration_kind
           when 'new_customer' then '新客'
           when 'expansion' then '拓客'
           when 'renewal' then '续费'
         end
       ),
       description = case
         when position('报名归因：' in coalesce(transaction.description, '')) = 0
           then concat_ws(
             '；',
             nullif(transaction.description, ''),
             '报名归因：' || case lot.registration_kind
               when 'new_customer' then '新客'
               when 'expansion' then '拓客'
               when 'renewal' then '续费'
             end
           )
         else transaction.description
       end
  from public.crs_lesson_lots lot
 where transaction.type = 'prepayment_lock'
   and transaction.reference_type in ('lesson_lot', 'lesson_lot_delete')
   and transaction.reference_id = lot.id
   and lot.registration_kind is not null
   and (
     transaction.metadata->>'registration_kind' is distinct from lot.registration_kind
     or position('报名归因：' in coalesce(transaction.description, '')) = 0
   );

-- Deleted legacy lesson lots can no longer be joined directly. Their immutable
-- ledger metadata still contains student/course identifiers, so classify them by
-- the same chronological rule used for live paid lesson lots.
with ordered as (
  select
    transaction.id,
    row_number() over (
      partition by transaction.metadata->>'student_id'
      order by transaction.created_at, transaction.id
    ) as student_sequence,
    row_number() over (
      partition by transaction.metadata->>'student_id', transaction.metadata->>'course_id'
      order by transaction.created_at, transaction.id
    ) as course_sequence
  from public.fin_transactions transaction
  where transaction.type = 'prepayment_lock'
    and nullif(transaction.metadata->>'student_id', '') is not null
    and nullif(transaction.metadata->>'course_id', '') is not null
), classified as (
  select
    ordered.id,
    case
      when ordered.course_sequence > 1 then 'renewal'
      when ordered.student_sequence = 1 then 'new_customer'
      else 'expansion'
    end as registration_kind
  from ordered
)
update public.fin_transactions transaction
   set metadata = coalesce(transaction.metadata, '{}'::jsonb) || jsonb_build_object(
         'registration_kind', classified.registration_kind,
         'registration_kind_label', case classified.registration_kind
           when 'new_customer' then '新客'
           when 'expansion' then '拓客'
           when 'renewal' then '续费'
         end
       ),
       description = concat_ws(
         '；',
         nullif(transaction.description, ''),
         '报名归因：' || case classified.registration_kind
           when 'new_customer' then '新客'
           when 'expansion' then '拓客'
           when 'renewal' then '续费'
         end
       )
  from classified
 where transaction.id = classified.id
   and coalesce(transaction.metadata->>'registration_kind', '') = '';

comment on function public.rpc_review_approval(uuid,text,text) is
  '审批并执行高风险业务；student_freeze 仅在审批通过后冻结学员';

select pg_notify('pgrst', 'reload schema');
