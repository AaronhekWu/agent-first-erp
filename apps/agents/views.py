"""
AI 知识库与工具调用视图

提供：
1. 知识库文档 CRUD API
2. ToolGateway 工具执行 API（AI Agent 与业务系统交互的唯一入口）

Agent 配置/会话/消息由后端 Claude 管理，不在此处理。
校区助手 AI 界面暂未实现，仅保留工具执行接口。
"""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from apps.core.deps import get_knowledge_service, get_services_map, get_tool_gateway
from apps.tools.gateway import ToolContext

# 确保工具处理函数被注册
import apps.tools.student_tools  # noqa: F401
import apps.tools.followup_tools  # noqa: F401
import apps.tools.course_tools  # noqa: F401
import apps.tools.finance_tools  # noqa: F401


# ---- 知识库 API ----

@require_GET
def list_docs(request):
    """列出知识库文档"""
    svc = get_knowledge_service()
    department = request.GET.get("department")
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 20))
    docs, total = svc.list_docs(department=department, page=page, page_size=page_size)
    return JsonResponse({
        "docs": [
            {
                "id": str(d.id),
                "department": d.department,
                "title": d.title,
                "doc_type": d.doc_type,
                "is_active": d.is_active,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
        "total": total,
    })


@require_GET
def get_doc(request, doc_id):
    """获取文档详情"""
    from uuid import UUID
    svc = get_knowledge_service()
    doc = svc.get_doc(UUID(doc_id))
    if not doc:
        return JsonResponse({"error": "文档不存在"}, status=404)
    return JsonResponse({
        "id": str(doc.id),
        "department": doc.department,
        "title": doc.title,
        "content": doc.content,
        "doc_type": doc.doc_type,
        "source": doc.source,
        "metadata": doc.metadata,
        "is_active": doc.is_active,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    })


@csrf_exempt
@require_http_methods(["POST"])
def create_doc(request):
    """创建知识库文档"""
    from uuid import UUID
    data = json.loads(request.body)
    user_id_str = request.META.get("HTTP_X_USER_ID")
    user_id = UUID(user_id_str) if user_id_str else None

    svc = get_knowledge_service()
    doc = svc.create_doc(data, user_id=user_id)
    return JsonResponse({
        "id": str(doc.id),
        "title": doc.title,
        "department": doc.department,
    }, status=201)


# ---- 工具执行 API（校区助手预留接口） ----

@csrf_exempt
@require_http_methods(["POST"])
def execute_tool(request):
    """
    执行 Agent 工具调用

    请求体：
    {
        "tool_name": "search_students",
        "tool_input": {"query": "张三"}
    }
    """
    from uuid import UUID

    data = json.loads(request.body)
    tool_name = data.get("tool_name")
    tool_input = data.get("tool_input", {})

    if not tool_name:
        return JsonResponse({"error": "缺少 tool_name"}, status=400)

    user_id_str = request.META.get("HTTP_X_USER_ID")
    user_id = UUID(user_id_str) if user_id_str else None

    ctx = ToolContext(
        user_id=user_id,
        services=get_services_map(),
    )

    gateway = get_tool_gateway()
    result = gateway.execute(tool_name, tool_input, ctx)
    return JsonResponse(result)


@require_GET
def list_tools(request):
    """列出所有可用工具"""
    from apps.tools.registry import list_tools as get_all_tools
    return JsonResponse({"tools": get_all_tools()})
