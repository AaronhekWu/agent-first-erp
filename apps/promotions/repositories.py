"""
促销模块仓库层
"""
from datetime import date
from uuid import UUID

from supabase import Client

from apps.core.constants import PromoTables
from apps.core.repositories import BaseRepository
from .models import Campaign, Referral


class CampaignRepository(BaseRepository[Campaign]):
    """促销活动仓库"""

    def __init__(self, client: Client):
        super().__init__(client, PromoTables.CAMPAIGNS, Campaign)

    def get_active_campaigns(self) -> list[Campaign]:
        """获取所有活跃促销活动（状态为active且未过期）"""
        today = date.today().isoformat()
        resp = (
            self._query()
            .select("*")
            .eq("status", "active")
            .or_(f"end_date.is.null,end_date.gte.{today}")
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def get_by_type(self, type: str) -> list[Campaign]:
        """按活动类型筛选"""
        resp = (
            self._query()
            .select("*")
            .eq("type", type)
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)


class ReferralRepository(BaseRepository[Referral]):
    """推荐记录仓库"""

    def __init__(self, client: Client):
        super().__init__(client, PromoTables.REFERRALS, Referral)

    def get_by_referrer(self, student_id: UUID) -> list[Referral]:
        """获取某推荐人的所有推荐记录"""
        resp = (
            self._query()
            .select("*")
            .eq("referrer_student_id", str(student_id))
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def get_by_referred(self, student_id: UUID) -> list[Referral]:
        """获取某被推荐学员的推荐记录"""
        resp = (
            self._query()
            .select("*")
            .eq("referred_student_id", str(student_id))
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def get_pending_rewards(self) -> list[Referral]:
        """获取已验证但尚未发放奖励的推荐记录"""
        resp = (
            self._query()
            .select("*")
            .eq("status", "verified")
            .eq("referrer_bonus_applied", False)
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)
