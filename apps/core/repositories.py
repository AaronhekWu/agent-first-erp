"""
仓库基类（Repository Pattern）

提供泛型 CRUD 操作，所有模块仓库继承后添加领域特定查询。
通过构造函数注入 Supabase Client，便于测试时替换为 mock。
"""
from __future__ import annotations

from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel
from supabase import Client

T = TypeVar("T", bound=BaseModel)


class BaseRepository(Generic[T]):
    """
    泛型仓库基类

    职责：封装 Supabase 表的基础 CRUD 操作
    约束：不包含业务逻辑，仅做数据存取
    """

    def __init__(self, client: Client, table: str, model_class: type[T]):
        self._client = client
        self._table = table
        self._model_class = model_class

    def _query(self):
        """获取表查询构建器"""
        return self._client.table(self._table)

    def _parse(self, data: dict) -> T:
        """将字典解析为 Pydantic 模型"""
        return self._model_class.model_validate(data)

    def _parse_list(self, data: list[dict]) -> list[T]:
        """将字典列表解析为 Pydantic 模型列表"""
        return [self._parse(item) for item in data]

    def get_by_id(self, id: UUID) -> T | None:
        """根据 ID 查询单条记录"""
        resp = self._query().select("*").eq("id", str(id)).execute()
        if not resp.data:
            return None
        return self._parse(resp.data[0])

    def list(
        self,
        *,
        filters: dict[str, Any] | None = None,
        page: int = 1,
        page_size: int = 20,
        order_by: str = "created_at",
        ascending: bool = False,
    ) -> tuple[list[T], int]:
        """
        分页查询列表

        返回 (数据列表, 总数) 元组
        """
        query = self._query().select("*", count="exact")

        # 应用过滤条件
        if filters:
            for key, value in filters.items():
                if value is not None:
                    query = query.eq(key, str(value) if isinstance(value, UUID) else value)

        # 排序和分页
        offset = (page - 1) * page_size
        query = query.order(order_by, desc=not ascending)
        query = query.range(offset, offset + page_size - 1)

        resp = query.execute()
        total = resp.count or 0
        return self._parse_list(resp.data), total

    def create(self, data: dict[str, Any]) -> T:
        """创建单条记录"""
        # 将 UUID 转为字符串以便序列化
        clean = {k: str(v) if isinstance(v, UUID) else v for k, v in data.items() if v is not None}
        resp = self._query().insert(clean).execute()
        return self._parse(resp.data[0])

    def update(self, id: UUID, data: dict[str, Any]) -> T:
        """更新单条记录"""
        clean = {k: str(v) if isinstance(v, UUID) else v for k, v in data.items() if v is not None}
        resp = self._query().update(clean).eq("id", str(id)).execute()
        return self._parse(resp.data[0])

    def delete(self, id: UUID) -> None:
        """硬删除单条记录"""
        self._query().delete().eq("id", str(id)).execute()

    def soft_delete(self, id: UUID) -> T:
        """软删除：设置 deleted_at 时间戳"""
        from datetime import datetime, timezone

        return self.update(id, {"deleted_at": datetime.now(timezone.utc).isoformat()})


class SoftDeleteRepository(BaseRepository[T]):
    """
    支持软删除的仓库基类

    默认查询自动排除已软删除的记录
    """

    def _query_active(self):
        """获取排除已删除记录的查询"""
        return self._query().select("*").is_("deleted_at", "null")

    def list(
        self,
        *,
        filters: dict[str, Any] | None = None,
        page: int = 1,
        page_size: int = 20,
        order_by: str = "created_at",
        ascending: bool = False,
        include_deleted: bool = False,
    ) -> tuple[list[T], int]:
        """分页查询，默认排除已软删除记录"""
        query = self._query().select("*", count="exact")

        if not include_deleted:
            query = query.is_("deleted_at", "null")

        if filters:
            for key, value in filters.items():
                if value is not None:
                    query = query.eq(key, str(value) if isinstance(value, UUID) else value)

        offset = (page - 1) * page_size
        query = query.order(order_by, desc=not ascending)
        query = query.range(offset, offset + page_size - 1)

        resp = query.execute()
        total = resp.count or 0
        return self._parse_list(resp.data), total

    def get_by_id(self, id: UUID, include_deleted: bool = False) -> T | None:
        """根据 ID 查询，默认排除已软删除记录"""
        query = self._query().select("*").eq("id", str(id))
        if not include_deleted:
            query = query.is_("deleted_at", "null")
        resp = query.execute()
        if not resp.data:
            return None
        return self._parse(resp.data[0])
