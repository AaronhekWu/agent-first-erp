"""
财务模块仓库层
"""
from uuid import UUID

from supabase import Client

from apps.core.constants import FinanceTables
from apps.core.repositories import BaseRepository
from .models import Account, ConsumptionLog, Recharge, Transaction, Transfer


class AccountRepository(BaseRepository[Account]):
    """财务账户仓库"""

    def __init__(self, client: Client):
        super().__init__(client, FinanceTables.ACCOUNTS, Account)

    def get_by_student(self, student_id: UUID) -> Account | None:
        """根据学员 ID 查询账户"""
        resp = (
            self._query()
            .select("*")
            .eq("student_id", str(student_id))
            .execute()
        )
        if not resp.data:
            return None
        return self._parse(resp.data[0])


class TransactionRepository(BaseRepository[Transaction]):
    """交易流水仓库（仅追加，不允许更新/删除）"""

    def __init__(self, client: Client):
        super().__init__(client, FinanceTables.TRANSACTIONS, Transaction)

    def get_by_account(self, account_id: UUID, limit: int = 50) -> list[Transaction]:
        """获取账户的交易流水"""
        resp = (
            self._query()
            .select("*")
            .eq("account_id", str(account_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return self._parse_list(resp.data)

    def update(self, id: UUID, data: dict) -> Transaction:
        """交易流水不可变，禁止更新"""
        raise NotImplementedError("交易流水不可变，禁止更新")

    def delete(self, id: UUID) -> None:
        """交易流水不可变，禁止删除"""
        raise NotImplementedError("交易流水不可变，禁止删除")


class RechargeRepository(BaseRepository[Recharge]):
    """充值记录仓库"""

    def __init__(self, client: Client):
        super().__init__(client, FinanceTables.RECHARGES, Recharge)

    def get_by_account(self, account_id: UUID) -> list[Recharge]:
        """获取账户的充值记录"""
        resp = (
            self._query()
            .select("*")
            .eq("account_id", str(account_id))
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)


class ConsumptionLogRepository(BaseRepository[ConsumptionLog]):
    """课消记录仓库（仅追加，不允许更新/删除）"""

    def __init__(self, client: Client):
        super().__init__(client, FinanceTables.CONSUMPTION_LOGS, ConsumptionLog)

    def get_by_enrollment(self, enrollment_id: UUID) -> list[ConsumptionLog]:
        """获取报名的课消记录"""
        resp = (
            self._query()
            .select("*")
            .eq("enrollment_id", str(enrollment_id))
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)

    def update(self, id: UUID, data: dict) -> ConsumptionLog:
        """课消记录不可变，禁止更新"""
        raise NotImplementedError("课消记录不可变，禁止更新")

    def delete(self, id: UUID) -> None:
        """课消记录不可变，禁止删除"""
        raise NotImplementedError("课消记录不可变，禁止删除")


class TransferRepository(BaseRepository[Transfer]):
    """转课记录仓库"""

    def __init__(self, client: Client):
        super().__init__(client, FinanceTables.TRANSFERS, Transfer)

    def get_by_student(self, student_id: UUID) -> list[Transfer]:
        """获取学员的转课记录"""
        resp = (
            self._query()
            .select("*")
            .eq("student_id", str(student_id))
            .order("created_at", desc=True)
            .execute()
        )
        return self._parse_list(resp.data)
