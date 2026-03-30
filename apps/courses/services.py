"""
课程服务

提供课程管理、报名、考勤等业务逻辑。
"""
from typing import Any
from uuid import UUID

from apps.audits.services import AuditService
from apps.courses.models import Attendance, Course, Enrollment
from apps.courses.repositories import AttendanceRepository, CourseRepository, EnrollmentRepository


class CourseService:
    """课程服务"""

    def __init__(
        self,
        course_repo: CourseRepository,
        enrollment_repo: EnrollmentRepository,
        attendance_repo: AttendanceRepository,
        audit_service: AuditService,
    ):
        self._course_repo = course_repo
        self._enrollment_repo = enrollment_repo
        self._attendance_repo = attendance_repo
        self._audit = audit_service

    # ---- 课程 ----

    def list_courses(self, page: int = 1, page_size: int = 20) -> tuple[list[Course], int]:
        """分页查询课程列表"""
        return self._course_repo.list(page=page, page_size=page_size)

    def create_course(self, data: dict[str, Any], operator_id: UUID) -> Course:
        """创建课程"""
        data["created_by"] = operator_id
        course = self._course_repo.create(data)
        self._audit.log_operation(
            user_id=operator_id, action="create", resource_type="course", resource_id=course.id,
        )
        return course

    # ---- 报名 ----

    def get_student_enrollments(self, student_id: UUID) -> list[Enrollment]:
        """获取学员的报名记录"""
        return self._enrollment_repo.get_by_student(student_id)

    def enroll_student(self, student_id: UUID, course_id: UUID, operator_id: UUID) -> Enrollment:
        """学员报名课程"""
        enrollment = self._enrollment_repo.create({
            "student_id": student_id,
            "course_id": course_id,
            "created_by": operator_id,
        })
        self._audit.log_operation(
            user_id=operator_id, action="enroll", resource_type="enrollment", resource_id=enrollment.id,
            changes={"student_id": str(student_id), "course_id": str(course_id)},
        )
        return enrollment

    # ---- 考勤 ----

    def get_attendance_summary(self, student_id: UUID, course_id: UUID | None = None) -> list[dict]:
        """获取学员的考勤统计"""
        enrollments = self._enrollment_repo.get_by_student(student_id)
        if course_id:
            enrollments = [e for e in enrollments if e.course_id == course_id]

        summaries = []
        for enrollment in enrollments:
            summary = self._attendance_repo.get_summary(enrollment.id)
            summary["enrollment_id"] = str(enrollment.id)
            summary["course_id"] = str(enrollment.course_id)
            summaries.append(summary)
        return summaries

    def mark_attendance(self, enrollment_id: UUID, class_date: str, status: str, operator_id: UUID) -> Attendance:
        """记录考勤"""
        attendance = self._attendance_repo.create({
            "enrollment_id": enrollment_id,
            "class_date": class_date,
            "status": status,
            "marked_by": operator_id,
        })
        self._audit.log_operation(
            user_id=operator_id, action="mark_attendance", resource_type="attendance", resource_id=attendance.id,
        )
        return attendance
