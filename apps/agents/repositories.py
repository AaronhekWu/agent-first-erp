"""
AI 知识库仓库层
"""
from uuid import UUID

from supabase import Client

from apps.core.constants import AITables
from apps.core.repositories import BaseRepository
from .models import Embedding, KnowledgeDoc


class KnowledgeDocRepository(BaseRepository[KnowledgeDoc]):
    """知识库文档仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AITables.KNOWLEDGE_DOCS, KnowledgeDoc)

    def get_by_department(self, department: str) -> list[KnowledgeDoc]:
        """获取部门的知识库文档"""
        resp = (
            self._query()
            .select("*")
            .eq("department", department)
            .eq("is_active", True)
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def get_shared(self) -> list[KnowledgeDoc]:
        """获取共享知识库文档"""
        resp = (
            self._query()
            .select("*")
            .eq("department", "shared")
            .eq("is_active", True)
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def search_by_title(self, query: str) -> list[KnowledgeDoc]:
        """按标题搜索文档"""
        resp = (
            self._query()
            .select("*")
            .ilike("title", f"%{query}%")
            .eq("is_active", True)
            .execute()
        )
        return self._parse_list(resp.data)


class EmbeddingRepository(BaseRepository[Embedding]):
    """向量嵌入仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AITables.EMBEDDINGS, Embedding)

    def get_by_doc(self, doc_id: UUID) -> list[Embedding]:
        """获取文档的所有嵌入块"""
        resp = (
            self._query()
            .select("id, doc_id, chunk_index, chunk_text, metadata, created_at")
            .eq("doc_id", str(doc_id))
            .order("chunk_index")
            .execute()
        )
        return self._parse_list(resp.data)

    def delete_by_doc(self, doc_id: UUID) -> None:
        """删除文档的所有嵌入（重新索引前调用）"""
        self._query().delete().eq("doc_id", str(doc_id)).execute()
