"""
课程模块数据模型
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from apps.core.models import SoftDeleteMixin, SupabaseModel


class Course(SupabaseModel, SoftDeleteMixin):
    """课程"""
    name: str
    description: str | None = None
    subject: str | None = None
    level: str | None = None
    max_capacity: int | None = None
    fee: Decimal | None = None
    status: str = "active"
    start_date: date | None = None
    end_date: date | None = None
    schedule_info: dict = {}
    department_id: UUID | None = None
    created_by: UUID | None = None


class CoursePrice(SupabaseModel):
    """课程价格方案"""
    course_id: UUID
    name: str
    price_type: str = "per_lesson"  # per_lesson|package|semester
    unit_price: Decimal
    total_lessons: int | None = None
    total_price: Decimal | None = None
    discount_rate: Decimal = Decimal("1.0000")
    is_default: bool = False
    effective_from: date | None = None
    effective_to: date | None = None
    status: str = "active"
    created_by: UUID | None = None


class Enrollment(SupabaseModel):
    """报名记录"""
    student_id: UUID
    course_id: UUID
    status: str = "enrolled"
    enrolled_at: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = None
    created_by: UUID | None = None
    # 财务相关字段
    price_id: UUID | None = None
    campaign_id: UUID | None = None
    unit_price: Decimal | None = None
    total_lessons: int | None = None
    consumed_lessons: int = 0
    remaining_lessons: int | None = None
    total_amount: Decimal | None = None
    paid_amount: Decimal | None = None
    discount_amount: Decimal = Decimal("0.00")
    source: str = "normal"  # normal|trial|referral|transfer_in|gift
    original_enrollment_id: UUID | None = None


class Attendance(SupabaseModel):
    """考勤记录"""
    enrollment_id: UUID
    class_date: date
    status: str
    notes: str | None = None
    marked_by: UUID | None = None
