"""
跟进模块数据模型
"""
from datetime import datetime
from uuid import UUID

from apps.core.models import SupabaseModel


class FollowupRecord(SupabaseModel):
    """跟进记录"""
    student_id: UUID
    type: str
    content: str
    result: str | None = None
    next_plan: str | None = None
    next_date: datetime | None = None
    is_reminded: bool = False
    created_by: UUID | None = None
