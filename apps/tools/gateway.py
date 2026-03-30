"""
Tool Gateway — AI Agent 工具调用的唯一入口

职责：
1. 验证工具是否存在且处于活跃状态
2. 执行工具处理函数
3. 记录调用日志到审计表
4. 统一错误处理

核心约束：AI Agent 永远不直接访问数据库，必须通过此 Gateway。
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from apps.audits.services import AuditService
from apps.tools.registry import get_tool

logger = logging.getLogger(__name__)


@dataclass
class ToolContext:
    """工具执行上下文，传递给每个工具处理函数"""
    user_id: UUID | None = None
    session_id: UUID | None = None
    services: dict[str, Any] | None = None

    def get_service(self, name: str) -> Any:
        """按名称获取服务实例"""
        if self.services is None:
            raise RuntimeError(f"服务容器未初始化，无法获取 '{name}'")
        svc = self.services.get(name)
        if svc is None:
            raise RuntimeError(f"服务 '{name}' 未注册")
        return svc


class ToolGateway:
    """
    工具网关

    所有 AI Agent 的工具调用都通过此网关执行。
    网关负责日志记录、错误处理、权限校验（预留）。
    """

    def __init__(self, audit_service: AuditService):
        self._audit = audit_service

    def execute(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
        context: ToolContext,
    ) -> dict[str, Any]:
        """
        执行工具调用

        参数：
            tool_name: 工具名称（需已在 registry 中注册）
            tool_input: 工具输入参数
            context: 执行上下文（含用户身份、会话信息、服务容器）

        返回：
            工具执行结果字典
        """
        handler = get_tool(tool_name)
        if handler is None:
            error_msg = f"工具 '{tool_name}' 未注册"
            self._log_call(context.session_id, tool_name, tool_input, None, "error", 0, error_msg)
            return {"error": error_msg}

        start = time.monotonic()
        try:
            result = handler(context, **tool_input)
            duration_ms = int((time.monotonic() - start) * 1000)
            self._log_call(context.session_id, tool_name, tool_input, result, "success", duration_ms)
            return result
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            error_msg = str(e)
            logger.exception("工具 '%s' 执行失败", tool_name)
            self._log_call(context.session_id, tool_name, tool_input, None, "error", duration_ms, error_msg)
            return {"error": error_msg}

    def _log_call(
        self,
        session_id: UUID | None,
        tool_name: str,
        tool_input: dict | None,
        tool_output: dict | None,
        status: str,
        duration_ms: int,
        error_message: str | None = None,
    ) -> None:
        """记录工具调用到审计日志"""
        try:
            self._audit.log_agent_call(
                session_id=session_id,
                tool_name=tool_name,
                tool_input=tool_input,
                tool_output=tool_output,
                status=status,
                duration_ms=duration_ms,
                error_message=error_message,
            )
        except Exception:
            logger.exception("工具调用日志写入失败")
