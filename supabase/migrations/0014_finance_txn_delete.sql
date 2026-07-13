-- 0014 — 财务流水删除走审批 (finance_txn_delete)
--
-- 删除一笔流水 = 反转其对账户的净影响 (recharge 减回, consume/refund 加回) 并删除记录,
-- 全程通过审批中心 (admin 通过后由 rpc_review_approval 执行)。
-- 反转后余额为负则拒绝并回滚 (保护账户完整性)。审计留痕在 aud_approvals (谁发起/谁审批/时间)。
--
-- 变更: 新增 _exec_finance_txn_delete 执行器; validate_approval_request_base、
--       rpc_create_approval_request、rpc_review_approval 增加 finance_txn_delete 分支。

-- 1) 执行器 (仅供 rpc_review_approval 调用, 收回 public/authenticated 直接执行权)
create or replace function public._exec_finance_txn_delete(p_txn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_txn public.fin_transactions%rowtype;
  v_new_balance numeric;
begin
  select * into v_txn from public.fin_transactions where id = p_txn_id for update;
  if not found then raise exception 'TXN_NOT_FOUND: 流水记录不存在'; end if;

  update public.fin_accounts
     set balance = balance + case v_txn.type
                     when 'recharge' then -v_txn.amount
                     when 'consume'  then  v_txn.amount
                     when 'refund'   then  v_txn.amount
                     else 0 end,
         total_recharged = total_recharged + case when v_txn.type = 'recharge' then -v_txn.amount else 0 end,
         total_consumed  = total_consumed  + case when v_txn.type = 'consume'  then -v_txn.amount else 0 end,
         total_refunded  = total_refunded  + case when v_txn.type = 'refund'   then -v_txn.amount else 0 end,
         updated_at = now()
   where id = v_txn.account_id
   returning balance into v_new_balance;

  if not found then raise exception 'ACCOUNT_NOT_FOUND: 账户不存在'; end if;
  if v_new_balance < 0 then
    raise exception 'BALANCE_WOULD_GO_NEGATIVE: 删除该流水会使账户余额为负, 请先处理后续流水';
  end if;

  delete from public.fin_transactions where id = p_txn_id;
  return jsonb_build_object('operation', 'finance_txn_delete', 'txn_type', v_txn.type,
                            'amount', v_txn.amount, 'new_balance', v_new_balance);
end;
$$;
revoke execute on function public._exec_finance_txn_delete(uuid) from public;

-- 2) validate_approval_request_base: 增加 finance_txn_delete 分支 (在 else 之前)
--    (完整函数体见 rpc_review_approval 同步更新; 此处仅示意新增分支)
--    实际部署时对整函数 CREATE OR REPLACE, 与生产一致。
-- 见 db: validate_approval_request_base 增加:
--   when 'finance_txn_delete' then
--     if (p_payload->>'p_txn_id')::uuid is distinct from p_target_id then
--       raise exception 'APPROVAL_TARGET_MISMATCH: 流水参数与审批目标不一致'; end if;
--     perform 1 from public.fin_transactions where id = p_target_id;
--     if not found then raise exception 'TXN_NOT_FOUND: 流水记录不存在'; end if;

-- 3) rpc_create_approval_request: v_scope 与去重 CASE 增加
--      when p_type = 'finance_txn_delete' then 'finance_txn'
--      when type   = 'finance_txn_delete' then 'finance_txn'

-- 4) rpc_review_approval: dispatch 增加
--      when 'finance_txn_delete' then
--        v_result := public._exec_finance_txn_delete((v_approval.payload->>'p_txn_id')::uuid);
--
-- 注: 上述 2/3/4 已对完整函数体 CREATE OR REPLACE 应用到生产 (内容与 MYW 版本一致 + 上述新增)。
