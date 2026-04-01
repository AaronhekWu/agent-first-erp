"""
财务模块数据模型
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from apps.core.models import SupabaseModel, TimestampMixin


class Account(SupabaseModel):
    """学生财务账户"""
    student_id: UUID
    balance: Decimal = Decimal("0.00")
    total_recharged: Decimal = Decimal("0.00")
    total_consumed: Decimal = Decimal("0.00")
    total_refunded: Decimal = Decimal("0.00")
    frozen_amount: Decimal = Decimal("0.00")
    status: str = "active"


class Transaction(BaseModel):
    """交易流水（不可变）"""
    id: UUID
    account_id: UUID
    type: str  # recharge|consume|refund|transfer_out|transfer_in|gift|adjustment
    amount: Decimal
    balance_before: Decimal
    balance_after: Decimal
    reference_type: str | None = None
    reference_id: UUID | None = None
    description: str | None = None
    metadata: dict = {}
    created_by: UUID | None = None
    created_at: datetime | None = None


class Recharge(SupabaseModel):
    """充值记录"""
    account_id: UUID
    amount: Decimal
    payment_method: str | None = None
    payment_ref: str | None = None
    campaign_id: UUID | None = None
    bonus_amount: Decimal = Decimal("0.00")
    notes: str | None = None
    status: str = "completed"
    created_by: UUID | None = None


class ConsumptionLog(BaseModel):
    """课消记录（不可变）"""
    id: UUID
    enrollment_id: UUID
    attendance_id: UUID | None = None
    lesson_count: int = 1
    unit_price: Decimal
    amount: Decimal
    type: str = "normal"
    notes: str | None = None
    created_by: UUID | None = None
    created_at: datetime | None = None


class Transfer(SupabaseModel):
    """转课记录"""
    student_id: UUID
    from_enrollment_id: UUID
    from_remaining_lessons: int
    from_unit_price: Decimal
    from_total_value: Decimal
    to_course_id: UUID
    to_price_id: UUID | None = None
    to_unit_price: Decimal
    to_lessons_converted: int
    to_enrollment_id: UUID | None = None
    price_difference: Decimal = Decimal("0.00")
    handling_fee: Decimal = Decimal("0.00")
    status: str = "completed"
    notes: str | None = None
    approved_by: UUID | None = None
    created_by: UUID | None = None
