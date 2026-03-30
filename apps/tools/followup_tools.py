"""
跟进相关工具

供 AI Agent 通过 ToolGateway 调用。
"""
from typing import Any

from apps.tools.gateway import ToolContext
from apps.tools.registry import register_tool


@register_tool("get_followup_history")
def get_followup_history(ctx: ToolContext, student_id: str, limit: int = 20) -> dict[str, Any]:
    """获取学员跟进历史记录"""
    from uuid import UUID

    svc = ctx.get_service("followup_service")
    records = svc.get_history(UUID(student_id), limit)
    return {
        "records": [
            {
                "id": str(r.id),
                "type": r.type,
                "content": r.content,
                "result": r.result,
                "next_plan": r.next_plan,
                "next_date": r.next_date.isoformat() if r.next_date else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
        "count": len(records),
    }


@register_tool("create_followup")
def create_followup(
    ctx: ToolContext,
    student_id: str,
    type: str,
    content: str,
    result: str | None = None,
    next_plan: str | None = None,
    next_date: str | None = None,
) -> dict[str, Any]:
    """创建学员跟进记录"""
    from uuid import UUID

    svc = ctx.get_service("followup_service")
    data = {
        "student_id": student_id,
        "type": type,
        "content": content,
    }
    if result:
        data["result"] = result
    if next_plan:
        data["next_plan"] = next_plan
    if next_date:
        data["next_date"] = next_date

    operator_id = ctx.user_id or UUID("00000000-0000-0000-0000-000000000000")
    record = svc.create_record(data, operator_id)
    return {
        "id": str(record.id),
        "message": "跟进记录创建成功",
    }
