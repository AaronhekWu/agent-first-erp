"""
跟进模块视图
"""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from apps.core.deps import get_followup_service


@require_GET
def followup_history(request, student_id):
    """获取学员跟进历史"""
    from uuid import UUID

    svc = get_followup_service()
    limit = int(request.GET.get("limit", 20))
    records = svc.get_history(UUID(student_id), limit)
    return JsonResponse({
        "records": [r.model_dump(mode="json") for r in records],
        "count": len(records),
    })


@csrf_exempt
@require_http_methods(["POST"])
def create_followup(request):
    """创建跟进记录"""
    from uuid import UUID

    svc = get_followup_service()
    data = json.loads(request.body)
    operator_id = UUID(request.META.get("HTTP_X_USER_ID", "00000000-0000-0000-0000-000000000000"))
    record = svc.create_record(data, operator_id)
    return JsonResponse(record.model_dump(mode="json"), status=201)


@require_GET
def pending_reminders(request):
    """获取待发送的跟进提醒"""
    svc = get_followup_service()
    records = svc.get_pending_reminders()
    return JsonResponse({
        "records": [r.model_dump(mode="json") for r in records],
        "count": len(records),
    })
