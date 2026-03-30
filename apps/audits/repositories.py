"""
审计模块仓库层

审计日志仅支持追加和查询，不允许更新和删除。
"""
from typing import Any
from uuid import UUID

from supabase import Client

from apps.core.constants import AuditTables
from apps.core.repositories import BaseRepository
from .models import AgentCallLog, OperationLog


class OperationLogRepository(BaseRepository[OperationLog]):
    """操作日志仓库（仅追加）"""

    def __init__(self, client: Client):
        super().__init__(client, AuditTables.OPERATION_LOGS, OperationLog)

    def update(self, *args, **kwargs):
        raise NotImplementedError("审计日志不允许更新")

    def delete(self, *args, **kwargs):
        raise NotImplementedError("审计日志不允许删除")

    def query_by_resource(self, resource_type: str, resource_id: UUID) -> list[OperationLog]:
        """按资源查询操作日志"""
        resp = (
            self._query()
            .select("*")
            .eq("resource_type", resource_type)
            .eq("resource_id", str(resource_id))
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def query_by_user(self, user_id: UUID, limit: int = 50) -> list[OperationLog]:
        """按用户查询操作日志"""
        resp = (
            self._query()
            .select("*")
            .eq("user_id", str(user_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return self._parse_list(resp.data)


class AgentCallLogRepository(BaseRepository[AgentCallLog]):
    """Agent 调用日志仓库（仅追加）"""

    def __init__(self, client: Client):
        super().__init__(client, AuditTables.AGENT_CALL_LOGS, AgentCallLog)

    def update(self, *args, **kwargs):
        raise NotImplementedError("审计日志不允许更新")

    def delete(self, *args, **kwargs):
        raise NotImplementedError("审计日志不允许删除")

    def query_by_session(self, session_id: UUID) -> list[AgentCallLog]:
        """按会话查询调用日志"""
        resp = (
            self._query()
            .select("*")
            .eq("session_id", str(session_id))
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)
