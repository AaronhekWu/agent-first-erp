-- 0010 - Separate course completion from list archiving.

create or replace function public.rpc_set_completed_course_archived(
  p_course_id uuid,
  p_archived boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_operator uuid := auth.uid();
  v_course public.crs_courses;
begin
  if v_operator is null then raise exception 'login required'; end if;

  update public.crs_courses
     set schedule_info = coalesce(schedule_info, '{}'::jsonb)
         || jsonb_build_object('is_archived', p_archived),
         updated_at = now()
   where id = p_course_id
     and deleted_at is null
     and status = 'archived'
  returning * into v_course;

  if v_course.id is null then
    raise exception '只有已结课课程可以归档';
  end if;

  insert into public.aud_operation_logs (user_id, action, resource_type, resource_id, changes)
  values (
    v_operator,
    case when p_archived then 'archive_completed' else 'restore_completed' end,
    'course',
    v_course.id,
    jsonb_build_object('is_archived', p_archived)
  );

  return jsonb_build_object('course_id', v_course.id, 'is_archived', p_archived);
end;
$$;

grant execute on function public.rpc_set_completed_course_archived(uuid, boolean) to authenticated;

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
  nullif(c.schedule_info ->> 'total_lessons', '')::integer as total_lessons,
  coalesce((c.schedule_info ->> 'is_archived')::boolean, false) as is_archived
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
