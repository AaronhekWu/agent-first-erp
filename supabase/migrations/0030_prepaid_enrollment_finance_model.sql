-- 0030 预付款报名财务模型
--
-- 主链：充值到账户总余额 -> 报名锁定预付款 -> 消课释放预付款并确认收入。
-- 同一学员同一课程允许多次报名；每次报名形成独立课时批次。
-- 历史在读批次仅按当前真实余额分配可锁预付款，不补造余额。

alter table public.crs_lesson_lots
  add column if not exists locked_amount numeric(12,2) not null default 0;

alter table public.crs_lesson_lots
  drop constraint if exists crs_lesson_lots_locked_amount_check;
alter table public.crs_lesson_lots
  add constraint crs_lesson_lots_locked_amount_check
  check (locked_amount >= 0);

alter table public.fin_consumption_logs
  add column if not exists prepaid_released numeric(12,2) not null default 0;

alter table public.fin_accounts
  alter column frozen_amount set default 0,
  alter column frozen_amount set not null;

update public.fin_accounts
set frozen_amount = coalesce(frozen_amount, 0)
where frozen_amount is null;

alter table public.fin_transactions
  drop constraint if exists chk_fin_transactions_type;
alter table public.fin_transactions
  add constraint chk_fin_transactions_type
  check (
    type::text = any(array[
      'recharge','consume','refund','transfer_out','transfer_in','gift',
      'adjustment','enrollment','lesson_purchase',
      'prepayment_lock','prepayment_release','prepayment_adjustment'
    ]::text[])
  );

alter table public.fin_recharges
  drop constraint if exists chk_fin_recharges_payment_method;
alter table public.fin_recharges
  add constraint chk_fin_recharges_payment_method
  check (
    payment_method::text = any(array[
      'shouqianba','digital_wallet','cash','corporate_transfer',
      'wechat','alipay','bank_transfer','other'
    ]::text[])
  );

-- 课程报名与课时批次不再由通用审计触发器生成“合同流水”；
-- 后续由业务 RPC 在同一事务内写入真实资金/预付款流水。
drop trigger if exists trg_capture_course_finance_audit
  on public.aud_operation_logs;
drop trigger if exists trg_capture_lesson_lot_finance_adjustment
  on public.crs_lesson_lots;

-- 历史预付款兼容分配：每个学员最多锁定其当前非负总余额。
with candidates as (
  select
    lot.id,
    account.id as account_id,
    greatest(round(lot.remaining_lessons * lot.unit_price, 2), 0) as outstanding,
    greatest(round(account.balance, 2), 0) as fundable,
    coalesce(sum(
      greatest(round(lot.remaining_lessons * lot.unit_price, 2), 0)
    ) over (
      partition by account.id
      order by
        case when lot.source_type = 'gift' then 1 else 0 end,
        lot.unit_price,
        lot.enrolled_at,
        lot.created_at,
        lot.id
      rows between unbounded preceding and 1 preceding
    ), 0) as prior_outstanding
  from public.crs_lesson_lots lot
  join public.crs_enrollments enrollment
    on enrollment.id = lot.enrollment_id
   and enrollment.status = 'enrolled'
  join public.fin_accounts account
    on account.student_id = enrollment.student_id
  where lot.source_type <> 'gift'
),
allocations as (
  select
    id,
    greatest(
      least(outstanding, fundable - prior_outstanding),
      0
    )::numeric(12,2) as allocated
  from candidates
)
update public.crs_lesson_lots lot
set locked_amount = allocation.allocated,
    updated_at = now()
from allocations allocation
where allocation.id = lot.id
  and lot.locked_amount is distinct from allocation.allocated;

update public.crs_lesson_lots
set locked_amount = 0,
    updated_at = now()
where source_type = 'gift'
  and locked_amount <> 0;

update public.fin_accounts as account
set frozen_amount = coalesce((
      select sum(lot.locked_amount)::numeric(12,2)
      from public.crs_enrollments enrollment
      join public.crs_lesson_lots lot
        on lot.enrollment_id = enrollment.id
      where enrollment.student_id = account.student_id
        and enrollment.status = 'enrolled'
    ), 0),
    updated_at = now()
where account.frozen_amount is distinct from coalesce((
  select sum(lot.locked_amount)::numeric(12,2)
  from public.crs_enrollments enrollment
  join public.crs_lesson_lots lot
    on lot.enrollment_id = enrollment.id
  where enrollment.student_id = account.student_id
    and enrollment.status = 'enrolled'
), 0);

-- 迁移前的消课明细没有记录“当时释放了多少预付款”。
-- 按当前历史批次的资金覆盖比例回填，仅供以后撤销旧消课时恢复锁定金额；
-- 本步骤不改变账户当前总余额、当前冻结金额或课时。
update public.fin_consumption_logs as consumption
set prepaid_released = case
      when lot.source_type = 'gift' or consumption.amount <= 0 then 0
      when round(lot.remaining_lessons * lot.unit_price, 2) <= 0 then 0
      else least(
        consumption.amount,
        round(
          consumption.amount
          * least(
              1,
              lot.locked_amount
              / nullif(round(lot.remaining_lessons * lot.unit_price, 2), 0)
            ),
          2
        )
      )
    end
from public.crs_lesson_lots as lot
where lot.id = consumption.lesson_lot_id
  and consumption.prepaid_released = 0
  and consumption.amount > 0;

-- 每个历史锁款批次补一条可审计的预付款初始化流水。
insert into public.fin_transactions(
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
select
  account.id,
  'prepayment_lock',
  lot.locked_amount,
  round(account.balance, 2),
  round(account.balance, 2),
  'lesson_lot',
  lot.id,
  format(
    '历史预付款初始化：%s；剩余 %s 课时 × %s；锁定 %s',
    course.name,
    lot.remaining_lessons,
    lot.unit_price,
    lot.locked_amount
  ),
  jsonb_build_object(
    'domain', 'prepayment',
    'event', 'historical_lock_initialization',
    'event_key', 'historical-prepayment-lock:' || lot.id::text,
    'student_id', enrollment.student_id,
    'course_id', enrollment.course_id,
    'course_name', course.name,
    'enrollment_id', enrollment.id,
    'lesson_lot_id', lot.id,
    'unit_price', lot.unit_price,
    'lessons', lot.remaining_lessons,
    'frozen_before', round(account.frozen_amount - lot.locked_amount, 2),
    'frozen_after', round(account.frozen_amount, 2),
    'available_after', round(account.balance - account.frozen_amount, 2),
    'historical_unfunded', greatest(
      round(lot.remaining_lessons * lot.unit_price - lot.locked_amount, 2),
      0
    )
  ),
  lot.created_by
from public.crs_lesson_lots lot
join public.crs_enrollments enrollment
  on enrollment.id = lot.enrollment_id
 and enrollment.status = 'enrolled'
join public.crs_courses course
  on course.id = enrollment.course_id
join public.fin_accounts account
  on account.student_id = enrollment.student_id
where lot.locked_amount > 0
  and not exists (
    select 1
    from public.fin_transactions transaction
    where transaction.metadata->>'event_key'
      = 'historical-prepayment-lock:' || lot.id::text
  );

create or replace function public.rpc_recharge_v2(
  p_student_id uuid,
  p_amount numeric,
  p_payment_method varchar,
  p_operator_id uuid default null,
  p_campaign_id uuid default null,
  p_bonus_amount numeric default 0,
  p_notes text default null,
  p_payment_ref varchar default null,
  p_course_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account public.fin_accounts;
  v_course public.crs_courses;
  v_recharge_id uuid;
  v_recharge_txn_id uuid;
  v_gift_txn_id uuid;
  v_operator uuid := coalesce(p_operator_id, auth.uid());
  v_amount numeric(12,2) := round(p_amount, 2);
  v_bonus numeric(12,2) := round(coalesce(p_bonus_amount, 0), 2);
  v_balance_before numeric(12,2);
  v_cash_balance_after numeric(12,2);
  v_final_balance numeric(12,2);
  v_method_label text;
  v_purpose text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if v_amount is null or v_amount <= 0 then
    raise exception 'INVALID_AMOUNT: 充值金额必须大于零';
  end if;
  if v_bonus < 0 then
    raise exception 'INVALID_BONUS: 赠送金额不能小于零';
  end if;
  if v_purpose is null then
    raise exception 'INVALID_REASON: 充值用途或原因必填';
  end if;
  if p_payment_method not in (
    'shouqianba','digital_wallet','cash','corporate_transfer',
    'wechat','alipay','bank_transfer','other'
  ) then
    raise exception 'INVALID_INPUT: 收款方式无效';
  end if;
  if not exists (
    select 1
    from public.stu_students
    where id = p_student_id and deleted_at is null
  ) then
    raise exception 'STUDENT_NOT_FOUND: 学员不存在';
  end if;

  if p_course_id is not null then
    select *
      into v_course
      from public.crs_courses
     where id = p_course_id
       and deleted_at is null;
    if not found then
      raise exception 'COURSE_NOT_FOUND: 充值关联课程不存在';
    end if;
  end if;

  select *
    into v_account
    from public.fin_accounts
   where student_id = p_student_id
   for update;
  if not found then
    insert into public.fin_accounts(student_id, balance, frozen_amount)
    values (p_student_id, 0, 0)
    returning * into v_account;
  end if;

  v_balance_before := round(v_account.balance, 2);
  v_cash_balance_after := round(v_balance_before + v_amount, 2);
  v_final_balance := round(v_cash_balance_after + v_bonus, 2);
  v_method_label := case p_payment_method
    when 'shouqianba' then '收钱吧'
    when 'digital_wallet' then '支付宝/微信'
    when 'cash' then '现金'
    when 'corporate_transfer' then '对公转账'
    when 'wechat' then '微信'
    when 'alipay' then '支付宝'
    when 'bank_transfer' then '银行转账'
    else '其他方式'
  end;

  insert into public.fin_recharges(
    account_id,
    amount,
    payment_method,
    payment_ref,
    campaign_id,
    bonus_amount,
    notes,
    created_by
  )
  values (
    v_account.id,
    v_amount,
    p_payment_method,
    p_payment_ref,
    p_campaign_id,
    v_bonus,
    v_purpose,
    v_operator
  )
  returning id into v_recharge_id;

  update public.fin_accounts
     set balance = v_final_balance,
         total_recharged = round(total_recharged + v_amount, 2),
         updated_at = now()
   where id = v_account.id;

  insert into public.fin_transactions(
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
    'recharge',
    v_amount,
    v_balance_before,
    v_cash_balance_after,
    'recharge',
    v_recharge_id,
    format(
      '充值：%s；金额 %s；%s；用途：%s%s',
      coalesce(v_course.name, '通用账户余额'),
      v_amount,
      v_method_label,
      v_purpose,
      case
        when v_course.id is not null
          then format('；课程参考单价 %s', round(v_course.fee, 2))
        else ''
      end
    ),
    jsonb_build_object(
      'domain', 'cash',
      'event', 'recharge',
      'course_id', v_course.id,
      'course_name', v_course.name,
      'course_unit_price', v_course.fee,
      'reason', v_purpose,
      'payment_method', p_payment_method,
      'payment_method_label', v_method_label,
      'payment_ref', p_payment_ref,
      'frozen_before', v_account.frozen_amount,
      'frozen_after', v_account.frozen_amount,
      'available_before', round(v_balance_before - v_account.frozen_amount, 2),
      'available_after', round(v_cash_balance_after - v_account.frozen_amount, 2)
    ),
    v_operator
  )
  returning id into v_recharge_txn_id;

  if v_bonus > 0 then
    insert into public.fin_transactions(
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
      'gift',
      v_bonus,
      v_cash_balance_after,
      v_final_balance,
      'recharge',
      v_recharge_id,
      format(
        '充值赠送：%s；赠送余额 %s；原因：%s',
        coalesce(v_course.name, '通用账户余额'),
        v_bonus,
        v_purpose
      ),
      jsonb_build_object(
        'domain', 'gift',
        'event', 'balance_gift',
        'gift_kind', 'balance',
        'course_id', v_course.id,
        'course_name', v_course.name,
        'reason', v_purpose,
        'frozen_before', v_account.frozen_amount,
        'frozen_after', v_account.frozen_amount,
        'available_before', round(v_cash_balance_after - v_account.frozen_amount, 2),
        'available_after', round(v_final_balance - v_account.frozen_amount, 2)
      ),
      v_operator
    )
    returning id into v_gift_txn_id;
  end if;

  insert into public.aud_operation_logs(
    user_id,
    action,
    resource_type,
    resource_id,
    changes
  )
  values (
    v_operator,
    'recharge',
    'account',
    v_account.id,
    jsonb_build_object(
      'amount', v_amount,
      'bonus', v_bonus,
      'course_id', v_course.id,
      'reason', v_purpose,
      'payment_method', p_payment_method,
      'new_balance', v_final_balance
    )
  );

  return jsonb_build_object(
    'message', '充值成功',
    'recharge_id', v_recharge_id,
    'transaction_id', v_recharge_txn_id,
    'gift_transaction_id', v_gift_txn_id,
    'new_balance', v_final_balance,
    'available_balance', round(v_final_balance - v_account.frozen_amount, 2)
  );
end;
$function$;

grant execute on function public.rpc_recharge_v2(
  uuid,numeric,varchar,uuid,uuid,numeric,text,varchar,uuid
) to authenticated;

create or replace function public.rpc_refund_v2(
  p_student_id uuid,
  p_amount numeric,
  p_reason text,
  p_operator_id uuid default null,
  p_course_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account public.fin_accounts;
  v_course public.crs_courses;
  v_operator uuid := coalesce(p_operator_id, auth.uid());
  v_amount numeric(12,2) := round(p_amount, 2);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_available_before numeric(12,2);
  v_txn_id uuid;
begin
  if v_amount is null or v_amount <= 0 then
    raise exception 'INVALID_AMOUNT: 退费金额必须大于零';
  end if;
  if v_reason is null then
    raise exception 'INVALID_REASON: 退费原因必填';
  end if;
  if not exists (
    select 1
    from public.stu_students
    where id = p_student_id and deleted_at is null
  ) then
    raise exception 'STUDENT_NOT_FOUND: 学员不存在';
  end if;

  if p_course_id is not null then
    select *
      into v_course
      from public.crs_courses
     where id = p_course_id;
    if not found then
      raise exception 'COURSE_NOT_FOUND: 退费关联课程不存在';
    end if;
  end if;

  select *
    into v_account
    from public.fin_accounts
   where student_id = p_student_id
   for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在';
  end if;

  v_balance_before := round(v_account.balance, 2);
  v_available_before := round(v_account.balance - v_account.frozen_amount, 2);
  if v_available_before < v_amount then
    raise exception
      'INSUFFICIENT_AVAILABLE_BALANCE: 可退余额仅 %，另有 % 预付款已被课程锁定',
      v_available_before,
      v_account.frozen_amount;
  end if;
  v_balance_after := round(v_balance_before - v_amount, 2);

  update public.fin_accounts
     set balance = v_balance_after,
         total_refunded = round(total_refunded + v_amount, 2),
         updated_at = now()
   where id = v_account.id;

  insert into public.fin_transactions(
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
    'refund',
    v_amount,
    v_balance_before,
    v_balance_after,
    case when v_course.id is null then 'account' else 'enrollment' end,
    v_course.id,
    format(
      '退费：%s；金额 %s；原因：%s',
      coalesce(v_course.name, '非课程可用余额'),
      v_amount,
      v_reason
    ),
    jsonb_build_object(
      'domain', 'cash',
      'event', 'refund',
      'course_id', v_course.id,
      'course_name', v_course.name,
      'course_unit_price', v_course.fee,
      'reason', v_reason,
      'frozen_before', v_account.frozen_amount,
      'frozen_after', v_account.frozen_amount,
      'available_before', v_available_before,
      'available_after', round(v_balance_after - v_account.frozen_amount, 2)
    ),
    v_operator
  )
  returning id into v_txn_id;

  insert into public.aud_operation_logs(
    user_id,
    action,
    resource_type,
    resource_id,
    changes
  )
  values (
    v_operator,
    'refund',
    'account',
    v_account.id,
    jsonb_build_object(
      'amount', v_amount,
      'course_id', v_course.id,
      'reason', v_reason,
      'new_balance', v_balance_after
    )
  );

  return jsonb_build_object(
    'message', '退费成功',
    'transaction_id', v_txn_id,
    'new_balance', v_balance_after,
    'available_balance', round(v_balance_after - v_account.frozen_amount, 2)
  );
end;
$function$;

grant execute on function public.rpc_refund_v2(uuid,numeric,text,uuid,uuid)
to authenticated;

create or replace function public.rpc_refund(
  p_student_id uuid,
  p_amount numeric,
  p_reason text,
  p_operator_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_course_id uuid;
begin
  select nullif(payload->>'p_course_id', '')::uuid
    into v_course_id
    from public.aud_approvals
   where type = 'finance_refund'
     and execution_status = 'running'
     and payload->>'p_student_id' = p_student_id::text
   order by created_at desc
   limit 1;

  return public.rpc_refund_v2(
    p_student_id,
    p_amount,
    p_reason,
    p_operator_id,
    v_course_id
  );
end;
$function$;

grant execute on function public.rpc_refund(uuid,numeric,text,uuid)
to authenticated;

-- 课时批次是预付款锁定金额的唯一事实来源。所有批次变化都会自动重算账户冻结金额，
-- 避免出现账户数字变化但没有对应课程批次的情况。
create or replace function public.sync_student_frozen_amount(p_student_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_frozen numeric(12,2);
begin
  select coalesce(sum(lot.locked_amount), 0)::numeric(12,2)
    into v_frozen
    from public.crs_enrollments enrollment
    join public.crs_lesson_lots lot on lot.enrollment_id = enrollment.id
   where enrollment.student_id = p_student_id
     and enrollment.status = 'enrolled';

  update public.fin_accounts
     set frozen_amount = v_frozen,
         updated_at = now()
   where student_id = p_student_id;

  return v_frozen;
end;
$function$;

create or replace function public.trg_sync_student_frozen_amount()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_student_id uuid;
  v_new_student_id uuid;
begin
  if tg_table_name = 'crs_lesson_lots' then
    if tg_op <> 'INSERT' then
      select student_id into v_old_student_id
        from public.crs_enrollments
       where id = old.enrollment_id;
    end if;
    if tg_op <> 'DELETE' then
      select student_id into v_new_student_id
        from public.crs_enrollments
       where id = new.enrollment_id;
    end if;
  else
    if tg_op <> 'INSERT' then v_old_student_id := old.student_id; end if;
    if tg_op <> 'DELETE' then v_new_student_id := new.student_id; end if;
  end if;

  if v_old_student_id is not null then
    perform public.sync_student_frozen_amount(v_old_student_id);
  end if;
  if v_new_student_id is not null
     and v_new_student_id is distinct from v_old_student_id then
    perform public.sync_student_frozen_amount(v_new_student_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_frozen_from_lesson_lots
  on public.crs_lesson_lots;
create trigger trg_sync_frozen_from_lesson_lots
after insert or update of enrollment_id, locked_amount or delete
on public.crs_lesson_lots
for each row execute function public.trg_sync_student_frozen_amount();

drop trigger if exists trg_sync_frozen_from_enrollments
  on public.crs_enrollments;
create trigger trg_sync_frozen_from_enrollments
after insert or update of student_id, status or delete
on public.crs_enrollments
for each row execute function public.trg_sync_student_frozen_amount();

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
  v_gift_lot public.crs_lesson_lots;
  v_account public.fin_accounts;
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
  v_available_before numeric(12,2);
  v_frozen_before numeric(12,2);
  v_frozen_after numeric(12,2);
  v_lock_txn_id uuid;
  v_gift_txn_id uuid;
  v_is_additional boolean := false;
begin
  if not public.has_permission('courses.enroll') then
    raise exception 'PERMISSION_DENIED: 无权办理学员报名';
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
    select 1
      from public.stu_students
     where id = p_student_id
       and deleted_at is null
       and status <> 'inactive'
  ) then
    raise exception 'STUDENT_NOT_FOUND: 学员不存在或已停用';
  end if;

  select *
    into v_course
    from public.crs_courses
   where id = p_course_id
     and deleted_at is null
   for update;
  if not found or v_course.status <> 'active' then
    raise exception 'COURSE_UNAVAILABLE: 课程不存在或当前不可报名';
  end if;

  select *
    into v_enrollment
    from public.crs_enrollments
   where student_id = p_student_id
     and course_id = p_course_id
     and status = 'enrolled'
   order by enrolled_at desc, id desc
   limit 1
   for update;
  v_is_additional := found;

  if not v_is_additional then
    select count(*)
      into v_enrolled_count
      from public.crs_enrollments
     where course_id = p_course_id
       and status = 'enrolled';
    if v_course.max_capacity is not null
       and v_enrolled_count >= v_course.max_capacity then
      raise exception 'COURSE_FULL: 课程已满员';
    end if;
  end if;

  v_base_lessons := nullif(v_course.schedule_info->>'total_lessons','')::integer;
  v_list_unit := v_course.fee;
  if v_base_lessons is null or v_base_lessons <= 0
     or v_list_unit is null or v_list_unit <= 0 then
    raise exception 'PRICE_INCOMPLETE: 课程尚未完整设置课时与标准单价';
  end if;
  v_gross := round(v_list_unit * v_base_lessons, 2);

  if p_price_id is not null then
    select *
      into v_plan
      from public.crs_course_prices
     where id = p_price_id
       and course_id = p_course_id
       and status = 'active'
       and (effective_from is null or effective_from <= current_date)
       and (effective_to is null or effective_to >= current_date);
    if not found then
      raise exception 'INVALID_PRICE_PLAN: 价格方案无效或已过期';
    end if;
    v_base_lessons := coalesce(v_plan.total_lessons, v_base_lessons);
    v_gross := coalesce(
      v_plan.total_price,
      round(coalesce(v_plan.unit_price, v_list_unit) * v_base_lessons, 2)
    );
  end if;
  if p_lessons_override is not null then
    if p_lessons_override <= 0 then
      raise exception 'INVALID_LESSONS: 报名课时必须大于零';
    end if;
    v_gross := round((v_gross / v_base_lessons) * p_lessons_override, 2);
    v_base_lessons := p_lessons_override;
  end if;

  if p_campaign_id is not null then
    select *
      into v_campaign
      from public.promo_campaigns
     where id = p_campaign_id
       and status = 'active'
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

  if p_source = 'normal'
     and (p_campaign_id is not null or p_custom_discount_type is not null) then
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

  select *
    into v_account
    from public.fin_accounts
   where student_id = p_student_id
   for update;
  if not found then
    insert into public.fin_accounts(student_id, balance, frozen_amount)
    values (p_student_id, 0, 0)
    returning * into v_account;
  end if;
  v_available_before := round(v_account.balance - v_account.frozen_amount, 2);
  v_frozen_before := round(v_account.frozen_amount, 2);
  if v_account.balance < 0 or v_available_before < v_net then
    raise exception
      'INSUFFICIENT_AVAILABLE_BALANCE: 当前可用余额为 %，本次报名需锁定 %；请先足额充值',
      v_available_before,
      v_net;
  end if;

  v_snapshot := jsonb_build_object(
    'version', 3,
    'lot_model', 'prepaid',
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
    'quoted_at', now(),
    'additional_registration', v_is_additional
  );

  if not v_is_additional then
    insert into public.crs_enrollments(
      student_id, course_id, price_id, campaign_id, notes, source, unit_price,
      total_lessons, consumed_lessons, remaining_lessons, total_amount, paid_amount,
      discount_amount, list_unit_price, gross_amount, discount_type, discount_value,
      discount_reason, referrer_student_id, price_snapshot, created_by
    )
    values (
      p_student_id, p_course_id, p_price_id, p_campaign_id, p_notes, p_source,
      v_effective_unit, 0, 0, 0, 0, 0, v_discount, v_list_unit, v_gross,
      v_discount_type, v_discount_value, p_discount_reason, p_referrer_student_id,
      v_snapshot, v_operator
    )
    returning * into v_enrollment;
  else
    update public.crs_enrollments
       set notes = concat_ws(E'\n', nullif(notes, ''), nullif(trim(coalesce(p_notes,'')), '')),
           price_snapshot = v_snapshot,
           updated_at = now()
     where id = v_enrollment.id
     returning * into v_enrollment;
  end if;

  insert into public.crs_lesson_lots(
    enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
    remaining_lessons, total_amount, locked_amount, notes, enrolled_at, created_by
  )
  values (
    v_enrollment.id, 'paid', v_effective_unit, v_base_lessons, 0,
    v_base_lessons, v_net, v_net, coalesce(p_notes, p_discount_reason),
    now(), v_operator
  )
  returning * into v_paid_lot;

  select frozen_amount
    into v_frozen_after
    from public.fin_accounts
   where id = v_account.id;

  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, metadata, created_by
  )
  values (
    v_account.id,
    'prepayment_lock',
    v_net,
    v_account.balance,
    v_account.balance,
    'lesson_lot',
    v_paid_lot.id,
    format(
      '学员报名：%s；%s 课时 × 单价 %s；锁定预付款 %s%s',
      v_course.name,
      v_base_lessons,
      v_effective_unit,
      v_net,
      case when v_is_additional then '；本课程追加报名' else '' end
    ),
    jsonb_build_object(
      'domain', 'prepayment',
      'event', case when v_is_additional then 'additional_registration' else 'registration' end,
      'student_id', p_student_id,
      'course_id', p_course_id,
      'course_name', v_course.name,
      'enrollment_id', v_enrollment.id,
      'lesson_lot_id', v_paid_lot.id,
      'lessons', v_base_lessons,
      'unit_price', v_effective_unit,
      'gross_amount', v_gross,
      'discount_amount', v_discount,
      'reason', coalesce(p_discount_reason, p_notes),
      'frozen_before', v_frozen_before,
      'frozen_after', v_frozen_after,
      'available_before', v_available_before,
      'available_after', round(v_account.balance - v_frozen_after, 2)
    ),
    v_operator
  )
  returning id into v_lock_txn_id;

  if v_total_gifts > 0 then
    insert into public.crs_lesson_lots(
      enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
      remaining_lessons, total_amount, locked_amount, notes, enrolled_at, created_by
    )
    values (
      v_enrollment.id, 'gift', 0, v_total_gifts, 0, v_total_gifts, 0, 0,
      coalesce(v_gift_note, '报名赠送课时'), now(), v_operator
    )
    returning * into v_gift_lot;

    insert into public.fin_transactions(
      account_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata, created_by
    )
    values (
      v_account.id,
      'gift',
      0,
      v_account.balance,
      v_account.balance,
      'lesson_lot',
      v_gift_lot.id,
      format(
        '报名赠送：%s；赠送 %s 课时；原因：%s',
        v_course.name,
        v_total_gifts,
        coalesce(v_gift_note, '报名赠送')
      ),
      jsonb_build_object(
        'domain', 'gift',
        'event', 'lesson_gift',
        'gift_kind', 'lesson',
        'student_id', p_student_id,
        'course_id', p_course_id,
        'course_name', v_course.name,
        'enrollment_id', v_enrollment.id,
        'lesson_lot_id', v_gift_lot.id,
        'gift_lessons', v_total_gifts,
        'reason', coalesce(v_gift_note, '报名赠送'),
        'frozen_before', v_frozen_after,
        'frozen_after', v_frozen_after,
        'available_before', round(v_account.balance - v_frozen_after, 2),
        'available_after', round(v_account.balance - v_frozen_after, 2)
      ),
      v_operator
    )
    returning id into v_gift_txn_id;
  end if;

  perform public.sync_enrollment_lot_totals(v_enrollment.id);
  insert into public.crs_enrollment_price_history(enrollment_id, action, snapshot, changed_by)
  values (
    v_enrollment.id,
    case when v_is_additional then 'additional_registration' else 'created' end,
    v_snapshot || jsonb_build_object('paid_lot_id', v_paid_lot.id),
    v_operator
  );
  if p_campaign_id is not null then
    update public.promo_campaigns
       set used_count = used_count + 1,
           updated_at = now()
     where id = p_campaign_id;
  end if;
  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    v_operator,
    case when v_is_additional then 'add_registration_lot' else 'enroll_student' end,
    'enrollment',
    v_enrollment.id,
    v_snapshot || jsonb_build_object(
      'paid_lot_id', v_paid_lot.id,
      'lock_transaction_id', v_lock_txn_id,
      'gift_transaction_id', v_gift_txn_id
    )
  );

  return jsonb_build_object(
    'message', case when v_is_additional then '追加报名成功' else '报名成功' end,
    'enrollment_id', v_enrollment.id,
    'pricing', v_snapshot,
    'paid_lot_id', v_paid_lot.id,
    'gift_lot_id', v_gift_lot.id,
    'lock_transaction_id', v_lock_txn_id,
    'gift_transaction_id', v_gift_txn_id,
    'additional_registration', v_is_additional,
    'balance', v_account.balance,
    'frozen_amount', v_frozen_after,
    'available_balance', round(v_account.balance - v_frozen_after, 2)
  );
end;
$function$;

revoke all on function public.rpc_enroll_student_v3(
  uuid,uuid,uuid,uuid,text,text,numeric,text,uuid,text,integer,integer,text
) from public;
grant execute on function public.rpc_enroll_student_v3(
  uuid,uuid,uuid,uuid,text,text,numeric,text,uuid,text,integer,integer,text
) to authenticated;

-- 新增付费课时只能走统一的“学员报名”通道；这里仅保留赠送和迁移兼容入口。
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
  v_enrollment public.crs_enrollments;
  v_course public.crs_courses;
  v_account public.fin_accounts;
  v_note text := nullif(trim(coalesce(p_notes,'')), '');
  v_txn_id uuid;
begin
  if not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权维护学员课时批次';
  end if;
  if p_source_type <> 'gift' then
    raise exception 'PAID_REGISTRATION_REQUIRED: 新增付费课时请使用“学员报名”';
  end if;
  if p_total_lessons is null or p_total_lessons <= 0 then
    raise exception 'INVALID_LESSONS: 赠送课时必须大于零';
  end if;
  if v_note is null then
    raise exception 'INVALID_NOTE: 赠送课时必须填写原因';
  end if;

  select e.*
    into v_enrollment
    from public.crs_enrollments e
    join public.crs_courses c on c.id = e.course_id
   where e.id = p_enrollment_id
     and e.status = 'enrolled'
   for update of e;
  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND: 在读报名不存在';
  end if;
  select * into v_course from public.crs_courses where id = v_enrollment.course_id;
  select * into v_account
    from public.fin_accounts
   where student_id = v_enrollment.student_id
   for update;
  if not found then
    insert into public.fin_accounts(student_id, balance, frozen_amount)
    values (v_enrollment.student_id, 0, 0)
    returning * into v_account;
  end if;

  insert into public.crs_lesson_lots(
    enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
    remaining_lessons, total_amount, locked_amount, notes, enrolled_at, created_by
  )
  values (
    p_enrollment_id, 'gift', 0, p_total_lessons, 0,
    p_total_lessons, 0, 0, v_note, coalesce(p_enrolled_at, now()), auth.uid()
  )
  returning * into v_lot;
  perform public.sync_enrollment_lot_totals(p_enrollment_id);

  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, metadata, created_by
  )
  values (
    v_account.id,
    'gift',
    0,
    v_account.balance,
    v_account.balance,
    'lesson_lot',
    v_lot.id,
    format('课程赠送：%s；赠送 %s 课时；原因：%s', v_course.name, p_total_lessons, v_note),
    jsonb_build_object(
      'domain', 'gift',
      'event', 'lesson_gift',
      'gift_kind', 'lesson',
      'student_id', v_enrollment.student_id,
      'course_id', v_enrollment.course_id,
      'course_name', v_course.name,
      'enrollment_id', p_enrollment_id,
      'lesson_lot_id', v_lot.id,
      'gift_lessons', p_total_lessons,
      'reason', v_note,
      'frozen_before', v_account.frozen_amount,
      'frozen_after', v_account.frozen_amount,
      'available_before', round(v_account.balance - v_account.frozen_amount, 2),
      'available_after', round(v_account.balance - v_account.frozen_amount, 2)
    ),
    auth.uid()
  )
  returning id into v_txn_id;

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    auth.uid(),
    'gift_lesson_lot',
    'enrollment',
    p_enrollment_id,
    to_jsonb(v_lot) || jsonb_build_object('transaction_id', v_txn_id)
  );
  return to_jsonb(v_lot) || jsonb_build_object('transaction_id', v_txn_id);
end;
$function$;

revoke all on function public.rpc_add_lesson_lot(
  uuid,integer,numeric,text,text,timestamptz
) from public;
grant execute on function public.rpc_add_lesson_lot(
  uuid,integer,numeric,text,text,timestamptz
) to authenticated;

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
  v_updated public.crs_lesson_lots;
  v_enrollment public.crs_enrollments;
  v_course public.crs_courses;
  v_account public.fin_accounts;
  v_new_remaining integer;
  v_new_price numeric(10,2);
  v_new_total numeric(12,2);
  v_target_lock numeric(12,2);
  v_lock_delta numeric(12,2);
  v_available_before numeric(12,2);
  v_frozen_before numeric(12,2);
  v_frozen_after numeric(12,2);
  v_note text := nullif(trim(coalesce(p_notes,'')), '');
  v_txn_id uuid;
begin
  if not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权维护学员课时批次';
  end if;
  select *
    into v_lot
    from public.crs_lesson_lots
   where id = p_lot_id
   for update;
  if not found then raise exception 'LOT_NOT_FOUND: 课时批次不存在'; end if;
  if p_total_lessons < v_lot.consumed_lessons or p_total_lessons <= 0 then
    raise exception 'INVALID_LESSONS: 总课时不能少于已消课时';
  end if;
  if v_lot.source_type = 'gift' and v_note is null then
    raise exception 'INVALID_NOTE: 赠送课时必须填写备注';
  end if;
  if v_lot.source_type <> 'gift' and coalesce(p_unit_price, 0) <= 0 then
    raise exception 'INVALID_PRICE: 正常课时单价必须大于零';
  end if;

  select * into v_enrollment
    from public.crs_enrollments
   where id = v_lot.enrollment_id
     and status = 'enrolled'
   for update;
  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND: 仅能编辑在读报名的课时批次';
  end if;
  select * into v_course from public.crs_courses where id = v_enrollment.course_id;
  select * into v_account
    from public.fin_accounts
   where student_id = v_enrollment.student_id
   for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在'; end if;

  v_new_remaining := p_total_lessons - v_lot.consumed_lessons;
  v_new_price := case
    when v_lot.source_type = 'gift' then 0
    else round(p_unit_price, 2)
  end;
  v_new_total := case
    when v_lot.source_type = 'gift' then 0
    else round(v_new_price * p_total_lessons, 2)
  end;
  -- 历史未足额锁定批次，编辑时只要求为新增的合同金额补足预付款。
  v_target_lock := least(
    greatest(
      v_lot.locked_amount + (
        round(v_new_remaining * v_new_price, 2)
        - round(v_lot.remaining_lessons * v_lot.unit_price, 2)
      ),
      0
    ),
    round(v_new_remaining * v_new_price, 2)
  );
  if v_lot.source_type = 'gift' then v_target_lock := 0; end if;
  v_lock_delta := round(v_target_lock - v_lot.locked_amount, 2);
  v_available_before := round(v_account.balance - v_account.frozen_amount, 2);
  v_frozen_before := v_account.frozen_amount;
  if v_lock_delta > 0
     and (v_account.balance < 0 or v_available_before < v_lock_delta) then
    raise exception
      'INSUFFICIENT_AVAILABLE_BALANCE: 编辑后需追加锁定 %，当前可用余额仅 %；请先充值',
      v_lock_delta,
      v_available_before;
  end if;

  update public.crs_lesson_lots
     set total_lessons = p_total_lessons,
         remaining_lessons = v_new_remaining,
         unit_price = v_new_price,
         total_amount = v_new_total,
         locked_amount = v_target_lock,
         notes = v_note,
         enrolled_at = coalesce(p_enrolled_at, enrolled_at),
         updated_at = now()
   where id = p_lot_id
  returning * into v_updated;
  perform public.sync_enrollment_lot_totals(v_updated.enrollment_id);
  select frozen_amount into v_frozen_after
    from public.fin_accounts where id = v_account.id;

  if v_lot.source_type = 'gift' then
    insert into public.fin_transactions(
      account_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata, created_by
    )
    values (
      v_account.id, 'gift', 0, v_account.balance, v_account.balance,
      'lesson_lot', v_lot.id,
      format(
        '调整赠送课时：%s；%s 课时调整为 %s 课时；原因：%s',
        v_course.name, v_lot.total_lessons, p_total_lessons, v_note
      ),
      jsonb_build_object(
        'domain', 'gift',
        'event', 'lesson_gift_adjustment',
        'course_id', v_course.id,
        'course_name', v_course.name,
        'enrollment_id', v_enrollment.id,
        'lesson_lot_id', v_lot.id,
        'lessons_before', v_lot.total_lessons,
        'lessons_after', p_total_lessons,
        'reason', v_note,
        'frozen_before', v_frozen_before,
        'frozen_after', v_frozen_after
      ),
      auth.uid()
    )
    returning id into v_txn_id;
  elsif v_lock_delta <> 0
        or v_lot.unit_price is distinct from v_new_price
        or v_lot.total_lessons is distinct from p_total_lessons then
    insert into public.fin_transactions(
      account_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata, created_by
    )
    values (
      v_account.id,
      'prepayment_adjustment',
      abs(v_lock_delta),
      v_account.balance,
      v_account.balance,
      'lesson_lot',
      v_lot.id,
      format(
        '调整报名批次：%s；%s 课时 × %s 调整为 %s 课时 × %s；预付款变化 %s',
        v_course.name,
        v_lot.total_lessons,
        v_lot.unit_price,
        p_total_lessons,
        v_new_price,
        v_lock_delta
      ),
      jsonb_build_object(
        'domain', 'prepayment',
        'event', 'registration_adjustment',
        'course_id', v_course.id,
        'course_name', v_course.name,
        'enrollment_id', v_enrollment.id,
        'lesson_lot_id', v_lot.id,
        'lessons_before', v_lot.total_lessons,
        'lessons_after', p_total_lessons,
        'unit_price_before', v_lot.unit_price,
        'unit_price_after', v_new_price,
        'locked_delta', v_lock_delta,
        'frozen_before', v_frozen_before,
        'frozen_after', v_frozen_after,
        'available_before', v_available_before,
        'available_after', round(v_account.balance - v_frozen_after, 2),
        'reason', v_note
      ),
      auth.uid()
    )
    returning id into v_txn_id;
  end if;

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    auth.uid(),
    'update_lesson_lot',
    'lesson_lot',
    p_lot_id,
    jsonb_build_object(
      'before', to_jsonb(v_lot),
      'after', to_jsonb(v_updated),
      'transaction_id', v_txn_id
    )
  );
  return to_jsonb(v_updated) || jsonb_build_object('transaction_id', v_txn_id);
end;
$function$;

revoke all on function public.rpc_update_lesson_lot(
  uuid,integer,numeric,text,timestamptz
) from public;
grant execute on function public.rpc_update_lesson_lot(
  uuid,integer,numeric,text,timestamptz
) to authenticated;

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
  v_course public.crs_courses;
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
  v_overdraft integer := 0;
begin
  if p_attendance_id is null and not public.has_permission('finance.consume') then
    raise exception 'PERMISSION_DENIED: 无权手动消课';
  end if;
  if p_attendance_id is not null
     and not public.has_permission('courses.attendance') then
    raise exception 'PERMISSION_DENIED: 无权通过点名消课';
  end if;
  if p_lesson_count is null or p_lesson_count <= 0 then
    raise exception 'INVALID_LESSONS: 消课数量必须大于零';
  end if;
  if p_unit_price is not null
     and not public.has_permission('courses.pricing') then
    raise exception 'PERMISSION_DENIED: 无权覆盖课时单价';
  end if;

  select *
    into v_enrollment
    from public.crs_enrollments
   where id = p_enrollment_id
     and status = 'enrolled'
   for update;
  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在或状态无效';
  end if;
  select * into v_course
    from public.crs_courses
   where id = v_enrollment.course_id;

  select *
    into v_account
    from public.fin_accounts
   where student_id = v_enrollment.student_id
   for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND: 学员财务账户不存在'; end if;
  v_balance_before := round(v_account.balance, 2);
  v_frozen_before := round(v_account.frozen_amount, 2);
  v_available_before := round(v_account.balance - v_account.frozen_amount, 2);

  for v_lot in
    select *
      from public.crs_lesson_lots
     where enrollment_id = p_enrollment_id
       and remaining_lessons > 0
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
    v_price := case
      when v_lot.source_type = 'gift' then 0
      else coalesce(p_unit_price, v_lot.unit_price)
    end;

    if v_lot.source_type = 'gift' then
      v_amount := 0;
    elsif p_unit_price is null and v_take = v_lot.remaining_lessons then
      select coalesce(sum(amount), 0)
        into v_lot_consumed_amount
        from public.fin_consumption_logs
       where lesson_lot_id = v_lot.id;
      v_amount := greatest(0, round(v_lot.total_amount - v_lot_consumed_amount, 2));
    else
      v_amount := round(v_price * v_take, 2);
    end if;

    v_release := case
      when v_lot.source_type = 'gift' then 0
      when v_take = v_lot.remaining_lessons then v_lot.locked_amount
      else least(v_lot.locked_amount, v_amount)
    end;
    v_release := round(greatest(v_release, 0), 2);

    update public.crs_lesson_lots
       set consumed_lessons = consumed_lessons + v_take,
           remaining_lessons = remaining_lessons - v_take,
           locked_amount = greatest(0, locked_amount - v_release),
           updated_at = now()
     where id = v_lot.id;

    insert into public.fin_consumption_logs(
      enrollment_id, attendance_id, lesson_lot_id, lesson_count,
      unit_price, amount, prepaid_released, type, notes, created_by
    )
    values (
      p_enrollment_id, p_attendance_id, v_lot.id, v_take,
      case when v_take > 0 then round(v_amount / v_take, 2) else v_price end,
      v_amount,
      v_release,
      case when v_lot.source_type = 'gift' then 'gift' else 'normal' end,
      v_lot.notes,
      v_operator
    )
    returning * into v_log;

    if v_first_log_id is null then v_first_log_id := v_log.id; end if;
    v_log_ids := v_log_ids || jsonb_build_array(v_log.id);
    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'lesson_lot_id', v_lot.id,
      'source_type', v_lot.source_type,
      'lesson_count', v_take,
      'unit_price', case when v_take > 0 then round(v_amount / v_take, 2) else v_price end,
      'amount', v_amount,
      'prepaid_released', v_release,
      'notes', v_lot.notes
    ));
    v_total_amount := v_total_amount + v_amount;
    v_total_released := v_total_released + v_release;
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    v_overdraft := v_need;
    select coalesce(
      p_unit_price,
      min(unit_price) filter (where source_type <> 'gift' and unit_price > 0),
      v_enrollment.unit_price,
      0
    )
      into v_price
      from public.crs_lesson_lots
     where enrollment_id = p_enrollment_id;
    v_amount := round(v_price * v_need, 2);

    insert into public.fin_consumption_logs(
      enrollment_id, attendance_id, lesson_lot_id, lesson_count,
      unit_price, amount, prepaid_released, type, notes, created_by
    )
    values (
      p_enrollment_id, p_attendance_id, null, v_need,
      v_price, v_amount, 0, 'overdraft',
      '课时不足，按规则透支课消',
      v_operator
    )
    returning * into v_log;
    if v_first_log_id is null then v_first_log_id := v_log.id; end if;
    v_log_ids := v_log_ids || jsonb_build_array(v_log.id);
    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'lesson_lot_id', null,
      'source_type', 'overdraft',
      'lesson_count', v_need,
      'unit_price', v_price,
      'amount', v_amount,
      'prepaid_released', 0,
      'notes', '课时不足，按规则透支课消'
    ));
    v_total_amount := v_total_amount + v_amount;
    v_need := 0;
  end if;

  v_total_amount := round(v_total_amount, 2);
  v_total_released := round(v_total_released, 2);
  v_balance_after := round(v_balance_before - v_total_amount, 2);
  update public.fin_accounts
     set balance = v_balance_after,
         total_consumed = round(total_consumed + v_total_amount, 2),
         updated_at = now()
   where id = v_account.id;
  perform public.sync_enrollment_lot_totals(p_enrollment_id);
  select frozen_amount into v_frozen_after
    from public.fin_accounts where id = v_account.id;

  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, metadata, created_by
  )
  values (
    v_account.id,
    'consume',
    v_total_amount,
    v_balance_before,
    v_balance_after,
    'consumption_log',
    v_first_log_id,
    format(
      '课消：%s；%s 课时；实收 %s；释放预付款 %s%s',
      v_course.name,
      p_lesson_count,
      v_total_amount,
      v_total_released,
      case when v_overdraft > 0 then format('；透支 %s 课时', v_overdraft) else '' end
    ),
    jsonb_build_object(
      'domain', 'income',
      'event', 'lesson_consumption',
      'student_id', v_enrollment.student_id,
      'course_id', v_enrollment.course_id,
      'course_name', v_course.name,
      'enrollment_id', p_enrollment_id,
      'consumption_log_ids', v_log_ids,
      'attendance_id', p_attendance_id,
      'lesson_count', p_lesson_count,
      'overdraft_lessons', v_overdraft,
      'prepaid_released', v_total_released,
      'breakdown', v_breakdown,
      'frozen_before', v_frozen_before,
      'frozen_after', v_frozen_after,
      'available_before', v_available_before,
      'available_after', round(v_balance_after - v_frozen_after, 2)
    ),
    v_operator
  )
  returning * into v_tx;

  return jsonb_build_object(
    'consumption_log_id', v_first_log_id,
    'consumption_log_ids', v_log_ids,
    'transaction_id', v_tx.id,
    'amount', v_total_amount,
    'prepaid_released', v_total_released,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'frozen_before', v_frozen_before,
    'frozen_after', v_frozen_after,
    'available_balance', round(v_balance_after - v_frozen_after, 2),
    'remaining_before', v_enrollment.remaining_lessons,
    'remaining_lessons', (
      select remaining_lessons
        from public.crs_enrollments
       where id = p_enrollment_id
    ),
    'lesson_count', p_lesson_count,
    'overdraft_lessons', v_overdraft,
    'breakdown', v_breakdown
  );
end;
$function$;

revoke all on function public.rpc_consume_lesson(
  uuid,uuid,uuid,integer,numeric
) from public;
grant execute on function public.rpc_consume_lesson(
  uuid,uuid,uuid,integer,numeric
) to authenticated;

-- 删除消课明细只会出现在撤销流程中；恢复明细对应的预付款锁定。
create or replace function public.trg_restore_prepaid_on_consumption_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.lesson_lot_id is not null and old.prepaid_released > 0 then
    update public.crs_lesson_lots
       set locked_amount = round(locked_amount + old.prepaid_released, 2),
           updated_at = now()
     where id = old.lesson_lot_id;
  end if;
  return old;
end;
$function$;

drop trigger if exists trg_restore_prepaid_on_consumption_delete
  on public.fin_consumption_logs;
create trigger trg_restore_prepaid_on_consumption_delete
before delete on public.fin_consumption_logs
for each row execute function public.trg_restore_prepaid_on_consumption_delete();

create or replace function public.rpc_drop_enrollment(
  p_enrollment_id uuid,
  p_refund_remaining boolean default true,
  p_reason text default null,
  p_operator_id uuid default null
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
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
  v_released numeric(12,2);
  v_frozen_before numeric(12,2);
  v_frozen_after numeric(12,2);
  v_lots jsonb;
  v_txn_id uuid;
begin
  if v_reason is null then
    raise exception 'INVALID_REASON: 退课原因必填';
  end if;
  select *
    into v_enrollment
    from public.crs_enrollments
   where id = p_enrollment_id
   for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在'; end if;
  if v_enrollment.status <> 'enrolled' then
    raise exception 'INVALID_STATE: 仅能退掉进行中的报名';
  end if;
  select * into v_course
    from public.crs_courses where id = v_enrollment.course_id;
  select * into v_account
    from public.fin_accounts
   where student_id = v_enrollment.student_id
   for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在'; end if;

  select
    coalesce(sum(locked_amount), 0)::numeric(12,2),
    coalesce(jsonb_agg(jsonb_build_object(
      'lesson_lot_id', id,
      'source_type', source_type,
      'remaining_lessons', remaining_lessons,
      'unit_price', unit_price,
      'locked_amount', locked_amount
    ) order by enrolled_at, created_at, id), '[]'::jsonb)
    into v_released, v_lots
    from public.crs_lesson_lots
   where enrollment_id = p_enrollment_id
     and remaining_lessons > 0;
  v_frozen_before := v_account.frozen_amount;

  update public.crs_enrollments
     set status = 'cancelled',
         completed_at = now(),
         notes = concat_ws(
           E'\n',
           nullif(notes, ''),
           '[退课 ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || v_reason
         ),
         updated_at = now()
   where id = p_enrollment_id;
  select frozen_amount into v_frozen_after
    from public.fin_accounts where id = v_account.id;

  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, metadata, created_by
  )
  values (
    v_account.id,
    'prepayment_release',
    v_released,
    v_account.balance,
    v_account.balance,
    'enrollment_drop',
    p_enrollment_id,
    format(
      '退课释放预付款：%s；释放 %s；原因：%s',
      v_course.name,
      v_released,
      v_reason
    ),
    jsonb_build_object(
      'domain', 'prepayment',
      'event', 'enrollment_drop',
      'student_id', v_enrollment.student_id,
      'course_id', v_enrollment.course_id,
      'course_name', v_course.name,
      'enrollment_id', p_enrollment_id,
      'released_lots', v_lots,
      'reason', v_reason,
      'frozen_before', v_frozen_before,
      'frozen_after', v_frozen_after,
      'available_before', round(v_account.balance - v_frozen_before, 2),
      'available_after', round(v_account.balance - v_frozen_after, 2)
    ),
    v_operator
  )
  returning id into v_txn_id;

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    v_operator,
    'drop_enrollment',
    'enrollment',
    p_enrollment_id,
    jsonb_build_object(
      'reason', v_reason,
      'released_prepayment', v_released,
      'released_lots', v_lots,
      'transaction_id', v_txn_id,
      'external_refund', false
    )
  );

  return jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'refunded_amount', 0,
    'released_prepayment', v_released,
    'released_lots', v_lots,
    'transaction_id', v_txn_id,
    'balance', v_account.balance,
    'frozen_amount', v_frozen_after,
    'available_balance', round(v_account.balance - v_frozen_after, 2)
  );
end;
$function$;

revoke all on function public.rpc_drop_enrollment(
  uuid,boolean,text,uuid
) from public;
grant execute on function public.rpc_drop_enrollment(
  uuid,boolean,text,uuid
) to authenticated;

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
  join public.stu_students student
    on student.id = enrollment.student_id
   and student.deleted_at is null
  left join public.fin_accounts account
    on account.student_id = student.id
  left join public.crs_attendance attendance
    on attendance.enrollment_id = enrollment.id
   and attendance.class_date = p_class_date
  left join lateral (
    select string_agg(
      parent.phone,
      ' / '
      order by parent.is_primary_contact desc, parent.created_at, parent.id
    ) as phone
      from public.stu_parents parent
     where parent.student_id = student.id
       and nullif(trim(parent.phone), '') is not null
  ) parent_contacts on true
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
        'locked_amount', lot.locked_amount,
        'unfunded_amount', greatest(
          round(lot.remaining_lessons * lot.unit_price - lot.locked_amount, 2),
          0
        ),
        'notes', lot.notes,
        'enrolled_at', lot.enrolled_at
      )
      order by
        case when lot.source_type = 'gift' then 1 else 0 end,
        lot.unit_price,
        lot.enrolled_at,
        lot.created_at
    ) as items
      from public.crs_lesson_lots lot
     where lot.enrollment_id = enrollment.id
  ) lots on true
  where enrollment.course_id = p_course_id
    and enrollment.status in ('enrolled','completed','transferred','cancelled')
) item;
$function$;

revoke all on function public.rpc_list_course_enrollments(uuid,date) from public;
grant execute on function public.rpc_list_course_enrollments(uuid,date) to authenticated;

create or replace view public.v_student_overview as
select
  student.id,
  student.student_code,
  student.name,
  coalesce(parent_contacts.phone, student.phone)::varchar as phone,
  student.gender,
  student.status,
  student.school,
  student.grade,
  student.source,
  student.department_id,
  department.name as department_name,
  student.assigned_to,
  profile.display_name as counselor_name,
  coalesce(account.balance, 0.00) as balance,
  coalesce(account.total_recharged, 0.00) as total_recharged,
  coalesce(account.total_consumed, 0.00) as total_consumed,
  coalesce(enrollment_stats.enrollment_count, 0) as enrollment_count,
  coalesce(enrollment_stats.active_enrollment_count, 0) as active_enrollment_count,
  last_followup.last_followup_at,
  last_followup.last_followup_type,
  student.created_at,
  student.updated_at,
  coalesce(account.frozen_amount, 0.00) as frozen_amount,
  coalesce(account.balance, 0.00) - coalesce(account.frozen_amount, 0.00) as available_balance
from public.stu_students student
left join public.acct_departments department on department.id = student.department_id
left join public.acct_profiles profile on profile.id = student.assigned_to
left join public.fin_accounts account on account.student_id = student.id
left join lateral (
  select string_agg(
    parent.phone,
    ' / '
    order by parent.is_primary_contact desc, parent.created_at, parent.id
  ) as phone
    from public.stu_parents parent
   where parent.student_id = student.id
     and nullif(trim(parent.phone), '') is not null
) parent_contacts on true
left join lateral (
  select
    count(*) as enrollment_count,
    count(*) filter (where enrollment.status = 'enrolled') as active_enrollment_count
    from public.crs_enrollments enrollment
   where enrollment.student_id = student.id
) enrollment_stats on true
left join lateral (
  select
    followup.created_at as last_followup_at,
    followup.type as last_followup_type
    from public.flup_records followup
   where followup.student_id = student.id
   order by followup.created_at desc
   limit 1
) last_followup on true
where student.deleted_at is null;

grant select on public.v_student_overview to authenticated;

create or replace function public.rpc_get_student_financial_profile(p_student_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
select jsonb_build_object(
  'account',
  jsonb_build_object(
    'balance', coalesce(account.balance, 0),
    'frozen_amount', coalesce(account.frozen_amount, 0),
    'available_balance', coalesce(account.balance, 0) - coalesce(account.frozen_amount, 0),
    'total_recharged', coalesce(account.total_recharged, 0),
    'total_consumed', coalesce(account.total_consumed, 0),
    'total_refunded', coalesce(account.total_refunded, 0),
    'historical_unfunded', coalesce(course_summary.historical_unfunded, 0)
  ),
  'courses',
  coalesce(course_summary.items, '[]'::jsonb)
)
from public.stu_students student
left join public.fin_accounts account on account.student_id = student.id
left join lateral (
  select
    coalesce(sum(item.historical_unfunded) filter (where item.status = 'enrolled'), 0)
      as historical_unfunded,
    coalesce(jsonb_agg(jsonb_build_object(
      'enrollment_id', item.enrollment_id,
      'course_id', item.course_id,
      'course_name', item.course_name,
      'status', item.status,
      'total_lessons', item.total_lessons,
      'consumed_lessons', item.consumed_lessons,
      'remaining_lessons', item.remaining_lessons,
      'contract_amount', item.contract_amount,
      'locked_amount', item.locked_amount,
      'remaining_value', item.remaining_value,
      'historical_unfunded', item.historical_unfunded,
      'batches', item.batches
    ) order by
      case when item.status = 'enrolled' then 0 else 1 end,
      item.created_at desc
    ), '[]'::jsonb) as items
  from (
    select
      enrollment.id as enrollment_id,
      enrollment.status,
      enrollment.total_lessons,
      enrollment.consumed_lessons,
      enrollment.remaining_lessons,
      enrollment.total_amount as contract_amount,
      enrollment.created_at,
      course.id as course_id,
      course.name as course_name,
      lot_summary.locked_amount,
      lot_summary.remaining_value,
      lot_summary.historical_unfunded,
      lot_summary.items as batches
    from public.crs_enrollments enrollment
    join public.crs_courses course on course.id = enrollment.course_id
    left join lateral (
      select
        coalesce(sum(lot.locked_amount), 0) as locked_amount,
        coalesce(sum(round(lot.remaining_lessons * lot.unit_price, 2)), 0) as remaining_value,
        coalesce(sum(greatest(
          round(lot.remaining_lessons * lot.unit_price - lot.locked_amount, 2),
          0
        )), 0) as historical_unfunded,
        coalesce(jsonb_agg(jsonb_build_object(
          'id', lot.id,
          'source_type', lot.source_type,
          'total_lessons', lot.total_lessons,
          'consumed_lessons', lot.consumed_lessons,
          'remaining_lessons', lot.remaining_lessons,
          'unit_price', lot.unit_price,
          'total_amount', lot.total_amount,
          'locked_amount', lot.locked_amount,
          'unfunded_amount', greatest(
            round(lot.remaining_lessons * lot.unit_price - lot.locked_amount, 2),
            0
          ),
          'notes', lot.notes,
          'enrolled_at', lot.enrolled_at
        ) order by
          case when lot.source_type = 'gift' then 1 else 0 end,
          lot.unit_price,
          lot.enrolled_at,
          lot.id), '[]'::jsonb) as items
      from public.crs_lesson_lots lot
      where lot.enrollment_id = enrollment.id
    ) lot_summary on true
    where enrollment.student_id = student.id
  ) item
) course_summary on true
where student.id = p_student_id
  and student.deleted_at is null;
$function$;

revoke all on function public.rpc_get_student_financial_profile(uuid) from public;
grant execute on function public.rpc_get_student_financial_profile(uuid) to authenticated;

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
  v_source public.crs_enrollments;
  v_source_course public.crs_courses;
  v_target_course public.crs_courses;
  v_target_id uuid;
  v_account public.fin_accounts;
  v_active_count integer;
  v_need integer := p_carry_lessons;
  v_take integer;
  v_lot public.crs_lesson_lots;
  v_target_lot public.crs_lesson_lots;
  v_moved_lock numeric(12,2);
  v_total_lock numeric(12,2) := 0;
  v_moved jsonb := '[]'::jsonb;
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
begin
  if v_reason is null then
    raise exception 'INVALID_REASON: 转课原因必填';
  end if;
  select *
    into v_source
    from public.crs_enrollments
   where id = p_source_enrollment_id
   for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 源报名不存在'; end if;
  if v_source.status <> 'enrolled' then
    raise exception 'INVALID_STATE: 仅能转出进行中的报名';
  end if;
  if p_carry_lessons is null or p_carry_lessons <= 0 then
    raise exception 'INVALID_INPUT: 携带课时数必须为正整数';
  end if;
  if p_carry_lessons > v_source.remaining_lessons then
    raise exception 'INVALID_INPUT: 携带课时不得超过剩余 % 课时', v_source.remaining_lessons;
  end if;

  select * into v_source_course
    from public.crs_courses where id = v_source.course_id;
  select *
    into v_target_course
    from public.crs_courses
   where id = p_target_course_id
     and deleted_at is null;
  if not found or v_target_course.status <> 'active' then
    raise exception 'COURSE_UNAVAILABLE: 目标课程不存在或不可报名';
  end if;
  if v_target_course.id = v_source.course_id then
    raise exception 'INVALID_INPUT: 目标课程与源课程相同';
  end if;

  select count(*)
    into v_active_count
    from public.crs_enrollments
   where course_id = p_target_course_id
     and status = 'enrolled';
  if v_target_course.max_capacity is not null
     and v_active_count >= v_target_course.max_capacity then
    raise exception 'COURSE_FULL: 目标课程已满员';
  end if;
  select * into v_account
    from public.fin_accounts
   where student_id = v_source.student_id
   for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在'; end if;

  insert into public.crs_enrollments(
    student_id, course_id, status, unit_price, total_lessons, consumed_lessons,
    remaining_lessons, total_amount, paid_amount, discount_amount, source,
    original_enrollment_id, created_by, notes, price_snapshot
  )
  values (
    v_source.student_id, p_target_course_id, 'enrolled', v_source.unit_price,
    0, 0, 0, 0, 0, 0, 'transfer', p_source_enrollment_id, v_operator,
    '由 ' || v_source_course.name || ' 转入：' || v_reason,
    jsonb_build_object(
      'version', 3,
      'lot_model', 'prepaid',
      'source', 'transfer',
      'original_enrollment_id', v_source.id,
      'reason', v_reason
    )
  )
  returning id into v_target_id;

  for v_lot in
    select *
      from public.crs_lesson_lots
     where enrollment_id = p_source_enrollment_id
       and remaining_lessons > 0
     order by
       case when source_type = 'gift' then 1 else 0 end,
       unit_price,
       enrolled_at,
       created_at,
       id
     for update
  loop
    exit when v_need <= 0;
    v_take := least(v_need, v_lot.remaining_lessons);
    v_moved_lock := case
      when v_lot.source_type = 'gift' then 0
      when v_take = v_lot.remaining_lessons then v_lot.locked_amount
      else least(
        v_lot.locked_amount,
        round(v_lot.locked_amount * v_take / v_lot.remaining_lessons, 2)
      )
    end;

    update public.crs_lesson_lots
       set total_lessons = total_lessons - v_take,
           remaining_lessons = remaining_lessons - v_take,
           total_amount = greatest(0, round(total_amount - unit_price * v_take, 2)),
           locked_amount = greatest(0, round(locked_amount - v_moved_lock, 2)),
           updated_at = now()
     where id = v_lot.id;

    insert into public.crs_lesson_lots(
      enrollment_id, source_type, unit_price, total_lessons, consumed_lessons,
      remaining_lessons, total_amount, locked_amount, notes, enrolled_at, created_by
    )
    values (
      v_target_id,
      case when v_lot.source_type = 'gift' then 'gift' else 'transfer' end,
      v_lot.unit_price,
      v_take,
      0,
      v_take,
      round(v_lot.unit_price * v_take, 2),
      v_moved_lock,
      concat_ws('；', v_lot.notes, '由 ' || v_source_course.name || ' 转入：' || v_reason),
      now(),
      v_operator
    )
    returning * into v_target_lot;

    v_moved := v_moved || jsonb_build_array(jsonb_build_object(
      'source_lot_id', v_lot.id,
      'target_lot_id', v_target_lot.id,
      'source_type', v_lot.source_type,
      'lesson_count', v_take,
      'unit_price', v_lot.unit_price,
      'locked_amount', v_moved_lock
    ));
    v_total_lock := v_total_lock + v_moved_lock;
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then
    raise exception 'TRANSFER_ALLOCATION_FAILED: 可转课时不足';
  end if;

  perform public.sync_enrollment_lot_totals(p_source_enrollment_id);
  perform public.sync_enrollment_lot_totals(v_target_id);
  if (
    select remaining_lessons
      from public.crs_enrollments
     where id = p_source_enrollment_id
  ) <= 0 then
    update public.crs_enrollments
       set status = 'transferred',
           completed_at = now(),
           notes = concat_ws(
             E'\n',
             nullif(notes, ''),
             '[转课 ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || v_reason
           ),
           updated_at = now()
     where id = p_source_enrollment_id;
  else
    update public.crs_enrollments
       set notes = concat_ws(
             E'\n',
             nullif(notes, ''),
             '[部分转课 ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || v_reason
           ),
           updated_at = now()
     where id = p_source_enrollment_id;
  end if;

  insert into public.fin_transactions(
    account_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, metadata, created_by
  )
  values
  (
    v_account.id,
    'transfer_out',
    0,
    v_account.balance,
    v_account.balance,
    'enrollment_transfer',
    p_source_enrollment_id,
    format(
      '转课转出：%s → %s；%s 课时；转移预付款 %s；原因：%s',
      v_source_course.name, v_target_course.name, p_carry_lessons, v_total_lock, v_reason
    ),
    jsonb_build_object(
      'domain', 'course_transfer',
      'event', 'transfer_out',
      'student_id', v_source.student_id,
      'source_enrollment_id', p_source_enrollment_id,
      'target_enrollment_id', v_target_id,
      'source_course_id', v_source_course.id,
      'source_course_name', v_source_course.name,
      'target_course_id', v_target_course.id,
      'target_course_name', v_target_course.name,
      'lesson_count', p_carry_lessons,
      'locked_amount', v_total_lock,
      'moved_lots', v_moved,
      'reason', v_reason,
      'frozen_before', v_account.frozen_amount,
      'frozen_after', v_account.frozen_amount,
      'available_before', round(v_account.balance - v_account.frozen_amount, 2),
      'available_after', round(v_account.balance - v_account.frozen_amount, 2)
    ),
    v_operator
  ),
  (
    v_account.id,
    'transfer_in',
    0,
    v_account.balance,
    v_account.balance,
    'enrollment_transfer',
    v_target_id,
    format(
      '转课转入：%s → %s；%s 课时；承接预付款 %s；原因：%s',
      v_source_course.name, v_target_course.name, p_carry_lessons, v_total_lock, v_reason
    ),
    jsonb_build_object(
      'domain', 'course_transfer',
      'event', 'transfer_in',
      'student_id', v_source.student_id,
      'source_enrollment_id', p_source_enrollment_id,
      'target_enrollment_id', v_target_id,
      'source_course_id', v_source_course.id,
      'source_course_name', v_source_course.name,
      'target_course_id', v_target_course.id,
      'target_course_name', v_target_course.name,
      'lesson_count', p_carry_lessons,
      'locked_amount', v_total_lock,
      'moved_lots', v_moved,
      'reason', v_reason,
      'frozen_before', v_account.frozen_amount,
      'frozen_after', v_account.frozen_amount,
      'available_before', round(v_account.balance - v_account.frozen_amount, 2),
      'available_after', round(v_account.balance - v_account.frozen_amount, 2)
    ),
    v_operator
  );

  insert into public.aud_operation_logs(user_id, action, resource_type, resource_id, changes)
  values (
    v_operator,
    'transfer_enrollment',
    'enrollment',
    p_source_enrollment_id,
    jsonb_build_object(
      'target_course_id', p_target_course_id,
      'new_enrollment_id', v_target_id,
      'carry_lessons', p_carry_lessons,
      'locked_amount', v_total_lock,
      'moved_lots', v_moved,
      'reason', v_reason
    )
  );
  return v_target_id;
end;
$function$;

revoke all on function public.rpc_transfer_enrollment(
  uuid,uuid,integer,text,uuid
) from public;
grant execute on function public.rpc_transfer_enrollment(
  uuid,uuid,integer,text,uuid
) to authenticated;

-- 考勤由“已消课”改为“未消课”时保留原流水并生成反向账务记录，
-- 同时删除消课明细以恢复课时和对应预付款锁定。
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
  v_attendance public.crs_attendance;
  v_enrollment public.crs_enrollments;
  v_old_status text;
  v_reverse_amount numeric(12,2) := 0;
  v_reverse_lessons integer := 0;
  v_first_log_id uuid;
  v_transaction public.fin_transactions;
  v_log public.fin_consumption_logs;
  v_consume_result jsonb := null;
  v_reversal jsonb := null;
  v_reason text;
begin
  if not public.has_permission('courses.attendance') then
    raise exception 'PERMISSION_DENIED: 无权修改考勤';
  end if;
  if p_status not in ('present','absent','late','leave') then
    raise exception 'INVALID_INPUT: 考勤状态无效';
  end if;

  select *
    into v_attendance
    from public.crs_attendance
   where id = p_attendance_id
   for update;
  if not found then raise exception 'ATTENDANCE_NOT_FOUND: 考勤记录不存在'; end if;
  v_old_status := v_attendance.status;
  select *
    into v_enrollment
    from public.crs_enrollments
   where id = v_attendance.enrollment_id
   for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在'; end if;

  if v_old_status in ('absent','leave')
     and p_status in ('present','late')
     and p_trigger_consume then
    if nullif(trim(coalesce(p_notes,'')), '') is null then
      raise exception 'INVALID_NOTE: 补课消必须填写备注';
    end if;
    update public.crs_attendance
       set status = p_status,
           notes = p_notes,
           marked_by = v_operator,
           updated_at = now()
     where id = p_attendance_id;
    v_consume_result := public.rpc_consume_lesson(
      p_enrollment_id => v_attendance.enrollment_id,
      p_operator_id => v_operator,
      p_attendance_id => p_attendance_id,
      p_lesson_count => 1
    );
  elsif v_old_status in ('present','late')
        and p_status in ('absent','leave') then
    select id
      into v_first_log_id
      from public.fin_consumption_logs
     where attendance_id = p_attendance_id
     order by created_at, id
     limit 1;

    if v_first_log_id is not null then
      select coalesce(sum(amount),0), coalesce(sum(lesson_count),0)
        into v_reverse_amount, v_reverse_lessons
        from public.fin_consumption_logs
       where attendance_id = p_attendance_id;

      for v_log in
        select *
          from public.fin_consumption_logs
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

      select *
        into v_transaction
        from public.fin_transactions
       where reference_type = 'consumption_log'
         and reference_id = v_first_log_id
       order by created_at desc
       limit 1
       for update;
      if found then
        v_reason := coalesce(
          nullif(trim(coalesce(p_notes,'')), ''),
          format(
            '考勤由%s改为%s，撤销原课消',
            case v_old_status when 'present' then '出勤' else '迟到' end,
            case p_status when 'absent' then '缺勤' else '请假' end
          )
        );
        v_reversal := public._void_finance_transaction(
          v_transaction.id,
          v_reason,
          v_operator,
          null
        );
      end if;

      delete from public.fin_consumption_logs
       where attendance_id = p_attendance_id;
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
    v_operator,
    'update_attendance',
    'attendance',
    p_attendance_id,
    jsonb_build_object(
      'from', v_old_status,
      'to', p_status,
      'trigger_consume', p_trigger_consume,
      'reverse_amount', v_reverse_amount,
      'reverse_lessons', v_reverse_lessons,
      'reversal', v_reversal
    )
  );

  return jsonb_build_object(
    'attendance_id', p_attendance_id,
    'from_status', v_old_status,
    'to_status', p_status,
    'consume_result', v_consume_result,
    'reverse_amount', v_reverse_amount,
    'reversal', v_reversal
  );
end;
$function$;

revoke all on function public.rpc_update_attendance(
  uuid,varchar,text,boolean,uuid
) from public;
grant execute on function public.rpc_update_attendance(
  uuid,varchar,text,boolean,uuid
) to authenticated;
