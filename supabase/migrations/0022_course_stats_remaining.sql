-- 0022 — v_course_stats 增加在读剩余课时合计
--
-- 支撑「可结课」判定: 仅当 (a) 学期结束且所有在读学员课时消完, 或 (b) 在读学员清空
-- 时结课按钮才可用。新列 enrolled_remaining_lessons = 在读(enrolled)报名的 remaining_lessons 合计。
-- CREATE OR REPLACE VIEW 末尾追加列; 重设 security_invoker 保持 RLS 语义。

create or replace view public.v_course_stats as
 SELECT c.id AS course_id,
    c.name AS course_name,
    c.subject,
    c.level,
    c.status,
    c.max_capacity,
    c.fee,
    c.department_id,
    d.name AS department_name,
    COALESCE(es.total_enrolled, 0::bigint) AS total_enrolled,
    COALESCE(es.active_enrolled, 0::bigint) AS active_enrolled,
    COALESCE(es.completed_count, 0::bigint) AS completed_count,
    COALESCE(att.total_attendance, 0::bigint) AS total_attendance,
    COALESCE(att.present_count, 0::bigint) AS present_count,
        CASE
            WHEN COALESCE(att.total_attendance, 0::bigint) > 0 THEN round(att.present_count::numeric / att.total_attendance::numeric * 100::numeric, 1)
            ELSE 0::numeric
        END AS attendance_rate,
    COALESCE(rev.total_revenue, 0.00) AS total_revenue,
    c.start_date,
    c.end_date,
    c.created_at,
    COALESCE(att.completed_sessions, 0::bigint) AS completed_sessions,
    NULLIF(c.schedule_info ->> 'total_lessons'::text, ''::text)::integer AS total_lessons,
    COALESCE((c.schedule_info ->> 'is_archived'::text)::boolean, false) AS is_archived,
    COALESCE(es.enrolled_remaining_lessons, 0::bigint) AS enrolled_remaining_lessons
   FROM crs_courses c
     LEFT JOIN acct_departments d ON d.id = c.department_id
     LEFT JOIN LATERAL ( SELECT count(*) AS total_enrolled,
            count(*) FILTER (WHERE e.status::text = 'enrolled'::text) AS active_enrolled,
            count(*) FILTER (WHERE e.status::text = 'completed'::text) AS completed_count,
            COALESCE(sum(GREATEST(e.remaining_lessons, 0)) FILTER (WHERE e.status::text = 'enrolled'::text), 0)::bigint AS enrolled_remaining_lessons
           FROM crs_enrollments e
          WHERE e.course_id = c.id) es ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS total_attendance,
            count(*) FILTER (WHERE a.status::text = ANY (ARRAY['present'::text, 'late'::text])) AS present_count,
            count(DISTINCT a.class_date) AS completed_sessions
           FROM crs_attendance a
             JOIN crs_enrollments e ON e.id = a.enrollment_id
          WHERE e.course_id = c.id) att ON true
     LEFT JOIN LATERAL ( SELECT sum(cl.amount) AS total_revenue
           FROM fin_consumption_logs cl
             JOIN crs_enrollments e ON e.id = cl.enrollment_id
          WHERE e.course_id = c.id) rev ON true
  WHERE c.deleted_at IS NULL;

alter view public.v_course_stats set (security_invoker = true);
