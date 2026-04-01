"""
财务相关工具

供 AI Agent 通过 ToolGateway 调用。
"""
from typing import Any

from apps.tools.gateway import ToolContext
from apps.tools.registry import register_tool


@register_tool("get_student_balance")
def get_student_balance(ctx: ToolContext, student_id: str) -> dict[str, Any]:
    """查询学生账户余额"""
    from uuid import UUID

    svc = ctx.get_service("finance_service")
    account = svc.get_or_create_account(UUID(student_id))
    return {
        "student_id": student_id,
        "balance": str(account.balance),
        "total_recharged": str(account.total_recharged),
        "total_consumed": str(account.total_consumed),
        "total_refunded": str(account.total_refunded),
        "frozen_amount": str(account.frozen_amount),
        "status": account.status,
    }


@register_tool("get_transaction_history")
def get_transaction_history(ctx: ToolContext, student_id: str, limit: int = 20) -> dict[str, Any]:
    """查询学生交易流水"""
    from uuid import UUID

    svc = ctx.get_service("finance_service")
    transactions = svc.get_transaction_history(UUID(student_id), limit=limit)
    return {
        "student_id": student_id,
        "transactions": [
            {
                "id": str(t.id),
                "type": t.type,
                "amount": str(t.amount),
                "balance_after": str(t.balance_after),
                "description": t.description,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in transactions
        ],
        "count": len(transactions),
    }


@register_tool("get_enrollment_financial_detail")
def get_enrollment_financial_detail(ctx: ToolContext, student_id: str) -> dict[str, Any]:
    """获取学生报名的财务详情（含课时消耗、余额等）"""
    from uuid import UUID

    course_svc = ctx.get_service("course_service")
    enrollments = course_svc.get_student_enrollments(UUID(student_id))
    return {
        "student_id": student_id,
        "enrollments": [
            {
                "id": str(e.id),
                "course_id": str(e.course_id),
                "status": e.status,
                "unit_price": str(e.unit_price) if e.unit_price else None,
                "total_lessons": e.total_lessons,
                "consumed_lessons": e.consumed_lessons,
                "remaining_lessons": e.remaining_lessons,
                "total_amount": str(e.total_amount) if e.total_amount else None,
                "paid_amount": str(e.paid_amount) if e.paid_amount else None,
                "discount_amount": str(e.discount_amount),
                "source": e.source,
            }
            for e in enrollments
        ],
        "count": len(enrollments),
    }


@register_tool("get_active_campaigns")
def get_active_campaigns(ctx: ToolContext) -> dict[str, Any]:
    """获取当前活跃的促销活动"""
    svc = ctx.get_service("promo_service")
    campaigns = svc.list_active_campaigns()
    return {
        "campaigns": [
            {
                "id": str(c.id),
                "name": c.name,
                "type": c.type,
                "discount_type": c.discount_type,
                "discount_value": str(c.discount_value) if c.discount_value else None,
                "gift_lessons": c.gift_lessons,
                "start_date": str(c.start_date) if c.start_date else None,
                "end_date": str(c.end_date) if c.end_date else None,
                "status": c.status,
            }
            for c in campaigns
        ],
        "count": len(campaigns),
    }
