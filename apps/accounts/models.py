"""
账户模块数据模型

包含用户档案、部门、角色及其关联关系。
"""
from uuid import UUID

from pydantic import BaseModel

from apps.core.models import SupabaseModel, TimestampMixin


class Profile(SupabaseModel):
    """用户档案"""
    display_name: str = ""
    phone: str | None = None
    avatar_url: str | None = None
    is_active: bool = True


class Department(SupabaseModel):
    """部门"""
    name: str
    parent_id: UUID | None = None
    description: str | None = None
    sort_order: int = 0


class Role(SupabaseModel):
    """角色"""
    name: str
    description: str | None = None
    permissions: list = []


class UserRole(BaseModel):
    """用户-角色关联"""
    id: UUID
    user_id: UUID
    role_id: UUID
    created_at: str | None = None


class UserDepartment(BaseModel):
    """用户-部门关联"""
    id: UUID
    user_id: UUID
    department_id: UUID
    is_head: bool = False
    created_at: str | None = None
