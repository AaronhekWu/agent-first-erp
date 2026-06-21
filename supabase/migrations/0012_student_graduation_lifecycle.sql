-- 0012 - Student graduation and reactivation lifecycle.

alter table public.stu_students
  add column if not exists graduated_at date,
  add column if not exists graduation_note text,
  add column if not exists graduated_by uuid references public.acct_profiles(id),
  add column if not exists reactivated_at timestamptz,
  add column if not exists reactivation_note text,
  add column if not exists reactivated_by uuid references public.acct_profiles(id);

create or replace function public.guard_student_status_transition()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance numeric := 0;
  v_frozen numeric := 0;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'graduated' then
    if old.status <> 'active' then raise exception 'INVALID_STATUS: 只有在读学员可以办理毕业'; end if;
    if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权办理学员毕业'; end if;
    if new.graduated_at is null then raise exception 'GRADUATION_DATE_REQUIRED: 毕业日期必填'; end if;
    if new.graduated_at > current_date then raise exception 'INVALID_GRADUATION_DATE: 毕业日期不能晚于今天'; end if;
    if new.graduated_at < old.created_at::date then raise exception 'INVALID_GRADUATION_DATE: 毕业日期不能早于建档日期'; end if;
    if exists (select 1 from public.crs_enrollments where student_id = new.id and status = 'enrolled') then
      raise exception 'STUDENT_HAS_ENROLLMENTS: 请先完成全部在读课程的结课、退课或转课';
    end if;
    select coalesce(balance,0), coalesce(frozen_amount,0) into v_balance, v_frozen
      from public.fin_accounts where student_id = new.id;
    if v_balance <> 0 or v_frozen <> 0 then
      raise exception 'STUDENT_ACCOUNT_NOT_SETTLED: 请先结清账户余额和冻结金额';
    end if;
    if exists (select 1 from public.aud_approvals where target_id = new.id and status = 'pending') then
      raise exception 'STUDENT_HAS_PENDING_APPROVAL: 请先处理该学员的待审批事项';
    end if;
  elsif old.status = 'graduated' and new.status = 'active' then
    if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权恢复学员在读状态'; end if;
    if new.reactivated_at is null or nullif(trim(coalesce(new.reactivation_note,'')),'') is null then
      raise exception 'REACTIVATION_REASON_REQUIRED: 恢复在读必须填写原因';
    end if;
  elsif old.status = 'graduated' then
    raise exception 'INVALID_STATUS: 已毕业学员请先恢复在读状态';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_status_transition on public.stu_students;
create trigger trg_student_status_transition
before update of status on public.stu_students
for each row execute function public.guard_student_status_transition();

create or replace function public.rpc_graduate_student(
  p_student_id uuid,
  p_graduated_at date default current_date,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_operator uuid := auth.uid();
  v_student public.stu_students;
begin
  if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权办理学员毕业'; end if;
  update public.stu_students
     set status = 'graduated', graduated_at = p_graduated_at,
         graduation_note = nullif(trim(coalesce(p_note,'')),''), graduated_by = v_operator,
         reactivated_at = null, reactivation_note = null, reactivated_by = null, updated_at = now()
   where id = p_student_id and deleted_at is null and status = 'active'
  returning * into v_student;
  if not found then raise exception 'INVALID_STATUS: 学员不存在或当前不是在读状态'; end if;
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(v_operator,'graduate_student','student',p_student_id,
    jsonb_build_object('name',v_student.name,'graduated_at',v_student.graduated_at,'note',v_student.graduation_note));
  return jsonb_build_object('message','毕业办理成功','student_id',p_student_id,'status','graduated','graduated_at',v_student.graduated_at);
end;
$$;

revoke all on function public.rpc_graduate_student(uuid,date,text) from public;
grant execute on function public.rpc_graduate_student(uuid,date,text) to authenticated;

create or replace function public.rpc_reactivate_student(
  p_student_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_operator uuid := auth.uid();
  v_student public.stu_students;
begin
  if not public.has_permission('students.graduate') then raise exception 'PERMISSION_DENIED: 无权恢复学员在读状态'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REACTIVATION_REASON_REQUIRED: 恢复在读必须填写原因'; end if;
  update public.stu_students
     set status = 'active', reactivated_at = now(), reactivation_note = trim(p_reason),
         reactivated_by = v_operator, updated_at = now()
   where id = p_student_id and deleted_at is null and status = 'graduated'
  returning * into v_student;
  if not found then raise exception 'INVALID_STATUS: 学员不存在或当前不是已毕业状态'; end if;
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(v_operator,'reactivate_student','student',p_student_id,
    jsonb_build_object('name',v_student.name,'reason',v_student.reactivation_note));
  return jsonb_build_object('message','已恢复在读','student_id',p_student_id,'status','active');
end;
$$;

revoke all on function public.rpc_reactivate_student(uuid,text) from public;
grant execute on function public.rpc_reactivate_student(uuid,text) to authenticated;

create or replace function public.guard_active_student_enrollment()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.stu_students where id = new.student_id and deleted_at is null and status = 'active') then
    raise exception 'STUDENT_NOT_ACTIVE: 只有在读学员可以报名课程';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_active_student_enrollment on public.crs_enrollments;
create trigger trg_active_student_enrollment
before insert on public.crs_enrollments
for each row execute function public.guard_active_student_enrollment();

create or replace function public.guard_active_student_recharge()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.fin_accounts a
    join public.stu_students s on s.id = a.student_id
    where a.id = new.account_id and s.deleted_at is null and s.status = 'active'
  ) then
    raise exception 'STUDENT_NOT_ACTIVE: 只有在读学员可以充值';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_active_student_recharge on public.fin_recharges;
create trigger trg_active_student_recharge
before insert on public.fin_recharges
for each row execute function public.guard_active_student_recharge();

notify pgrst,'reload schema';
