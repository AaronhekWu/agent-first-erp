"""
Pydantic 基础模型

所有模块的数据模型继承自此处的基类，提供统一的序列化和校验能力。
不使用 Django ORM Model——数据存储完全通过 Supabase 客户端。
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TimestampMixin(BaseModel):
    """时间戳混入，包含 created_at 和 updated_at"""
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SupabaseModel(TimestampMixin):
    """Supabase 数据模型基类，所有业务实体继承此类"""
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class SoftDeleteMixin(BaseModel):
    """软删除混入"""
    deleted_at: datetime | None = None
