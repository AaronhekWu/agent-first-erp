"""
数据库表名常量

集中管理所有 Supabase 表名，避免硬编码字符串散落在代码中。
"""


# 账户模块
class AccountTables:
    PROFILES = "acct_profiles"
    DEPARTMENTS = "acct_departments"
    ROLES = "acct_roles"
    USER_ROLES = "acct_user_roles"
    USER_DEPARTMENTS = "acct_user_departments"


# 学员模块
class StudentTables:
    STUDENTS = "stu_students"
    PARENTS = "stu_parents"
    TAGS = "stu_tags"
    STUDENT_TAGS = "stu_student_tags"


# 课程模块
class CourseTables:
    COURSES = "crs_courses"
    ENROLLMENTS = "crs_enrollments"
    ATTENDANCE = "crs_attendance"
    COURSE_PRICES = "crs_course_prices"


# 跟进模块
class FollowupTables:
    RECORDS = "flup_records"


# 财务模块
class FinanceTables:
    ACCOUNTS = "fin_accounts"
    TRANSACTIONS = "fin_transactions"
    RECHARGES = "fin_recharges"
    CONSUMPTION_LOGS = "fin_consumption_logs"
    TRANSFERS = "fin_transfers"


# 推广模块
class PromoTables:
    CAMPAIGNS = "promo_campaigns"
    REFERRALS = "promo_referrals"


# AI 模块
class AITables:
    KNOWLEDGE_DOCS = "ai_knowledge_docs"
    EMBEDDINGS = "ai_embeddings"


# 审计模块
class AuditTables:
    OPERATION_LOGS = "aud_operation_logs"
    AGENT_CALL_LOGS = "aud_agent_call_logs"
