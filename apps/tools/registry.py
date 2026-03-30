"""
工具注册表

管理所有可供 AI Agent 调用的工具函数。
工具通过装饰器注册，ToolGateway 通过名称查找并执行。
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

# 工具处理函数类型：接收 context 和 kwargs，返回字典结果
ToolHandler = Callable[..., dict[str, Any]]

# 全局工具注册表
_registry: dict[str, ToolHandler] = {}


def register_tool(name: str):
    """
    工具注册装饰器

    用法：
        @register_tool("search_students")
        def search_students(ctx, query: str, limit: int = 10) -> dict:
            ...
    """
    def decorator(func: ToolHandler) -> ToolHandler:
        if name in _registry:
            logger.warning("工具 '%s' 已注册，将被覆盖", name)
        _registry[name] = func
        return func
    return decorator


def get_tool(name: str) -> ToolHandler | None:
    """根据名称获取工具处理函数"""
    return _registry.get(name)


def list_tools() -> list[str]:
    """列出所有已注册的工具名称"""
    return list(_registry.keys())
