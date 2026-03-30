"""
跟进服务

提供跟进记录的创建、查询、提醒等业务逻辑。
"""
from typing import Any
from uuid import UUID

from apps.audits.services import AuditService
from apps.followups.models import FollowupRecord
from apps.followups.repositories import FollowupRepository


class FollowupService:
    """跟进服务"""

    def __init__(self, followup_repo: FollowupRepository, audit_service: AuditService):
        self._repo = followup_repo
        self._audit = audit_service

    def get_history(self, student_id: UUID, limit: int = 20) -> list[FollowupRecord]:
        """获取学员的跟进历史"""
        return self._repo.get_by_student(student_id, limit)

    def create_record(self, data: dict[str, Any], operator_id: UUID) -> FollowupRecord:
        """创建跟进记录"""
        data["created_by"] = operator_id
        record = self._repo.create(data)
        self._audit.log_operation(
            user_id=operator_id,
            action="create",
            resource_type="followup",
            resource_id=record.id,
            changes={"new": data},
        )
        return record

    def update_record(self, record_id: UUID, data: dict[str, Any], operator_id: UUID) -> FollowupRecord:
        """更新跟进记录"""
        old = self._repo.get_by_id(record_id)
        record = self._repo.update(record_id, data)
        self._audit.log_operation(
            user_id=operator_id,
            action="update",
            resource_type="followup",
            resource_id=record_id,
            changes={"old": old.model_dump() if old else None, "new": data},
        )
        return record

    def get_pending_reminders(self) -> list[FollowupRecord]:
        """获取待发送的跟进提醒"""
        return self._repo.get_pending_reminders()

    def mark_reminded(self, record_id: UUID) -> FollowupRecord:
        """标记跟进已提醒"""
        return self._repo.mark_reminded(record_id)
