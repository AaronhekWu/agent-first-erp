"""
审计模块数据模型
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class OperationLog(BaseModel):
    """操作审计日志"""
    id: UUID
    user_id: UUID | None = None
    action: str
    resource_type: str
    resource_id: UUID | None = None
    changes: dict | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime | None = None


class AgentCallLog(BaseModel):
    """Agent 调用日志"""
    id: UUID
    session_id: UUID | None = None
    tool_name: str
    tool_input: dict | None = None
    tool_output: dict | None = None
    status: str
    duration_ms: int | None = None
    error_message: str | None = None
    created_at: datetime | None = None
