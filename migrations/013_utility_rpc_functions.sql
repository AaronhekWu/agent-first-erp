-- Migration 013: 辅助 RPC 函数
--
-- 辅助写操作和搜索函数：
--   1. search_students_by_name — pg_trgm 模糊搜索
--   2. rpc_create_followup — 创建跟进记录 + 审计
--   3. rpc_mark_attendance — 考勤 + 可选触发课消
--   4. rpc_transfer_counselor — 转移顾问 + 审计
--   5. rpc_update_student — 更新学员 + 审计
--   6. rpc_create_course — 创建课程 + 审计
--   7. rpc_create_campaign — 创建促销活动 + 审计
--   8. rpc_create_referral — 创建推荐记录
--   9. rpc_soft_delete_student — 软删除学员 + 审计
--
-- Date: 2026-04-15

BEGIN;

-- ============================================================
-- 1. search_students_by_name — pg_trgm 模糊搜索
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_students_by_name(
    p_query  VARCHAR,
    p_limit  INT DEFAULT 10
)
RETURNS TABLE (
    id            UUID,
    name          VARCHAR,
    phone         VARCHAR,
    status        VARCHAR,
    school        VARCHAR,
    grade         VARCHAR,
    assigned_to   UUID,
    department_id UUID,
    similarity    REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id, s.name, s.phone, s.status, s.school, s.grade,
        s.assigned_to, s.department_id,
        similarity(s.name, p_query) AS similarity
    FROM stu_students s
    WHERE s.deleted_at IS NULL
      AND (
          s.name % p_query           -- trigram 模糊匹配
          OR s.name ILIKE '%' || p_query || '%'  -- 包含匹配（兜底）
          OR s.phone ILIKE '%' || p_query || '%' -- 手机号搜索
      )
    ORDER BY similarity(s.name, p_query) DESC, s.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION search_students_by_name IS '模糊搜索学员（pg_trgm + 手机号）';

-- ============================================================
-- 2. rpc_create_followup — 创建跟进记录
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_followup(
    p_student_id  UUID,
    p_type        VARCHAR,
    p_content     TEXT,
    p_result      VARCHAR      DEFAULT NULL,
    p_next_plan   TEXT         DEFAULT NULL,
    p_next_date   TIMESTAMPTZ  DEFAULT NULL,
    p_operator_id UUID         DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator UUID;
    v_record   flup_records;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 校验学员存在
    IF NOT EXISTS (
        SELECT 1 FROM stu_students WHERE id = p_student_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在或已删除';
    END IF;

    -- 校验跟进方式
    IF p_type NOT IN ('phone', 'wechat', 'visit', 'other') THEN
        RAISE EXCEPTION 'INVALID_INPUT: 跟进方式必须为 phone/wechat/visit/other';
    END IF;

    IF p_content IS NULL OR trim(p_content) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: 跟进内容不能为空';
    END IF;

    -- 创建跟进记录
    INSERT INTO flup_records (student_id, type, content, result, next_plan, next_date, created_by)
    VALUES (p_student_id, p_type, trim(p_content), p_result, p_next_plan, p_next_date, v_operator)
    RETURNING * INTO v_record;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'create', 'followup', v_record.id,
            jsonb_build_object(
                'student_id', p_student_id,
                'type', p_type,
                'content', left(p_content, 200),
                'next_date', p_next_date
            ));

    RETURN jsonb_build_object(
        'followup_id', v_record.id,
        'student_id', p_student_id,
        'type', v_record.type,
        'next_date', v_record.next_date,
        'created_at', v_record.created_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_create_followup IS '创建跟进记录（含校验和审计）';

-- ============================================================
-- 3. rpc_mark_attendance — 考勤 + 可选触发课消
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_mark_attendance(
    p_enrollment_id  UUID,
    p_class_date     DATE,
    p_status         VARCHAR,
    p_operator_id    UUID    DEFAULT NULL,
    p_trigger_consume BOOLEAN DEFAULT false,
    p_notes          TEXT    DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator   UUID;
    v_enrollment crs_enrollments;
    v_attendance crs_attendance;
    v_consume_result JSONB;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 校验状态
    IF p_status NOT IN ('present', 'absent', 'late', 'leave') THEN
        RAISE EXCEPTION 'INVALID_INPUT: 考勤状态必须为 present/absent/late/leave';
    END IF;

    -- 校验报名记录
    SELECT * INTO v_enrollment
    FROM crs_enrollments
    WHERE id = p_enrollment_id AND status = 'enrolled';

    IF v_enrollment.id IS NULL THEN
        RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND: 报名记录不存在或状态无效';
    END IF;

    -- 防重复打卡（同一报名同一日期）
    IF EXISTS (
        SELECT 1 FROM crs_attendance
        WHERE enrollment_id = p_enrollment_id AND class_date = p_class_date
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_ATTENDANCE: 该日期已有考勤记录';
    END IF;

    -- 创建考勤记录
    INSERT INTO crs_attendance (enrollment_id, class_date, status, notes, marked_by)
    VALUES (p_enrollment_id, p_class_date, p_status, p_notes, v_operator)
    RETURNING * INTO v_attendance;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'mark_attendance', 'attendance', v_attendance.id,
            jsonb_build_object(
                'enrollment_id', p_enrollment_id,
                'class_date', p_class_date,
                'status', p_status
            ));

    -- 如果出勤且要求触发课消
    IF p_trigger_consume AND p_status IN ('present', 'late') THEN
        v_consume_result := public.rpc_consume_lesson(
            p_enrollment_id := p_enrollment_id,
            p_operator_id   := v_operator,
            p_attendance_id := v_attendance.id,
            p_lesson_count  := 1
        );
    END IF;

    RETURN jsonb_build_object(
        'attendance_id', v_attendance.id,
        'enrollment_id', p_enrollment_id,
        'class_date', p_class_date,
        'status', p_status,
        'consume_triggered', p_trigger_consume AND p_status IN ('present', 'late'),
        'consume_result', v_consume_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_mark_attendance IS '考勤打卡（可选自动触发课消）';

-- ============================================================
-- 4. rpc_transfer_counselor — 转移顾问
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_transfer_counselor(
    p_student_id     UUID,
    p_new_counselor  UUID,
    p_operator_id    UUID DEFAULT NULL,
    p_reason         TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator   UUID;
    v_student    stu_students;
    v_old_counselor UUID;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 获取学员
    SELECT * INTO v_student
    FROM stu_students
    WHERE id = p_student_id AND deleted_at IS NULL;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在或已删除';
    END IF;

    -- 校验新顾问存在
    IF NOT EXISTS (SELECT 1 FROM acct_profiles WHERE id = p_new_counselor AND is_active = true) THEN
        RAISE EXCEPTION 'COUNSELOR_NOT_FOUND: 新顾问用户不存在或已停用';
    END IF;

    v_old_counselor := v_student.assigned_to;

    -- 更新顾问
    UPDATE stu_students SET assigned_to = p_new_counselor
    WHERE id = p_student_id;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'transfer_counselor', 'student', p_student_id,
            jsonb_build_object(
                'old_counselor', v_old_counselor,
                'new_counselor', p_new_counselor,
                'reason', p_reason
            ));

    RETURN jsonb_build_object(
        'student_id', p_student_id,
        'student_name', v_student.name,
        'old_counselor', v_old_counselor,
        'new_counselor', p_new_counselor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_transfer_counselor IS '转移学员顾问（含审计）';

-- ============================================================
-- 5. rpc_update_student — 更新学员信息
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_student(
    p_student_id    UUID,
    p_name          VARCHAR     DEFAULT NULL,
    p_phone         VARCHAR     DEFAULT NULL,
    p_gender        VARCHAR     DEFAULT NULL,
    p_birth_date    DATE        DEFAULT NULL,
    p_email         VARCHAR     DEFAULT NULL,
    p_school        VARCHAR     DEFAULT NULL,
    p_grade         VARCHAR     DEFAULT NULL,
    p_source        VARCHAR     DEFAULT NULL,
    p_notes         TEXT        DEFAULT NULL,
    p_status        VARCHAR     DEFAULT NULL,
    p_operator_id   UUID        DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator UUID;
    v_old      stu_students;
    v_changes  JSONB := '{}';
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 获取当前学员信息
    SELECT * INTO v_old
    FROM stu_students
    WHERE id = p_student_id AND deleted_at IS NULL;

    IF v_old.id IS NULL THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在或已删除';
    END IF;

    -- 按需更新各字段，记录变更
    IF p_name IS NOT NULL AND p_name != v_old.name THEN
        UPDATE stu_students SET name = trim(p_name) WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', v_old.name, 'new', p_name));
    END IF;

    IF p_phone IS NOT NULL THEN
        UPDATE stu_students SET phone = p_phone WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('phone', jsonb_build_object('old', v_old.phone, 'new', p_phone));
    END IF;

    IF p_gender IS NOT NULL THEN
        UPDATE stu_students SET gender = p_gender WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('gender', jsonb_build_object('old', v_old.gender, 'new', p_gender));
    END IF;

    IF p_birth_date IS NOT NULL THEN
        UPDATE stu_students SET birth_date = p_birth_date WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('birth_date', jsonb_build_object('old', v_old.birth_date, 'new', p_birth_date));
    END IF;

    IF p_email IS NOT NULL THEN
        UPDATE stu_students SET email = p_email WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('email', jsonb_build_object('old', v_old.email, 'new', p_email));
    END IF;

    IF p_school IS NOT NULL THEN
        UPDATE stu_students SET school = p_school WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('school', jsonb_build_object('old', v_old.school, 'new', p_school));
    END IF;

    IF p_grade IS NOT NULL THEN
        UPDATE stu_students SET grade = p_grade WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('grade', jsonb_build_object('old', v_old.grade, 'new', p_grade));
    END IF;

    IF p_source IS NOT NULL THEN
        UPDATE stu_students SET source = p_source WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('source', jsonb_build_object('old', v_old.source, 'new', p_source));
    END IF;

    IF p_notes IS NOT NULL THEN
        UPDATE stu_students SET notes = p_notes WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('notes', 'updated');
    END IF;

    IF p_status IS NOT NULL AND p_status IN ('active', 'inactive', 'graduated') THEN
        UPDATE stu_students SET status = p_status WHERE id = p_student_id;
        v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_status));
    END IF;

    -- 如果有变更，记录审计日志
    IF v_changes != '{}'::jsonb THEN
        INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
        VALUES (v_operator, 'update', 'student', p_student_id, v_changes);
    END IF;

    RETURN jsonb_build_object(
        'student_id', p_student_id,
        'changes', v_changes,
        'updated', v_changes != '{}'::jsonb
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_update_student IS '更新学员信息（含变更记录和审计）';

-- ============================================================
-- 6. rpc_create_course — 创建课程
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_course(
    p_name          VARCHAR,
    p_subject       VARCHAR      DEFAULT NULL,
    p_level         VARCHAR      DEFAULT NULL,
    p_description   TEXT         DEFAULT NULL,
    p_max_capacity  INT          DEFAULT NULL,
    p_fee           DECIMAL(10,2) DEFAULT NULL,
    p_start_date    DATE         DEFAULT NULL,
    p_end_date      DATE         DEFAULT NULL,
    p_schedule_info JSONB        DEFAULT '{}'::jsonb,
    p_department_id UUID         DEFAULT NULL,
    p_operator_id   UUID         DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator UUID;
    v_course   crs_courses;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: 课程名称不能为空';
    END IF;

    INSERT INTO crs_courses (name, subject, level, description, max_capacity, fee,
                              start_date, end_date, schedule_info, department_id, created_by)
    VALUES (trim(p_name), p_subject, p_level, p_description, p_max_capacity, p_fee,
            p_start_date, p_end_date, p_schedule_info, p_department_id, v_operator)
    RETURNING * INTO v_course;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'create', 'course', v_course.id,
            jsonb_build_object('name', v_course.name, 'subject', v_course.subject));

    RETURN jsonb_build_object(
        'course_id', v_course.id,
        'name', v_course.name,
        'subject', v_course.subject,
        'status', v_course.status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_create_course IS '创建课程（含审计）';

-- ============================================================
-- 7. rpc_create_campaign — 创建促销活动
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_campaign(
    p_name              VARCHAR,
    p_type              VARCHAR,
    p_description       TEXT             DEFAULT NULL,
    p_discount_type     VARCHAR          DEFAULT NULL,
    p_discount_value    DECIMAL(10,2)    DEFAULT NULL,
    p_gift_lessons      INT              DEFAULT 0,
    p_applicable_course_ids JSONB        DEFAULT '[]'::jsonb,
    p_start_date        DATE             DEFAULT NULL,
    p_end_date          DATE             DEFAULT NULL,
    p_max_usage         INT              DEFAULT NULL,
    p_rules             JSONB            DEFAULT '{}'::jsonb,
    p_operator_id       UUID             DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator UUID;
    v_campaign promo_campaigns;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: 活动名称不能为空';
    END IF;

    IF p_type IS NULL OR trim(p_type) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: 活动类型不能为空';
    END IF;

    INSERT INTO promo_campaigns (name, type, description, discount_type, discount_value,
                                  gift_lessons, applicable_course_ids, start_date, end_date,
                                  max_usage, rules, created_by)
    VALUES (trim(p_name), p_type, p_description, p_discount_type, p_discount_value,
            p_gift_lessons, p_applicable_course_ids, p_start_date, p_end_date,
            p_max_usage, p_rules, v_operator)
    RETURNING * INTO v_campaign;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'create', 'campaign', v_campaign.id,
            jsonb_build_object('name', v_campaign.name, 'type', v_campaign.type));

    RETURN jsonb_build_object(
        'campaign_id', v_campaign.id,
        'name', v_campaign.name,
        'type', v_campaign.type,
        'status', v_campaign.status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_create_campaign IS '创建促销活动（含审计）';

-- ============================================================
-- 8. rpc_create_referral — 创建推荐记录
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_referral(
    p_referrer_student_id UUID,
    p_referred_student_id UUID,
    p_campaign_id         UUID DEFAULT NULL,
    p_operator_id         UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator  UUID;
    v_campaign  promo_campaigns;
    v_referral  promo_referrals;
    v_data      JSONB := '{}';
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 校验推荐人和被推荐人存在
    IF NOT EXISTS (SELECT 1 FROM stu_students WHERE id = p_referrer_student_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 推荐人不存在';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM stu_students WHERE id = p_referred_student_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 被推荐人不存在';
    END IF;

    -- 不能自己推荐自己
    IF p_referrer_student_id = p_referred_student_id THEN
        RAISE EXCEPTION 'INVALID_INPUT: 不能自己推荐自己';
    END IF;

    -- 如果关联活动，获取奖励规则
    IF p_campaign_id IS NOT NULL THEN
        SELECT * INTO v_campaign
        FROM promo_campaigns
        WHERE id = p_campaign_id AND status = 'active';

        IF v_campaign.id IS NULL THEN
            RAISE EXCEPTION 'CAMPAIGN_INVALID: 促销活动不存在或已停用';
        END IF;
    END IF;

    INSERT INTO promo_referrals (
        campaign_id, referrer_student_id, referred_student_id, status,
        referrer_bonus_type, referrer_bonus_value,
        referred_bonus_type, referred_bonus_value
    )
    VALUES (
        p_campaign_id, p_referrer_student_id, p_referred_student_id, 'pending',
        v_campaign.rules ->> 'referrer_bonus_type',
        (v_campaign.rules ->> 'referrer_bonus_value')::DECIMAL,
        v_campaign.rules ->> 'referred_bonus_type',
        (v_campaign.rules ->> 'referred_bonus_value')::DECIMAL
    )
    RETURNING * INTO v_referral;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'create', 'referral', v_referral.id,
            jsonb_build_object(
                'referrer', p_referrer_student_id,
                'referred', p_referred_student_id,
                'campaign_id', p_campaign_id
            ));

    RETURN jsonb_build_object(
        'referral_id', v_referral.id,
        'referrer_student_id', p_referrer_student_id,
        'referred_student_id', p_referred_student_id,
        'status', v_referral.status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_create_referral IS '创建推荐记录（含活动奖励关联）';

-- ============================================================
-- 9. rpc_soft_delete_student — 软删除学员
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_soft_delete_student(
    p_student_id  UUID,
    p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator UUID;
    v_student  stu_students;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    SELECT * INTO v_student
    FROM stu_students
    WHERE id = p_student_id AND deleted_at IS NULL;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在或已删除';
    END IF;

    -- 检查是否有未完成的报名
    IF EXISTS (
        SELECT 1 FROM crs_enrollments
        WHERE student_id = p_student_id AND status = 'enrolled'
    ) THEN
        RAISE EXCEPTION 'HAS_ACTIVE_ENROLLMENTS: 学员存在未完成的课程报名，请先处理';
    END IF;

    -- 检查账户余额
    IF EXISTS (
        SELECT 1 FROM fin_accounts
        WHERE student_id = p_student_id AND balance > 0
    ) THEN
        RAISE EXCEPTION 'HAS_BALANCE: 学员账户存在余额，请先退费';
    END IF;

    -- 软删除
    UPDATE stu_students SET
        deleted_at = now(),
        status = 'inactive'
    WHERE id = p_student_id;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'delete', 'student', p_student_id,
            jsonb_build_object('name', v_student.name, 'phone', v_student.phone));

    RETURN jsonb_build_object(
        'student_id', p_student_id,
        'name', v_student.name,
        'deleted', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_soft_delete_student IS '软删除学员（含活跃检查和审计）';

COMMIT;
