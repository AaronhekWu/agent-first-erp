-- 0009 - Course lifecycle and lesson progress

create or replace function public.rpc_update_course_plan(
  p_course_id uuid,
  p_total_lessons integer,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_operator uuid := auth.uid();
  v_course public.crs_courses;
  v_completed_sessions bigint;
begin
  if v_operator is null then
    raise exception 'login required';
  end if;
  if p_total_lessons is null or p_total_lessons <= 0 then
    raise exception '计划课次必须大于 0';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception '结束日期不能早于开始日期';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_course_id::text, 0));
  select count(distinct a.class_date)
    into v_completed_sessions
    from public.crs_attendance a
    join public.crs_enrollments e on e.id = a.enrollment_id
   where e.course_id = p_course_id;
  if p_total_lessons < v_completed_sessions then
    raise exception '计划总课次不能少于已上课次（% 节）', v_completed_sessions;
  end if;

  update public.crs_courses
     set schedule_info = coalesce(schedule_info, '{}'::jsonb)
         || jsonb_build_object('total_lessons', p_total_lessons),
         start_date = p_start_date,
         end_date = p_end_date,
         updated_at = now()
   where id = p_course_id
     and deleted_at is null
     and status <> 'archived'
  returning * into v_course;

  if v_course.id is null then
    raise exception '课程不存在或已经结课';
  end if;

  insert into public.aud_operation_logs (user_id, action, resource_type, resource_id, changes)
  values (
    v_operator,
    'update_plan',
    'course',
    v_course.id,
    jsonb_build_object(
      'total_lessons', p_total_lessons,
      'start_date', p_start_date,
      'end_date', p_end_date
    )
  );

  return jsonb_build_object(
    'course_id', v_course.id,
    'total_lessons', p_total_lessons,
    'start_date', v_course.start_date,
    'end_date', v_course.end_date
  );
end;
$$;

grant execute on function public.rpc_update_course_plan(uuid, integer, date, date) to authenticated;

create or replace function public.guard_course_lesson_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_course_id uuid;
  v_total_lessons integer;
  v_completed_sessions bigint;
begin
  select e.course_id into v_course_id
    from public.crs_enrollments e
   where e.id = new.enrollment_id;
  if v_course_id is null then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_course_id::text, 0));
  select nullif(c.schedule_info ->> 'total_lessons', '')::integer
    into v_total_lessons
    from public.crs_courses c
   where c.id = v_course_id;
  if v_total_lessons is null then return new; end if;

  if exists (
    select 1
      from public.crs_attendance a
      join public.crs_enrollments e on e.id = a.enrollment_id
     where e.course_id = v_course_id and a.class_date = new.class_date
  ) then return new; end if;

  select count(distinct a.class_date)
    into v_completed_sessions
    from public.crs_attendance a
    join public.crs_enrollments e on e.id = a.enrollment_id
   where e.course_id = v_course_id;
  if v_completed_sessions >= v_total_lessons then
    raise exception '课程已完成计划的 % 节课，不能新增上课日期', v_total_lessons;
  end if;
  return new;
end;
$$;

drop trigger if exists crs_attendance_lesson_limit on public.crs_attendance;
create trigger crs_attendance_lesson_limit
before insert on public.crs_attendance
for each row execute function public.guard_course_lesson_limit();

with completed as (
  select e.course_id, count(distinct a.class_date)::integer as lesson_count
    from public.crs_attendance a
    join public.crs_enrollments e on e.id = a.enrollment_id
   group by e.course_id
)
update public.crs_courses c
   set schedule_info = coalesce(c.schedule_info, '{}'::jsonb)
       || jsonb_build_object('total_lessons', completed.lesson_count),
       updated_at = now()
  from completed
 where c.id = completed.course_id
   and nullif(c.schedule_info ->> 'total_lessons', '')::integer < completed.lesson_count;

create or replace function public.sync_course_completion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    update public.crs_enrollments
       set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
     where course_id = new.id and status = 'enrolled';
  end if;
  return new;
end;
$$;

drop trigger if exists crs_courses_sync_completion on public.crs_courses;
create trigger crs_courses_sync_completion
after update of status on public.crs_courses
for each row execute function public.sync_course_completion();

create or replace view public.v_course_stats
with (security_invoker = true)
as
select
  c.id as course_id,
  c.name as course_name,
  c.subject,
  c.level,
  c.status,
  c.max_capacity,
  c.fee,
  c.department_id,
  d.name as department_name,
  coalesce(es.total_enrolled, 0::bigint) as total_enrolled,
  coalesce(es.active_enrolled, 0::bigint) as active_enrolled,
  coalesce(es.completed_count, 0::bigint) as completed_count,
  coalesce(att.total_attendance, 0::bigint) as total_attendance,
  coalesce(att.present_count, 0::bigint) as present_count,
  case
    when coalesce(att.total_attendance, 0::bigint) > 0
      then round(att.present_count::numeric / att.total_attendance::numeric * 100::numeric, 1)
    else 0::numeric
  end as attendance_rate,
  coalesce(rev.total_revenue, 0.00) as total_revenue,
  c.start_date,
  c.end_date,
  c.created_at,
  coalesce(att.completed_sessions, 0::bigint) as completed_sessions,
  nullif(c.schedule_info ->> 'total_lessons', '')::integer as total_lessons
from public.crs_courses c
left join public.acct_departments d on d.id = c.department_id
left join lateral (
  select
    count(*) as total_enrolled,
    count(*) filter (where e.status::text = 'enrolled') as active_enrolled,
    count(*) filter (where e.status::text = 'completed') as completed_count
  from public.crs_enrollments e
  where e.course_id = c.id
) es on true
left join lateral (
  select
    count(*) as total_attendance,
    count(*) filter (where a.status::text = any (array['present', 'late'])) as present_count,
    count(distinct a.class_date) as completed_sessions
  from public.crs_attendance a
  join public.crs_enrollments e on e.id = a.enrollment_id
  where e.course_id = c.id
) att on true
left join lateral (
  select sum(cl.amount) as total_revenue
  from public.fin_consumption_logs cl
  join public.crs_enrollments e on e.id = cl.enrollment_id
  where e.course_id = c.id
) rev on true
where c.deleted_at is null;

notify pgrst, 'reload schema';
