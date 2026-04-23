-- Migration 015: 平台集成
--
-- 集成阿里云 Supabase 平台能力：
--   1. Realtime publication — 审计日志、财务流水实时推送
--   2. pg_cron 定时任务 — 每日跟进提醒检查、每周报表刷新
--   3. pg_net 异步通知函数 — Webhook 回调
--   4. RAG 知识库同步触发器 — ai_knowledge_docs 变更时同步到 RAG
--   5. 向量相似度搜索 RPC — 知识库语义检索
--
-- Date: 2026-04-15

BEGIN;

-- ============================================================
-- 1. Realtime Publication
--    将关键表加入 supabase_realtime 以支持实时订阅
-- ============================================================

-- 确保 supabase_realtime publication 存在
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 添加需要实时推送的表
ALTER PUBLICATION supabase_realtime ADD TABLE aud_operation_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE aud_agent_call_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE fin_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE flup_records;

-- ============================================================
-- 2. pg_cron 定时任务
-- ============================================================

-- 2a. 每日跟进提醒检查（每天早上 9:00 UTC+8 = 01:00 UTC）
-- 标记已过期但未提醒的跟进记录
SELECT cron.schedule(
    'daily_followup_reminder_check',
    '0 1 * * *',
    $$
    UPDATE flup_records
    SET is_reminded = true
    WHERE next_date IS NOT NULL
      AND next_date <= now()
      AND is_reminded = false;
    $$
);

-- 2b. 每周一自动刷新物化视图（如果将来创建了物化视图）
-- 并清理 30 天前的 agent 调用日志
SELECT cron.schedule(
    'weekly_cleanup_agent_logs',
    '0 2 * * 1',
    $$
    DELETE FROM aud_agent_call_logs
    WHERE created_at < now() - interval '90 days';
    $$
);

-- ============================================================
-- 3. pg_net 异步通知函数
--    通用 Webhook 回调函数，可被触发器或定时任务调用
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_webhook(
    p_url     TEXT,
    p_payload JSONB,
    p_method  TEXT DEFAULT 'POST'
)
RETURNS BIGINT AS $$
DECLARE
    v_request_id BIGINT;
BEGIN
    SELECT net.http_post(
        url     := p_url,
        body    := p_payload::TEXT,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Source', 'erp-supabase'
        )
    ) INTO v_request_id;

    RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
    -- pg_net 失败不应阻塞主事务
    RAISE WARNING 'Webhook notification failed: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION notify_webhook IS '通用 Webhook 通知（基于 pg_net）';

-- ============================================================
-- 4. RAG 知识库同步触发器
--    ai_knowledge_docs 插入/更新时，通过 pg_net 调用 RAG API 同步
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_knowledge_to_rag()
RETURNS TRIGGER AS $$
DECLARE
    v_rag_url TEXT := 'http://47.102.28.236:80/rag/v1/documents';
    v_payload JSONB;
BEGIN
    -- 仅处理 active 文档
    IF NEW.is_active = false THEN
        RETURN NEW;
    END IF;

    v_payload := jsonb_build_object(
        'id', NEW.id,
        'title', NEW.title,
        'content', NEW.content,
        'doc_type', NEW.doc_type,
        'department', NEW.department,
        'metadata', NEW.metadata,
        'action', TG_OP
    );

    -- 异步调用 RAG API（不阻塞主事务）
    PERFORM public.notify_webhook(v_rag_url, v_payload);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_sync_knowledge_rag
    AFTER INSERT OR UPDATE ON ai_knowledge_docs
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_knowledge_to_rag();

COMMENT ON FUNCTION sync_knowledge_to_rag IS 'ai_knowledge_docs 变更时自动同步到 RAG 引擎';

-- ============================================================
-- 5. 向量相似度搜索 RPC
--    使用 pgvector 进行语义检索
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_knowledge(
    p_query_embedding vector(1536),
    p_limit           INT     DEFAULT 5,
    p_threshold       FLOAT   DEFAULT 0.7,
    p_department      VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    doc_id      UUID,
    title       VARCHAR,
    chunk_text  TEXT,
    chunk_index INT,
    doc_type    VARCHAR,
    department  VARCHAR,
    similarity  FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id AS doc_id,
        d.title,
        e.chunk_text,
        e.chunk_index,
        d.doc_type,
        d.department,
        (1 - (e.embedding <=> p_query_embedding))::FLOAT AS similarity
    FROM ai_embeddings e
    JOIN ai_knowledge_docs d ON d.id = e.doc_id AND d.is_active = true
    WHERE (p_department IS NULL OR d.department = p_department)
      AND (1 - (e.embedding <=> p_query_embedding)) >= p_threshold
    ORDER BY e.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION search_knowledge IS '知识库语义检索（pgvector cosine similarity）';

-- ============================================================
-- 6. 财务异常告警触发器
--    大额交易自动记录告警日志
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_large_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_threshold DECIMAL(12,2) := 10000.00;  -- 告警阈值
BEGIN
    IF NEW.amount >= v_threshold THEN
        INSERT INTO aud_operation_logs (user_id, action, resource_type, resource_id, changes)
        VALUES (NEW.created_by, 'alert_large_transaction', 'transaction', NEW.id,
                jsonb_build_object(
                    'type', NEW.type,
                    'amount', NEW.amount,
                    'threshold', v_threshold,
                    'account_id', NEW.account_id
                ));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_check_large_transaction
    AFTER INSERT ON fin_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_large_transaction();

COMMENT ON FUNCTION check_large_transaction IS '大额交易自动告警（超过阈值写审计日志）';

-- ============================================================
-- 7. GraphQL 增强注释
--    确保所有枚举字段有清晰的 COMMENT 供 pg_graphql 文档
-- ============================================================

COMMENT ON COLUMN stu_students.status IS '@graphql({"description": "学员状态: active/inactive/graduated"})';
COMMENT ON COLUMN crs_courses.status IS '@graphql({"description": "课程状态: active/inactive/archived"})';
COMMENT ON COLUMN crs_enrollments.status IS '@graphql({"description": "报名状态: enrolled/completed/cancelled/transferred"})';
COMMENT ON COLUMN crs_attendance.status IS '@graphql({"description": "考勤状态: present/absent/late/leave"})';
COMMENT ON COLUMN fin_transactions.type IS '@graphql({"description": "交易类型: recharge/consume/refund/transfer_out/transfer_in/gift/adjustment"})';
COMMENT ON COLUMN flup_records.type IS '@graphql({"description": "跟进方式: phone/wechat/visit/other"})';
COMMENT ON COLUMN promo_campaigns.type IS '@graphql({"description": "活动类型"})';
COMMENT ON COLUMN fin_recharges.payment_method IS '@graphql({"description": "支付方式: cash/wechat/alipay/bank_transfer/other"})';

COMMIT;
