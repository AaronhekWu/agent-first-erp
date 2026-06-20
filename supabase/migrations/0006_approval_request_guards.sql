-- 0006 - Prevent invalid and duplicate approval requests

with duplicates as (
  select id,
         row_number() over (
           partition by type, target_id
           order by created_at
         ) as position
    from public.aud_approvals
   where status = 'pending'
     and target_id is not null
)
update public.aud_approvals a
   set status = 'rejected',
       reviewer_note = '系统自动关闭：存在更早的同目标待审批申请',
       reviewed_at = now(),
       execution_status = 'not_required',
       execution_error = null,
       execution_result = jsonb_build_object('message', 'duplicate request closed automatically')
  from duplicates d
 where a.id = d.id
   and d.position > 1;

update public.aud_approvals a
   set status = 'rejected',
       reviewer_note = '系统自动关闭：目标学员已停用',
       reviewed_at = now(),
       execution_status = 'not_required',
       execution_error = null,
       execution_result = jsonb_build_object('message', 'stale request closed automatically')
 where a.type = 'student_delete'
   and a.status = 'pending'
   and not exists (
     select 1
       from public.stu_students s
      where s.id = a.target_id
        and s.status = 'active'
   );

create unique index if not exists aud_approvals_one_pending_target_idx
  on public.aud_approvals (type, target_id)
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
  v_target_status text;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
  if p_type not in (
    'student_delete',
    'course_archive',
    'course_delete',
    'enrollment_drop',
    'enrollment_transfer',
    'finance_refund',
    'department_delete',
    'staff_deactivate'
  ) then
    raise exception 'unsupported approval type: %', p_type;
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'approval title is required';
  end if;
  if p_target_id is null then
    raise exception 'approval target is required';
  end if;

  if p_type = 'student_delete' then
    select status into v_target_status
      from public.stu_students
     where id = p_target_id;

    if not found then
      raise exception 'student not found';
    end if;
    if v_target_status is distinct from 'active' then
      raise exception 'only active students can be submitted for deletion';
    end if;
  end if;

  if exists (
    select 1
      from public.aud_approvals
     where type = p_type
       and target_id = p_target_id
       and status = 'pending'
  ) then
    raise exception 'an approval for this target is already pending';
  end if;

  begin
    insert into public.aud_approvals (
      type, title, reason, target_id, target_label, amount, payload, requested_by
    )
    values (
      p_type,
      p_title,
      nullif(trim(coalesce(p_reason, '')), ''),
      p_target_id,
      p_target_label,
      p_amount,
      coalesce(p_payload, '{}'::jsonb),
      auth.uid()
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'an approval for this target is already pending';
  end;

  return v_id;
end;
$$;

grant execute on function public.rpc_create_approval_request(text, text, text, uuid, text, numeric, jsonb)
  to authenticated;
