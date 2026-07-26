-- Enrich course progress markers with the attendance and lesson-consumption
-- details needed by the hover card in the course progress timeline.

create or replace function public.rpc_list_course_sessions(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.has_permission('courses.view') then
    raise exception 'PERMISSION_DENIED: 无权查看课程进度';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.class_date), '[]'::jsonb)
    into v_result
  from (
    with attendance_rows as (
      select
        a.id,
        a.class_date,
        a.status,
        s.name as student_name,
        coalesce(consumption.lesson_count, 0) as lesson_count,
        coalesce(consumption.amount, 0) as amount
      from public.crs_attendance a
      join public.crs_enrollments e on e.id = a.enrollment_id
      join public.stu_students s on s.id = e.student_id
      left join lateral (
        select
          coalesce(sum(log.lesson_count), 0) as lesson_count,
          coalesce(sum(log.amount), 0) as amount
        from public.fin_consumption_logs log
        where log.attendance_id = a.id
      ) consumption on true
      where e.course_id = p_course_id
    )
    select
      class_date,
      count(*)::integer as headcount,
      count(*) filter (where status in ('present', 'late'))::integer as attended,
      count(*) filter (where status = 'present')::integer as present,
      count(*) filter (where status = 'late')::integer as late,
      count(*) filter (where status = 'absent')::integer as absent,
      count(*) filter (where status = 'leave')::integer as leave,
      coalesce(sum(lesson_count), 0) as consumed_lessons,
      coalesce(sum(amount), 0) as consumed_amount,
      string_agg(student_name, '、' order by student_name)
        filter (where status in ('present', 'late')) as student_names
    from attendance_rows
    group by class_date
  ) t;

  return v_result;
end;
$function$;

grant execute on function public.rpc_list_course_sessions(uuid) to authenticated;
