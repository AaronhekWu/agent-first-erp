"""
财务服务

提供账户管理、充值、课消、退费等业务逻辑。
所有余额变动操作遵循：获取账户 → 记录变动前余额 → 更新账户 → 写交易流水 → 审计日志。
"""
from decimal import Decimal
from uuid import UUID

from apps.audits.services import AuditService
from apps.finance.models import Account, ConsumptionLog, Recharge, Transaction
from apps.finance.repositories import (
    AccountRepository,
    ConsumptionLogRepository,
    RechargeRepository,
    TransactionRepository,
    TransferRepository,
)


class FinanceService:
    """财务服务"""

    def __init__(
        self,
        account_repo: AccountRepository,
        transaction_repo: TransactionRepository,
        recharge_repo: RechargeRepository,
        consumption_log_repo: ConsumptionLogRepository,
        transfer_repo: TransferRepository,
        audit_service: AuditService,
    ):
        self._account_repo = account_repo
        self._transaction_repo = transaction_repo
        self._recharge_repo = recharge_repo
        self._consumption_log_repo = consumption_log_repo
        self._transfer_repo = transfer_repo
        self._audit = audit_service

    def get_or_create_account(self, student_id: UUID) -> Account:
        """获取或创建学生账户"""
        account = self._account_repo.get_by_student(student_id)
        if account:
            return account
        account = self._account_repo.create({
            "student_id": student_id,
            "balance": "0.00",
            "total_recharged": "0.00",
            "total_consumed": "0.00",
            "total_refunded": "0.00",
            "frozen_amount": "0.00",
            "status": "active",
        })
        self._audit.log_operation(
            user_id=None,
            action="create",
            resource_type="finance_account",
            resource_id=account.id,
            changes={"student_id": str(student_id)},
        )
        return account

    def get_balance(self, student_id: UUID) -> Decimal:
        """查询余额"""
        account = self.get_or_create_account(student_id)
        return account.balance

    def recharge(
        self,
        student_id: UUID,
        amount: Decimal,
        payment_method: str,
        user_id: UUID | None = None,
        campaign_id: UUID | None = None,
        bonus_amount: Decimal = Decimal("0.00"),
        notes: str | None = None,
    ) -> Recharge:
        """充值：创建充值记录 + 更新账户余额 + 写交易流水"""
        if amount <= 0:
            raise ValueError("充值金额必须大于零")

        account = self.get_or_create_account(student_id)
        balance_before = account.balance
        total_credit = amount + bonus_amount
        balance_after = balance_before + total_credit

        # 更新账户余额和累计充值
        self._account_repo.update(account.id, {
            "balance": str(balance_after),
            "total_recharged": str(account.total_recharged + total_credit),
        })

        # 创建充值记录
        recharge_data = {
            "account_id": account.id,
            "amount": str(amount),
            "payment_method": payment_method,
            "bonus_amount": str(bonus_amount),
            "status": "completed",
        }
        if campaign_id:
            recharge_data["campaign_id"] = campaign_id
        if notes:
            recharge_data["notes"] = notes
        if user_id:
            recharge_data["created_by"] = user_id
        recharge = self._recharge_repo.create(recharge_data)

        # 写交易流水
        tx_data = {
            "account_id": account.id,
            "type": "recharge",
            "amount": str(total_credit),
            "balance_before": str(balance_before),
            "balance_after": str(balance_after),
            "reference_type": "recharge",
            "reference_id": recharge.id,
            "description": f"充值 {amount}" + (f"（赠送 {bonus_amount}）" if bonus_amount > 0 else ""),
        }
        if user_id:
            tx_data["created_by"] = user_id
        self._transaction_repo.create(tx_data)

        # 审计日志
        self._audit.log_operation(
            user_id=user_id,
            action="recharge",
            resource_type="finance_account",
            resource_id=account.id,
            changes={
                "amount": str(amount),
                "bonus_amount": str(bonus_amount),
                "balance_before": str(balance_before),
                "balance_after": str(balance_after),
                "payment_method": payment_method,
            },
        )

        return recharge

    def consume_lesson(
        self,
        enrollment_id: UUID,
        unit_price: Decimal,
        student_id: UUID,
        attendance_id: UUID | None = None,
        lesson_count: int = 1,
        user_id: UUID | None = None,
    ) -> ConsumptionLog:
        """课消：扣减余额 + 写消费记录 + 写交易流水"""
        consume_amount = unit_price * lesson_count
        if consume_amount <= 0:
            raise ValueError("课消金额必须大于零")

        account = self.get_or_create_account(student_id)
        balance_before = account.balance
        balance_after = balance_before - consume_amount

        # 更新账户余额和累计消费
        self._account_repo.update(account.id, {
            "balance": str(balance_after),
            "total_consumed": str(account.total_consumed + consume_amount),
        })

        # 创建课消记录
        log_data: dict = {
            "enrollment_id": enrollment_id,
            "lesson_count": lesson_count,
            "unit_price": str(unit_price),
            "amount": str(consume_amount),
            "type": "normal",
        }
        if attendance_id:
            log_data["attendance_id"] = attendance_id
        if user_id:
            log_data["created_by"] = user_id
        consumption_log = self._consumption_log_repo.create(log_data)

        # 写交易流水
        tx_data: dict = {
            "account_id": account.id,
            "type": "consume",
            "amount": str(consume_amount),
            "balance_before": str(balance_before),
            "balance_after": str(balance_after),
            "reference_type": "consumption_log",
            "reference_id": consumption_log.id,
            "description": f"课消 {lesson_count} 课时，单价 {unit_price}",
        }
        if user_id:
            tx_data["created_by"] = user_id
        self._transaction_repo.create(tx_data)

        # 审计日志
        self._audit.log_operation(
            user_id=user_id,
            action="consume",
            resource_type="finance_account",
            resource_id=account.id,
            changes={
                "enrollment_id": str(enrollment_id),
                "lesson_count": lesson_count,
                "unit_price": str(unit_price),
                "amount": str(consume_amount),
                "balance_before": str(balance_before),
                "balance_after": str(balance_after),
            },
        )

        return consumption_log

    def get_transaction_history(self, student_id: UUID, limit: int = 50) -> list[Transaction]:
        """获取交易流水"""
        account = self._account_repo.get_by_student(student_id)
        if not account:
            return []
        return self._transaction_repo.get_by_account(account.id, limit=limit)

    def refund(
        self,
        student_id: UUID,
        amount: Decimal,
        reason: str,
        user_id: UUID | None = None,
    ) -> Transaction:
        """退费"""
        if amount <= 0:
            raise ValueError("退费金额必须大于零")

        account = self.get_or_create_account(student_id)
        balance_before = account.balance

        if amount > balance_before:
            raise ValueError(f"退费金额 {amount} 超过账户余额 {balance_before}")

        balance_after = balance_before - amount

        # 更新账户余额和累计退费
        self._account_repo.update(account.id, {
            "balance": str(balance_after),
            "total_refunded": str(account.total_refunded + amount),
        })

        # 写交易流水
        tx_data: dict = {
            "account_id": account.id,
            "type": "refund",
            "amount": str(amount),
            "balance_before": str(balance_before),
            "balance_after": str(balance_after),
            "description": f"退费：{reason}",
        }
        if user_id:
            tx_data["created_by"] = user_id
        transaction = self._transaction_repo.create(tx_data)

        # 审计日志
        self._audit.log_operation(
            user_id=user_id,
            action="refund",
            resource_type="finance_account",
            resource_id=account.id,
            changes={
                "amount": str(amount),
                "reason": reason,
                "balance_before": str(balance_before),
                "balance_after": str(balance_after),
            },
        )

        return transaction
