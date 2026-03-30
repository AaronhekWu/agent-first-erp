"""
审计服务

提供审计日志的记录和查询能力。被其他服务依赖，需最先实现。
"""
from typing import Any
from uuid import UUID

from apps.audits.repositories import AgentCallLogRepository, OperationLogRepository


class AuditService:
    """审计服务：负责操作日志和 Agent 调用日志"""

    def __init__(
        self,
        operation_log_repo: OperationLogRepository,
        agent_call_log_repo: AgentCallLogRepository,
    ):
        self._op_repo = operation_log_repo
        self._agent_repo = agent_call_log_repo

    def log_operation(
        self,
        *,
        user_id: UUID | None,
        action: str,
        resource_type: str,
        resource_id: UUID | None = None,
        changes: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """记录业务操作日志"""
        data = {
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "changes": changes,
            "ip_address": ip_address,
            "user_agent": user_agent,
        }
        self._op_repo.create({k: v for k, v in data.items() if v is not None})

    def log_agent_call(
        self,
        *,
        session_id: UUID | None,
        tool_name: str,
        tool_input: dict | None = None,
        tool_output: dict | None = None,
        status: str,
        duration_ms: int | None = None,
        error_message: str | None = None,
    ) -> None:
        """记录 Agent 工具调用日志"""
        data = {
            "session_id": session_id,
            "tool_name": tool_name,
            "tool_input": tool_input,
            "tool_output": tool_output,
            "status": status,
            "duration_ms": duration_ms,
            "error_message": error_message,
        }
        self._agent_repo.create({k: v for k, v in data.items() if v is not None})

    def get_operation_logs(self, resource_type: str, resource_id: UUID):
        """查询资源的操作日志"""
        return self._op_repo.query_by_resource(resource_type, resource_id)

    def get_user_logs(self, user_id: UUID, limit: int = 50):
        """查询用户的操作日志"""
        return self._op_repo.query_by_user(user_id, limit)

    def get_agent_call_logs(self, session_id: UUID):
        """查询会话的 Agent 调用日志"""
        return self._agent_repo.query_by_session(session_id)
