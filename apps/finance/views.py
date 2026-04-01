"""
财务模块视图
"""
import json
from uuid import UUID

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from apps.core.deps import get_finance_service


@require_GET
def get_account(request, student_id):
    """获取学生账户及余额"""
    svc = get_finance_service()
    account = svc.get_or_create_account(UUID(student_id))
    return JsonResponse(account.model_dump(mode="json"))


@require_GET
def get_transactions(request, student_id):
    """获取交易流水"""
    svc = get_finance_service()
    limit = int(request.GET.get("limit", 50))
    transactions = svc.get_transaction_history(UUID(student_id), limit=limit)
    return JsonResponse({
        "transactions": [t.model_dump(mode="json") for t in transactions],
        "count": len(transactions),
    })


@csrf_exempt
@require_http_methods(["POST"])
def create_recharge(request):
    """创建充值"""
    svc = get_finance_service()
    data = json.loads(request.body)

    student_id = data.get("student_id")
    amount = data.get("amount")
    payment_method = data.get("payment_method")

    if not student_id or not amount or not payment_method:
        return JsonResponse({"error": "缺少必填字段：student_id, amount, payment_method"}, status=400)

    from decimal import Decimal

    user_id = UUID(request.META.get("HTTP_X_USER_ID", "00000000-0000-0000-0000-000000000000"))
    campaign_id = UUID(data["campaign_id"]) if data.get("campaign_id") else None
    bonus_amount = Decimal(str(data.get("bonus_amount", "0.00")))
    notes = data.get("notes")

    recharge = svc.recharge(
        student_id=UUID(student_id),
        amount=Decimal(str(amount)),
        payment_method=payment_method,
        user_id=user_id,
        campaign_id=campaign_id,
        bonus_amount=bonus_amount,
        notes=notes,
    )
    return JsonResponse(recharge.model_dump(mode="json"), status=201)
