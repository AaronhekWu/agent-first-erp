"""
促销模块视图
"""
import json
from uuid import UUID

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from apps.core.deps import get_promo_service


@require_GET
def list_campaigns(request):
    """获取所有活跃促销活动"""
    svc = get_promo_service()
    campaigns = svc.list_active_campaigns()
    return JsonResponse({
        "campaigns": [c.model_dump(mode="json") for c in campaigns],
        "count": len(campaigns),
    })


@require_GET
def campaign_detail(request, campaign_id):
    """获取促销活动详情"""
    svc = get_promo_service()
    campaign = svc.get_campaign(UUID(campaign_id))
    if not campaign:
        return JsonResponse({"error": "活动不存在"}, status=404)
    return JsonResponse(campaign.model_dump(mode="json"))


@csrf_exempt
@require_http_methods(["POST"])
def create_campaign(request):
    """创建促销活动"""
    svc = get_promo_service()
    data = json.loads(request.body)
    user_id = UUID(request.META.get("HTTP_X_USER_ID", "00000000-0000-0000-0000-000000000000"))
    campaign = svc.create_campaign(data, user_id)
    return JsonResponse(campaign.model_dump(mode="json"), status=201)


@csrf_exempt
@require_http_methods(["POST"])
def create_referral(request):
    """创建推荐记录"""
    svc = get_promo_service()
    data = json.loads(request.body)
    referrer_id = UUID(data["referrer_student_id"])
    referred_id = UUID(data["referred_student_id"])
    campaign_id = UUID(data["campaign_id"]) if data.get("campaign_id") else None
    referral = svc.create_referral(referrer_id, referred_id, campaign_id)
    return JsonResponse(referral.model_dump(mode="json"), status=201)


@require_GET
def student_referrals(request, student_id):
    """获取学员的推荐记录"""
    svc = get_promo_service()
    referrals = svc.get_referrals_by_student(UUID(student_id))
    return JsonResponse({
        "referrals": [r.model_dump(mode="json") for r in referrals],
        "count": len(referrals),
    })
