"""
学员相关工具

供 AI Agent 通过 ToolGateway 调用。
"""
from typing import Any

from apps.tools.gateway import ToolContext
from apps.tools.registry import register_tool


@register_tool("search_students")
def search_students(ctx: ToolContext, query: str, limit: int = 10) -> dict[str, Any]:
    """根据姓名模糊搜索学员"""
    svc = ctx.get_service("student_service")
    students = svc.search(query, limit)
    return {
        "students": [
            {
                "id": str(s.id),
                "name": s.name,
                "phone": s.phone,
                "status": s.status,
                "school": s.school,
                "grade": s.grade,
            }
            for s in students
        ],
        "count": len(students),
    }


@register_tool("get_student_detail")
def get_student_detail(ctx: ToolContext, student_id: str) -> dict[str, Any]:
    """获取学员详细信息（含家长和标签）"""
    from uuid import UUID

    svc = ctx.get_service("student_service")
    detail = svc.get_detail(UUID(student_id))
    if not detail:
        return {"error": "学员不存在"}
    return {
        "id": str(detail.id),
        "name": detail.name,
        "gender": detail.gender,
        "birth_date": str(detail.birth_date) if detail.birth_date else None,
        "phone": detail.phone,
        "email": detail.email,
        "school": detail.school,
        "grade": detail.grade,
        "status": detail.status,
        "source": detail.source,
        "notes": detail.notes,
        "parents": [
            {
                "name": p.name,
                "relationship": p.relationship,
                "phone": p.phone,
                "is_primary_contact": p.is_primary_contact,
            }
            for p in detail.parents
        ],
        "tags": [{"name": t.name, "color": t.color} for t in detail.tags],
    }
