"""
课程相关工具

供 AI Agent 通过 ToolGateway 调用。
"""
from typing import Any

from apps.tools.gateway import ToolContext
from apps.tools.registry import register_tool


@register_tool("get_enrollments")
def get_enrollments(ctx: ToolContext, student_id: str) -> dict[str, Any]:
    """获取学员的课程报名信息"""
    from uuid import UUID

    svc = ctx.get_service("course_service")
    enrollments = svc.get_student_enrollments(UUID(student_id))
    return {
        "enrollments": [
            {
                "id": str(e.id),
                "course_id": str(e.course_id),
                "status": e.status,
                "enrolled_at": e.enrolled_at.isoformat() if e.enrolled_at else None,
            }
            for e in enrollments
        ],
        "count": len(enrollments),
    }


@register_tool("get_attendance_summary")
def get_attendance_summary(ctx: ToolContext, student_id: str, course_id: str | None = None) -> dict[str, Any]:
    """获取学员的考勤统计"""
    from uuid import UUID

    svc = ctx.get_service("course_service")
    cid = UUID(course_id) if course_id else None
    summaries = svc.get_attendance_summary(UUID(student_id), cid)
    return {
        "summaries": summaries,
        "count": len(summaries),
    }
