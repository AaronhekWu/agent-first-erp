"""
学员模块仓库层
"""
from uuid import UUID

from supabase import Client

from apps.core.constants import StudentTables
from apps.core.repositories import SoftDeleteRepository, BaseRepository
from .models import Parent, Student, Tag


class StudentRepository(SoftDeleteRepository[Student]):
    """学员仓库，支持软删除和模糊搜索"""

    def __init__(self, client: Client):
        super().__init__(client, StudentTables.STUDENTS, Student)

    def fuzzy_search(self, query: str, limit: int = 10) -> list[Student]:
        """基于 pg_trgm 的模糊搜索"""
        resp = (
            self._client.rpc(
                "search_students_by_name",
                {"search_query": query, "result_limit": limit},
            ).execute()
        )
        # 如果 RPC 不存在，回退到 ilike 查询
        if resp.data:
            return self._parse_list(resp.data)
        resp = (
            self._query()
            .select("*")
            .is_("deleted_at", "null")
            .ilike("name", f"%{query}%")
            .limit(limit)
            .execute()
        )
        return self._parse_list(resp.data)

    def get_by_assigned_to(self, user_id: UUID, page: int = 1, page_size: int = 20) -> tuple[list[Student], int]:
        """获取分配给指定用户的学员"""
        return self.list(filters={"assigned_to": user_id}, page=page, page_size=page_size)


class ParentRepository(BaseRepository[Parent]):
    """家长仓库"""

    def __init__(self, client: Client):
        super().__init__(client, StudentTables.PARENTS, Parent)

    def get_by_student(self, student_id: UUID) -> list[Parent]:
        """获取学员的所有家长"""
        resp = self._query().select("*").eq("student_id", str(student_id)).execute()
        return self._parse_list(resp.data)


class TagRepository(BaseRepository[Tag]):
    """标签仓库"""

    def __init__(self, client: Client):
        super().__init__(client, StudentTables.TAGS, Tag)

    def get_student_tags(self, student_id: UUID) -> list[Tag]:
        """获取学员关联的所有标签"""
        resp = (
            self._client.table(StudentTables.STUDENT_TAGS)
            .select("tag_id")
            .eq("student_id", str(student_id))
            .execute()
        )
        if not resp.data:
            return []
        tag_ids = [r["tag_id"] for r in resp.data]
        tags_resp = self._query().select("*").in_("id", tag_ids).execute()
        return self._parse_list(tags_resp.data)

    def set_student_tags(self, student_id: UUID, tag_ids: list[UUID]) -> None:
        """设置学员标签（全量替换）"""
        table = self._client.table(StudentTables.STUDENT_TAGS)
        # 先删除现有关联
        table.delete().eq("student_id", str(student_id)).execute()
        # 批量插入新关联
        if tag_ids:
            rows = [{"student_id": str(student_id), "tag_id": str(tid)} for tid in tag_ids]
            table.insert(rows).execute()
