-- 0005 - Transactional approval review and execution

alter table public.aud_approvals
  add column if not exists execution_status text not null default 'not_started',
  add column if not exists execution_error text,
  add column if not exists execution_result jsonb,
  add column if not exists executed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.aud_approvals'::regclass
      and conname = 'aud_approvals_execution_status_check'
  ) then
    alter table public.aud_approvals
      add constraint aud_approvals_execution_status_check
      check (execution_status in ('not_started', 'running', 'succeeded', 'failed', 'not_required'));
  end if;
end;
$$;

drop function if exists public.rpc_review_approval(uuid, text, text);

create function public.rpc_review_approval(
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
  if v_reviewer is null then
    raise exception 'login required';
  end if;
  if public.get_my_role() <> 'admin' then
    raise exception 'only admin can review approvals';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'review status must be approved or rejected';
  end if;

  select *
    into v_approval
    from public.aud_approvals
   where id = p_id
   for update;

  if not found or v_approval.status <> 'pending' then
    raise exception 'pending approval not found';
  end if;

  if p_status = 'rejected' then
    update public.aud_approvals
       set status = 'rejected',
           reviewed_by = v_reviewer,
           reviewer_note = nullif(trim(coalesce(p_reviewer_note, '')), ''),
           reviewed_at = now(),
           execution_status = 'not_required',
           execution_error = null,
           execution_result = jsonb_build_object('message', 'request rejected'),
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
    case v_approval.type
      when 'finance_refund' then
        perform public.rpc_refund(
          p_student_id => (v_approval.payload->>'p_student_id')::uuid,
          p_amount => (v_approval.payload->>'p_amount')::numeric,
          p_reason => v_approval.payload->>'p_reason',
          p_operator_id => v_reviewer
        );
        v_result := jsonb_build_object('operation', 'rpc_refund');

      when 'enrollment_drop' then
        perform public.rpc_drop_enrollment(
          p_enrollment_id => (v_approval.payload->>'p_enrollment_id')::uuid,
          p_refund_remaining => coalesce((v_approval.payload->>'p_refund_remaining')::boolean, false),
          p_reason => v_approval.payload->>'p_reason',
          p_operator_id => v_reviewer
        );
        v_result := jsonb_build_object('operation', 'rpc_drop_enrollment');

      when 'enrollment_transfer' then
        perform public.rpc_transfer_enrollment(
          p_source_enrollment_id => (v_approval.payload->>'p_source_enrollment_id')::uuid,
          p_target_course_id => (v_approval.payload->>'p_target_course_id')::uuid,
          p_carry_lessons => (v_approval.payload->>'p_carry_lessons')::integer,
          p_reason => v_approval.payload->>'p_reason',
          p_operator_id => v_reviewer
        );
        v_result := jsonb_build_object('operation', 'rpc_transfer_enrollment');

      when 'department_delete' then
        perform public.rpc_delete_department((v_approval.payload->>'p_id')::uuid);
        v_result := jsonb_build_object('operation', 'rpc_delete_department');

      when 'staff_deactivate' then
        perform public.rpc_delete_staff((v_approval.payload->>'p_id')::uuid);
        v_result := jsonb_build_object('operation', 'rpc_delete_staff');

      when 'student_delete' then
        update public.stu_students
           set status = 'inactive'
         where id = (v_approval.payload->>'p_student_id')::uuid
           and status <> 'inactive';
        if not found then
          raise exception 'active student not found';
        end if;
        v_result := jsonb_build_object('operation', 'student_soft_delete', 'status', 'inactive');

      when 'course_archive' then
        update public.crs_courses
           set status = 'archived'
         where id = (v_approval.payload->>'p_course_id')::uuid
           and status <> 'archived';
        if not found then
          raise exception 'active course not found';
        end if;
        v_result := jsonb_build_object('operation', 'course_archive', 'status', 'archived');

      when 'course_delete' then
        if exists (
          select 1 from public.crs_enrollments
          where course_id = (v_approval.payload->>'p_course_id')::uuid
        ) then
          raise exception 'course has enrollment history; archive it instead';
        end if;
        delete from public.crs_courses
         where id = (v_approval.payload->>'p_course_id')::uuid;
        if not found then
          raise exception 'course not found';
        end if;
        v_result := jsonb_build_object('operation', 'course_delete');

      else
        raise exception 'unsupported approval type: %', v_approval.type;
    end case;

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

    return jsonb_build_object('ok', true, 'status', 'approved', 'execution', v_result);
  exception when others then
    update public.aud_approvals
       set execution_status = 'failed',
           execution_error = sqlerrm,
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
