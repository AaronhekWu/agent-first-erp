"""
Agent 模块视图

提供会话管理和工具调用 API。
工具调用通过 ToolGateway 执行，是 AI Agent 与业务系统交互的唯一入口。
"""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from apps.core.deps import get_agent_service, get_services_map, get_tool_gateway
from apps.tools.gateway import ToolContext

# 确保工具处理函数被注册
import apps.tools.student_tools  # noqa: F401
import apps.tools.followup_tools  # noqa: F401
import apps.tools.course_tools  # noqa: F401


@csrf_exempt
@require_http_methods(["POST"])
def create_session(request):
    """创建 Agent 对话会话"""
    from uuid import UUID

    svc = get_agent_service()
    data = json.loads(request.body)

    agent_name = data.get("agent_name", "default_assistant")
    agent = svc.get_agent(agent_name)
    if not agent:
        return JsonResponse({"error": f"Agent '{agent_name}' 不存在"}, status=404)

    user_id = UUID(data.get("user_id", "00000000-0000-0000-0000-000000000000"))
    channel = data.get("channel", "api")

    session = svc.create_session(agent.id, user_id, channel, data.get("metadata"))
    return JsonResponse({
        "session_id": str(session.id),
        "agent": agent.name,
        "channel": session.channel,
    }, status=201)


@require_GET
def get_messages(request, session_id):
    """获取会话消息历史"""
    from uuid import UUID

    svc = get_agent_service()
    limit = int(request.GET.get("limit", 50))
    messages = svc.get_messages(UUID(session_id), limit)
    return JsonResponse({
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "tool_calls": m.tool_calls,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    })


@csrf_exempt
@require_http_methods(["POST"])
def execute_tool(request):
    """
    执行 Agent 工具调用

    请求体：
    {
        "session_id": "uuid",
        "tool_name": "search_students",
        "tool_input": {"query": "张三"}
    }
    """
    from uuid import UUID

    data = json.loads(request.body)
    session_id = data.get("session_id")
    tool_name = data.get("tool_name")
    tool_input = data.get("tool_input", {})

    if not tool_name:
        return JsonResponse({"error": "缺少 tool_name"}, status=400)

    user_id_str = request.META.get("HTTP_X_USER_ID")
    user_id = UUID(user_id_str) if user_id_str else None

    ctx = ToolContext(
        user_id=user_id,
        session_id=UUID(session_id) if session_id else None,
        services=get_services_map(),
    )

    gateway = get_tool_gateway()
    result = gateway.execute(tool_name, tool_input, ctx)
    return JsonResponse(result)


@require_GET
def list_tools(request):
    """列出所有可用工具"""
    from apps.tools.registry import list_tools as get_all_tools
    svc = get_agent_service()
    configs = svc.get_tool_configs()
    return JsonResponse({
        "tools": [
            {
                "name": tc.name,
                "description": tc.description,
                "input_schema": tc.input_schema,
            }
            for tc in configs
        ],
        "registered": get_all_tools(),
    })
