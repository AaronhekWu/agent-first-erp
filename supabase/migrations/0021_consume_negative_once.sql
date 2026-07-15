-- 0021 — 消课负余额规则调整
--
-- 原规则: 余额 < 本次消课金额 即拒绝 (永不为负)。
-- 新规则: 余额 > 0 即允许执行 (本次可扣成负数, 避免上课当天卡点名);
--         余额 <= 0 (已欠费) 时拒绝, 须先充值再消课。
-- 其余逻辑不变。

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
  -- 负余额规则: 余额为正可扣 (允许本次扣成负数); 已欠费(<=0)则拒绝
  if v_account.balance <= 0 then
    raise exception '账户已欠费（当前余额 %），请先充值后再消课', v_account.balance;
  end if;
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
$function$;
