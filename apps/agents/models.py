"""
Agent 模块数据模型
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from apps.core.models import SupabaseModel


class Agent(SupabaseModel):
    """AI Agent 配置"""
    name: str
    description: str | None = None
    system_prompt: str | None = None
    model_id: str
    model_config: dict = {}
    tools: list = []
    is_active: bool = True
    created_by: UUID | None = None


class PromptTemplate(SupabaseModel):
    """Prompt 模板"""
    agent_id: UUID
    name: str
    template: str
    variables: list = []
    is_active: bool = True
    version: int = 1


class Session(SupabaseModel):
    """对话会话"""
    agent_id: UUID
    user_id: UUID | None = None
    channel: str
    status: str = "active"
    metadata: dict = {}


class Message(BaseModel):
    """对话消息"""
    id: UUID
    session_id: UUID
    role: str
    content: str | None = None
    tool_calls: dict | None = None
    tool_call_id: str | None = None
    token_count: int | None = None
    created_at: datetime | None = None


class ToolConfig(SupabaseModel):
    """工具配置"""
    name: str
    description: str | None = None
    input_schema: dict
    handler: str
    requires_auth: bool = True
    is_active: bool = True
    rate_limit: int | None = None
