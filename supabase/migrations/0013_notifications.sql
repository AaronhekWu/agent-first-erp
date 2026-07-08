-- 0013 — 通知数据源 rpc_get_notifications
--
-- (原先与一版 rpc_review_approval 同处 0005_approval_execute_and_notifications.sql;
--  审批执行逻辑已由 0005_approval_execution.sql + 0007_approval_validation.sql 取代,
--  故将仍在用的通知函数独立到此, 删除旧的重复 0005 文件以消除迁移号冲突。)
--
-- SECURITY INVOKER (默认): 下层视图 RLS 按调用者生效, 避免越权泄露.
-- 返回当前用户可见通知: 待审批(admin 全部/其他本人) + 余额预警 + 待跟进.

create or replace function public.rpc_get_notifications()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread', 0);
  end if;

  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', 'apv_' || (a.id)::text,
      'kind', 'approval',
      'title', a.title,
      'subtitle', coalesce(a.target_label, a.type) || ' · ' || coalesce(a.reason, '待处理'),
      'href', '/audits',
      'at', a.created_at
    ) order by a.created_at desc)
    from (
      select * from public.aud_approvals
       where status = 'pending' order by created_at desc limit 5
    ) a
  ), '[]'::jsonb);

  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', 'bal_' || (b.student_id)::text,
      'kind', 'balance',
      'title', '余额预警：' || b.name,
      'subtitle', '余额 ' || coalesce(b.balance, 0)::text
                  || ' · 预计可用 ' || coalesce(b.days_left, 0)::text || ' 天',
      'href', '/students/' || (b.student_id)::text,
      'at', now()
    ) order by b.days_left asc nulls last)
    from (
      select * from public.v_balance_warnings order by days_left asc nulls last limit 5
    ) b
  ), '[]'::jsonb);

  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', 'flw_' || (f.followup_id)::text,
      'kind', 'followup',
      'title', '待跟进：' || f.student_name,
      'subtitle', coalesce(f.next_plan, f.last_followup_type, '计划跟进'),
      'href', '/followups',
      'at', f.next_date
    ) order by f.next_date asc nulls last)
    from (
      select * from public.v_pending_followups order by next_date asc nulls last limit 5
    ) f
  ), '[]'::jsonb);

  return jsonb_build_object('items', v_items, 'unread', jsonb_array_length(v_items));
end;
$$;

grant execute on function public.rpc_get_notifications() to authenticated;
