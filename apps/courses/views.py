"""
课程模块视图
"""
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from apps.core.deps import get_course_service


@require_GET
def list_courses(request):
    """分页查询课程列表"""
    svc = get_course_service()
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 20))
    courses, total = svc.list_courses(page=page, page_size=page_size)
    return JsonResponse({
        "courses": [c.model_dump(mode="json") for c in courses],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@require_GET
def student_enrollments(request, student_id):
    """获取学员报名记录"""
    from uuid import UUID

    svc = get_course_service()
    enrollments = svc.get_student_enrollments(UUID(student_id))
    return JsonResponse({
        "enrollments": [e.model_dump(mode="json") for e in enrollments],
        "count": len(enrollments),
    })


@require_GET
def attendance_summary(request, student_id):
    """获取学员考勤统计"""
    from uuid import UUID

    svc = get_course_service()
    course_id = request.GET.get("course_id")
    cid = UUID(course_id) if course_id else None
    summaries = svc.get_attendance_summary(UUID(student_id), cid)
    return JsonResponse({"summaries": summaries})
