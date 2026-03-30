"""
跟进模块仓库层
"""
from datetime import datetime, timezone
from uuid import UUID

from supabase import Client

from apps.core.constants import FollowupTables
from apps.core.repositories import BaseRepository
from .models import FollowupRecord


class FollowupRepository(BaseRepository[FollowupRecord]):
    """跟进记录仓库"""

    def __init__(self, client: Client):
        super().__init__(client, FollowupTables.RECORDS, FollowupRecord)

    def get_by_student(self, student_id: UUID, limit: int = 20) -> list[FollowupRecord]:
        """获取学员的跟进历史"""
        resp = (
            self._query()
            .select("*")
            .eq("student_id", str(student_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return self._parse_list(resp.data)

    def get_pending_reminders(self) -> list[FollowupRecord]:
        """获取待发送提醒的跟进记录"""
        now = datetime.now(timezone.utc).isoformat()
        resp = (
            self._query()
            .select("*")
            .eq("is_reminded", False)
            .not_.is_("next_date", "null")
            .lte("next_date", now)
            .order("next_date")
            .execute()
        )
        return self._parse_list(resp.data)

    def mark_reminded(self, record_id: UUID) -> FollowupRecord:
        """标记跟进记录已提醒"""
        return self.update(record_id, {"is_reminded": True})
