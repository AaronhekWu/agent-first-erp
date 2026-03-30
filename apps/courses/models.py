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


class Enrollment(SupabaseModel):
    """报名记录"""
    student_id: UUID
    course_id: UUID
    status: str = "enrolled"
    enrolled_at: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = None
    created_by: UUID | None = None


class Attendance(SupabaseModel):
    """考勤记录"""
    enrollment_id: UUID
    class_date: date
    status: str
    notes: str | None = None
    marked_by: UUID | None = None
