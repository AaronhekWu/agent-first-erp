-- 0029 财务账本一致性
--
-- 1. 财务流水不再物理删除：撤销时保留原记录并追加反向账务记录。
-- 2. 反转金额以 balance_after - balance_before 的真实方向为准，不能仅凭 type 推断。
-- 3. 账户余额与最新钱包流水在事务提交时强制一致，阻止无流水余额变动。
-- 4. 补录并修正刘珉瑶账户历史删除流水造成的 3,120.00 元虚增。

create or replace function public._void_finance_transaction(
  p_txn_id uuid,
  p_reason text,
  p_operator_id uuid default null,
  p_approval_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx public.fin_transactions%rowtype;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_original_delta numeric(12,2);
  v_inverse_delta numeric(12,2);
  v_reversal_id uuid;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'INVALID_REASON: 撤销原因必填';
  end if;

  select *
    into v_tx
    from public.fin_transactions
   where id = p_txn_id
   for update;
  if not found then
    raise exception 'TXN_NOT_FOUND: 财务流水不存在';
  end if;
  if coalesce(v_tx.metadata->>'domain', '') = 'course_contract' then
    raise exception 'COURSE_EVENT_LOCKED: 课程合同记录不能在财务流水中单独撤销';
  end if;
  if coalesce((v_tx.metadata->>'voided')::boolean, false) then
    raise exception 'TXN_ALREADY_VOIDED: 该财务流水已经撤销';
  end if;

  v_original_delta := round(v_tx.balance_after - v_tx.balance_before, 2);
  v_inverse_delta := -v_original_delta;
  if v_original_delta = 0 then
    raise exception 'TXN_HAS_NO_BALANCE_EFFECT: 该记录没有钱包余额变动';
  end if;

  select balance
    into v_balance_before
    from public.fin_accounts
   where id = v_tx.account_id
   for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在';
  end if;
  v_balance_after := round(v_balance_before + v_inverse_delta, 2);

  update public.fin_accounts
     set balance = v_balance_after,
         total_recharged = greatest(
           0,
           round(total_recharged - case when v_tx.type = 'recharge' then v_tx.amount else 0 end, 2)
         ),
         total_consumed = greatest(
           0,
           round(total_consumed - case when v_tx.type = 'consume' then v_tx.amount else 0 end, 2)
         ),
         total_refunded = greatest(
           0,
           round(total_refunded - case when v_tx.type = 'refund' then v_tx.amount else 0 end, 2)
         ),
         updated_at = now()
   where id = v_tx.account_id;

  update public.fin_transactions
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
       'voided', true,
       'voided_at', now(),
       'void_reason', trim(p_reason),
       'voided_by_approval', p_approval_id
     )
   where id = v_tx.id;

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
    v_tx.account_id,
    'adjustment',
    abs(v_inverse_delta),
    v_balance_before,
    v_balance_after,
    'transaction_reversal',
    v_tx.id,
    '撤销流水：' || coalesce(nullif(trim(v_tx.description), ''), '原财务记录'),
    jsonb_build_object(
      'domain', 'ledger_reversal',
      'original_transaction_id', v_tx.id,
      'approval_id', p_approval_id,
      'reason', trim(p_reason),
      'balance_delta', v_inverse_delta
    ),
    p_operator_id
  )
  returning id into v_reversal_id;

  return jsonb_build_object(
    'operation', 'finance_transaction_reversal',
    'original_transaction_id', v_tx.id,
    'reversal_transaction_id', v_reversal_id,
    'original_type', v_tx.type,
    'amount', v_tx.amount,
    'balance_delta', v_inverse_delta,
    'new_balance', v_balance_after
  );
end;
$function$;

revoke all on function public._void_finance_transaction(uuid,text,uuid,uuid) from public;
revoke all on function public._void_finance_transaction(uuid,text,uuid,uuid) from authenticated;

create or replace function public._exec_finance_txn_delete(p_txn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_approval_id uuid;
  v_reason text;
begin
  select id, reason
    into v_approval_id, v_reason
    from public.aud_approvals
   where type = 'finance_txn_delete'
     and execution_status = 'running'
     and payload->>'p_txn_id' = p_txn_id::text
   order by created_at desc
   limit 1;

  if v_approval_id is null then
    raise exception 'APPROVAL_CONTEXT_REQUIRED: 流水撤销必须通过审批执行';
  end if;

  return public._void_finance_transaction(
    p_txn_id,
    coalesce(nullif(trim(v_reason), ''), '审批撤销财务流水'),
    auth.uid(),
    v_approval_id
  );
end;
$function$;

revoke all on function public._exec_finance_txn_delete(uuid) from public;
revoke all on function public._exec_finance_txn_delete(uuid) from authenticated;

create or replace function public.rpc_reverse_approval(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_approval public.aud_approvals%rowtype;
  v_before jsonb;
  v_result_data jsonb;
  v_log_ids jsonb;
  v_tx public.fin_transactions%rowtype;
  v_log public.fin_consumption_logs%rowtype;
  v_enrollment_id uuid;
  v_restored_lessons integer := 0;
  v_restored_amount numeric(12,2) := 0;
  v_reversal jsonb;
  v_result jsonb;
  v_amount numeric(12,2) := 0;
  v_student_id uuid;
  v_original_id uuid;
  v_original_delta numeric(12,2);
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_restore_id uuid;
  v_prior_reversal_id uuid;
begin
  select *
    into v_approval
    from public.aud_approvals
   where id = p_id;

  if not found then
    raise exception 'APPROVAL_NOT_FOUND: 审批记录不存在';
  end if;

  if v_approval.type not in (
    'finance_consume',
    'finance_refund',
    'enrollment_drop',
    'finance_txn_delete'
  ) then
    return public.rpc_reverse_approval_base_0025(p_id, p_reason);
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
  if v_approval.status <> 'approved' or v_approval.execution_status <> 'succeeded' then
    raise exception 'APPROVAL_NOT_REVERSIBLE: 仅能撤销已通过且执行成功的审批';
  end if;
  if v_approval.reversed_at is not null then
    raise exception 'APPROVAL_ALREADY_REVERSED: 该审批已经撤销';
  end if;

  v_before := v_approval.execution_result->'before';
  v_result_data := v_approval.execution_result->'result';

  case v_approval.type
    when 'finance_consume' then
      select *
        into v_tx
        from public.fin_transactions
       where id = (v_result_data->>'transaction_id')::uuid
       for update;
      if not found then
        raise exception 'REVERSAL_SOURCE_MISSING: 原消课流水不存在';
      end if;

      v_log_ids := coalesce(
        v_result_data->'consumption_log_ids',
        case
          when nullif(v_result_data->>'consumption_log_id', '') is null then '[]'::jsonb
          else jsonb_build_array(v_result_data->>'consumption_log_id')
        end
      );

      for v_log in
        select *
          from public.fin_consumption_logs
         where id in (
           select value::uuid
             from jsonb_array_elements_text(v_log_ids)
         )
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

      v_reversal := public._void_finance_transaction(
        v_tx.id,
        trim(p_reason),
        auth.uid(),
        p_id
      );

      delete from public.fin_consumption_logs
       where id in (
         select value::uuid
           from jsonb_array_elements_text(v_log_ids)
       );
      perform public.sync_enrollment_lot_totals(v_enrollment_id);

      v_result := jsonb_build_object(
        'restored_amount', v_restored_amount,
        'restored_lessons', v_restored_lessons,
        'restored_enrollment_id', v_enrollment_id,
        'ledger_reversal', v_reversal
      );

    when 'finance_refund' then
      select *
        into v_tx
        from public.fin_transactions
       where id = (v_result_data->>'transaction_id')::uuid
       for update;
      if not found then
        raise exception 'REVERSAL_SOURCE_MISSING: 原退费流水不存在或已被历史操作删除';
      end if;
      v_reversal := public._void_finance_transaction(
        v_tx.id,
        trim(p_reason),
        auth.uid(),
        p_id
      );
      v_result := jsonb_build_object(
        'restored_amount', v_tx.amount,
        'ledger_reversal', v_reversal
      );

    when 'enrollment_drop' then
      v_amount := coalesce((v_result_data->>'refunded_amount')::numeric, 0);
      v_student_id := (v_before->>'student_id')::uuid;
      if v_amount > 0 then
        select t.*
          into v_tx
          from public.fin_transactions t
          join public.fin_accounts a on a.id = t.account_id
         where a.student_id = v_student_id
           and t.reference_type = 'enrollment_drop'
           and t.reference_id = v_approval.target_id
         order by t.created_at desc, t.id desc
         limit 1
         for update of t;
        if not found then
          raise exception 'REVERSAL_SOURCE_MISSING: 原退课返还流水不存在或已被历史操作删除';
        end if;
        v_reversal := public._void_finance_transaction(
          v_tx.id,
          trim(p_reason),
          auth.uid(),
          p_id
        );
      else
        v_reversal := jsonb_build_object('balance_delta', 0);
      end if;

      update public.crs_enrollments
         set status = v_before->>'status',
             completed_at = (v_before->>'completed_at')::timestamptz,
             notes = v_before->>'notes',
             updated_at = now()
       where id = v_approval.target_id;
      v_result := jsonb_build_object(
        'restored_enrollment_id', v_approval.target_id,
        'reversed_refund', v_amount,
        'ledger_reversal', v_reversal
      );

    when 'finance_txn_delete' then
      v_original_id := (v_approval.payload->>'p_txn_id')::uuid;
      v_prior_reversal_id := nullif(v_result_data->>'reversal_transaction_id', '')::uuid;

      select *
        into v_tx
        from public.fin_transactions
       where id = v_original_id
       for update;

      if found then
        if not coalesce((v_tx.metadata->>'voided')::boolean, false) then
          raise exception 'TXN_NOT_VOIDED: 原流水当前不是已撤销状态';
        end if;
      else
        v_tx := jsonb_populate_record(null::public.fin_transactions, v_before);
        if v_tx.id is null then
          raise exception 'REVERSAL_SOURCE_MISSING: 原流水快照不存在';
        end if;
        v_tx.metadata := coalesce(v_tx.metadata, '{}'::jsonb) || jsonb_build_object(
          'restored_from_legacy_delete', true,
          'restored_at', now(),
          'restored_by_approval', p_id
        );
        insert into public.fin_transactions
        select (v_tx).*;
      end if;

      v_original_delta := round(v_tx.balance_after - v_tx.balance_before, 2);
      select balance
        into v_balance_before
        from public.fin_accounts
       where id = v_tx.account_id
       for update;
      if not found then
        raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在';
      end if;
      v_balance_after := round(v_balance_before + v_original_delta, 2);

      update public.fin_accounts
         set balance = v_balance_after,
             total_recharged = round(total_recharged + case when v_tx.type = 'recharge' then v_tx.amount else 0 end, 2),
             total_consumed = round(total_consumed + case when v_tx.type = 'consume' then v_tx.amount else 0 end, 2),
             total_refunded = round(total_refunded + case when v_tx.type = 'refund' then v_tx.amount else 0 end, 2),
             updated_at = now()
       where id = v_tx.account_id;

      update public.fin_transactions
         set metadata = (
           coalesce(metadata, '{}'::jsonb)
           - 'voided'
           - 'voided_at'
           - 'void_reason'
           - 'voided_by_approval'
         ) || jsonb_build_object(
           'restored_at', now(),
           'restored_by_approval', p_id
         )
       where id = v_tx.id;

      if v_prior_reversal_id is not null then
        update public.fin_transactions
           set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'voided', true,
             'voided_at', now(),
             'void_reason', trim(p_reason),
             'voided_by_approval', p_id
           )
         where id = v_prior_reversal_id;
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
        v_tx.account_id,
        'adjustment',
        abs(v_original_delta),
        v_balance_before,
        v_balance_after,
        'approval',
        p_id,
        '恢复已撤销流水：' || coalesce(nullif(trim(v_tx.description), ''), '原财务记录'),
        jsonb_build_object(
          'domain', 'ledger_reversal_restore',
          'original_transaction_id', v_tx.id,
          'approval_id', p_id,
          'reason', trim(p_reason),
          'balance_delta', v_original_delta
        ),
        auth.uid()
      )
      returning id into v_restore_id;

      v_result := jsonb_build_object(
        'restored_transaction_id', v_tx.id,
        'restoration_transaction_id', v_restore_id,
        'balance_delta', v_original_delta,
        'new_balance', v_balance_after
      );
  end case;

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
      'type', v_approval.type,
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

grant execute on function public.rpc_reverse_approval(uuid,text) to authenticated;

-- 补录 2026-07-23 19:35 对旧退费流水的撤销。该动作曾改变余额，但旧逻辑物理删除了流水。
do $repair$
declare
  v_account_id uuid := 'a6c48375-5456-49e5-a27b-3ac1ac74e3b2';
  v_student_id uuid := '7676e6ba-0de2-4b57-b360-db52c22be272';
  v_operator_id uuid;
  v_balance numeric(12,2);
begin
  select a.balance
    into v_balance
    from public.fin_accounts a
    join public.stu_students s on s.id = a.student_id
   where a.id = v_account_id
     and a.student_id = v_student_id
     and s.name = '刘珉瑶'
   for update of a;

  if not found then
    raise notice '刘珉瑶账户不存在，跳过指定历史数据修正';
  else
    select reviewed_by
      into v_operator_id
      from public.aud_approvals
     where id = '23afdac1-5881-4697-b6f0-932754cc2f18';

    if not exists (
      select 1
        from public.fin_transactions
       where metadata->>'repair_key' = 'liuminyao_legacy_refund_delete_20260723'
    ) then
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
      created_by,
      created_at
    )
    values (
      v_account_id,
      'adjustment',
      4516.94,
      1280.53,
      5797.47,
      'approval',
      '23afdac1-5881-4697-b6f0-932754cc2f18',
      '历史操作补录：撤销退费流水后恢复余额',
      jsonb_build_object(
        'domain', 'ledger_reconciliation',
        'repair_key', 'liuminyao_legacy_refund_delete_20260723',
        'balance_delta', 4516.94,
        'approval_id', '23afdac1-5881-4697-b6f0-932754cc2f18'
      ),
      v_operator_id,
      '2026-07-23 19:35:29.723404+08'::timestamptz
      );
    end if;

    if not exists (
      select 1
        from public.fin_transactions
       where metadata->>'repair_key' = 'liuminyao_refund_direction_fix_20260727'
    ) then
      if round(v_balance, 2) <> 5797.47 then
        raise exception 'DATA_REPAIR_BALANCE_CHANGED: 刘珉瑶当前余额已变化，停止自动修正（当前 %）', v_balance;
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
      v_account_id,
      'adjustment',
      3120.00,
      5797.47,
      2677.47,
      'balance_reconciliation',
      '42758bda-0c1e-4c3d-88fd-6ffb36928915',
      '账本一致性修正：退课返还流水撤销方向错误',
      jsonb_build_object(
        'domain', 'ledger_reconciliation',
        'repair_key', 'liuminyao_refund_direction_fix_20260727',
        'balance_delta', -3120.00,
        'root_approval_id', '42758bda-0c1e-4c3d-88fd-6ffb36928915',
        'reason', '旧逻辑按 refund 类型反转，未按实际余额方向反转，造成两次 1560 元虚增'
      ),
      v_operator_id
      );

      update public.fin_accounts
         set balance = 2677.47,
             updated_at = now()
       where id = v_account_id;

      insert into public.aud_operation_logs (
      user_id,
      action,
      resource_type,
      resource_id,
      changes
    )
    values (
      v_operator_id,
      'balance_reconciliation',
      'account',
      v_account_id,
      jsonb_build_object(
        'student_id', v_student_id,
        'balance_before', 5797.47,
        'balance_after', 2677.47,
        'correction', -3120.00,
        'reason', '修正退课返还流水撤销方向错误'
      )
      );
    end if;
  end if;
end;
$repair$;

create or replace function public.assert_finance_ledger_balance()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_account_id uuid;
  v_account_balance numeric(12,2);
  v_latest_balance numeric(12,2);
begin
  if tg_table_name = 'fin_accounts' then
    v_account_id := new.id;
  elsif tg_op = 'DELETE' then
    v_account_id := old.account_id;
  else
    v_account_id := new.account_id;
  end if;

  select balance
    into v_account_balance
    from public.fin_accounts
   where id = v_account_id;
  if not found then
    return null;
  end if;

  select t.balance_after
    into v_latest_balance
    from public.fin_transactions t
   where t.account_id = v_account_id
     and coalesce(t.metadata->>'domain', '') <> 'course_contract'
   order by t.created_at desc, t.id desc
   limit 1;

  if not found then
    if round(v_account_balance, 2) <> 0 then
      raise exception 'FINANCE_LEDGER_MISSING: 非零账户余额必须有对应财务流水';
    end if;
    return null;
  end if;

  if round(v_account_balance, 2) <> round(v_latest_balance, 2) then
    raise exception
      'FINANCE_LEDGER_MISMATCH: 账户余额 % 与最新财务流水余额 % 不一致，操作已回滚',
      v_account_balance,
      v_latest_balance;
  end if;

  return null;
end;
$function$;

drop trigger if exists trg_fin_account_ledger_balance on public.fin_accounts;
create constraint trigger trg_fin_account_ledger_balance
after insert or update on public.fin_accounts
deferrable initially deferred
for each row execute function public.assert_finance_ledger_balance();

drop trigger if exists trg_fin_transaction_ledger_balance on public.fin_transactions;
create constraint trigger trg_fin_transaction_ledger_balance
after insert or update or delete on public.fin_transactions
deferrable initially deferred
for each row execute function public.assert_finance_ledger_balance();

create index if not exists idx_fin_transactions_account_ledger_order
  on public.fin_transactions(account_id, created_at desc, id desc);

comment on function public.assert_finance_ledger_balance() is
  '事务提交时校验账户余额与最新钱包流水一致，阻止未留流水的余额变动';
