-- 0005 — 审批闭环(通过即执行) + 通知数据源
--
-- 1) 重写 rpc_review_approval: 管理员「通过」时, 依据 aud_approvals.type + payload
--    分派执行真正的破坏性操作 (退费/退课/转课/删部门/停用员工走既有 RPC;
--    删学员/课程归档删除走内联软删). 「驳回」仅改状态, 不执行.
-- 2) 新增 rpc_get_notifications: 返回当前用户可见的通知 (待审批 / 余额预警 / 待跟进).
--    注意: SECURITY INVOKER (默认), 使下层视图的 RLS 按调用者生效, 避免越权泄露.

create or replace function public.rpc_review_approval(
  p_id uuid,
  p_status text,
  p_reviewer_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.aud_approvals;
  v_p   jsonb;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
  if public.get_my_role() <> 'admin' then
    raise exception 'only admin can review approvals';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'review status must be approved or rejected';
  end if;

  select * into v_row from public.aud_approvals
   where id = p_id and status = 'pending'
   for update;
  if not found then
    raise exception 'pending approval not found';
  end if;
  v_p := coalesce(v_row.payload, '{}'::jsonb);

  -- 仅「通过」才执行底层操作
  if p_status = 'approved' then
    case v_row.type
      when 'finance_refund' then
        perform public.rpc_refund(
          (v_p->>'p_student_id')::uuid,
          (v_p->>'p_amount')::numeric,
          coalesce(v_p->>'p_reason', v_row.reason));
      when 'enrollment_drop' then
        perform public.rpc_drop_enrollment(
          (v_p->>'p_enrollment_id')::uuid,
          coalesce((v_p->>'p_refund_remaining')::boolean, true),
          coalesce(v_p->>'p_reason', v_row.reason));
      when 'enrollment_transfer' then
        perform public.rpc_transfer_enrollment(
          (v_p->>'p_source_enrollment_id')::uuid,
          (v_p->>'p_target_course_id')::uuid,
          (v_p->>'p_carry_lessons')::int,
          coalesce(v_p->>'p_reason', v_row.reason));
      when 'department_delete' then
        perform public.rpc_delete_department((v_p->>'p_id')::uuid);
      when 'staff_deactivate' then
        perform public.rpc_delete_staff((v_p->>'p_id')::uuid);
      when 'student_delete' then
        update public.stu_students
           set deleted_at = now(), updated_at = now()
         where id = (v_p->>'p_student_id')::uuid;
      when 'course_archive' then
        update public.crs_courses
           set status = 'archived', updated_at = now()
         where id = (v_p->>'p_course_id')::uuid;
      when 'course_delete' then
        update public.crs_courses
           set deleted_at = now(), updated_at = now()
         where id = (v_p->>'p_course_id')::uuid;
      else
        raise exception 'unknown approval type: %', v_row.type;
    end case;
  end if;

  update public.aud_approvals
     set status = p_status,
         reviewed_by = auth.uid(),
         reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
         reviewed_at = now()
   where id = p_id;
end;
$$;

grant execute on function public.rpc_review_approval(uuid, text, text) to authenticated;


create or replace function public.rpc_get_notifications()
returns jsonb
language plpgsql
stable
set search_path to 'public'   -- SECURITY INVOKER (默认): 下层视图 RLS 按调用者生效
as $$
declare
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread', 0);
  end if;

  -- 待审批 (admin 见全部, 其他见本人提交; 由 aud_approvals RLS 限定)
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

  -- 余额预警 (按视图 RLS 范围)
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

  -- 待跟进
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
