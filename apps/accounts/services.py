"""
账户服务

提供用户管理、RBAC 权限检查等能力。
"""
from uuid import UUID

from apps.accounts.models import Department, Profile, Role
from apps.accounts.repositories import DepartmentRepository, ProfileRepository, RoleRepository
from apps.audits.services import AuditService


class AccountService:
    """账户服务：用户档案、角色、部门管理"""

    def __init__(
        self,
        profile_repo: ProfileRepository,
        role_repo: RoleRepository,
        department_repo: DepartmentRepository,
        audit_service: AuditService,
    ):
        self._profile_repo = profile_repo
        self._role_repo = role_repo
        self._department_repo = department_repo
        self._audit = audit_service

    # ---- 用户档案 ----

    def get_profile(self, user_id: UUID) -> Profile | None:
        """获取用户档案"""
        return self._profile_repo.get_by_id(user_id)

    def update_profile(self, user_id: UUID, data: dict, operator_id: UUID | None = None) -> Profile:
        """更新用户档案"""
        old = self._profile_repo.get_by_id(user_id)
        result = self._profile_repo.update(user_id, data)
        self._audit.log_operation(
            user_id=operator_id,
            action="update",
            resource_type="profile",
            resource_id=user_id,
            changes={"old": old.model_dump() if old else None, "new": data},
        )
        return result

    # ---- 权限检查 ----

    def get_user_roles(self, user_id: UUID) -> list[Role]:
        """获取用户的所有角色"""
        return self._role_repo.get_user_roles(user_id)

    def user_has_role(self, user_id: UUID, role_name: str) -> bool:
        """检查用户是否拥有指定角色"""
        roles = self.get_user_roles(user_id)
        return any(r.name == role_name for r in roles)

    def user_has_permission(self, user_id: UUID, permission: str) -> bool:
        """检查用户是否拥有指定权限"""
        roles = self.get_user_roles(user_id)
        for role in roles:
            if "*" in role.permissions or permission in role.permissions:
                return True
        return False

    # ---- 部门 ----

    def list_departments(self) -> list[Department]:
        """获取所有部门"""
        departments, _ = self._department_repo.list(page_size=100, order_by="sort_order", ascending=True)
        return departments

    # ---- 角色 ----

    def list_roles(self) -> list[Role]:
        """获取所有角色"""
        roles, _ = self._role_repo.list(page_size=100)
        return roles
