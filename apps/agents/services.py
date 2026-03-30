"""
Agent 服务

提供会话管理、消息历史、Agent 配置等业务逻辑。
"""
from uuid import UUID

from apps.agents.models import Agent, Message, Session
from apps.agents.repositories import (
    AgentRepository,
    MessageRepository,
    SessionRepository,
    ToolConfigRepository,
)


class AgentService:
    """Agent 服务：会话管理、消息历史"""

    def __init__(
        self,
        agent_repo: AgentRepository,
        session_repo: SessionRepository,
        message_repo: MessageRepository,
        tool_config_repo: ToolConfigRepository,
    ):
        self._agent_repo = agent_repo
        self._session_repo = session_repo
        self._message_repo = message_repo
        self._tool_config_repo = tool_config_repo

    # ---- Agent 配置 ----

    def get_agent(self, name: str) -> Agent | None:
        """根据名称获取 Agent 配置"""
        return self._agent_repo.get_active_by_name(name)

    def get_default_agent(self) -> Agent | None:
        """获取默认 Agent"""
        return self._agent_repo.get_active_by_name("default_assistant")

    # ---- 会话管理 ----

    def create_session(self, agent_id: UUID, user_id: UUID, channel: str, metadata: dict | None = None) -> Session:
        """创建新会话"""
        data = {
            "agent_id": agent_id,
            "user_id": user_id,
            "channel": channel,
            "metadata": metadata or {},
        }
        return self._session_repo.create(data)

    def get_session(self, session_id: UUID) -> Session | None:
        """获取会话"""
        return self._session_repo.get_by_id(session_id)

    def close_session(self, session_id: UUID) -> Session:
        """关闭会话"""
        return self._session_repo.close_session(session_id)

    def get_user_sessions(self, user_id: UUID) -> list[Session]:
        """获取用户的活跃会话"""
        return self._session_repo.get_active_by_user(user_id)

    # ---- 消息管理 ----

    def get_messages(self, session_id: UUID, limit: int = 50) -> list[Message]:
        """获取会话消息历史"""
        return self._message_repo.get_by_session(session_id, limit)

    def add_message(self, session_id: UUID, role: str, content: str | None = None, **kwargs) -> Message:
        """追加消息"""
        return self._message_repo.append(session_id, role, content, **kwargs)

    # ---- 工具配置 ----

    def get_tool_configs(self) -> list:
        """获取所有活跃工具配置"""
        return self._tool_config_repo.get_all_active()

    def get_tool_config(self, name: str):
        """根据名称获取工具配置"""
        return self._tool_config_repo.get_active_by_name(name)
