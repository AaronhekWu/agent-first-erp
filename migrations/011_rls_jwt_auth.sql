-- Migration 011: RLS + JWT 部门级分级鉴权
--
-- 为全部 24 张 ERP 表创建 RLS 策略:
--   1. JWT helper 函数 (get_my_role, get_my_department_ids, is_admin)
--   2. 对所有表启用 RLS
--   3. 按角色和部门配置 SELECT 策略
--   4. 写操作由 SECURITY DEFINER RPC 函数处理，不设直接策略（即 RLS 默认拒绝）
--
-- 4 个角色: admin, teacher, counselor, viewer
-- JWT claims 结构: app_metadata.role / app_metadata.department_ids
--
-- Date: 2026-04-15

BEGIN;

-- ============================================================
-- 1. JWT Helper 函数
-- ============================================================

-- 获取当前用户角色（优先从 JWT app_metadata 读取，回退查 acct_user_roles）
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- 优先从 JWT app_metadata 读取
    v_role := current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role';
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;
    -- Fallback: 从 acct_user_roles 查询，按权限优先级取最高角色
    SELECT r.name INTO v_role
    FROM acct_roles r
    JOIN acct_user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    ORDER BY CASE r.name
        WHEN 'admin' THEN 1
        WHEN 'teacher' THEN 2
        WHEN 'counselor' THEN 3
        ELSE 4
    END
    LIMIT 1;
    RETURN COALESCE(v_role, 'viewer');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 获取当前用户部门 ID 列表（优先从 JWT，回退查 acct_user_departments）
CREATE OR REPLACE FUNCTION public.get_my_department_ids()
RETURNS UUID[] AS $$
DECLARE
    v_deps UUID[];
    v_raw JSONB;
BEGIN
    -- 优先从 JWT app_metadata 读取
    v_raw := current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' -> 'department_ids';
    IF v_raw IS NOT NULL AND jsonb_array_length(v_raw) > 0 THEN
        SELECT array_agg(elem::text::uuid)
        INTO v_deps
        FROM jsonb_array_elements_text(v_raw) AS elem;
        RETURN v_deps;
    END IF;
    -- Fallback: 从 acct_user_departments 查询
    SELECT array_agg(ud.department_id)
    INTO v_deps
    FROM acct_user_departments ud
    WHERE ud.user_id = auth.uid();
    RETURN COALESCE(v_deps, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 快速判断是否 admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT public.get_my_role() = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. 对全部 24 张表启用 RLS
-- ============================================================

-- 账户模块 (5 张)
ALTER TABLE acct_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_user_departments ENABLE ROW LEVEL SECURITY;

-- 学员模块 (4 张)
ALTER TABLE stu_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE stu_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE stu_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE stu_student_tags ENABLE ROW LEVEL SECURITY;

-- 课程模块 (4 张)
ALTER TABLE crs_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crs_course_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE crs_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crs_attendance ENABLE ROW LEVEL SECURITY;

-- 跟进模块 (1 张)
ALTER TABLE flup_records ENABLE ROW LEVEL SECURITY;

-- 财务模块 (5 张)
ALTER TABLE fin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_recharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_consumption_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_transfers ENABLE ROW LEVEL SECURITY;

-- 推广模块 (2 张)
ALTER TABLE promo_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_referrals ENABLE ROW LEVEL SECURITY;

-- AI 模块 (2 张)
ALTER TABLE ai_knowledge_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;

-- 审计模块 (2 张)
ALTER TABLE aud_operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE aud_agent_call_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. SELECT 策略 — 账户模块
-- ============================================================

-- acct_profiles: 所有已认证用户可读
CREATE POLICY acct_profiles_authenticated_select
    ON acct_profiles FOR SELECT
    TO authenticated
    USING (true);

-- acct_departments: 所有已认证用户可读
CREATE POLICY acct_departments_authenticated_select
    ON acct_departments FOR SELECT
    TO authenticated
    USING (true);

-- acct_roles: 所有已认证用户可读
CREATE POLICY acct_roles_authenticated_select
    ON acct_roles FOR SELECT
    TO authenticated
    USING (true);

-- acct_user_roles: admin 看全部，其他用户只看自己的
CREATE POLICY acct_user_roles_authenticated_select
    ON acct_user_roles FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR user_id = auth.uid()
    );

-- acct_user_departments: admin 看全部，其他用户只看自己的
CREATE POLICY acct_user_departments_authenticated_select
    ON acct_user_departments FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR user_id = auth.uid()
    );

-- ============================================================
-- 4. SELECT 策略 — 学员模块
-- ============================================================

-- stu_students: admin/teacher 看全部; counselor 看 assigned_to 自己或同部门; viewer 看全部
CREATE POLICY stu_students_authenticated_select
    ON stu_students FOR SELECT
    TO authenticated
    USING (
        public.get_my_role() IN ('admin', 'teacher', 'viewer')
        OR (
            public.get_my_role() = 'counselor'
            AND (
                assigned_to = auth.uid()
                OR department_id = ANY(public.get_my_department_ids())
            )
        )
    );

-- stu_parents: 跟随 stu_students 的可见性
CREATE POLICY stu_parents_authenticated_select
    ON stu_parents FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM stu_students s
            WHERE s.id = stu_parents.student_id
        )
    );

-- stu_tags: 所有已认证用户可读（标签字典表）
CREATE POLICY stu_tags_authenticated_select
    ON stu_tags FOR SELECT
    TO authenticated
    USING (true);

-- stu_student_tags: 跟随 stu_students 的可见性
CREATE POLICY stu_student_tags_authenticated_select
    ON stu_student_tags FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM stu_students s
            WHERE s.id = stu_student_tags.student_id
        )
    );

-- ============================================================
-- 5. SELECT 策略 — 课程模块
-- ============================================================

-- crs_courses: 所有已认证用户可读
CREATE POLICY crs_courses_authenticated_select
    ON crs_courses FOR SELECT
    TO authenticated
    USING (true);

-- crs_course_prices: 所有已认证用户可读
CREATE POLICY crs_course_prices_authenticated_select
    ON crs_course_prices FOR SELECT
    TO authenticated
    USING (true);

-- crs_enrollments: 同 stu_students 规则，通过 student_id 关联
CREATE POLICY crs_enrollments_authenticated_select
    ON crs_enrollments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM stu_students s
            WHERE s.id = crs_enrollments.student_id
        )
    );

-- crs_attendance: 同 crs_enrollments，通过 enrollment_id 关联
CREATE POLICY crs_attendance_authenticated_select
    ON crs_attendance FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM crs_enrollments e
            WHERE e.id = crs_attendance.enrollment_id
        )
    );

-- ============================================================
-- 6. SELECT 策略 — 跟进模块
-- ============================================================

-- flup_records: admin 看全部; counselor 看自己创建的或 assigned 学员的; teacher 看自己创建的
CREATE POLICY flup_records_authenticated_select
    ON flup_records FOR SELECT
    TO authenticated
    USING (
        public.get_my_role() = 'admin'
        OR created_by = auth.uid()
        OR (
            public.get_my_role() = 'counselor'
            AND EXISTS (
                SELECT 1 FROM stu_students s
                WHERE s.id = flup_records.student_id
                  AND (
                      s.assigned_to = auth.uid()
                      OR s.department_id = ANY(public.get_my_department_ids())
                  )
            )
        )
    );

-- ============================================================
-- 7. SELECT 策略 — 财务模块
-- ============================================================

-- fin_accounts: admin 看全部; counselor 看对应学员的
CREATE POLICY fin_accounts_authenticated_select
    ON fin_accounts FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            public.get_my_role() = 'counselor'
            AND EXISTS (
                SELECT 1 FROM stu_students s
                WHERE s.id = fin_accounts.student_id
                  AND (
                      s.assigned_to = auth.uid()
                      OR s.department_id = ANY(public.get_my_department_ids())
                  )
            )
        )
    );

-- fin_transactions: admin 看全部; counselor 看对应学员的
CREATE POLICY fin_transactions_authenticated_select
    ON fin_transactions FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            public.get_my_role() = 'counselor'
            AND EXISTS (
                SELECT 1 FROM fin_accounts a
                JOIN stu_students s ON s.id = a.student_id
                WHERE a.id = fin_transactions.account_id
                  AND (
                      s.assigned_to = auth.uid()
                      OR s.department_id = ANY(public.get_my_department_ids())
                  )
            )
        )
    );

-- fin_recharges: admin 看全部; counselor 看对应学员的
CREATE POLICY fin_recharges_authenticated_select
    ON fin_recharges FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            public.get_my_role() = 'counselor'
            AND EXISTS (
                SELECT 1 FROM fin_accounts a
                JOIN stu_students s ON s.id = a.student_id
                WHERE a.id = fin_recharges.account_id
                  AND (
                      s.assigned_to = auth.uid()
                      OR s.department_id = ANY(public.get_my_department_ids())
                  )
            )
        )
    );

-- fin_consumption_logs: admin 看全部; counselor 看对应学员的
CREATE POLICY fin_consumption_logs_authenticated_select
    ON fin_consumption_logs FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            public.get_my_role() = 'counselor'
            AND EXISTS (
                SELECT 1 FROM crs_enrollments e
                JOIN stu_students s ON s.id = e.student_id
                WHERE e.id = fin_consumption_logs.enrollment_id
                  AND (
                      s.assigned_to = auth.uid()
                      OR s.department_id = ANY(public.get_my_department_ids())
                  )
            )
        )
    );

-- fin_transfers: admin 看全部; counselor 看对应学员的
CREATE POLICY fin_transfers_authenticated_select
    ON fin_transfers FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            public.get_my_role() = 'counselor'
            AND EXISTS (
                SELECT 1 FROM stu_students s
                WHERE s.id = fin_transfers.student_id
                  AND (
                      s.assigned_to = auth.uid()
                      OR s.department_id = ANY(public.get_my_department_ids())
                  )
            )
        )
    );

-- ============================================================
-- 8. SELECT 策略 — 推广模块
-- ============================================================

-- promo_campaigns: 所有已认证用户可读
CREATE POLICY promo_campaigns_authenticated_select
    ON promo_campaigns FOR SELECT
    TO authenticated
    USING (true);

-- promo_referrals: admin 看全部; counselor 看相关学员的
CREATE POLICY promo_referrals_authenticated_select
    ON promo_referrals FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            public.get_my_role() = 'counselor'
            AND EXISTS (
                SELECT 1 FROM stu_students s
                WHERE (s.id = promo_referrals.referrer_student_id
                       OR s.id = promo_referrals.referred_student_id)
                  AND (
                      s.assigned_to = auth.uid()
                      OR s.department_id = ANY(public.get_my_department_ids())
                  )
            )
        )
    );

-- ============================================================
-- 9. SELECT 策略 — AI 模块
-- ============================================================

-- ai_knowledge_docs: 知识库公开可读（所有已认证用户）
CREATE POLICY ai_knowledge_docs_authenticated_select
    ON ai_knowledge_docs FOR SELECT
    TO authenticated
    USING (true);

-- ai_embeddings: 知识库公开可读（所有已认证用户）
CREATE POLICY ai_embeddings_authenticated_select
    ON ai_embeddings FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================
-- 10. SELECT 策略 — 审计模块
-- ============================================================

-- aud_operation_logs: 仅 admin 可读
CREATE POLICY aud_operation_logs_admin_select
    ON aud_operation_logs FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- aud_agent_call_logs: 仅 admin 可读
CREATE POLICY aud_agent_call_logs_admin_select
    ON aud_agent_call_logs FOR SELECT
    TO authenticated
    USING (public.is_admin());

COMMIT;
