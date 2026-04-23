-- Migration 016: MVP 上线前硬化补丁
--
-- 修复测试报告 (docs/test-report.md) 中发现的 P0 / P1 问题：
--   P0-1: 补 rpc_update_student 函数
--   P0-2: 枚举字段加 CHECK 约束，防止脏数据入库
--   P1-1: 写 RPC 前置校验学员存在，返回标准错误码
--   P1-2: handle_new_user trigger 用 email 前缀兜底 display_name
--   额外: fin_accounts.student_id 加 UNIQUE 约束
--
-- Date: 2026-04-21

BEGIN;

-- ============================================================
-- 1. P0-2 + 附加: 枚举字段 CHECK 约束
-- ============================================================

ALTER TABLE fin_recharges
  ADD CONSTRAINT chk_fin_recharges_payment_method
  CHECK (payment_method IN ('cash','wechat','alipay','bank_transfer','other'));

ALTER TABLE fin_transactions
  ADD CONSTRAINT chk_fin_transactions_type
  CHECK (type IN ('recharge','consume','refund','transfer_out','transfer_in','gift','adjustment'));

ALTER TABLE crs_attendance
  ADD CONSTRAINT chk_crs_attendance_status
  CHECK (status IN ('present','absent','late','leave'));

ALTER TABLE flup_records
  ADD CONSTRAINT chk_flup_records_type
  CHECK (type IN ('phone','wechat','visit','other'));

ALTER TABLE stu_students
  ADD CONSTRAINT chk_stu_students_status
  CHECK (status IS NULL OR status IN ('active','inactive','graduated'));

ALTER TABLE stu_students
  ADD CONSTRAINT chk_stu_students_gender
  CHECK (gender IS NULL OR gender IN ('male','female'));

ALTER TABLE crs_enrollments
  ADD CONSTRAINT chk_crs_enrollments_status
  CHECK (status IS NULL OR status IN ('enrolled','completed','cancelled','transferred'));

ALTER TABLE crs_courses
  ADD CONSTRAINT chk_crs_courses_status
  CHECK (status IS NULL OR status IN ('active','inactive','archived'));

-- ============================================================
-- 2. 附加: fin_accounts 唯一约束（防止并发下重复建账户）
-- ============================================================

ALTER TABLE fin_accounts
  ADD CONSTRAINT uq_fin_accounts_student_id UNIQUE (student_id);

-- ============================================================
-- 3. P0-1: rpc_update_student 函数
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_student(
    p_student_id    UUID,
    p_name          VARCHAR DEFAULT NULL,
    p_phone         VARCHAR DEFAULT NULL,
    p_gender        VARCHAR DEFAULT NULL,
    p_birth_date    DATE    DEFAULT NULL,
    p_email         VARCHAR DEFAULT NULL,
    p_school        VARCHAR DEFAULT NULL,
    p_grade         VARCHAR DEFAULT NULL,
    p_status        VARCHAR DEFAULT NULL,
    p_source        VARCHAR DEFAULT NULL,
    p_notes         TEXT    DEFAULT NULL,
    p_assigned_to   UUID    DEFAULT NULL,
    p_department_id UUID    DEFAULT NULL,
    p_operator_id   UUID    DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_old RECORD;
    v_op  UUID := COALESCE(p_operator_id, auth.uid());
    v_changes JSONB;
BEGIN
    SELECT * INTO v_old
    FROM stu_students
    WHERE id = p_student_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在';
    END IF;

    UPDATE stu_students SET
        name          = COALESCE(p_name, name),
        phone         = COALESCE(p_phone, phone),
        gender        = COALESCE(p_gender, gender),
        birth_date    = COALESCE(p_birth_date, birth_date),
        email         = COALESCE(p_email, email),
        school        = COALESCE(p_school, school),
        grade         = COALESCE(p_grade, grade),
        status        = COALESCE(p_status, status),
        source        = COALESCE(p_source, source),
        notes         = COALESCE(p_notes, notes),
        assigned_to   = COALESCE(p_assigned_to, assigned_to),
        department_id = COALESCE(p_department_id, department_id),
        updated_at    = now()
    WHERE id = p_student_id;

    v_changes := jsonb_build_object(
        'old', to_jsonb(v_old),
        'new_values', jsonb_strip_nulls(jsonb_build_object(
            'name', p_name, 'phone', p_phone, 'gender', p_gender,
            'birth_date', p_birth_date, 'email', p_email, 'school', p_school,
            'grade', p_grade, 'status', p_status, 'source', p_source,
            'notes', p_notes, 'assigned_to', p_assigned_to,
            'department_id', p_department_id
        ))
    );

    INSERT INTO aud_operation_logs(user_id, action, resource_type, resource_id, changes)
    VALUES (v_op, 'update_student', 'student', p_student_id, v_changes);

    RETURN jsonb_build_object(
        'message', '学员更新成功',
        'student_id', p_student_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION rpc_update_student IS '更新学员信息（仅更新非 NULL 字段）';

-- ============================================================
-- 4. P1-1: 写 RPC 增加学员存在性前置校验
--          避免抛 FK 23503 技术错误，统一走 STUDENT_NOT_FOUND
-- ============================================================

-- 4a. rpc_recharge: 开头校验
CREATE OR REPLACE FUNCTION public.rpc_recharge(
    p_student_id      UUID,
    p_amount          NUMERIC,
    p_payment_method  VARCHAR,
    p_operator_id     UUID    DEFAULT NULL,
    p_campaign_id     UUID    DEFAULT NULL,
    p_bonus_amount    NUMERIC DEFAULT 0.00,
    p_notes           TEXT    DEFAULT NULL,
    p_payment_ref     VARCHAR DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_account_id   UUID;
    v_balance      NUMERIC;
    v_recharge_id  UUID;
    v_txn_id       UUID;
    v_op           UUID := COALESCE(p_operator_id, auth.uid());
    v_total        NUMERIC := p_amount + COALESCE(p_bonus_amount, 0);
BEGIN
    -- 前置校验 (P1-1)
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 充值金额必须大于零';
    END IF;

    IF p_payment_method NOT IN ('cash','wechat','alipay','bank_transfer','other') THEN
        RAISE EXCEPTION 'INVALID_INPUT: 支付方式必须是 cash/wechat/alipay/bank_transfer/other';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM stu_students WHERE id = p_student_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在';
    END IF;

    -- 锁账户
    SELECT id, balance INTO v_account_id, v_balance
    FROM fin_accounts
    WHERE student_id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO fin_accounts(student_id, balance) VALUES (p_student_id, 0)
        RETURNING id, balance INTO v_account_id, v_balance;
    END IF;

    -- 写充值记录
    INSERT INTO fin_recharges(account_id, amount, payment_method, payment_ref,
                               campaign_id, bonus_amount, notes, created_by)
    VALUES (v_account_id, p_amount, p_payment_method, p_payment_ref,
            p_campaign_id, p_bonus_amount, p_notes, v_op)
    RETURNING id INTO v_recharge_id;

    -- 更新余额
    UPDATE fin_accounts SET
        balance = balance + v_total,
        total_recharged = total_recharged + p_amount,
        updated_at = now()
    WHERE id = v_account_id
    RETURNING balance INTO v_balance;

    -- 写流水
    INSERT INTO fin_transactions(account_id, type, amount, balance_before, balance_after,
                                  reference_type, reference_id, description, created_by)
    VALUES (v_account_id, 'recharge', v_total, v_balance - v_total, v_balance,
            'recharge', v_recharge_id,
            format('充值 %s', p_amount::TEXT) ||
              CASE WHEN COALESCE(p_bonus_amount,0)>0 THEN format(' + 赠送 %s', p_bonus_amount::TEXT) ELSE '' END,
            v_op)
    RETURNING id INTO v_txn_id;

    -- 审计
    INSERT INTO aud_operation_logs(user_id, action, resource_type, resource_id, changes)
    VALUES (v_op, 'recharge', 'account', v_account_id,
            jsonb_build_object('amount', p_amount, 'bonus', p_bonus_amount,
                               'payment_method', p_payment_method,
                               'new_balance', v_balance));

    RETURN jsonb_build_object(
        'message', '充值成功',
        'recharge_id', v_recharge_id,
        'transaction_id', v_txn_id,
        'new_balance', v_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4b. rpc_refund: 开头校验
CREATE OR REPLACE FUNCTION public.rpc_refund(
    p_student_id  UUID,
    p_amount      NUMERIC,
    p_reason      TEXT,
    p_operator_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_account_id UUID;
    v_balance    NUMERIC;
    v_txn_id     UUID;
    v_op         UUID := COALESCE(p_operator_id, auth.uid());
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: 退费金额必须大于零';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: 退费原因不能为空';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM stu_students WHERE id = p_student_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在';
    END IF;

    SELECT id, balance INTO v_account_id, v_balance
    FROM fin_accounts
    WHERE student_id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: 账户不存在';
    END IF;

    IF v_balance < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_BALANCE: 退费金额 % 超过账户余额 %', p_amount, v_balance;
    END IF;

    UPDATE fin_accounts SET
        balance = balance - p_amount,
        total_refunded = total_refunded + p_amount,
        updated_at = now()
    WHERE id = v_account_id
    RETURNING balance INTO v_balance;

    INSERT INTO fin_transactions(account_id, type, amount, balance_before, balance_after,
                                  description, created_by)
    VALUES (v_account_id, 'refund', p_amount, v_balance + p_amount, v_balance,
            format('退费：%s', p_reason), v_op)
    RETURNING id INTO v_txn_id;

    INSERT INTO aud_operation_logs(user_id, action, resource_type, resource_id, changes)
    VALUES (v_op, 'refund', 'account', v_account_id,
            jsonb_build_object('amount', p_amount, 'reason', p_reason, 'new_balance', v_balance));

    RETURN jsonb_build_object(
        'message', '退费成功',
        'transaction_id', v_txn_id,
        'new_balance', v_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4c. rpc_enroll_student: 开头校验（保留原先逻辑）
CREATE OR REPLACE FUNCTION public.rpc_enroll_student(
    p_student_id  UUID,
    p_course_id   UUID,
    p_operator_id UUID    DEFAULT NULL,
    p_price_id    UUID    DEFAULT NULL,
    p_campaign_id UUID    DEFAULT NULL,
    p_notes       TEXT    DEFAULT NULL,
    p_source      VARCHAR DEFAULT 'normal'
) RETURNS JSONB AS $$
DECLARE
    v_enrollment_id UUID;
    v_unit_price    NUMERIC;
    v_course_status VARCHAR;
    v_max_cap       INTEGER;
    v_enrolled_cnt  INTEGER;
    v_op            UUID := COALESCE(p_operator_id, auth.uid());
BEGIN
    IF NOT EXISTS (SELECT 1 FROM stu_students WHERE id = p_student_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在';
    END IF;

    SELECT status, max_capacity, fee
      INTO v_course_status, v_max_cap, v_unit_price
    FROM crs_courses
    WHERE id = p_course_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COURSE_NOT_FOUND: 课程不存在';
    END IF;

    IF v_course_status <> 'active' THEN
        RAISE EXCEPTION 'COURSE_INACTIVE: 课程当前状态为 %，不能报名', v_course_status;
    END IF;

    IF EXISTS (SELECT 1 FROM crs_enrollments
               WHERE student_id = p_student_id AND course_id = p_course_id
                 AND status IN ('enrolled','completed')) THEN
        RAISE EXCEPTION 'DUPLICATE_ENROLLMENT: 该学员已报名此课程';
    END IF;

    IF v_max_cap IS NOT NULL THEN
        SELECT count(*) INTO v_enrolled_cnt FROM crs_enrollments
          WHERE course_id = p_course_id AND status = 'enrolled';
        IF v_enrolled_cnt >= v_max_cap THEN
            RAISE EXCEPTION 'COURSE_FULL: 课程已满员';
        END IF;
    END IF;

    IF p_campaign_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM promo_campaigns
        WHERE id = p_campaign_id AND status = 'active'
          AND (start_date IS NULL OR start_date <= CURRENT_DATE)
          AND (end_date   IS NULL OR end_date   >= CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'CAMPAIGN_INVALID: 活动无效或已过期';
    END IF;

    INSERT INTO crs_enrollments(student_id, course_id, price_id, campaign_id,
                                 notes, source, unit_price, paid_amount,
                                 total_amount, created_by)
    VALUES (p_student_id, p_course_id, p_price_id, p_campaign_id,
            p_notes, p_source, v_unit_price, v_unit_price,
            v_unit_price, v_op)
    RETURNING id INTO v_enrollment_id;

    INSERT INTO aud_operation_logs(user_id, action, resource_type, resource_id, changes)
    VALUES (v_op, 'enroll_student', 'enrollment', v_enrollment_id,
            jsonb_build_object('student_id', p_student_id, 'course_id', p_course_id,
                               'unit_price', v_unit_price, 'source', p_source));

    RETURN jsonb_build_object(
        'message', '报名成功',
        'enrollment_id', v_enrollment_id,
        'unit_price', v_unit_price
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 5. P1-2: handle_new_user 改用 email 前缀兜底 display_name
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.acct_profiles (id, display_name)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
            NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
            split_part(NEW.email, '@', 1),
            '用户'
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 回填现存空 display_name
UPDATE acct_profiles p SET
    display_name = COALESCE(
        NULLIF(u.raw_user_meta_data->>'display_name', ''),
        NULLIF(u.raw_user_meta_data->>'full_name', ''),
        split_part(u.email, '@', 1),
        '用户'
    ),
    updated_at = now()
FROM auth.users u
WHERE p.id = u.id AND (p.display_name IS NULL OR p.display_name = '');

COMMIT;
