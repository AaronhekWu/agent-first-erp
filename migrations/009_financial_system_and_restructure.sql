-- Migration 009: Financial System and Restructure
--
-- This migration:
--   1. Drops legacy agent (agt_*) tables
--   2. Adds course pricing (crs_course_prices)
--   3. Adds promotional campaigns and referrals (promo_*)
--   4. Adds financial accounts, transactions, recharges, consumption logs, and transfers (fin_*)
--   5. Extends crs_enrollments with pricing/financial columns
--   6. Adds RAG knowledge-base tables with pgvector (ai_*)
--   7. Registers moddatetime triggers on all new tables with updated_at
--
-- Date: 2026-04-01

BEGIN;

-- ============================================================
-- 1. Drop old agent tables
-- ============================================================

DROP TABLE IF EXISTS agt_messages CASCADE;
DROP TABLE IF EXISTS agt_sessions CASCADE;
DROP TABLE IF EXISTS agt_prompt_templates CASCADE;
DROP TABLE IF EXISTS agt_tool_configs CASCADE;
DROP TABLE IF EXISTS agt_agents CASCADE;

-- ============================================================
-- 2. Course prices
-- ============================================================

CREATE TABLE crs_course_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES crs_courses(id),
    name VARCHAR NOT NULL,
    price_type VARCHAR NOT NULL DEFAULT 'per_lesson',
    unit_price DECIMAL(10,2) NOT NULL,
    total_lessons INT,
    total_price DECIMAL(10,2),
    discount_rate DECIMAL(5,4) DEFAULT 1.0000,
    is_default BOOLEAN DEFAULT false,
    effective_from DATE,
    effective_to DATE,
    status VARCHAR DEFAULT 'active',
    created_by UUID REFERENCES acct_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. Promotional campaigns
-- ============================================================

CREATE TABLE promo_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL,
    description TEXT,
    rules JSONB DEFAULT '{}',
    discount_type VARCHAR,
    discount_value DECIMAL(10,2),
    gift_lessons INT DEFAULT 0,
    applicable_course_ids JSONB DEFAULT '[]',
    start_date DATE,
    end_date DATE,
    max_usage INT,
    used_count INT DEFAULT 0,
    status VARCHAR DEFAULT 'active',
    created_by UUID REFERENCES acct_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. Financial accounts
-- ============================================================

CREATE TABLE fin_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL UNIQUE REFERENCES stu_students(id),
    balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_recharged DECIMAL(12,2) DEFAULT 0.00,
    total_consumed DECIMAL(12,2) DEFAULT 0.00,
    total_refunded DECIMAL(12,2) DEFAULT 0.00,
    frozen_amount DECIMAL(12,2) DEFAULT 0.00,
    status VARCHAR DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. Financial transactions
-- ============================================================

CREATE TABLE fin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES fin_accounts(id),
    type VARCHAR NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_before DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    reference_type VARCHAR,
    reference_id UUID,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES acct_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. Financial recharges
-- ============================================================

CREATE TABLE fin_recharges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES fin_accounts(id),
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR,
    payment_ref VARCHAR,
    campaign_id UUID REFERENCES promo_campaigns(id),
    bonus_amount DECIMAL(12,2) DEFAULT 0.00,
    notes TEXT,
    status VARCHAR DEFAULT 'completed',
    created_by UUID REFERENCES acct_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. Financial consumption logs
-- ============================================================

CREATE TABLE fin_consumption_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES crs_enrollments(id),
    attendance_id UUID REFERENCES crs_attendance(id),
    lesson_count INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type VARCHAR DEFAULT 'normal',
    notes TEXT,
    created_by UUID REFERENCES acct_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. Financial transfers
-- ============================================================

CREATE TABLE fin_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES stu_students(id),
    from_enrollment_id UUID NOT NULL REFERENCES crs_enrollments(id),
    from_remaining_lessons INT NOT NULL,
    from_unit_price DECIMAL(10,2) NOT NULL,
    from_total_value DECIMAL(12,2) NOT NULL,
    to_course_id UUID NOT NULL REFERENCES crs_courses(id),
    to_price_id UUID REFERENCES crs_course_prices(id),
    to_unit_price DECIMAL(10,2) NOT NULL,
    to_lessons_converted INT NOT NULL,
    to_enrollment_id UUID REFERENCES crs_enrollments(id),
    price_difference DECIMAL(12,2) DEFAULT 0.00,
    handling_fee DECIMAL(12,2) DEFAULT 0.00,
    status VARCHAR DEFAULT 'completed',
    notes TEXT,
    approved_by UUID REFERENCES acct_profiles(id),
    created_by UUID REFERENCES acct_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. Promotional referrals
-- ============================================================

CREATE TABLE promo_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES promo_campaigns(id),
    referrer_student_id UUID NOT NULL REFERENCES stu_students(id),
    referred_student_id UUID NOT NULL REFERENCES stu_students(id),
    referrer_bonus_type VARCHAR,
    referrer_bonus_value DECIMAL(10,2),
    referrer_bonus_applied BOOLEAN DEFAULT false,
    referred_bonus_type VARCHAR,
    referred_bonus_value DECIMAL(10,2),
    referred_bonus_applied BOOLEAN DEFAULT false,
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. Alter crs_enrollments with pricing/financial columns
-- ============================================================

ALTER TABLE crs_enrollments
    ADD COLUMN price_id UUID REFERENCES crs_course_prices(id),
    ADD COLUMN campaign_id UUID REFERENCES promo_campaigns(id),
    ADD COLUMN unit_price DECIMAL(10,2),
    ADD COLUMN total_lessons INT,
    ADD COLUMN consumed_lessons INT DEFAULT 0,
    ADD COLUMN remaining_lessons INT,
    ADD COLUMN total_amount DECIMAL(12,2),
    ADD COLUMN paid_amount DECIMAL(12,2),
    ADD COLUMN discount_amount DECIMAL(12,2) DEFAULT 0.00,
    ADD COLUMN source VARCHAR DEFAULT 'normal',
    ADD COLUMN original_enrollment_id UUID REFERENCES crs_enrollments(id);

-- ============================================================
-- 11. RAG knowledge base tables (pgvector)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_knowledge_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department VARCHAR,
    title VARCHAR NOT NULL,
    content TEXT NOT NULL,
    doc_type VARCHAR DEFAULT 'text',
    source VARCHAR,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES acct_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES ai_knowledge_docs(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL DEFAULT 0,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_embeddings_vector ON ai_embeddings
    USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- 12. moddatetime triggers for updated_at columns
-- ============================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crs_course_prices FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON promo_campaigns FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON fin_accounts FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON fin_recharges FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON fin_transfers FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON promo_referrals FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_knowledge_docs FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

COMMIT;
