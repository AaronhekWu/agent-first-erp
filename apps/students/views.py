"""
学员模块视图
"""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from apps.core.deps import get_student_service


@require_GET
def list_students(request):
    """分页查询学员列表"""
    svc = get_student_service()
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 20))
    status = request.GET.get("status")

    filters = {}
    if status:
        filters["status"] = status

    students, total = svc.list_students(filters=filters, page=page, page_size=page_size)
    return JsonResponse({
        "students": [s.model_dump(mode="json") for s in students],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@require_GET
def search_students(request):
    """搜索学员"""
    svc = get_student_service()
    query = request.GET.get("q", "")
    limit = int(request.GET.get("limit", 10))
    if not query:
        return JsonResponse({"error": "缺少搜索关键词 q"}, status=400)
    students = svc.search(query, limit)
    return JsonResponse({
        "students": [s.model_dump(mode="json") for s in students],
        "count": len(students),
    })


@require_GET
def student_detail(request, student_id):
    """获取学员详情"""
    from uuid import UUID

    svc = get_student_service()
    detail = svc.get_detail(UUID(student_id))
    if not detail:
        return JsonResponse({"error": "学员不存在"}, status=404)
    return JsonResponse(detail.model_dump(mode="json"))


@csrf_exempt
@require_http_methods(["POST"])
def create_student(request):
    """创建学员"""
    from uuid import UUID

    svc = get_student_service()
    data = json.loads(request.body)
    # TODO: 从认证信息中获取 operator_id，当前使用占位
    operator_id = UUID(request.META.get("HTTP_X_USER_ID", "00000000-0000-0000-0000-000000000000"))
    student = svc.create_student(data, operator_id)
    return JsonResponse(student.model_dump(mode="json"), status=201)
