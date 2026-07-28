export const FINANCE_TRANSACTION_LABELS: Record<string, string> = {
  recharge: "充值",
  consume: "消课",
  refund: "退费",
  transfer_in: "转入",
  transfer_out: "转出",
  gift: "赠送",
  adjustment: "账务调整",
  enrollment: "课程报名",
  lesson_purchase: "课时付费",
  prepayment_lock: "锁定预付款",
  prepayment_release: "释放预付款",
  prepayment_adjustment: "调整预付款",
};

export const FINANCE_REFERENCE_LABELS: Record<string, string> = {
  recharge: "充值记录",
  consumption_log: "消课记录",
  lesson_lot: "课时批次",
  enrollment: "报名记录",
  enrollment_drop: "退课记录",
  attendance: "考勤记录",
  refund: "退费记录",
  account: "学员账户",
  transaction_reversal: "流水撤销记录",
  approval: "审批记录",
  balance_reconciliation: "余额核对记录",
  enrollment_transfer: "转课记录",
};

export const APPROVAL_TYPE_LABELS: Record<string, string> = {
  finance_consume: "手动消课审批",
  finance_refund: "退费审批",
  finance_txn_delete: "流水撤销审批",
  enrollment_drop: "退课审批",
  enrollment_transfer: "转课审批",
  student_delete: "学员停用审批",
  staff_deactivate: "成员停用审批",
  department_delete: "部门删除审批",
  course_archive: "课程归档审批",
  course_delete: "课程删除审批",
};

export function financeTransactionLabel(type: string): string {
  return FINANCE_TRANSACTION_LABELS[type] ?? "其他财务记录";
}

export function financeReferenceLabel(type?: string | null): string {
  if (!type) return "无";
  return FINANCE_REFERENCE_LABELS[type] ?? "关联业务记录";
}

export function approvalTypeLabel(type: string): string {
  return APPROVAL_TYPE_LABELS[type] ?? "其他审批";
}

export function shortRecordId(id?: string | null): string {
  if (!id) return "";
  return id.length > 8 ? id.slice(-8).toUpperCase() : id.toUpperCase();
}
