-- 0008 - A student cannot be deactivated with active enrollments or funds

alter function public.validate_approval_request(text, uuid, jsonb)
  rename to validate_approval_request_base;

create function public.validate_approval_request(
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
  v_balance numeric;
begin
  perform public.validate_approval_request_base(p_type, p_target_id, p_payload);

  if p_type = 'student_delete' then
    if exists (
      select 1 from public.crs_enrollments
       where student_id = p_target_id and status = 'enrolled'
    ) then
      raise exception 'STUDENT_HAS_ENROLLMENTS: 请先完成退课或转课';
    end if;

    select balance into v_balance
      from public.fin_accounts
     where student_id = p_target_id
     for update;
    if found and v_balance <> 0 then
      raise exception 'STUDENT_HAS_BALANCE: 请先结清学员账户余额';
    end if;
  end if;
end;
$$;

revoke all on function public.validate_approval_request_base(text, uuid, jsonb) from public;
revoke all on function public.validate_approval_request_base(text, uuid, jsonb) from authenticated;
revoke all on function public.validate_approval_request(text, uuid, jsonb) from public;
revoke all on function public.validate_approval_request(text, uuid, jsonb) from authenticated;

create or replace function public.enforce_student_deactivation_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance numeric;
begin
  if new.status = 'inactive' and old.status is distinct from 'inactive' then
    if exists (
      select 1 from public.crs_enrollments
       where student_id = new.id and status = 'enrolled'
    ) then
      raise exception 'STUDENT_HAS_ENROLLMENTS: 请先完成退课或转课';
    end if;

    select balance into v_balance
      from public.fin_accounts
     where student_id = new.id;
    if found and v_balance <> 0 then
      raise exception 'STUDENT_HAS_BALANCE: 请先结清学员账户余额';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_deactivation_integrity on public.stu_students;
create trigger trg_student_deactivation_integrity
before update of status on public.stu_students
for each row execute function public.enforce_student_deactivation_integrity();

update public.stu_students s
   set status = 'active'
 where s.status = 'inactive'
   and exists (
     select 1 from public.aud_approvals a
      where a.type = 'student_delete'
        and a.target_id = s.id
        and a.status = 'approved'
   )
   and (
     exists (
       select 1 from public.crs_enrollments e
        where e.student_id = s.id and e.status = 'enrolled'
     )
     or exists (
       select 1 from public.fin_accounts f
        where f.student_id = s.id and f.balance <> 0
     )
   );

select pg_notify('pgrst', 'reload schema');
