"""
AI 知识库模块数据模型

Agent 配置/会话/消息由后端 Claude 管理，不存数据库。
此模块仅管理 RAG 知识库文档和向量嵌入。
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from apps.core.models import SupabaseModel


class KnowledgeDoc(SupabaseModel):
    """知识库文档"""
    department: str | None = None  # admin|marketing|teaching|finance|shared
    title: str
    content: str
    doc_type: str = "text"  # text|policy|faq|report
    source: str | None = None
    metadata: dict = {}
    is_active: bool = True
    created_by: UUID | None = None


class Embedding(BaseModel):
    """向量嵌入（不可变）"""
    id: UUID
    doc_id: UUID
    chunk_index: int = 0
    chunk_text: str
    embedding: list | None = None  # vector(1536)，查询时通常不返回
    metadata: dict = {}
    created_at: datetime | None = None
