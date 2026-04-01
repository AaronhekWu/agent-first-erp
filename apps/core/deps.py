"""
依赖注入 / 服务容器

集中创建和管理所有 Repository 与 Service 实例。
通过 service_role 客户端实例化（用于后台和 Agent 操作）。
视图层通过此模块获取服务实例，保持解耦。
"""
from functools import lru_cache

from apps.core.db import get_service_client

# 仓库
from apps.accounts.repositories import DepartmentRepository, ProfileRepository, RoleRepository
from apps.students.repositories import ParentRepository, StudentRepository, TagRepository
from apps.courses.repositories import AttendanceRepository, CourseRepository, EnrollmentRepository
from apps.followups.repositories import FollowupRepository
from apps.agents.repositories import EmbeddingRepository, KnowledgeDocRepository
from apps.finance.repositories import (
    AccountRepository, ConsumptionLogRepository, RechargeRepository,
    TransactionRepository, TransferRepository,
)
from apps.promotions.repositories import CampaignRepository, ReferralRepository
from apps.audits.repositories import AgentCallLogRepository, OperationLogRepository

# 服务
from apps.accounts.services import AccountService
from apps.students.services import StudentService
from apps.courses.services import CourseService
from apps.followups.services import FollowupService
from apps.agents.services import KnowledgeService
from apps.finance.services import FinanceService
from apps.promotions.services import PromoService
from apps.audits.services import AuditService

# 工具
from apps.tools.gateway import ToolGateway


@lru_cache(maxsize=1)
def get_audit_service() -> AuditService:
    """审计服务（其他服务依赖此项，最先实例化）"""
    client = get_service_client()
    return AuditService(
        operation_log_repo=OperationLogRepository(client),
        agent_call_log_repo=AgentCallLogRepository(client),
    )


@lru_cache(maxsize=1)
def get_account_service() -> AccountService:
    client = get_service_client()
    return AccountService(
        profile_repo=ProfileRepository(client),
        role_repo=RoleRepository(client),
        department_repo=DepartmentRepository(client),
        audit_service=get_audit_service(),
    )


@lru_cache(maxsize=1)
def get_student_service() -> StudentService:
    client = get_service_client()
    return StudentService(
        student_repo=StudentRepository(client),
        parent_repo=ParentRepository(client),
        tag_repo=TagRepository(client),
        audit_service=get_audit_service(),
    )


@lru_cache(maxsize=1)
def get_course_service() -> CourseService:
    client = get_service_client()
    return CourseService(
        course_repo=CourseRepository(client),
        enrollment_repo=EnrollmentRepository(client),
        attendance_repo=AttendanceRepository(client),
        audit_service=get_audit_service(),
    )


@lru_cache(maxsize=1)
def get_followup_service() -> FollowupService:
    client = get_service_client()
    return FollowupService(
        followup_repo=FollowupRepository(client),
        audit_service=get_audit_service(),
    )


@lru_cache(maxsize=1)
def get_finance_service() -> FinanceService:
    client = get_service_client()
    return FinanceService(
        account_repo=AccountRepository(client),
        transaction_repo=TransactionRepository(client),
        recharge_repo=RechargeRepository(client),
        consumption_log_repo=ConsumptionLogRepository(client),
        transfer_repo=TransferRepository(client),
        audit_service=get_audit_service(),
    )


@lru_cache(maxsize=1)
def get_promo_service() -> PromoService:
    client = get_service_client()
    return PromoService(
        campaign_repo=CampaignRepository(client),
        referral_repo=ReferralRepository(client),
        audit_service=get_audit_service(),
    )


@lru_cache(maxsize=1)
def get_knowledge_service() -> KnowledgeService:
    client = get_service_client()
    return KnowledgeService(
        doc_repo=KnowledgeDocRepository(client),
        embedding_repo=EmbeddingRepository(client),
        audit_service=get_audit_service(),
    )


@lru_cache(maxsize=1)
def get_tool_gateway() -> ToolGateway:
    return ToolGateway(audit_service=get_audit_service())


def get_services_map() -> dict:
    """获取服务名称到实例的映射（供 ToolContext 使用）"""
    return {
        "account_service": get_account_service(),
        "student_service": get_student_service(),
        "course_service": get_course_service(),
        "followup_service": get_followup_service(),
        "knowledge_service": get_knowledge_service(),
        "finance_service": get_finance_service(),
        "promo_service": get_promo_service(),
        "audit_service": get_audit_service(),
    }
