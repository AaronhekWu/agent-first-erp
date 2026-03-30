"""
学员服务

提供学员信息的查询、创建、更新、标签管理等业务逻辑。
"""
from typing import Any
from uuid import UUID

from apps.audits.services import AuditService
from apps.students.models import Student, StudentDetail
from apps.students.repositories import ParentRepository, StudentRepository, TagRepository


class StudentService:
    """学员服务"""

    def __init__(
        self,
        student_repo: StudentRepository,
        parent_repo: ParentRepository,
        tag_repo: TagRepository,
        audit_service: AuditService,
    ):
        self._student_repo = student_repo
        self._parent_repo = parent_repo
        self._tag_repo = tag_repo
        self._audit = audit_service

    def search(self, query: str, limit: int = 10) -> list[Student]:
        """模糊搜索学员"""
        return self._student_repo.fuzzy_search(query, limit)

    def get_detail(self, student_id: UUID) -> StudentDetail | None:
        """获取学员详情（含家长和标签）"""
        student = self._student_repo.get_by_id(student_id)
        if not student:
            return None
        parents = self._parent_repo.get_by_student(student_id)
        tags = self._tag_repo.get_student_tags(student_id)
        return StudentDetail(
            **student.model_dump(),
            parents=parents,
            tags=tags,
        )

    def list_students(
        self,
        *,
        filters: dict[str, Any] | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Student], int]:
        """分页查询学员列表"""
        return self._student_repo.list(filters=filters, page=page, page_size=page_size)

    def create_student(self, data: dict[str, Any], operator_id: UUID) -> Student:
        """创建学员"""
        data["created_by"] = operator_id
        student = self._student_repo.create(data)
        self._audit.log_operation(
            user_id=operator_id,
            action="create",
            resource_type="student",
            resource_id=student.id,
            changes={"new": data},
        )
        return student

    def update_student(self, student_id: UUID, data: dict[str, Any], operator_id: UUID) -> Student:
        """更新学员信息"""
        old = self._student_repo.get_by_id(student_id)
        student = self._student_repo.update(student_id, data)
        self._audit.log_operation(
            user_id=operator_id,
            action="update",
            resource_type="student",
            resource_id=student_id,
            changes={"old": old.model_dump() if old else None, "new": data},
        )
        return student

    def delete_student(self, student_id: UUID, operator_id: UUID) -> Student:
        """软删除学员"""
        student = self._student_repo.soft_delete(student_id)
        self._audit.log_operation(
            user_id=operator_id,
            action="delete",
            resource_type="student",
            resource_id=student_id,
        )
        return student

    def set_tags(self, student_id: UUID, tag_ids: list[UUID], operator_id: UUID) -> None:
        """设置学员标签"""
        self._tag_repo.set_student_tags(student_id, tag_ids)
        self._audit.log_operation(
            user_id=operator_id,
            action="update_tags",
            resource_type="student",
            resource_id=student_id,
            changes={"tag_ids": [str(t) for t in tag_ids]},
        )
