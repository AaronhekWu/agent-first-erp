"""
促销服务

提供促销活动管理、推荐奖励等业务逻辑。
"""
from datetime import date
from uuid import UUID

from apps.audits.services import AuditService
from apps.promotions.models import Campaign, Referral
from apps.promotions.repositories import CampaignRepository, ReferralRepository


class PromoService:
    """促销服务"""

    def __init__(
        self,
        campaign_repo: CampaignRepository,
        referral_repo: ReferralRepository,
        audit_service: AuditService,
    ):
        self._campaign_repo = campaign_repo
        self._referral_repo = referral_repo
        self._audit = audit_service

    # ---- 促销活动 ----

    def list_active_campaigns(self) -> list[Campaign]:
        """获取所有活跃促销活动"""
        return self._campaign_repo.get_active_campaigns()

    def get_campaign(self, campaign_id: UUID) -> Campaign | None:
        """获取促销活动详情"""
        return self._campaign_repo.get_by_id(campaign_id)

    def create_campaign(self, data: dict, user_id: UUID = None) -> Campaign:
        """创建促销活动"""
        if user_id:
            data["created_by"] = user_id
        campaign = self._campaign_repo.create(data)
        if user_id:
            self._audit.log_operation(
                user_id=user_id,
                action="create",
                resource_type="campaign",
                resource_id=campaign.id,
            )
        return campaign

    def check_campaign_validity(self, campaign_id: UUID) -> bool:
        """检查活动是否有效（未过期、未超额）"""
        campaign = self._campaign_repo.get_by_id(campaign_id)
        if not campaign:
            return False
        if campaign.status != "active":
            return False
        if campaign.end_date and campaign.end_date < date.today():
            return False
        if campaign.max_usage is not None and campaign.used_count >= campaign.max_usage:
            return False
        return True

    def increment_campaign_usage(self, campaign_id: UUID) -> Campaign:
        """递增活动使用次数"""
        campaign = self._campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError("活动不存在")
        return self._campaign_repo.update(
            campaign_id, {"used_count": campaign.used_count + 1}
        )

    # ---- 推荐 ----

    def create_referral(
        self,
        referrer_id: UUID,
        referred_id: UUID,
        campaign_id: UUID = None,
    ) -> Referral:
        """创建推荐记录"""
        data = {
            "referrer_student_id": referrer_id,
            "referred_student_id": referred_id,
            "status": "pending",
        }
        if campaign_id:
            data["campaign_id"] = campaign_id
            # 如果关联了活动，从活动中获取奖励信息
            campaign = self._campaign_repo.get_by_id(campaign_id)
            if campaign and campaign.rules:
                data["referrer_bonus_type"] = campaign.rules.get("referrer_bonus_type")
                data["referrer_bonus_value"] = campaign.rules.get("referrer_bonus_value")
                data["referred_bonus_type"] = campaign.rules.get("referred_bonus_type")
                data["referred_bonus_value"] = campaign.rules.get("referred_bonus_value")
        return self._referral_repo.create(data)

    def apply_referral_rewards(
        self, referral_id: UUID, user_id: UUID = None
    ) -> Referral:
        """发放推荐奖励（标记为已发放）"""
        referral = self._referral_repo.get_by_id(referral_id)
        if not referral:
            raise ValueError("推荐记录不存在")
        if referral.status not in ("verified", "pending"):
            raise ValueError(f"推荐记录状态不正确: {referral.status}")

        updated = self._referral_repo.update(referral_id, {
            "referrer_bonus_applied": True,
            "referred_bonus_applied": True,
            "status": "rewarded",
        })

        if user_id:
            self._audit.log_operation(
                user_id=user_id,
                action="apply_reward",
                resource_type="referral",
                resource_id=referral_id,
            )
        return updated

    def get_referrals_by_student(self, student_id: UUID) -> list[Referral]:
        """获取学员的推荐记录（包括作为推荐人和被推荐人）"""
        as_referrer = self._referral_repo.get_by_referrer(student_id)
        as_referred = self._referral_repo.get_by_referred(student_id)
        return as_referrer + as_referred
