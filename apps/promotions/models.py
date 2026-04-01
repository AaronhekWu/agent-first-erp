"""
促销模块数据模型
"""
from datetime import date
from decimal import Decimal
from uuid import UUID

from apps.core.models import SupabaseModel


class Campaign(SupabaseModel):
    """促销活动"""
    name: str
    type: str  # trial|referral|package|seasonal|custom
    description: str | None = None
    rules: dict = {}
    discount_type: str | None = None  # percent|fixed|gift_lessons|free_trial
    discount_value: Decimal | None = None
    gift_lessons: int = 0
    applicable_course_ids: list = []
    start_date: date | None = None
    end_date: date | None = None
    max_usage: int | None = None
    used_count: int = 0
    status: str = "active"
    created_by: UUID | None = None


class Referral(SupabaseModel):
    """老带新推荐记录"""
    campaign_id: UUID | None = None
    referrer_student_id: UUID
    referred_student_id: UUID
    referrer_bonus_type: str | None = None
    referrer_bonus_value: Decimal | None = None
    referrer_bonus_applied: bool = False
    referred_bonus_type: str | None = None
    referred_bonus_value: Decimal | None = None
    referred_bonus_applied: bool = False
    status: str = "pending"  # pending|verified|rewarded|expired
