"""
Agent 模块仓库层
"""
from uuid import UUID

from supabase import Client

from apps.core.constants import AgentTables
from apps.core.repositories import BaseRepository
from .models import Agent, Message, PromptTemplate, Session, ToolConfig


class AgentRepository(BaseRepository[Agent]):
    """Agent 配置仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AgentTables.AGENTS, Agent)

    def get_active_by_name(self, name: str) -> Agent | None:
        """根据名称获取活跃的 Agent"""
        resp = self._query().select("*").eq("name", name).eq("is_active", True).execute()
        if not resp.data:
            return None
        return self._parse(resp.data[0])


class PromptTemplateRepository(BaseRepository[PromptTemplate]):
    """Prompt 模板仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AgentTables.PROMPT_TEMPLATES, PromptTemplate)

    def get_active_by_agent(self, agent_id: UUID) -> list[PromptTemplate]:
        """获取 Agent 的活跃模板"""
        resp = (
            self._query()
            .select("*")
            .eq("agent_id", str(agent_id))
            .eq("is_active", True)
            .order("version", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)


class SessionRepository(BaseRepository[Session]):
    """会话仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AgentTables.SESSIONS, Session)

    def get_active_by_user(self, user_id: UUID) -> list[Session]:
        """获取用户的活跃会话"""
        resp = (
            self._query()
            .select("*")
            .eq("user_id", str(user_id))
            .eq("status", "active")
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def close_session(self, session_id: UUID) -> Session:
        """关闭会话"""
        return self.update(session_id, {"status": "closed"})


class MessageRepository(BaseRepository[Message]):
    """消息仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AgentTables.MESSAGES, Message)

    def get_by_session(self, session_id: UUID, limit: int = 50) -> list[Message]:
        """获取会话的消息历史（按时间正序）"""
        resp = (
            self._query()
            .select("*")
            .eq("session_id", str(session_id))
            .order("created_at")
            .limit(limit)
            .execute()
        )
        return self._parse_list(resp.data)

    def append(self, session_id: UUID, role: str, content: str | None = None, **kwargs) -> Message:
        """追加消息到会话"""
        data = {"session_id": str(session_id), "role": role, "content": content, **kwargs}
        return self.create(data)


class ToolConfigRepository(BaseRepository[ToolConfig]):
    """工具配置仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AgentTables.TOOL_CONFIGS, ToolConfig)

    def get_active_by_name(self, name: str) -> ToolConfig | None:
        """根据名称获取活跃的工具配置"""
        resp = self._query().select("*").eq("name", name).eq("is_active", True).execute()
        if not resp.data:
            return None
        return self._parse(resp.data[0])

    def get_all_active(self) -> list[ToolConfig]:
        """获取所有活跃工具配置"""
        resp = self._query().select("*").eq("is_active", True).execute()
        return self._parse_list(resp.data)
