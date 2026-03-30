"""
审计模块视图

仅管理员可访问审计日志。
"""
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from apps.core.deps import get_audit_service


@require_GET
def operation_logs(request):
    """查询操作日志"""
    from uuid import UUID

    svc = get_audit_service()
    resource_type = request.GET.get("resource_type")
    resource_id = request.GET.get("resource_id")
    user_id = request.GET.get("user_id")

    if resource_type and resource_id:
        logs = svc.get_operation_logs(resource_type, UUID(resource_id))
    elif user_id:
        logs = svc.get_user_logs(UUID(user_id))
    else:
        return JsonResponse({"error": "需要提供 resource_type+resource_id 或 user_id"}, status=400)

    return JsonResponse({
        "logs": [log.model_dump(mode="json") for log in logs],
        "count": len(logs),
    })


@require_GET
def agent_call_logs(request, session_id):
    """查询 Agent 调用日志"""
    from uuid import UUID

    svc = get_audit_service()
    logs = svc.get_agent_call_logs(UUID(session_id))
    return JsonResponse({
        "logs": [log.model_dump(mode="json") for log in logs],
        "count": len(logs),
    })
