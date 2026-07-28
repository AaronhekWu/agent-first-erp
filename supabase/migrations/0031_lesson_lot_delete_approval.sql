-- 课时批次删除必须经过审批。审批通过后才删除未发生消课的批次，
-- 同步释放锁定预付款并写入财务流水；最高管理员撤销审批时恢复原批次。

do $block$
begin
  if to_regprocedure('public.validate_approval_request_base_0031(text,uuid,jsonb)') is null
     and to_regprocedure('public.validate_approval_request(text,uuid,jsonb)') is not null then
    alter function public.validate_approval_request(text,uuid,jsonb)
      rename to validate_approval_request_base_0031;
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
  v_lot public.crs_lesson_lots%rowtype;
  v_enrollment public.crs_enrollments%rowtype;
begin
  if p_type <> 'lesson_lot_delete' then
    perform public.validate_approval_request_base_0031(
      p_type,
      p_target_id,
      coalesce(p_payload, '{}'::jsonb)
    );
    return;
  end if;

  if not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权删除课时批次';
  end if;
  if nullif(p_payload->>'p_lot_id', '')::uuid is distinct from p_target_id then
    raise exception 'APPROVAL_TARGET_MISMATCH: 课时批次参数与审批目标不一致';
  end if;
  if nullif(trim(coalesce(p_payload->>'p_reason', '')), '') is null then
    raise exception 'INVALID_REASON: 删除原因必填';
  end if;

  select *
    into v_lot
    from public.crs_lesson_lots
   where id = p_target_id
   for update;
  if not found then
    raise exception 'LOT_NOT_FOUND: 课时批次不存在或已经删除';
  end if;

  select *
    into v_enrollment
    from public.crs_enrollments
   where id = v_lot.enrollment_id
     and status = 'enrolled'
   for update;
  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND: 仅能删除在读报名的课时批次';
  end if;
  if nullif(p_payload->>'p_enrollment_id', '')::uuid is distinct from v_lot.enrollment_id then
    raise exception 'APPROVAL_TARGET_MISMATCH: 报名参数与课时批次不一致';
  end if;
  if v_lot.consumed_lessons > 0
     or exists (
       select 1
         from public.fin_consumption_logs
        where lesson_lot_id = v_lot.id
     ) then
    raise exception 'LOT_HAS_CONSUMPTION: 该批次已有消课记录，不能删除';
  end if;
  if exists (
    select 1
      from public.aud_approvals approval
     where approval.status = 'pending'
       and approval.target_id = v_lot.enrollment_id
       and approval.type in ('enrollment_drop', 'enrollment_transfer', 'finance_consume')
  ) then
    raise exception 'ENROLLMENT_APPROVAL_PENDING: 该报名已有待处理审批，请先处理后再删除批次';
  end if;
end;
$function$;

revoke all on function public.validate_approval_request_base_0031(text,uuid,jsonb)
  from public, authenticated;
revoke all on function public.validate_approval_request(text,uuid,jsonb)
  from public, authenticated;

do $block$
begin
  if to_regprocedure('public.rpc_create_approval_request_base_0031(text,text,text,uuid,text,numeric,jsonb)') is null
     and to_regprocedure('public.rpc_create_approval_request(text,text,text,uuid,text,numeric,jsonb)') is not null then
    alter function public.rpc_create_approval_request(text,text,text,uuid,text,numeric,jsonb)
      rename to rpc_create_approval_request_base_0031;
  end if;
end
$block$;

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
  v_enrollment_id uuid;
begin
  if p_type in ('enrollment_drop', 'enrollment_transfer', 'finance_consume') then
    v_enrollment_id := case
      when p_type = 'enrollment_transfer'
        then nullif(p_payload->>'p_source_enrollment_id', '')::uuid
      else nullif(p_payload->>'p_enrollment_id', '')::uuid
    end;
    if exists (
      select 1
        from public.aud_approvals approval
       where approval.status = 'pending'
         and approval.type = 'lesson_lot_delete'
         and nullif(approval.payload->>'p_enrollment_id', '')::uuid = v_enrollment_id
    ) then
      raise exception 'LOT_APPROVAL_PENDING: 该报名有待处理的课时批次删除审批';
    end if;
  end if;

  return public.rpc_create_approval_request_base_0031(
    p_type,
    p_title,
    p_reason,
    p_target_id,
    p_target_label,
    p_amount,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_create_approval_request_base_0031(
  text,text,text,uuid,text,numeric,jsonb
) from public, authenticated;
revoke all on function public.rpc_create_approval_request(
  text,text,text,uuid,text,numeric,jsonb
) from public;
grant execute on function public.rpc_create_approval_request(
  text,text,text,uuid,text,numeric,jsonb
) to authenticated;

create or replace function public._exec_lesson_lot_delete(
  p_lot_id uuid,
  p_reason text,
  p_operator_id uuid,
  p_approval_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lot public.crs_lesson_lots%rowtype;
  v_enrollment public.crs_enrollments%rowtype;
  v_course public.crs_courses%rowtype;
  v_account public.fin_accounts%rowtype;
  v_frozen_after numeric(12,2);
  v_transaction_id uuid;
  v_cancelled_enrollment boolean := false;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'INVALID_REASON: 删除原因必填';
  end if;

  select *
    into v_lot
    from public.crs_lesson_lots
   where id = p_lot_id
   for update;
  if not found then
    raise exception 'LOT_NOT_FOUND: 课时批次不存在或已经删除';
  end if;
  if v_lot.consumed_lessons > 0
     or exists (
       select 1
         from public.fin_consumption_logs
        where lesson_lot_id = v_lot.id
     ) then
    raise exception 'LOT_HAS_CONSUMPTION: 该批次已有消课记录，不能删除';
  end if;

  select *
    into v_enrollment
    from public.crs_enrollments
   where id = v_lot.enrollment_id
     and status = 'enrolled'
   for update;
  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND: 仅能删除在读报名的课时批次';
  end if;
  select * into v_course
    from public.crs_courses
   where id = v_enrollment.course_id;
  select *
    into v_account
    from public.fin_accounts
   where student_id = v_enrollment.student_id
   for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在';
  end if;

  delete from public.crs_lesson_lots
   where id = v_lot.id;
  perform public.sync_enrollment_lot_totals(v_lot.enrollment_id);

  if not exists (
    select 1
      from public.crs_lesson_lots
     where enrollment_id = v_lot.enrollment_id
  ) then
    update public.crs_enrollments
       set status = 'cancelled',
           completed_at = now(),
           notes = concat_ws(
             '；',
             nullif(trim(coalesce(notes, '')), ''),
             '删除最后一个课时批次：' || trim(p_reason)
           ),
           updated_at = now()
     where id = v_lot.enrollment_id;
    v_cancelled_enrollment := true;
  end if;

  select frozen_amount
    into v_frozen_after
    from public.fin_accounts
   where id = v_account.id;

  insert into public.fin_transactions (
    account_id,
    type,
    amount,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    description,
    metadata,
    created_by
  )
  values (
    v_account.id,
    'prepayment_release',
    v_lot.locked_amount,
    v_account.balance,
    v_account.balance,
    'lesson_lot_delete',
    v_lot.id,
    case
      when v_lot.source_type = 'gift'
        then '删除赠送课时批次：' || coalesce(v_course.name, '课程')
      else '删除课时批次并释放锁定预付款：' || coalesce(v_course.name, '课程')
    end,
    jsonb_build_object(
      'domain', 'course_contract',
      'event', 'lesson_lot_delete',
      'approval_id', p_approval_id,
      'lesson_lot_id', v_lot.id,
      'enrollment_id', v_lot.enrollment_id,
      'course_id', v_enrollment.course_id,
      'course_name', v_course.name,
      'student_id', v_enrollment.student_id,
      'source_type', v_lot.source_type,
      'total_lessons', v_lot.total_lessons,
      'unit_price', v_lot.unit_price,
      'released_locked_amount', v_lot.locked_amount,
      'frozen_before', v_account.frozen_amount,
      'frozen_after', v_frozen_after,
      'available_before', round(v_account.balance - v_account.frozen_amount, 2),
      'available_after', round(v_account.balance - v_frozen_after, 2),
      'reason', trim(p_reason)
    ),
    p_operator_id
  )
  returning id into v_transaction_id;

  insert into public.aud_operation_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    changes
  )
  values (
    p_operator_id,
    'delete_lesson_lot',
    'lesson_lot',
    v_lot.id,
    jsonb_build_object(
      'approval_id', p_approval_id,
      'reason', trim(p_reason),
      'deleted_lot', to_jsonb(v_lot),
      'released_locked_amount', v_lot.locked_amount,
      'cancelled_enrollment', v_cancelled_enrollment,
      'transaction_id', v_transaction_id
    )
  );

  return jsonb_build_object(
    'deleted', true,
    'lesson_lot_id', v_lot.id,
    'enrollment_id', v_lot.enrollment_id,
    'released_locked_amount', v_lot.locked_amount,
    'cancelled_enrollment', v_cancelled_enrollment,
    'transaction_id', v_transaction_id
  );
end;
$function$;

revoke all on function public._exec_lesson_lot_delete(uuid,text,uuid,uuid)
  from public, authenticated;

do $block$
begin
  if to_regprocedure('public.rpc_review_approval_base_0031(uuid,text,text)') is null
     and to_regprocedure('public.rpc_review_approval(uuid,text,text)') is not null then
    alter function public.rpc_review_approval(uuid,text,text)
      rename to rpc_review_approval_base_0031;
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
  select *
    into v_approval
    from public.aud_approvals
   where id = p_id;
  if not found or v_approval.type <> 'lesson_lot_delete' then
    return public.rpc_review_approval_base_0031(
      p_id,
      p_status,
      p_reviewer_note
    );
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

    select jsonb_build_object(
      'lot', to_jsonb(lot),
      'enrollment', to_jsonb(enrollment),
      'account', to_jsonb(account)
    )
      into v_before
      from public.crs_lesson_lots lot
      join public.crs_enrollments enrollment
        on enrollment.id = lot.enrollment_id
      join public.fin_accounts account
        on account.student_id = enrollment.student_id
     where lot.id = v_approval.target_id;

    v_action_result := public._exec_lesson_lot_delete(
      v_approval.target_id,
      v_approval.payload->>'p_reason',
      v_reviewer,
      v_approval.id
    );
    v_result := jsonb_build_object(
      'operation', 'lesson_lot_delete',
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

revoke all on function public.rpc_review_approval_base_0031(uuid,text,text)
  from public, authenticated;
revoke all on function public.rpc_review_approval(uuid,text,text)
  from public;
grant execute on function public.rpc_review_approval(uuid,text,text)
  to authenticated;

do $block$
begin
  if to_regprocedure('public.rpc_reverse_approval_base_0031(uuid,text)') is null
     and to_regprocedure('public.rpc_reverse_approval(uuid,text)') is not null then
    alter function public.rpc_reverse_approval(uuid,text)
      rename to rpc_reverse_approval_base_0031;
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
  v_result_data jsonb;
  v_lot public.crs_lesson_lots%rowtype;
  v_enrollment public.crs_enrollments%rowtype;
  v_account public.fin_accounts%rowtype;
  v_original_transaction_id uuid;
  v_reversal_transaction_id uuid;
  v_frozen_after numeric(12,2);
  v_result jsonb;
begin
  select *
    into v_approval
    from public.aud_approvals
   where id = p_id;
  if not found then
    raise exception 'APPROVAL_NOT_FOUND: 审批记录不存在';
  end if;
  if v_approval.type <> 'lesson_lot_delete' then
    return public.rpc_reverse_approval_base_0031(p_id, p_reason);
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
  v_result_data := v_approval.execution_result->'result';
  v_lot := jsonb_populate_record(
    null::public.crs_lesson_lots,
    v_before->'lot'
  );
  if v_lot.id is null then
    raise exception 'REVERSAL_SOURCE_MISSING: 原课时批次快照不存在';
  end if;
  if exists (
    select 1
      from public.crs_lesson_lots
     where id = v_lot.id
  ) then
    raise exception 'LOT_ALREADY_EXISTS: 原课时批次已经存在';
  end if;

  select *
    into v_enrollment
    from public.crs_enrollments
   where id = v_lot.enrollment_id
   for update;
  if not found then
    raise exception 'REVERSAL_SOURCE_MISSING: 原报名记录不存在';
  end if;
  select *
    into v_account
    from public.fin_accounts
   where student_id = v_enrollment.student_id
   for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在';
  end if;

  insert into public.crs_lesson_lots
  select (v_lot).*;

  update public.crs_enrollments
     set status = v_before->'enrollment'->>'status',
         completed_at = (v_before->'enrollment'->>'completed_at')::timestamptz,
         notes = v_before->'enrollment'->>'notes',
         updated_at = now()
   where id = v_lot.enrollment_id;
  perform public.sync_enrollment_lot_totals(v_lot.enrollment_id);

  select frozen_amount
    into v_frozen_after
    from public.fin_accounts
   where id = v_account.id;

  v_original_transaction_id := nullif(
    v_result_data->>'transaction_id',
    ''
  )::uuid;
  if v_original_transaction_id is not null then
    update public.fin_transactions
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'voided', true,
         'voided_at', now(),
         'void_reason', trim(p_reason),
         'voided_by_approval', p_id
       )
     where id = v_original_transaction_id;
    if not found then
      raise exception 'REVERSAL_SOURCE_MISSING: 原批次删除财务流水不存在';
    end if;
  end if;

  insert into public.fin_transactions (
    account_id,
    type,
    amount,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    description,
    metadata,
    created_by
  )
  values (
    v_account.id,
    case when v_lot.source_type = 'gift' then 'gift' else 'prepayment_lock' end,
    v_lot.locked_amount,
    v_account.balance,
    v_account.balance,
    'lesson_lot_delete',
    v_lot.id,
    case
      when v_lot.source_type = 'gift'
        then '撤销删除并恢复赠送课时批次'
      else '撤销删除并恢复课时批次锁定预付款'
    end,
    jsonb_build_object(
      'domain', 'course_contract',
      'event', 'lesson_lot_delete_reversal',
      'approval_id', p_id,
      'original_transaction_id', v_original_transaction_id,
      'lesson_lot_id', v_lot.id,
      'enrollment_id', v_lot.enrollment_id,
      'student_id', v_enrollment.student_id,
      'source_type', v_lot.source_type,
      'restored_locked_amount', v_lot.locked_amount,
      'frozen_before', v_account.frozen_amount,
      'frozen_after', v_frozen_after,
      'available_before', round(v_account.balance - v_account.frozen_amount, 2),
      'available_after', round(v_account.balance - v_frozen_after, 2),
      'reason', trim(p_reason)
    ),
    auth.uid()
  )
  returning id into v_reversal_transaction_id;

  v_result := jsonb_build_object(
    'restored_lesson_lot_id', v_lot.id,
    'restored_enrollment_id', v_lot.enrollment_id,
    'restored_locked_amount', v_lot.locked_amount,
    'original_transaction_id', v_original_transaction_id,
    'reversal_transaction_id', v_reversal_transaction_id
  );

  update public.aud_approvals
     set status = 'rejected',
         execution_status = 'not_required',
         reversed_at = now(),
         reversed_by = auth.uid(),
         reversal_note = trim(p_reason),
         reversal_result = v_result
   where id = p_id;

  insert into public.aud_operation_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    changes
  )
  values (
    auth.uid(),
    'reverse_approval',
    'approval',
    p_id,
    jsonb_build_object(
      'type', 'lesson_lot_delete',
      'reason', trim(p_reason),
      'result', v_result
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'rejected',
    'reversal', v_result
  );
end;
$function$;

revoke all on function public.rpc_reverse_approval_base_0031(uuid,text)
  from public, authenticated;
revoke all on function public.rpc_reverse_approval(uuid,text)
  from public;
grant execute on function public.rpc_reverse_approval(uuid,text)
  to authenticated;

comment on function public._exec_lesson_lot_delete(uuid,text,uuid,uuid)
  is '审批通过后删除未消课的课时批次，释放锁定预付款并记录审计流水';
