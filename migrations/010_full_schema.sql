-- Migration 010: Full ERP Schema (Standalone)
--
-- This migration creates the complete Agent-First ERP schema from scratch.
-- It replaces all previous incremental migrations with a single consolidated DDL.
--
-- Tables (24 total):
--   Account:   acct_departments, acct_roles, acct_profiles, acct_user_roles, acct_user_departments
--   Student:   stu_tags, stu_students, stu_parents, stu_student_tags
--   Course:    crs_courses, crs_course_prices, crs_enrollments, crs_attendance
--   Followup:  flup_records
--   Finance:   fin_accounts, fin_transactions, fin_recharges, fin_consumption_logs, fin_transfers
--   Promo:     promo_campaigns, promo_referrals
--   AI:        ai_knowledge_docs, ai_embeddings
--   Audit:     aud_operation_logs, aud_agent_call_logs
--
-- Date: 2026-04-15

BEGIN;

-- ============================================================
-- 0. Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- vector extension is already installed; ensure it is available
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. Custom trigger function (replaces moddatetime)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Account module (acct_*)
-- ============================================================

-- 2a. Departments
CREATE TABLE acct_departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR NOT NULL,
    parent_id   UUID REFERENCES acct_departments(id),
    description TEXT,
    sort_order  INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  acct_departments             IS '部门';
COMMENT ON COLUMN acct_departments.name        IS '部门名称';
COMMENT ON COLUMN acct_departments.parent_id   IS '上级部门（自引用）';
COMMENT ON COLUMN acct_departments.sort_order  IS '排序权重';

-- 2b. Roles
CREATE TABLE acct_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  acct_roles              IS '角色';
COMMENT ON COLUMN acct_roles.name         IS '角色名称（唯一）';
COMMENT ON COLUMN acct_roles.permissions  IS '权限列表，JSON数组';

-- 2c. Profiles (linked to auth.users)
CREATE TABLE acct_profiles (
    id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR NOT NULL DEFAULT '',
    phone        VARCHAR,
    avatar_url   VARCHAR,
    is_active    BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  acct_profiles               IS '用户档案';
COMMENT ON COLUMN acct_profiles.id            IS '关联 auth.users 主键';
COMMENT ON COLUMN acct_profiles.display_name  IS '显示名称';
COMMENT ON COLUMN acct_profiles.is_active     IS '是否启用';

-- 2d. User-Role association
CREATE TABLE acct_user_roles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES acct_profiles(id),
    role_id    UUID NOT NULL REFERENCES acct_roles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, role_id)
);

COMMENT ON TABLE acct_user_roles IS '用户-角色关联';

-- 2e. User-Department association
CREATE TABLE acct_user_departments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES acct_profiles(id),
    department_id UUID NOT NULL REFERENCES acct_departments(id),
    is_head       BOOLEAN DEFAULT false,
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, department_id)
);

COMMENT ON TABLE  acct_user_departments          IS '用户-部门关联';
COMMENT ON COLUMN acct_user_departments.is_head  IS '是否为部门负责人';

-- ============================================================
-- 3. Student module (stu_*)
-- ============================================================

-- 3a. Tags
CREATE TABLE stu_tags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR NOT NULL UNIQUE,
    color      VARCHAR,
    category   VARCHAR,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  stu_tags          IS '学员标签';
COMMENT ON COLUMN stu_tags.name     IS '标签名称（唯一）';
COMMENT ON COLUMN stu_tags.color    IS '标签颜色（HEX）';
COMMENT ON COLUMN stu_tags.category IS '标签分类';

-- 3b. Students (soft-delete)
CREATE TABLE stu_students (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR NOT NULL,
    gender        VARCHAR,
    birth_date    DATE,
    phone         VARCHAR,
    email         VARCHAR,
    school        VARCHAR,
    grade         VARCHAR,
    status        VARCHAR DEFAULT 'active',
    source        VARCHAR,
    notes         TEXT,
    assigned_to   UUID REFERENCES acct_profiles(id),
    department_id UUID REFERENCES acct_departments(id),
    created_by    UUID REFERENCES acct_profiles(id),
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  stu_students              IS '学员';
COMMENT ON COLUMN stu_students.name         IS '学员姓名';
COMMENT ON COLUMN stu_students.status       IS '状态: active/inactive/graduated';
COMMENT ON COLUMN stu_students.source       IS '来源渠道';
COMMENT ON COLUMN stu_students.assigned_to  IS '负责人（课程顾问）';
COMMENT ON COLUMN stu_students.deleted_at   IS '软删除时间戳';

-- 3c. Parents
CREATE TABLE stu_parents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES stu_students(id),
    name               VARCHAR NOT NULL,
    relationship       VARCHAR,
    phone              VARCHAR,
    wechat_id          VARCHAR,
    is_primary_contact BOOLEAN DEFAULT false,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  stu_parents                     IS '家长/监护人';
COMMENT ON COLUMN stu_parents.relationship        IS '与学员关系';
COMMENT ON COLUMN stu_parents.is_primary_contact  IS '是否为主要联系人';

-- 3d. Student-Tag association
CREATE TABLE stu_student_tags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES stu_students(id),
    tag_id     UUID NOT NULL REFERENCES stu_tags(id),
    UNIQUE (student_id, tag_id)
);

COMMENT ON TABLE stu_student_tags IS '学员-标签关联';

-- ============================================================
-- 4. Course module (crs_*)
-- ============================================================

-- 4a. Courses (soft-delete)
CREATE TABLE crs_courses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR NOT NULL,
    description   TEXT,
    subject       VARCHAR,
    level         VARCHAR,
    max_capacity  INT,
    fee           DECIMAL(10,2),
    status        VARCHAR DEFAULT 'active',
    start_date    DATE,
    end_date      DATE,
    schedule_info JSONB DEFAULT '{}',
    department_id UUID REFERENCES acct_departments(id),
    created_by    UUID REFERENCES acct_profiles(id),
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  crs_courses               IS '课程';
COMMENT ON COLUMN crs_courses.name          IS '课程名称';
COMMENT ON COLUMN crs_courses.subject       IS '学科';
COMMENT ON COLUMN crs_courses.level         IS '难度等级';
COMMENT ON COLUMN crs_courses.fee           IS '默认课时费';
COMMENT ON COLUMN crs_courses.schedule_info IS '排课信息（JSON）';
COMMENT ON COLUMN crs_courses.deleted_at    IS '软删除时间戳';

-- 4b. Course prices
CREATE TABLE crs_course_prices (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id     UUID NOT NULL REFERENCES crs_courses(id),
    name          VARCHAR NOT NULL,
    price_type    VARCHAR NOT NULL DEFAULT 'per_lesson',
    unit_price    DECIMAL(10,2) NOT NULL,
    total_lessons INT,
    total_price   DECIMAL(10,2),
    discount_rate DECIMAL(5,4) DEFAULT 1.0000,
    is_default    BOOLEAN DEFAULT false,
    effective_from DATE,
    effective_to   DATE,
    status        VARCHAR DEFAULT 'active',
    created_by    UUID REFERENCES acct_profiles(id),
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  crs_course_prices              IS '课程价格方案';
COMMENT ON COLUMN crs_course_prices.price_type   IS '计价方式: per_lesson/package/semester';
COMMENT ON COLUMN crs_course_prices.discount_rate IS '折扣率（1.0000=无折扣）';
COMMENT ON COLUMN crs_course_prices.is_default   IS '是否为默认价格方案';

-- ============================================================
-- 5. Promotions module (promo_*)
-- ============================================================

-- 5a. Campaigns (must precede crs_enrollments which references it)
CREATE TABLE promo_campaigns (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR NOT NULL,
    type                 VARCHAR NOT NULL,
    description          TEXT,
    rules                JSONB DEFAULT '{}',
    discount_type        VARCHAR,
    discount_value       DECIMAL(10,2),
    gift_lessons         INT DEFAULT 0,
    applicable_course_ids JSONB DEFAULT '[]',
    start_date           DATE,
    end_date             DATE,
    max_usage            INT,
    used_count           INT DEFAULT 0,
    status               VARCHAR DEFAULT 'active',
    created_by           UUID REFERENCES acct_profiles(id),
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  promo_campaigns                      IS '促销活动';
COMMENT ON COLUMN promo_campaigns.type                 IS '活动类型';
COMMENT ON COLUMN promo_campaigns.discount_type        IS '折扣类型';
COMMENT ON COLUMN promo_campaigns.discount_value       IS '折扣值';
COMMENT ON COLUMN promo_campaigns.gift_lessons         IS '赠送课时数';
COMMENT ON COLUMN promo_campaigns.applicable_course_ids IS '适用课程ID列表（JSON数组）';

-- ============================================================
-- 6. Enrollments & Attendance (crs_*)
-- ============================================================

-- 6a. Enrollments
CREATE TABLE crs_enrollments (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id             UUID NOT NULL REFERENCES stu_students(id),
    course_id              UUID NOT NULL REFERENCES crs_courses(id),
    status                 VARCHAR DEFAULT 'enrolled',
    enrolled_at            TIMESTAMPTZ DEFAULT now(),
    completed_at           TIMESTAMPTZ,
    notes                  TEXT,
    created_by             UUID REFERENCES acct_profiles(id),
    price_id               UUID REFERENCES crs_course_prices(id),
    campaign_id            UUID REFERENCES promo_campaigns(id),
    unit_price             DECIMAL(10,2),
    total_lessons          INT,
    consumed_lessons       INT DEFAULT 0,
    remaining_lessons      INT,
    total_amount           DECIMAL(12,2),
    paid_amount            DECIMAL(12,2),
    discount_amount        DECIMAL(12,2) DEFAULT 0.00,
    source                 VARCHAR DEFAULT 'normal',
    original_enrollment_id UUID REFERENCES crs_enrollments(id),
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  crs_enrollments                          IS '报名记录';
COMMENT ON COLUMN crs_enrollments.status                   IS '状态: enrolled/completed/cancelled/transferred';
COMMENT ON COLUMN crs_enrollments.source                   IS '来源: normal/trial/referral/transfer_in/gift';
COMMENT ON COLUMN crs_enrollments.original_enrollment_id   IS '原始报名（转课场景）';
COMMENT ON COLUMN crs_enrollments.consumed_lessons         IS '已消耗课时';
COMMENT ON COLUMN crs_enrollments.remaining_lessons        IS '剩余课时';

-- 6b. Attendance
CREATE TABLE crs_attendance (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES crs_enrollments(id),
    class_date    DATE NOT NULL,
    status        VARCHAR NOT NULL,
    notes         TEXT,
    marked_by     UUID REFERENCES acct_profiles(id),
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  crs_attendance            IS '考勤记录';
COMMENT ON COLUMN crs_attendance.status     IS '状态: present/absent/late/leave';
COMMENT ON COLUMN crs_attendance.marked_by  IS '记录人';

-- ============================================================
-- 7. Followup module (flup_*)
-- ============================================================

CREATE TABLE flup_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL REFERENCES stu_students(id),
    type        VARCHAR NOT NULL,
    content     TEXT NOT NULL,
    result      VARCHAR,
    next_plan   TEXT,
    next_date   TIMESTAMPTZ,
    is_reminded BOOLEAN DEFAULT false,
    created_by  UUID REFERENCES acct_profiles(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  flup_records              IS '跟进记录';
COMMENT ON COLUMN flup_records.type         IS '跟进方式: phone/wechat/visit/other';
COMMENT ON COLUMN flup_records.content      IS '跟进内容';
COMMENT ON COLUMN flup_records.result       IS '跟进结果';
COMMENT ON COLUMN flup_records.next_plan    IS '下次跟进计划';
COMMENT ON COLUMN flup_records.next_date    IS '下次跟进日期';
COMMENT ON COLUMN flup_records.is_reminded  IS '是否已提醒';

-- ============================================================
-- 8. Finance module (fin_*)
-- ============================================================

-- 8a. Accounts
CREATE TABLE fin_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL UNIQUE REFERENCES stu_students(id),
    balance         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_recharged DECIMAL(12,2) DEFAULT 0.00,
    total_consumed  DECIMAL(12,2) DEFAULT 0.00,
    total_refunded  DECIMAL(12,2) DEFAULT 0.00,
    frozen_amount   DECIMAL(12,2) DEFAULT 0.00,
    status          VARCHAR DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  fin_accounts                 IS '学生财务账户';
COMMENT ON COLUMN fin_accounts.balance         IS '当前余额';
COMMENT ON COLUMN fin_accounts.total_recharged IS '累计充值';
COMMENT ON COLUMN fin_accounts.total_consumed  IS '累计消费';
COMMENT ON COLUMN fin_accounts.total_refunded  IS '累计退费';
COMMENT ON COLUMN fin_accounts.frozen_amount   IS '冻结金额';

-- 8b. Transactions (append-only, no updated_at)
CREATE TABLE fin_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES fin_accounts(id),
    type            VARCHAR NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    balance_before  DECIMAL(12,2) NOT NULL,
    balance_after   DECIMAL(12,2) NOT NULL,
    reference_type  VARCHAR,
    reference_id    UUID,
    description     TEXT,
    metadata        JSONB DEFAULT '{}',
    created_by      UUID REFERENCES acct_profiles(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  fin_transactions                IS '交易流水（不可变）';
COMMENT ON COLUMN fin_transactions.type           IS '类型: recharge/consume/refund/transfer_out/transfer_in/gift/adjustment';
COMMENT ON COLUMN fin_transactions.balance_before IS '交易前余额';
COMMENT ON COLUMN fin_transactions.balance_after  IS '交易后余额';

-- 8c. Recharges
CREATE TABLE fin_recharges (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id     UUID NOT NULL REFERENCES fin_accounts(id),
    amount         DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR,
    payment_ref    VARCHAR,
    campaign_id    UUID REFERENCES promo_campaigns(id),
    bonus_amount   DECIMAL(12,2) DEFAULT 0.00,
    notes          TEXT,
    status         VARCHAR DEFAULT 'completed',
    created_by     UUID REFERENCES acct_profiles(id),
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  fin_recharges                IS '充值记录';
COMMENT ON COLUMN fin_recharges.payment_method IS '支付方式';
COMMENT ON COLUMN fin_recharges.bonus_amount   IS '赠送金额';

-- 8d. Consumption logs (append-only, no updated_at)
CREATE TABLE fin_consumption_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES crs_enrollments(id),
    attendance_id UUID REFERENCES crs_attendance(id),
    lesson_count  INT NOT NULL DEFAULT 1,
    unit_price    DECIMAL(10,2) NOT NULL,
    amount        DECIMAL(12,2) NOT NULL,
    type          VARCHAR DEFAULT 'normal',
    notes         TEXT,
    created_by    UUID REFERENCES acct_profiles(id),
    created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  fin_consumption_logs              IS '课消记录（不可变）';
COMMENT ON COLUMN fin_consumption_logs.lesson_count IS '消耗课时数';
COMMENT ON COLUMN fin_consumption_logs.unit_price   IS '课时单价';
COMMENT ON COLUMN fin_consumption_logs.amount       IS '消耗金额';

-- 8e. Transfers
CREATE TABLE fin_transfers (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id           UUID NOT NULL REFERENCES stu_students(id),
    from_enrollment_id   UUID NOT NULL REFERENCES crs_enrollments(id),
    from_remaining_lessons INT NOT NULL,
    from_unit_price      DECIMAL(10,2) NOT NULL,
    from_total_value     DECIMAL(12,2) NOT NULL,
    to_course_id         UUID NOT NULL REFERENCES crs_courses(id),
    to_price_id          UUID REFERENCES crs_course_prices(id),
    to_unit_price        DECIMAL(10,2) NOT NULL,
    to_lessons_converted INT NOT NULL,
    to_enrollment_id     UUID REFERENCES crs_enrollments(id),
    price_difference     DECIMAL(12,2) DEFAULT 0.00,
    handling_fee         DECIMAL(12,2) DEFAULT 0.00,
    status               VARCHAR DEFAULT 'completed',
    notes                TEXT,
    approved_by          UUID REFERENCES acct_profiles(id),
    created_by           UUID REFERENCES acct_profiles(id),
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  fin_transfers                        IS '转课记录';
COMMENT ON COLUMN fin_transfers.from_remaining_lessons IS '原课程剩余课时';
COMMENT ON COLUMN fin_transfers.to_lessons_converted   IS '转入课程折算课时';
COMMENT ON COLUMN fin_transfers.price_difference       IS '差价';
COMMENT ON COLUMN fin_transfers.handling_fee           IS '手续费';

-- ============================================================
-- 9. Promotions — referrals
-- ============================================================

CREATE TABLE promo_referrals (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id           UUID REFERENCES promo_campaigns(id),
    referrer_student_id   UUID NOT NULL REFERENCES stu_students(id),
    referred_student_id   UUID NOT NULL REFERENCES stu_students(id),
    referrer_bonus_type   VARCHAR,
    referrer_bonus_value  DECIMAL(10,2),
    referrer_bonus_applied BOOLEAN DEFAULT false,
    referred_bonus_type   VARCHAR,
    referred_bonus_value  DECIMAL(10,2),
    referred_bonus_applied BOOLEAN DEFAULT false,
    status                VARCHAR DEFAULT 'pending',
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  promo_referrals                        IS '推荐记录';
COMMENT ON COLUMN promo_referrals.referrer_student_id    IS '推荐人（学员）';
COMMENT ON COLUMN promo_referrals.referred_student_id    IS '被推荐人（学员）';
COMMENT ON COLUMN promo_referrals.referrer_bonus_applied IS '推荐人奖励是否已发放';
COMMENT ON COLUMN promo_referrals.referred_bonus_applied IS '被推荐人奖励是否已发放';

-- ============================================================
-- 10. AI module (ai_*)
-- ============================================================

-- 10a. Knowledge documents
CREATE TABLE ai_knowledge_docs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department VARCHAR,
    title      VARCHAR NOT NULL,
    content    TEXT NOT NULL,
    doc_type   VARCHAR DEFAULT 'text',
    source     VARCHAR,
    metadata   JSONB DEFAULT '{}',
    is_active  BOOLEAN DEFAULT true,
    created_by UUID REFERENCES acct_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  ai_knowledge_docs           IS 'RAG知识库文档';
COMMENT ON COLUMN ai_knowledge_docs.doc_type  IS '文档类型: text/faq/policy/procedure';
COMMENT ON COLUMN ai_knowledge_docs.is_active IS '是否启用';

-- 10b. Embeddings (pgvector)
CREATE TABLE ai_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id      UUID NOT NULL REFERENCES ai_knowledge_docs(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL DEFAULT 0,
    chunk_text  TEXT NOT NULL,
    embedding   vector(1536),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  ai_embeddings            IS '文档向量嵌入';
COMMENT ON COLUMN ai_embeddings.chunk_index IS '分块序号';
COMMENT ON COLUMN ai_embeddings.embedding  IS '1536维向量（OpenAI text-embedding-ada-002）';

-- ============================================================
-- 11. Audit module (aud_*) — append-only, no updated_at
-- ============================================================

-- 11a. Operation logs
CREATE TABLE aud_operation_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES acct_profiles(id),
    action        VARCHAR NOT NULL,
    resource_type VARCHAR NOT NULL,
    resource_id   UUID,
    changes       JSONB,
    ip_address    VARCHAR,
    user_agent    VARCHAR,
    created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  aud_operation_logs               IS '操作审计日志（不可变）';
COMMENT ON COLUMN aud_operation_logs.action        IS '操作类型: create/update/delete';
COMMENT ON COLUMN aud_operation_logs.resource_type IS '资源类型（表名）';
COMMENT ON COLUMN aud_operation_logs.resource_id   IS '资源ID';
COMMENT ON COLUMN aud_operation_logs.changes       IS '变更内容（JSON）';

-- 11b. Agent call logs
CREATE TABLE aud_agent_call_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID,
    tool_name     VARCHAR NOT NULL,
    tool_input    JSONB,
    tool_output   JSONB,
    status        VARCHAR NOT NULL,
    duration_ms   INT,
    error_message TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  aud_agent_call_logs              IS 'Agent调用日志（不可变）';
COMMENT ON COLUMN aud_agent_call_logs.tool_name    IS '工具名称';
COMMENT ON COLUMN aud_agent_call_logs.status       IS '调用状态: success/error';
COMMENT ON COLUMN aud_agent_call_logs.duration_ms  IS '耗时（毫秒）';

-- ============================================================
-- 12. Indexes
-- ============================================================

-- Student fuzzy search (pg_trgm)
CREATE INDEX idx_stu_students_name_trgm ON stu_students USING gin (name gin_trgm_ops);

-- Soft-delete partial indexes
CREATE INDEX idx_stu_students_active ON stu_students (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_crs_courses_active  ON crs_courses (status) WHERE deleted_at IS NULL;

-- Finance
CREATE INDEX idx_fin_accounts_student       ON fin_accounts (student_id);
CREATE INDEX idx_fin_transactions_account   ON fin_transactions (account_id, created_at DESC);
CREATE INDEX idx_fin_consumption_enrollment ON fin_consumption_logs (enrollment_id);

-- Enrollments
CREATE INDEX idx_crs_enrollments_student ON crs_enrollments (student_id);
CREATE INDEX idx_crs_enrollments_course  ON crs_enrollments (course_id);

-- Audit
CREATE INDEX idx_aud_ops_resource    ON aud_operation_logs (resource_type, resource_id);
CREATE INDEX idx_aud_ops_user        ON aud_operation_logs (user_id, created_at DESC);
CREATE INDEX idx_aud_agent_session   ON aud_agent_call_logs (session_id, created_at DESC);

-- AI vector (HNSW)
CREATE INDEX idx_ai_embeddings_vector ON ai_embeddings USING hnsw (embedding vector_cosine_ops);

-- Followup pending reminders
CREATE INDEX idx_flup_pending_reminders ON flup_records (next_date) WHERE is_reminded = false AND next_date IS NOT NULL;

-- ============================================================
-- 13. update_updated_at triggers
-- ============================================================
-- Applied to all tables with updated_at EXCEPT append-only tables:
--   aud_operation_logs, aud_agent_call_logs, fin_transactions, fin_consumption_logs

CREATE TRIGGER trg_acct_departments_updated_at
    BEFORE UPDATE ON acct_departments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_acct_roles_updated_at
    BEFORE UPDATE ON acct_roles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_acct_profiles_updated_at
    BEFORE UPDATE ON acct_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_stu_students_updated_at
    BEFORE UPDATE ON stu_students
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_stu_parents_updated_at
    BEFORE UPDATE ON stu_parents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_crs_courses_updated_at
    BEFORE UPDATE ON crs_courses
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_crs_course_prices_updated_at
    BEFORE UPDATE ON crs_course_prices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_crs_enrollments_updated_at
    BEFORE UPDATE ON crs_enrollments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_crs_attendance_updated_at
    BEFORE UPDATE ON crs_attendance
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_flup_records_updated_at
    BEFORE UPDATE ON flup_records
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_fin_accounts_updated_at
    BEFORE UPDATE ON fin_accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_fin_recharges_updated_at
    BEFORE UPDATE ON fin_recharges
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_fin_transfers_updated_at
    BEFORE UPDATE ON fin_transfers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_promo_campaigns_updated_at
    BEFORE UPDATE ON promo_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_promo_referrals_updated_at
    BEFORE UPDATE ON promo_referrals
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_ai_knowledge_docs_updated_at
    BEFORE UPDATE ON ai_knowledge_docs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 14. Auth trigger — auto-create profile on signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.acct_profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 15. Seed data
-- ============================================================

INSERT INTO acct_roles (name, description, permissions) VALUES
    ('admin',     '系统管理员', '["*"]'::jsonb),
    ('teacher',   '教师',       '["students:read","courses:read","courses:write","attendance:write","followups:read","followups:write"]'::jsonb),
    ('counselor', '课程顾问',   '["students:read","students:write","courses:read","enrollments:write","followups:read","followups:write","finance:read","finance:recharge"]'::jsonb),
    ('viewer',    '只读用户',   '["students:read","courses:read","followups:read"]'::jsonb);

INSERT INTO acct_departments (name, sort_order) VALUES
    ('管理部', 1),
    ('市场部', 2),
    ('教学部', 3),
    ('财务部', 4);

COMMIT;
