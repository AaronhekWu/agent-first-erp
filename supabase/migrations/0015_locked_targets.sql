-- 0015 — 待审批对象锁 (并发冲突防护)
--
-- 返回所有「待审批」记录的 target_id (仅 UUID, 不含明细), 供前端把相关行的操作按钮置灰,
-- 防止多人对同一学员/报名/课程同时发起冲突操作。
-- SECURITY DEFINER: 锁集合对所有登录用户一致 (不受 aud_approvals RLS 影响), 否则跨用户锁不住。

create or replace function public.rpc_get_locked_targets()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(distinct target_id), '[]'::jsonb)
  from public.aud_approvals
  where status = 'pending' and target_id is not null;
$$;

grant execute on function public.rpc_get_locked_targets() to authenticated;
