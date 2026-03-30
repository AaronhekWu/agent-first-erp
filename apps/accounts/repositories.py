"""
账户模块仓库层
"""
from uuid import UUID

from supabase import Client

from apps.core.constants import AccountTables
from apps.core.repositories import BaseRepository
from .models import Department, Profile, Role


class ProfileRepository(BaseRepository[Profile]):
    """用户档案仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AccountTables.PROFILES, Profile)


class DepartmentRepository(BaseRepository[Department]):
    """部门仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AccountTables.DEPARTMENTS, Department)

    def get_children(self, parent_id: UUID) -> list[Department]:
        """获取指定部门的子部门"""
        resp = self._query().select("*").eq("parent_id", str(parent_id)).order("sort_order").execute()
        return self._parse_list(resp.data)


class RoleRepository(BaseRepository[Role]):
    """角色仓库"""

    def __init__(self, client: Client):
        super().__init__(client, AccountTables.ROLES, Role)

    def get_by_name(self, name: str) -> Role | None:
        """根据角色名查询"""
        resp = self._query().select("*").eq("name", name).execute()
        if not resp.data:
            return None
        return self._parse(resp.data[0])

    def get_user_roles(self, user_id: UUID) -> list[Role]:
        """获取用户的所有角色"""
        resp = (
            self._client.table(AccountTables.USER_ROLES)
            .select("role_id")
            .eq("user_id", str(user_id))
            .execute()
        )
        if not resp.data:
            return []
        role_ids = [r["role_id"] for r in resp.data]
        roles_resp = self._query().select("*").in_("id", role_ids).execute()
        return self._parse_list(roles_resp.data)
