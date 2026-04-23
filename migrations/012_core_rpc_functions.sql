-- Migration 012: 核心写操作 RPC 函数
--
-- 5 个原子写操作，全部使用 SECURITY DEFINER + SELECT FOR UPDATE 行锁 + 审计日志
--   1. rpc_create_student — 建学员 + 钱包初始化 + 审计
--   2. rpc_recharge — 行锁 + 余额更新 + 充值记录 + 流水 + 审计
--   3. rpc_enroll_student — 校验 + 防重复 + 关联价格 + 审计
--   4. rpc_refund — 余额校验 + 扣减 + 流水 + 审计
--   5. rpc_consume_lesson — 扣费 + 消课 + 更新剩余课时 + 审计
--
-- 错误格式: RAISE EXCEPTION 'error_code: 中文描述'
-- Date: 2026-04-15

BEGIN;

-- ============================================================
-- 1. rpc_create_student
--    创建学员 + 自动初始化财务账户 + 审计日志
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_student(
    p_name          VARCHAR,
    p_phone         VARCHAR     DEFAULT NULL,
    p_gender        VARCHAR     DEFAULT NULL,
    p_birth_date    DATE        DEFAULT NULL,
    p_email         VARCHAR     DEFAULT NULL,
    p_school        VARCHAR     DEFAULT NULL,
    p_grade         VARCHAR     DEFAULT NULL,
    p_source        VARCHAR     DEFAULT NULL,
    p_notes         TEXT        DEFAULT NULL,
    p_assigned_to   UUID        DEFAULT NULL,
    p_department_id UUID        DEFAULT NULL,
    p_operator_id   UUID        DEFAULT NULL,
    p_parent_name   VARCHAR     DEFAULT NULL,
    p_parent_phone  VARCHAR     DEFAULT NULL,
    p_parent_relation VARCHAR   DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator  UUID;
    v_student   stu_students;
    v_account   fin_accounts;
    v_parent    stu_parents;
    v_result    JSONB;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 校验必填字段
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: 学员姓名不能为空';
    END IF;

    -- 创建学员
    INSERT INTO stu_students (name, phone, gender, birth_date, email, school, grade,
                              source, notes, assigned_to, department_id, created_by)
    VALUES (trim(p_name), p_phone, p_gender, p_birth_date, p_email, p_school, p_grade,
            p_source, p_notes, p_assigned_to, p_department_id, v_operator)
    RETURNING * INTO v_student;

    -- 自动初始化财务账户
    INSERT INTO fin_accounts (student_id)
    VALUES (v_student.id)
    RETURNING * INTO v_account;

    -- 如果提供了家长信息，创建家长记录
    IF p_parent_name IS NOT NULL AND trim(p_parent_name) != '' THEN
        INSERT INTO stu_parents (student_id, name, phone, relationship, is_primary_contact)
        VALUES (v_student.id, trim(p_parent_name), p_parent_phone, p_parent_relation, true)
        RETURNING * INTO v_parent;
    END IF;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'create', 'student', v_student.id,
            jsonb_build_object(
                'name', v_student.name,
                'phone', v_student.phone,
                'source', v_student.source,
                'assigned_to', v_student.assigned_to,
                'department_id', v_student.department_id,
                'account_id', v_account.id
            ));

    -- 构建返回结果
    v_result := jsonb_build_object(
        'student_id', v_student.id,
        'name', v_student.name,
        'status', v_student.status,
        'account_id', v_account.id,
        'account_balance', v_account.balance
    );

    IF v_parent.id IS NOT NULL THEN
        v_result := v_result || jsonb_build_object(
            'parent_id', v_parent.id,
            'parent_name', v_parent.name
        );
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_create_student IS '创建学员（含钱包初始化和可选家长信息）';

-- ============================================================
-- 2. rpc_recharge
--    充值：行锁 + 余额更新 + 充值记录 + 交易流水 + 审计
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_recharge(
    p_student_id     UUID,
    p_amount         DECIMAL(12,2),
    p_payment_method VARCHAR,
    p_operator_id    UUID         DEFAULT NULL,
    p_campaign_id    UUID         DEFAULT NULL,
    p_bonus_amount   DECIMAL(12,2) DEFAULT 0.00,
    p_notes          TEXT         DEFAULT NULL,
    p_payment_ref    VARCHAR      DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator       UUID;
    v_account        fin_accounts;
    v_balance_before DECIMAL(12,2);
    v_total_credit   DECIMAL(12,2);
    v_balance_after  DECIMAL(12,2);
    v_recharge       fin_recharges;
    v_tx             fin_transactions;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 校验金额
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 充值金额必须大于零';
    END IF;

    IF p_bonus_amount < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 赠送金额不能为负数';
    END IF;

    -- 如果关联促销活动，校验活动有效性
    IF p_campaign_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM promo_campaigns
            WHERE id = p_campaign_id
              AND status = 'active'
              AND (end_date IS NULL OR end_date >= CURRENT_DATE)
              AND (max_usage IS NULL OR used_count < max_usage)
        ) THEN
            RAISE EXCEPTION 'CAMPAIGN_INVALID: 促销活动无效或已过期';
        END IF;

        -- 递增活动使用次数
        UPDATE promo_campaigns SET used_count = used_count + 1
        WHERE id = p_campaign_id;
    END IF;

    -- 获取账户并加行锁（防止并发修改余额）
    SELECT * INTO v_account
    FROM fin_accounts
    WHERE student_id = p_student_id
    FOR UPDATE;

    IF v_account.id IS NULL THEN
        -- 账户不存在，自动创建
        INSERT INTO fin_accounts (student_id)
        VALUES (p_student_id)
        RETURNING * INTO v_account;
    END IF;

    v_balance_before := v_account.balance;
    v_total_credit   := p_amount + p_bonus_amount;
    v_balance_after  := v_balance_before + v_total_credit;

    -- 更新账户余额和累计充值
    UPDATE fin_accounts SET
        balance         = v_balance_after,
        total_recharged = total_recharged + v_total_credit
    WHERE id = v_account.id;

    -- 创建充值记录
    INSERT INTO fin_recharges (account_id, amount, payment_method, payment_ref,
                               campaign_id, bonus_amount, notes, status, created_by)
    VALUES (v_account.id, p_amount, p_payment_method, p_payment_ref,
            p_campaign_id, p_bonus_amount, p_notes, 'completed', v_operator)
    RETURNING * INTO v_recharge;

    -- 写交易流水
    INSERT INTO fin_transactions (account_id, type, amount, balance_before, balance_after,
                                   reference_type, reference_id, description, created_by)
    VALUES (v_account.id, 'recharge', v_total_credit, v_balance_before, v_balance_after,
            'recharge', v_recharge.id,
            '充值 ' || p_amount || CASE WHEN p_bonus_amount > 0 THEN '（赠送 ' || p_bonus_amount || '）' ELSE '' END,
            v_operator)
    RETURNING * INTO v_tx;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'recharge', 'finance_account', v_account.id,
            jsonb_build_object(
                'student_id', p_student_id,
                'amount', p_amount,
                'bonus_amount', p_bonus_amount,
                'payment_method', p_payment_method,
                'balance_before', v_balance_before,
                'balance_after', v_balance_after,
                'recharge_id', v_recharge.id,
                'transaction_id', v_tx.id
            ));

    RETURN jsonb_build_object(
        'recharge_id', v_recharge.id,
        'transaction_id', v_tx.id,
        'account_id', v_account.id,
        'amount', p_amount,
        'bonus_amount', p_bonus_amount,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_recharge IS '充值（含行锁、活动校验、流水记录）';

-- ============================================================
-- 3. rpc_enroll_student
--    报名：校验 + 防重复 + 关联价格 + 审计
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_enroll_student(
    p_student_id    UUID,
    p_course_id     UUID,
    p_operator_id   UUID         DEFAULT NULL,
    p_price_id      UUID         DEFAULT NULL,
    p_campaign_id   UUID         DEFAULT NULL,
    p_notes         TEXT         DEFAULT NULL,
    p_source        VARCHAR      DEFAULT 'normal'
)
RETURNS JSONB AS $$
DECLARE
    v_operator    UUID;
    v_course      crs_courses;
    v_price       crs_course_prices;
    v_enrollment  crs_enrollments;
    v_unit_price  DECIMAL(10,2);
    v_total_lessons INT;
    v_total_amount  DECIMAL(12,2);
    v_discount_amount DECIMAL(12,2) := 0.00;
    v_campaign    promo_campaigns;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 校验学员存在且未删除
    IF NOT EXISTS (
        SELECT 1 FROM stu_students WHERE id = p_student_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在或已删除';
    END IF;

    -- 校验课程存在且有效
    SELECT * INTO v_course
    FROM crs_courses
    WHERE id = p_course_id AND deleted_at IS NULL AND status = 'active';

    IF v_course.id IS NULL THEN
        RAISE EXCEPTION 'COURSE_NOT_FOUND: 课程不存在或已停用';
    END IF;

    -- 防重复报名（同一学员同一课程只能有一个 enrolled 状态）
    IF EXISTS (
        SELECT 1 FROM crs_enrollments
        WHERE student_id = p_student_id
          AND course_id = p_course_id
          AND status = 'enrolled'
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_ENROLLMENT: 该学员已报名此课程';
    END IF;

    -- 检查课程容量
    IF v_course.max_capacity IS NOT NULL THEN
        IF (SELECT count(*) FROM crs_enrollments
            WHERE course_id = p_course_id AND status = 'enrolled') >= v_course.max_capacity THEN
            RAISE EXCEPTION 'COURSE_FULL: 课程已满';
        END IF;
    END IF;

    -- 获取价格方案
    IF p_price_id IS NOT NULL THEN
        SELECT * INTO v_price
        FROM crs_course_prices
        WHERE id = p_price_id AND course_id = p_course_id AND status = 'active';
    ELSE
        -- 使用默认价格
        SELECT * INTO v_price
        FROM crs_course_prices
        WHERE course_id = p_course_id AND is_default = true AND status = 'active'
        LIMIT 1;
    END IF;

    -- 计算价格信息
    IF v_price.id IS NOT NULL THEN
        v_unit_price    := v_price.unit_price;
        v_total_lessons := v_price.total_lessons;
        v_total_amount  := COALESCE(v_price.total_price, v_price.unit_price * COALESCE(v_price.total_lessons, 1));
    ELSE
        -- 无价格方案，使用课程默认费用
        v_unit_price    := COALESCE(v_course.fee, 0.00);
        v_total_lessons := NULL;
        v_total_amount  := v_unit_price;
    END IF;

    -- 如果关联促销活动，计算折扣
    IF p_campaign_id IS NOT NULL THEN
        SELECT * INTO v_campaign
        FROM promo_campaigns
        WHERE id = p_campaign_id
          AND status = 'active'
          AND (end_date IS NULL OR end_date >= CURRENT_DATE)
          AND (max_usage IS NULL OR used_count < max_usage);

        IF v_campaign.id IS NOT NULL THEN
            IF v_campaign.discount_type = 'percentage' AND v_campaign.discount_value IS NOT NULL THEN
                v_discount_amount := v_total_amount * v_campaign.discount_value / 100;
            ELSIF v_campaign.discount_type = 'fixed' AND v_campaign.discount_value IS NOT NULL THEN
                v_discount_amount := LEAST(v_campaign.discount_value, v_total_amount);
            END IF;

            -- 赠送课时
            IF v_campaign.gift_lessons > 0 AND v_total_lessons IS NOT NULL THEN
                v_total_lessons := v_total_lessons + v_campaign.gift_lessons;
            END IF;

            -- 递增活动使用次数
            UPDATE promo_campaigns SET used_count = used_count + 1
            WHERE id = p_campaign_id;
        END IF;
    END IF;

    -- 创建报名记录
    INSERT INTO crs_enrollments (
        student_id, course_id, status, notes, created_by,
        price_id, campaign_id, unit_price, total_lessons,
        remaining_lessons, total_amount, paid_amount,
        discount_amount, source
    )
    VALUES (
        p_student_id, p_course_id, 'enrolled', p_notes, v_operator,
        v_price.id, p_campaign_id, v_unit_price, v_total_lessons,
        v_total_lessons, v_total_amount - v_discount_amount, v_total_amount - v_discount_amount,
        v_discount_amount, p_source
    )
    RETURNING * INTO v_enrollment;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'enroll', 'enrollment', v_enrollment.id,
            jsonb_build_object(
                'student_id', p_student_id,
                'course_id', p_course_id,
                'course_name', v_course.name,
                'unit_price', v_unit_price,
                'total_lessons', v_total_lessons,
                'total_amount', v_total_amount,
                'discount_amount', v_discount_amount,
                'campaign_id', p_campaign_id,
                'source', p_source
            ));

    RETURN jsonb_build_object(
        'enrollment_id', v_enrollment.id,
        'student_id', p_student_id,
        'course_id', p_course_id,
        'course_name', v_course.name,
        'unit_price', v_unit_price,
        'total_lessons', v_total_lessons,
        'remaining_lessons', v_total_lessons,
        'total_amount', v_total_amount - v_discount_amount,
        'discount_amount', v_discount_amount,
        'status', 'enrolled'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_enroll_student IS '学员报名（含价格校验、防重复、促销折扣）';

-- ============================================================
-- 4. rpc_refund
--    退费：余额校验 + 行锁扣减 + 交易流水 + 审计
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_refund(
    p_student_id  UUID,
    p_amount      DECIMAL(12,2),
    p_reason      TEXT,
    p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator       UUID;
    v_account        fin_accounts;
    v_balance_before DECIMAL(12,2);
    v_balance_after  DECIMAL(12,2);
    v_tx             fin_transactions;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 校验金额
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 退费金额必须大于零';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: 退费原因不能为空';
    END IF;

    -- 获取账户并加行锁
    SELECT * INTO v_account
    FROM fin_accounts
    WHERE student_id = p_student_id
    FOR UPDATE;

    IF v_account.id IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: 学员账户不存在';
    END IF;

    v_balance_before := v_account.balance;

    -- 余额校验
    IF p_amount > v_balance_before THEN
        RAISE EXCEPTION 'INSUFFICIENT_BALANCE: 退费金额 % 超过账户余额 %',
            p_amount, v_balance_before;
    END IF;

    v_balance_after := v_balance_before - p_amount;

    -- 更新账户余额和累计退费
    UPDATE fin_accounts SET
        balance        = v_balance_after,
        total_refunded = total_refunded + p_amount
    WHERE id = v_account.id;

    -- 写交易流水
    INSERT INTO fin_transactions (account_id, type, amount, balance_before, balance_after,
                                   description, created_by)
    VALUES (v_account.id, 'refund', p_amount, v_balance_before, v_balance_after,
            '退费：' || p_reason, v_operator)
    RETURNING * INTO v_tx;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'refund', 'finance_account', v_account.id,
            jsonb_build_object(
                'student_id', p_student_id,
                'amount', p_amount,
                'reason', p_reason,
                'balance_before', v_balance_before,
                'balance_after', v_balance_after,
                'transaction_id', v_tx.id
            ));

    RETURN jsonb_build_object(
        'transaction_id', v_tx.id,
        'account_id', v_account.id,
        'amount', p_amount,
        'reason', p_reason,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_refund IS '退费（含余额校验、行锁、流水记录）';

-- ============================================================
-- 5. rpc_consume_lesson
--    课消：行锁 + 扣费 + 消课记录 + 更新剩余课时 + 流水 + 审计
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_consume_lesson(
    p_enrollment_id  UUID,
    p_operator_id    UUID         DEFAULT NULL,
    p_attendance_id  UUID         DEFAULT NULL,
    p_lesson_count   INT          DEFAULT 1,
    p_unit_price     DECIMAL(10,2) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_operator       UUID;
    v_enrollment     crs_enrollments;
    v_account        fin_accounts;
    v_actual_price   DECIMAL(10,2);
    v_consume_amount DECIMAL(12,2);
    v_balance_before DECIMAL(12,2);
    v_balance_after  DECIMAL(12,2);
    v_consumption    fin_consumption_logs;
    v_tx             fin_transactions;
BEGIN
    v_operator := COALESCE(p_operator_id, auth.uid());

    -- 校验课时数
    IF p_lesson_count <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: 消课数量必须大于零';
    END IF;

    -- 获取报名记录
    SELECT * INTO v_enrollment
    FROM crs_enrollments
    WHERE id = p_enrollment_id AND status = 'enrolled';

    IF v_enrollment.id IS NULL THEN
        RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND: 报名记录不存在或状态无效';
    END IF;

    -- 检查剩余课时
    IF v_enrollment.remaining_lessons IS NOT NULL AND p_lesson_count > v_enrollment.remaining_lessons THEN
        RAISE EXCEPTION 'INSUFFICIENT_LESSONS: 剩余课时不足，当前剩余 % 课时',
            v_enrollment.remaining_lessons;
    END IF;

    -- 确定单价（优先使用传入值，否则使用报名时的单价）
    v_actual_price := COALESCE(p_unit_price, v_enrollment.unit_price, 0.00);
    v_consume_amount := v_actual_price * p_lesson_count;

    -- 获取学员财务账户并加行锁
    SELECT * INTO v_account
    FROM fin_accounts
    WHERE student_id = v_enrollment.student_id
    FOR UPDATE;

    IF v_account.id IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: 学员财务账户不存在';
    END IF;

    v_balance_before := v_account.balance;
    v_balance_after  := v_balance_before - v_consume_amount;

    -- 更新账户余额和累计消费
    UPDATE fin_accounts SET
        balance        = v_balance_after,
        total_consumed = total_consumed + v_consume_amount
    WHERE id = v_account.id;

    -- 更新报名记录的已消耗/剩余课时
    UPDATE crs_enrollments SET
        consumed_lessons  = consumed_lessons + p_lesson_count,
        remaining_lessons = CASE
            WHEN remaining_lessons IS NOT NULL THEN remaining_lessons - p_lesson_count
            ELSE NULL
        END
    WHERE id = p_enrollment_id;

    -- 如果课时消耗完毕，自动标记为已完成
    IF v_enrollment.remaining_lessons IS NOT NULL
       AND (v_enrollment.remaining_lessons - p_lesson_count) <= 0 THEN
        UPDATE crs_enrollments SET
            status = 'completed',
            completed_at = now()
        WHERE id = p_enrollment_id;
    END IF;

    -- 创建课消记录
    INSERT INTO fin_consumption_logs (enrollment_id, attendance_id, lesson_count,
                                      unit_price, amount, type, created_by)
    VALUES (p_enrollment_id, p_attendance_id, p_lesson_count,
            v_actual_price, v_consume_amount, 'normal', v_operator)
    RETURNING * INTO v_consumption;

    -- 写交易流水
    INSERT INTO fin_transactions (account_id, type, amount, balance_before, balance_after,
                                   reference_type, reference_id, description, created_by)
    VALUES (v_account.id, 'consume', v_consume_amount, v_balance_before, v_balance_after,
            'consumption_log', v_consumption.id,
            '课消 ' || p_lesson_count || ' 课时，单价 ' || v_actual_price,
            v_operator)
    RETURNING * INTO v_tx;

    -- 审计日志
    INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
    VALUES (v_operator, 'consume', 'finance_account', v_account.id,
            jsonb_build_object(
                'enrollment_id', p_enrollment_id,
                'student_id', v_enrollment.student_id,
                'lesson_count', p_lesson_count,
                'unit_price', v_actual_price,
                'amount', v_consume_amount,
                'balance_before', v_balance_before,
                'balance_after', v_balance_after,
                'consumption_log_id', v_consumption.id,
                'transaction_id', v_tx.id
            ));

    RETURN jsonb_build_object(
        'consumption_log_id', v_consumption.id,
        'transaction_id', v_tx.id,
        'enrollment_id', p_enrollment_id,
        'lesson_count', p_lesson_count,
        'unit_price', v_actual_price,
        'amount', v_consume_amount,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after,
        'remaining_lessons', CASE
            WHEN v_enrollment.remaining_lessons IS NOT NULL
            THEN v_enrollment.remaining_lessons - p_lesson_count
            ELSE NULL
        END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_consume_lesson IS '课消（含行锁、课时校验、自动完课、流水记录）';

COMMIT;
