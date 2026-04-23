-- Migration 014: 报表 Views + Report RPC 函数
--
-- Views:
--   1. v_student_overview — 学员总览（含余额、报名数、顾问）
--   2. v_revenue_summary — 按月/类型收入汇总
--   3. v_course_stats — 课程统计（报名数、出勤率、收入）
--   4. v_counselor_performance — 顾问业绩
--   5. v_pending_followups — 待跟进列表
--   6. v_student_retention — 学员留存率
--
-- Report RPCs:
--   1. rpc_get_dashboard_summary — 仪表盘概览数据
--   2. rpc_get_student_lifecycle — 学员全生命周期数据
--
-- Date: 2026-04-15

BEGIN;

-- ============================================================
-- 1. v_student_overview — 学员总览
-- ============================================================

CREATE OR REPLACE VIEW v_student_overview AS
SELECT
    s.id,
    s.name,
    s.phone,
    s.gender,
    s.status,
    s.school,
    s.grade,
    s.source,
    s.department_id,
    d.name AS department_name,
    s.assigned_to,
    p.display_name AS counselor_name,
    COALESCE(fa.balance, 0.00) AS balance,
    COALESCE(fa.total_recharged, 0.00) AS total_recharged,
    COALESCE(fa.total_consumed, 0.00) AS total_consumed,
    COALESCE(enroll_stats.enrollment_count, 0) AS enrollment_count,
    COALESCE(enroll_stats.active_enrollment_count, 0) AS active_enrollment_count,
    last_followup.last_followup_at,
    last_followup.last_followup_type,
    s.created_at,
    s.updated_at
FROM stu_students s
LEFT JOIN acct_departments d ON d.id = s.department_id
LEFT JOIN acct_profiles p ON p.id = s.assigned_to
LEFT JOIN fin_accounts fa ON fa.student_id = s.id
LEFT JOIN LATERAL (
    SELECT
        count(*) AS enrollment_count,
        count(*) FILTER (WHERE e.status = 'enrolled') AS active_enrollment_count
    FROM crs_enrollments e
    WHERE e.student_id = s.id
) enroll_stats ON true
LEFT JOIN LATERAL (
    SELECT
        f.created_at AS last_followup_at,
        f.type AS last_followup_type
    FROM flup_records f
    WHERE f.student_id = s.id
    ORDER BY f.created_at DESC
    LIMIT 1
) last_followup ON true
WHERE s.deleted_at IS NULL;

COMMENT ON VIEW v_student_overview IS '学员总览（含余额、报名统计、最近跟进）';

-- ============================================================
-- 2. v_revenue_summary — 按月收入汇总
-- ============================================================

CREATE OR REPLACE VIEW v_revenue_summary AS
SELECT
    date_trunc('month', t.created_at)::date AS month,
    t.type AS transaction_type,
    count(*) AS transaction_count,
    SUM(t.amount) AS total_amount
FROM fin_transactions t
GROUP BY date_trunc('month', t.created_at), t.type
ORDER BY month DESC, t.type;

COMMENT ON VIEW v_revenue_summary IS '按月/类型收入汇总';

-- ============================================================
-- 3. v_course_stats — 课程统计
-- ============================================================

CREATE OR REPLACE VIEW v_course_stats AS
SELECT
    c.id AS course_id,
    c.name AS course_name,
    c.subject,
    c.level,
    c.status,
    c.max_capacity,
    c.fee,
    c.department_id,
    d.name AS department_name,
    COALESCE(es.total_enrolled, 0) AS total_enrolled,
    COALESCE(es.active_enrolled, 0) AS active_enrolled,
    COALESCE(es.completed_count, 0) AS completed_count,
    COALESCE(att.total_attendance, 0) AS total_attendance,
    COALESCE(att.present_count, 0) AS present_count,
    CASE
        WHEN COALESCE(att.total_attendance, 0) > 0
        THEN ROUND(att.present_count::DECIMAL / att.total_attendance * 100, 1)
        ELSE 0
    END AS attendance_rate,
    COALESCE(rev.total_revenue, 0.00) AS total_revenue,
    c.start_date,
    c.end_date,
    c.created_at
FROM crs_courses c
LEFT JOIN acct_departments d ON d.id = c.department_id
LEFT JOIN LATERAL (
    SELECT
        count(*) AS total_enrolled,
        count(*) FILTER (WHERE e.status = 'enrolled') AS active_enrolled,
        count(*) FILTER (WHERE e.status = 'completed') AS completed_count
    FROM crs_enrollments e
    WHERE e.course_id = c.id
) es ON true
LEFT JOIN LATERAL (
    SELECT
        count(*) AS total_attendance,
        count(*) FILTER (WHERE a.status IN ('present', 'late')) AS present_count
    FROM crs_attendance a
    JOIN crs_enrollments e ON e.id = a.enrollment_id
    WHERE e.course_id = c.id
) att ON true
LEFT JOIN LATERAL (
    SELECT SUM(cl.amount) AS total_revenue
    FROM fin_consumption_logs cl
    JOIN crs_enrollments e ON e.id = cl.enrollment_id
    WHERE e.course_id = c.id
) rev ON true
WHERE c.deleted_at IS NULL;

COMMENT ON VIEW v_course_stats IS '课程统计（报名、出勤率、收入）';

-- ============================================================
-- 4. v_counselor_performance — 顾问业绩
-- ============================================================

CREATE OR REPLACE VIEW v_counselor_performance AS
SELECT
    p.id AS counselor_id,
    p.display_name AS counselor_name,
    COALESCE(stu.student_count, 0) AS student_count,
    COALESCE(stu.active_student_count, 0) AS active_student_count,
    COALESCE(flup.followup_count_30d, 0) AS followup_count_30d,
    COALESCE(enroll.enrollment_count_30d, 0) AS enrollment_count_30d,
    COALESCE(rev.recharge_amount_30d, 0.00) AS recharge_amount_30d,
    COALESCE(rev.recharge_count_30d, 0) AS recharge_count_30d
FROM acct_profiles p
JOIN acct_user_roles ur ON ur.user_id = p.id
JOIN acct_roles r ON r.id = ur.role_id AND r.name IN ('counselor', 'admin')
LEFT JOIN LATERAL (
    SELECT
        count(*) AS student_count,
        count(*) FILTER (WHERE s.status = 'active') AS active_student_count
    FROM stu_students s
    WHERE s.assigned_to = p.id AND s.deleted_at IS NULL
) stu ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS followup_count_30d
    FROM flup_records f
    WHERE f.created_by = p.id
      AND f.created_at >= now() - interval '30 days'
) flup ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS enrollment_count_30d
    FROM crs_enrollments e
    WHERE e.created_by = p.id
      AND e.created_at >= now() - interval '30 days'
) enroll ON true
LEFT JOIN LATERAL (
    SELECT
        SUM(r.amount) AS recharge_amount_30d,
        count(*) AS recharge_count_30d
    FROM fin_recharges r
    WHERE r.created_by = p.id
      AND r.created_at >= now() - interval '30 days'
      AND r.status = 'completed'
) rev ON true
WHERE p.is_active = true;

COMMENT ON VIEW v_counselor_performance IS '顾问业绩（学员数、跟进数、报名数、充值额）';

-- ============================================================
-- 5. v_pending_followups — 待跟进列表
-- ============================================================

CREATE OR REPLACE VIEW v_pending_followups AS
SELECT
    f.id AS followup_id,
    f.student_id,
    s.name AS student_name,
    s.phone AS student_phone,
    f.type AS last_followup_type,
    f.content AS last_followup_content,
    f.result AS last_followup_result,
    f.next_plan,
    f.next_date,
    f.created_by,
    p.display_name AS creator_name,
    f.created_at,
    CASE
        WHEN f.next_date < now() THEN 'overdue'
        WHEN f.next_date < now() + interval '1 day' THEN 'today'
        WHEN f.next_date < now() + interval '3 days' THEN 'upcoming'
        ELSE 'future'
    END AS urgency
FROM flup_records f
JOIN stu_students s ON s.id = f.student_id AND s.deleted_at IS NULL
LEFT JOIN acct_profiles p ON p.id = f.created_by
WHERE f.next_date IS NOT NULL
  AND f.is_reminded = false
ORDER BY f.next_date ASC;

COMMENT ON VIEW v_pending_followups IS '待跟进列表（按紧急程度排序）';

-- ============================================================
-- 6. v_student_retention — 学员留存统计
-- ============================================================

CREATE OR REPLACE VIEW v_student_retention AS
SELECT
    date_trunc('month', s.created_at)::date AS cohort_month,
    count(*) AS total_students,
    count(*) FILTER (WHERE s.status = 'active') AS still_active,
    count(*) FILTER (WHERE s.status = 'inactive' OR s.deleted_at IS NOT NULL) AS churned,
    count(*) FILTER (WHERE s.status = 'graduated') AS graduated,
    ROUND(
        count(*) FILTER (WHERE s.status = 'active')::DECIMAL / NULLIF(count(*), 0) * 100,
        1
    ) AS retention_rate,
    COALESCE(SUM(fa.total_recharged), 0.00) AS cohort_total_recharged,
    COALESCE(SUM(fa.total_consumed), 0.00) AS cohort_total_consumed
FROM stu_students s
LEFT JOIN fin_accounts fa ON fa.student_id = s.id
GROUP BY date_trunc('month', s.created_at)
ORDER BY cohort_month DESC;

COMMENT ON VIEW v_student_retention IS '学员留存率（按入学月份分组）';

-- ============================================================
-- 7. rpc_get_dashboard_summary — 仪表盘概览
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_dashboard_summary(
    p_date_from DATE DEFAULT (CURRENT_DATE - interval '30 days')::date,
    p_date_to   DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_total_students    INT;
    v_active_students   INT;
    v_new_students_period INT;
    v_total_revenue     DECIMAL(12,2);
    v_total_recharges   DECIMAL(12,2);
    v_total_consumption DECIMAL(12,2);
    v_total_refunds     DECIMAL(12,2);
    v_active_courses    INT;
    v_pending_followups INT;
    v_active_enrollments INT;
    v_monthly_revenue   JSONB;
BEGIN
    -- 学员统计
    SELECT count(*), count(*) FILTER (WHERE status = 'active')
    INTO v_total_students, v_active_students
    FROM stu_students WHERE deleted_at IS NULL;

    SELECT count(*) INTO v_new_students_period
    FROM stu_students
    WHERE deleted_at IS NULL
      AND created_at::date BETWEEN p_date_from AND p_date_to;

    -- 财务统计（期间内）
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'recharge'), 0.00),
        COALESCE(SUM(amount) FILTER (WHERE type = 'consume'), 0.00),
        COALESCE(SUM(amount) FILTER (WHERE type = 'refund'), 0.00)
    INTO v_total_recharges, v_total_consumption, v_total_refunds
    FROM fin_transactions
    WHERE created_at::date BETWEEN p_date_from AND p_date_to;

    v_total_revenue := v_total_recharges - v_total_refunds;

    -- 课程统计
    SELECT count(*) INTO v_active_courses
    FROM crs_courses WHERE deleted_at IS NULL AND status = 'active';

    -- 活跃报名
    SELECT count(*) INTO v_active_enrollments
    FROM crs_enrollments WHERE status = 'enrolled';

    -- 待跟进
    SELECT count(*) INTO v_pending_followups
    FROM flup_records
    WHERE next_date IS NOT NULL
      AND next_date <= now() + interval '3 days'
      AND is_reminded = false;

    -- 月度收入趋势（最近6个月）
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_monthly_revenue
    FROM (
        SELECT
            to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            SUM(amount) FILTER (WHERE type = 'recharge') AS recharge,
            SUM(amount) FILTER (WHERE type = 'consume') AS consume,
            SUM(amount) FILTER (WHERE type = 'refund') AS refund
        FROM fin_transactions
        WHERE created_at >= date_trunc('month', CURRENT_DATE) - interval '5 months'
        GROUP BY date_trunc('month', created_at)
        ORDER BY month
    ) t;

    RETURN jsonb_build_object(
        'period', jsonb_build_object('from', p_date_from, 'to', p_date_to),
        'students', jsonb_build_object(
            'total', v_total_students,
            'active', v_active_students,
            'new_in_period', v_new_students_period
        ),
        'finance', jsonb_build_object(
            'net_revenue', v_total_revenue,
            'recharges', v_total_recharges,
            'consumption', v_total_consumption,
            'refunds', v_total_refunds
        ),
        'courses', jsonb_build_object(
            'active', v_active_courses,
            'active_enrollments', v_active_enrollments
        ),
        'followups', jsonb_build_object(
            'pending', v_pending_followups
        ),
        'monthly_revenue', v_monthly_revenue
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_get_dashboard_summary IS '仪表盘概览（学员、财务、课程、跟进统计）';

-- ============================================================
-- 8. rpc_get_student_lifecycle — 学员全生命周期
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_student_lifecycle(
    p_student_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_student    JSONB;
    v_parents    JSONB;
    v_tags       JSONB;
    v_account    JSONB;
    v_enrollments JSONB;
    v_followups  JSONB;
    v_transactions JSONB;
BEGIN
    -- 学员基本信息
    SELECT to_jsonb(sub) INTO v_student
    FROM (
        SELECT s.*, d.name AS department_name, p.display_name AS counselor_name
        FROM stu_students s
        LEFT JOIN acct_departments d ON d.id = s.department_id
        LEFT JOIN acct_profiles p ON p.id = s.assigned_to
        WHERE s.id = p_student_id
    ) sub;

    IF v_student IS NULL THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在';
    END IF;

    -- 家长
    SELECT COALESCE(jsonb_agg(to_jsonb(sp)), '[]'::jsonb) INTO v_parents
    FROM stu_parents sp WHERE sp.student_id = p_student_id;

    -- 标签
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'category', t.category)), '[]'::jsonb)
    INTO v_tags
    FROM stu_student_tags st
    JOIN stu_tags t ON t.id = st.tag_id
    WHERE st.student_id = p_student_id;

    -- 财务账户
    SELECT to_jsonb(fa) INTO v_account
    FROM fin_accounts fa WHERE fa.student_id = p_student_id;

    -- 报名记录（含课程名称）
    SELECT COALESCE(jsonb_agg(row_to_json(sub) ORDER BY sub.enrolled_at DESC), '[]'::jsonb) INTO v_enrollments
    FROM (
        SELECT e.*, c.name AS course_name, c.subject
        FROM crs_enrollments e
        JOIN crs_courses c ON c.id = e.course_id
        WHERE e.student_id = p_student_id
    ) sub;

    -- 最近跟进记录
    SELECT COALESCE(jsonb_agg(row_to_json(sub) ORDER BY sub.created_at DESC), '[]'::jsonb) INTO v_followups
    FROM (
        SELECT f.*, p.display_name AS creator_name
        FROM flup_records f
        LEFT JOIN acct_profiles p ON p.id = f.created_by
        WHERE f.student_id = p_student_id
        LIMIT 20
    ) sub;

    -- 最近交易流水
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_transactions
    FROM (
        SELECT ft.*
        FROM fin_transactions ft
        JOIN fin_accounts fa ON fa.id = ft.account_id
        WHERE fa.student_id = p_student_id
        LIMIT 30
    ) t;

    RETURN jsonb_build_object(
        'student', v_student,
        'parents', v_parents,
        'tags', v_tags,
        'account', v_account,
        'enrollments', v_enrollments,
        'followups', v_followups,
        'transactions', v_transactions
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_get_student_lifecycle IS '学员全生命周期数据（基本信息、家长、标签、财务、报名、跟进、流水）';

COMMIT;
