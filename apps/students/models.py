"""
学员模块数据模型
"""
from datetime import date
from uuid import UUID

from pydantic import BaseModel

from apps.core.models import SoftDeleteMixin, SupabaseModel


class Student(SupabaseModel, SoftDeleteMixin):
    """学员"""
    name: str
    gender: str | None = None
    birth_date: date | None = None
    phone: str | None = None
    email: str | None = None
    school: str | None = None
    grade: str | None = None
    status: str = "active"
    source: str | None = None
    notes: str | None = None
    assigned_to: UUID | None = None
    department_id: UUID | None = None
    created_by: UUID | None = None


class Parent(SupabaseModel):
    """家长/监护人"""
    student_id: UUID
    name: str
    relationship: str | None = None
    phone: str | None = None
    wechat_id: str | None = None
    is_primary_contact: bool = False


class Tag(BaseModel):
    """标签"""
    id: UUID
    name: str
    color: str | None = None
    category: str | None = None
    created_at: str | None = None


class StudentDetail(Student):
    """学员详情（含家长和标签）"""
    parents: list[Parent] = []
    tags: list[Tag] = []
