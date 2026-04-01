"""
课程模块仓库层
"""
from uuid import UUID

from supabase import Client

from apps.core.constants import CourseTables
from apps.core.repositories import BaseRepository, SoftDeleteRepository
from .models import Attendance, Course, CoursePrice, Enrollment


class CourseRepository(SoftDeleteRepository[Course]):
    """课程仓库"""

    def __init__(self, client: Client):
        super().__init__(client, CourseTables.COURSES, Course)


class CoursePriceRepository(BaseRepository[CoursePrice]):
    """课程价格方案仓库"""

    def __init__(self, client: Client):
        super().__init__(client, CourseTables.COURSE_PRICES, CoursePrice)

    def get_by_course(self, course_id: UUID) -> list[CoursePrice]:
        """获取课程的所有价格方案"""
        resp = self._query().select("*").eq("course_id", str(course_id)).eq("status", "active").order("is_default", desc=True).execute()
        return self._parse_list(resp.data)

    def get_default_price(self, course_id: UUID) -> CoursePrice | None:
        """获取课程的默认价格方案"""
        resp = self._query().select("*").eq("course_id", str(course_id)).eq("is_default", True).eq("status", "active").execute()
        if not resp.data:
            return None
        return self._parse(resp.data[0])


class EnrollmentRepository(BaseRepository[Enrollment]):
    """报名仓库"""

    def __init__(self, client: Client):
        super().__init__(client, CourseTables.ENROLLMENTS, Enrollment)

    def get_by_student(self, student_id: UUID) -> list[Enrollment]:
        """获取学员的所有报名记录"""
        resp = self._query().select("*").eq("student_id", str(student_id)).order("enrolled_at", desc=True).execute()
        return self._parse_list(resp.data)

    def get_by_course(self, course_id: UUID) -> list[Enrollment]:
        """获取课程的所有报名记录"""
        resp = self._query().select("*").eq("course_id", str(course_id)).execute()
        return self._parse_list(resp.data)


class AttendanceRepository(BaseRepository[Attendance]):
    """考勤仓库"""

    def __init__(self, client: Client):
        super().__init__(client, CourseTables.ATTENDANCE, Attendance)

    def get_by_enrollment(self, enrollment_id: UUID) -> list[Attendance]:
        """获取报名记录的所有考勤"""
        resp = (
            self._query()
            .select("*")
            .eq("enrollment_id", str(enrollment_id))
            .order("class_date", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def get_summary(self, enrollment_id: UUID) -> dict:
        """获取考勤统计摘要"""
        records = self.get_by_enrollment(enrollment_id)
        total = len(records)
        counts = {"present": 0, "absent": 0, "late": 0, "excused": 0}
        for r in records:
            if r.status in counts:
                counts[r.status] += 1
        return {"total": total, **counts}
