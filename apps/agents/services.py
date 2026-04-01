"""
AI 知识库服务

提供知识库文档的 CRUD 和向量搜索接口。
Agent 配置/会话/消息由后端 Claude 管理，不在此处理。
"""
from uuid import UUID

from apps.agents.models import KnowledgeDoc
from apps.agents.repositories import EmbeddingRepository, KnowledgeDocRepository
from apps.audits.services import AuditService


class KnowledgeService:
    """知识库服务：文档管理与向量搜索"""

    def __init__(
        self,
        doc_repo: KnowledgeDocRepository,
        embedding_repo: EmbeddingRepository,
        audit_service: AuditService,
    ):
        self._doc_repo = doc_repo
        self._embedding_repo = embedding_repo
        self._audit = audit_service

    # ---- 文档管理 ----

    def get_doc(self, doc_id: UUID) -> KnowledgeDoc | None:
        """获取文档"""
        return self._doc_repo.get_by_id(doc_id)

    def list_docs(self, department: str | None = None, page: int = 1, page_size: int = 20):
        """列出文档"""
        filters = {}
        if department:
            filters["department"] = department
        filters["is_active"] = True
        return self._doc_repo.list(filters=filters, page=page, page_size=page_size)

    def get_department_docs(self, department: str) -> list[KnowledgeDoc]:
        """获取部门知识库"""
        return self._doc_repo.get_by_department(department)

    def create_doc(self, data: dict, user_id: UUID | None = None) -> KnowledgeDoc:
        """创建文档"""
        if user_id:
            data["created_by"] = user_id
        doc = self._doc_repo.create(data)
        self._audit.log_operation(
            user_id=user_id,
            action="create",
            resource_type="knowledge_doc",
            resource_id=doc.id,
        )
        return doc

    def update_doc(self, doc_id: UUID, data: dict, user_id: UUID | None = None) -> KnowledgeDoc:
        """更新文档"""
        doc = self._doc_repo.update(doc_id, data)
        self._audit.log_operation(
            user_id=user_id,
            action="update",
            resource_type="knowledge_doc",
            resource_id=doc_id,
        )
        return doc

    def deactivate_doc(self, doc_id: UUID, user_id: UUID | None = None) -> KnowledgeDoc:
        """停用文档"""
        doc = self._doc_repo.update(doc_id, {"is_active": False})
        self._audit.log_operation(
            user_id=user_id,
            action="deactivate",
            resource_type="knowledge_doc",
            resource_id=doc_id,
        )
        return doc

    def search_docs(self, query: str) -> list[KnowledgeDoc]:
        """按标题搜索文档"""
        return self._doc_repo.search_by_title(query)

    # ---- 向量嵌入（预留接口，待后续 LLM 集成） ----

    def get_doc_embeddings(self, doc_id: UUID):
        """获取文档的向量嵌入"""
        return self._embedding_repo.get_by_doc(doc_id)

    def reindex_doc(self, doc_id: UUID, chunks: list[dict]) -> int:
        """
        重新索引文档嵌入

        参数:
            doc_id: 文档 ID
            chunks: [{"chunk_text": "...", "embedding": [...], "metadata": {}}]

        返回:
            写入的嵌入块数量
        """
        # 清除旧嵌入
        self._embedding_repo.delete_by_doc(doc_id)
        # 写入新嵌入
        for i, chunk in enumerate(chunks):
            self._embedding_repo.create({
                "doc_id": doc_id,
                "chunk_index": i,
                "chunk_text": chunk["chunk_text"],
                "embedding": chunk.get("embedding"),
                "metadata": chunk.get("metadata", {}),
            })
        return len(chunks)
