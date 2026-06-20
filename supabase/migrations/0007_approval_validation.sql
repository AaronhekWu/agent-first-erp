-- 0007 - Central validation for every approval type

create or replace function public.validate_approval_request(
  p_type text,
  p_target_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
  v_balance numeric;
  v_remaining integer;
  v_source_course_id uuid;
  v_target_course_id uuid;
  v_carry integer;
  v_capacity integer;
  v_enrolled integer;
begin
  if p_target_id is null then
    raise exception 'APPROVAL_TARGET_REQUIRED: 审批目标不能为空';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'APPROVAL_PAYLOAD_INVALID: 审批参数格式错误';
  end if;

  case p_type
    when 'student_delete' then
      if (p_payload->>'p_student_id')::uuid is distinct from p_target_id then
        raise exception 'APPROVAL_TARGET_MISMATCH: 学员参数与审批目标不一致';
      end if;
      select status into v_status
        from public.stu_students
       where id = p_target_id and deleted_at is null;
      if not found then raise exception 'STUDENT_NOT_FOUND: 学员不存在'; end if;
      if v_status is distinct from 'active' then
        raise exception 'STUDENT_INACTIVE: 仅能停用在读学员';
      end if;

    when 'course_archive' then
      if (p_payload->>'p_course_id')::uuid is distinct from p_target_id then
        raise exception 'APPROVAL_TARGET_MISMATCH: 课程参数与审批目标不一致';
      end if;
      select status into v_status
        from public.crs_courses
       where id = p_target_id and deleted_at is null;
      if not found then raise exception 'COURSE_NOT_FOUND: 课程不存在'; end if;
      if v_status = 'archived' then raise exception 'COURSE_ARCHIVED: 课程已经归档'; end if;

    when 'course_delete' then
      if (p_payload->>'p_course_id')::uuid is distinct from p_target_id then
        raise exception 'APPROVAL_TARGET_MISMATCH: 课程参数与审批目标不一致';
      end if;
      perform 1 from public.crs_courses where id = p_target_id and deleted_at is null;
      if not found then raise exception 'COURSE_NOT_FOUND: 课程不存在'; end if;
      if exists (select 1 from public.crs_enrollments where course_id = p_target_id) then
        raise exception 'COURSE_HAS_ENROLLMENTS: 课程已有报名历史，请使用归档';
      end if;

    when 'enrollment_drop' then
      if (p_payload->>'p_enrollment_id')::uuid is distinct from p_target_id then
        raise exception 'APPROVAL_TARGET_MISMATCH: 报名参数与审批目标不一致';
      end if;
      select status into v_status from public.crs_enrollments where id = p_target_id;
      if not found then raise exception 'ENROLLMENT_NOT_FOUND: 报名记录不存在'; end if;
      if v_status is distinct from 'enrolled' then
        raise exception 'ENROLLMENT_INACTIVE: 仅能退掉进行中的报名';
      end if;

    when 'enrollment_transfer' then
      if (p_payload->>'p_source_enrollment_id')::uuid is distinct from p_target_id then
        raise exception 'APPROVAL_TARGET_MISMATCH: 报名参数与审批目标不一致';
      end if;
      v_target_course_id := (p_payload->>'p_target_course_id')::uuid;
      v_carry := (p_payload->>'p_carry_lessons')::integer;
      select status, remaining_lessons, course_id
        into v_status, v_remaining, v_source_course_id
        from public.crs_enrollments
       where id = p_target_id;
      if not found then raise exception 'ENROLLMENT_NOT_FOUND: 源报名不存在'; end if;
      if v_status is distinct from 'enrolled' then
        raise exception 'ENROLLMENT_INACTIVE: 仅能转出进行中的报名';
      end if;
      if v_carry is null or v_carry <= 0 or v_carry > coalesce(v_remaining, 0) then
        raise exception 'INVALID_LESSONS: 携带课时必须大于零且不超过剩余课时';
      end if;
      if v_target_course_id is null or v_target_course_id = v_source_course_id then
        raise exception 'INVALID_TARGET_COURSE: 目标课程无效或与源课程相同';
      end if;
      select status, max_capacity
        into v_status, v_capacity
        from public.crs_courses
       where id = v_target_course_id and deleted_at is null;
      if not found then raise exception 'COURSE_NOT_FOUND: 目标课程不存在'; end if;
      if v_status is distinct from 'active' then raise exception 'COURSE_INACTIVE: 目标课程已下线'; end if;
      select count(*) into v_enrolled
        from public.crs_enrollments
       where course_id = v_target_course_id and status = 'enrolled';
      if v_capacity is not null and v_enrolled >= v_capacity then
        raise exception 'COURSE_FULL: 目标课程已满员';
      end if;

    when 'finance_refund' then
      if (p_payload->>'p_student_id')::uuid is distinct from p_target_id then
        raise exception 'APPROVAL_TARGET_MISMATCH: 学员参数与审批目标不一致';
      end if;
      if (p_payload->>'p_amount')::numeric is null or (p_payload->>'p_amount')::numeric <= 0 then
        raise exception 'INVALID_AMOUNT: 退费金额必须大于零';
      end if;
      if nullif(trim(coalesce(p_payload->>'p_reason', '')), '') is null then
        raise exception 'INVALID_REASON: 退费原因不能为空';
      end if;
      perform 1 from public.stu_students where id = p_target_id and deleted_at is null;
      if not found then raise exception 'STUDENT_NOT_FOUND: 学员不存在'; end if;
      select balance into v_balance
        from public.fin_accounts
       where student_id = p_target_id
       for update;
      if not found then raise exception 'ACCOUNT_NOT_FOUND: 学员账户不存在'; end if;
      if v_balance < (p_payload->>'p_amount')::numeric then
        raise exception 'INSUFFICIENT_BALANCE: 退费金额超过当前余额';
      end if;

    when 'department_delete' then
      if (p_payload->>'p_id')::uuid is distinct from p_target_id then
        raise exception 'APPROVAL_TARGET_MISMATCH: 部门参数与审批目标不一致';
      end if;
      perform 1 from public.acct_departments where id = p_target_id;
      if not found then raise exception 'DEPT_NOT_FOUND: 部门不存在'; end if;
      if exists (select 1 from public.acct_departments where parent_id = p_target_id) then
        raise exception 'DEPT_HAS_CHILDREN: 请先移除子部门';
      end if;
      if exists (
        select 1 from public.acct_profiles
         where department_id = p_target_id and is_active = true
      ) then
        raise exception 'DEPT_HAS_MEMBERS: 请先移除部门成员';
      end if;

    when 'staff_deactivate' then
      if (p_payload->>'p_id')::uuid is distinct from p_target_id then
        raise exception 'APPROVAL_TARGET_MISMATCH: 员工参数与审批目标不一致';
      end if;
      select case when is_active then 'active' else 'inactive' end into v_status
        from public.acct_profiles where id = p_target_id;
      if not found then raise exception 'STAFF_NOT_FOUND: 员工不存在'; end if;
      if v_status is distinct from 'active' then raise exception 'STAFF_INACTIVE: 员工已经停用'; end if;

    else
      raise exception 'UNSUPPORTED_APPROVAL: 不支持的审批类型 %', p_type;
  end case;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'APPROVAL_PAYLOAD_INVALID: 审批参数缺失或格式错误';
end;
$$;

revoke all on function public.validate_approval_request(text, uuid, jsonb) from public;
revoke all on function public.validate_approval_request(text, uuid, jsonb) from authenticated;

drop index if exists public.aud_approvals_one_pending_target_idx;

with duplicates as (
  select id,
         row_number() over (
           partition by
             case
               when type in ('student_delete', 'finance_refund') then 'student'
               when type in ('course_archive', 'course_delete') then 'course'
               when type in ('enrollment_drop', 'enrollment_transfer') then 'enrollment'
               when type = 'department_delete' then 'department'
               when type = 'staff_deactivate' then 'staff'
               else type
             end,
             target_id
           order by created_at
         ) as position
    from public.aud_approvals
   where status = 'pending' and target_id is not null
)
update public.aud_approvals a
   set status = 'rejected',
       reviewer_note = '系统自动关闭：同一目标存在更早的待审批申请',
       reviewed_at = now(),
       execution_status = 'not_required',
       execution_result = jsonb_build_object('message', 'conflicting request closed automatically')
  from duplicates d
 where a.id = d.id and d.position > 1;

create unique index aud_approvals_one_pending_target_idx
  on public.aud_approvals (
    (case
      when type in ('student_delete', 'finance_refund') then 'student'
      when type in ('course_archive', 'course_delete') then 'course'
      when type in ('enrollment_drop', 'enrollment_transfer') then 'enrollment'
      when type = 'department_delete' then 'department'
      when type = 'staff_deactivate' then 'staff'
      else type
    end),
    target_id
  )
  where status = 'pending' and target_id is not null;

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
as $$
declare
  v_id uuid;
  v_scope text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'approval title is required'; end if;

  perform public.validate_approval_request(p_type, p_target_id, coalesce(p_payload, '{}'::jsonb));
  if p_type = 'finance_refund'
     and p_amount is distinct from (p_payload->>'p_amount')::numeric then
    raise exception 'APPROVAL_AMOUNT_MISMATCH: 展示金额与执行金额不一致';
  end if;

  v_scope := case
    when p_type in ('student_delete', 'finance_refund') then 'student'
    when p_type in ('course_archive', 'course_delete') then 'course'
    when p_type in ('enrollment_drop', 'enrollment_transfer') then 'enrollment'
    when p_type = 'department_delete' then 'department'
    when p_type = 'staff_deactivate' then 'staff'
    else p_type
  end;
  perform pg_advisory_xact_lock(hashtextextended(v_scope || ':' || p_target_id::text, 0));

  if exists (
    select 1 from public.aud_approvals
     where target_id = p_target_id
       and status = 'pending'
       and case
         when type in ('student_delete', 'finance_refund') then 'student'
         when type in ('course_archive', 'course_delete') then 'course'
         when type in ('enrollment_drop', 'enrollment_transfer') then 'enrollment'
         when type = 'department_delete' then 'department'
         when type = 'staff_deactivate' then 'staff'
         else type
       end = v_scope
  ) then
    raise exception 'APPROVAL_ALREADY_PENDING: 该对象已有待处理审批';
  end if;

  begin
    insert into public.aud_approvals (
      type, title, reason, target_id, target_label, amount, payload, requested_by
    ) values (
      p_type, p_title, nullif(trim(coalesce(p_reason, '')), ''), p_target_id,
      p_target_label, p_amount, coalesce(p_payload, '{}'::jsonb), auth.uid()
    ) returning id into v_id;
  exception when unique_violation then
    raise exception 'APPROVAL_ALREADY_PENDING: 该对象已有待处理审批';
  end;

  return v_id;
end;
$$;

grant execute on function public.rpc_create_approval_request(text, text, text, uuid, text, numeric, jsonb)
  to authenticated;

create or replace function public.rpc_review_approval(
  p_id uuid,
  p_status text,
  p_reviewer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_approval public.aud_approvals%rowtype;
  v_reviewer uuid := auth.uid();
  v_result jsonb;
begin
  if v_reviewer is null then raise exception 'login required'; end if;
  if public.get_my_role() <> 'admin' then raise exception 'only admin can review approvals'; end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'review status must be approved or rejected';
  end if;

  select * into v_approval
    from public.aud_approvals where id = p_id for update;
  if not found or v_approval.status <> 'pending' then
    raise exception 'pending approval not found';
  end if;

  if p_status = 'rejected' then
    update public.aud_approvals
       set status = 'rejected', reviewed_by = v_reviewer,
           reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
           reviewed_at = now(), execution_status = 'not_required',
           execution_error = null,
           execution_result = jsonb_build_object('message', 'request rejected'),
           executed_at = null
     where id = p_id;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  update public.aud_approvals
     set execution_status = 'running', execution_error = null, execution_result = null
   where id = p_id;

  begin
    perform public.validate_approval_request(v_approval.type, v_approval.target_id, v_approval.payload);
    if v_approval.type = 'finance_refund'
       and v_approval.amount is distinct from (v_approval.payload->>'p_amount')::numeric then
      raise exception 'APPROVAL_AMOUNT_MISMATCH: 展示金额与执行金额不一致';
    end if;

    case v_approval.type
      when 'finance_refund' then
        perform public.rpc_refund(
          p_student_id => (v_approval.payload->>'p_student_id')::uuid,
          p_amount => (v_approval.payload->>'p_amount')::numeric,
          p_reason => v_approval.payload->>'p_reason', p_operator_id => v_reviewer);
        v_result := jsonb_build_object('operation', 'rpc_refund');
      when 'enrollment_drop' then
        perform public.rpc_drop_enrollment(
          p_enrollment_id => (v_approval.payload->>'p_enrollment_id')::uuid,
          p_refund_remaining => coalesce((v_approval.payload->>'p_refund_remaining')::boolean, false),
          p_reason => v_approval.payload->>'p_reason', p_operator_id => v_reviewer);
        v_result := jsonb_build_object('operation', 'rpc_drop_enrollment');
      when 'enrollment_transfer' then
        perform public.rpc_transfer_enrollment(
          p_source_enrollment_id => (v_approval.payload->>'p_source_enrollment_id')::uuid,
          p_target_course_id => (v_approval.payload->>'p_target_course_id')::uuid,
          p_carry_lessons => (v_approval.payload->>'p_carry_lessons')::integer,
          p_reason => v_approval.payload->>'p_reason', p_operator_id => v_reviewer);
        v_result := jsonb_build_object('operation', 'rpc_transfer_enrollment');
      when 'department_delete' then
        perform public.rpc_delete_department((v_approval.payload->>'p_id')::uuid);
        v_result := jsonb_build_object('operation', 'rpc_delete_department');
      when 'staff_deactivate' then
        perform public.rpc_delete_staff((v_approval.payload->>'p_id')::uuid);
        v_result := jsonb_build_object('operation', 'rpc_delete_staff');
      when 'student_delete' then
        update public.stu_students set status = 'inactive'
         where id = (v_approval.payload->>'p_student_id')::uuid and status = 'active';
        if not found then raise exception 'STUDENT_INACTIVE: 学员已经停用'; end if;
        v_result := jsonb_build_object('operation', 'student_soft_delete', 'status', 'inactive');
      when 'course_archive' then
        update public.crs_courses set status = 'archived'
         where id = (v_approval.payload->>'p_course_id')::uuid and status <> 'archived';
        if not found then raise exception 'COURSE_ARCHIVED: 课程已经归档'; end if;
        v_result := jsonb_build_object('operation', 'course_archive', 'status', 'archived');
      when 'course_delete' then
        delete from public.crs_courses where id = (v_approval.payload->>'p_course_id')::uuid;
        if not found then raise exception 'COURSE_NOT_FOUND: 课程不存在'; end if;
        v_result := jsonb_build_object('operation', 'course_delete');
      else
        raise exception 'UNSUPPORTED_APPROVAL: 不支持的审批类型 %', v_approval.type;
    end case;

    update public.aud_approvals
       set status = 'approved', reviewed_by = v_reviewer,
           reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
           reviewed_at = now(), execution_status = 'succeeded', execution_error = null,
           execution_result = v_result, executed_at = now()
     where id = p_id;
    return jsonb_build_object('ok', true, 'status', 'approved', 'execution', v_result);
  exception when others then
    update public.aud_approvals
       set execution_status = 'failed', execution_error = sqlerrm,
           execution_result = jsonb_build_object('sqlstate', sqlstate),
           reviewed_by = v_reviewer,
           reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
           reviewed_at = now()
     where id = p_id;
    return jsonb_build_object('ok', false, 'status', 'pending', 'error', sqlerrm);
  end;
end;
$$;

grant execute on function public.rpc_review_approval(uuid, text, text) to authenticated;

do $$
declare
  v_approval public.aud_approvals%rowtype;
begin
  for v_approval in
    select * from public.aud_approvals where status = 'pending'
  loop
    begin
      perform public.validate_approval_request(v_approval.type, v_approval.target_id, v_approval.payload);
    exception when others then
      update public.aud_approvals
         set status = 'rejected', reviewer_note = '系统自动关闭：' || sqlerrm,
             reviewed_at = now(), execution_status = 'not_required',
             execution_error = null,
             execution_result = jsonb_build_object('message', 'stale request closed automatically')
       where id = v_approval.id;
    end;
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');
