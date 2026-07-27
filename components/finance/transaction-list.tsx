"use client";

import { Fragment, useMemo, useState } from "react";
import { Download, Eye, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Transaction, TxType } from "@/lib/api/finance";
import { ListPagination } from "@/components/ui/list-pagination";
import { Gate } from "@/lib/auth/permissions-context";
import { requestApproval } from "@/lib/api/approvals-client";
import {
  financeReferenceLabel,
  financeTransactionLabel,
  shortRecordId,
} from "@/lib/finance-display";

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  recharge: { label: "充值", cls: "text-emerald-600" },
  consume: { label: "消课", cls: "text-red-500" },
  refund: { label: "退费", cls: "text-amber-600" },
  transfer_in: { label: "转入", cls: "text-emerald-600" },
  transfer_out: { label: "转出", cls: "text-slate-600" },
  gift: { label: "赠送", cls: "text-violet-600" },
  adjustment: { label: "账务调整", cls: "text-slate-600" },
  enrollment: { label: "课程报名", cls: "text-blue-600" },
  lesson_purchase: { label: "课时付费", cls: "text-brand-600" },
};

export function TransactionList({ rows }: { rows: Transaction[] }) {
  const [type, setType] = useState<TxType | "">("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((t) => {
      if (type && t.type !== type) return false;
      if (from && t.created_at.slice(0, 10) < from) return false;
      if (to && t.created_at.slice(0, 10) > to) return false;
      if (min && Math.abs(Number(t.amount)) < Number(min)) return false;
      if (max && Math.abs(Number(t.amount)) > Number(max)) return false;
      if (!q) return true;
      return (
        (t.student_name ?? "").toLowerCase().includes(q) ||
        (t.student_code ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, type, query, from, to, min, max]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, t) => {
        if (isVoidedMetadata(t.metadata)) return acc;
        const amount = Number(t.amount) || 0;
        if (t.type === "recharge") acc.recharge += amount;
        if (t.type === "refund") acc.refund += amount;
        if (t.type === "consume") acc.consume += amount;
        if (t.type === "recharge") acc.net += amount;
        if (t.type === "refund") acc.net -= amount;
        if (
          t.type === "enrollment"
          || t.type === "lesson_purchase"
          || (t.type === "adjustment" && isCourseContractMetadata(t.metadata))
        ) acc.courseFee += amount;
        return acc;
      },
      { recharge: 0, refund: 0, consume: 0, courseFee: 0, net: 0 },
    );
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const requestTxnDelete = async (t: Transaction) => {
    const label = financeTransactionLabel(t.type);
    const reason = prompt(`请填写撤销该流水（${label} ${formatCurrency(t.amount)}）的审批原因`);
    if (reason === null) return;
    if (!reason.trim()) return alert("审批原因必填");
    try {
      await requestApproval({
        type: "finance_txn_delete",
        title: `撤销流水审批：${t.student_name ?? ""} ${label} ${formatCurrency(t.amount)}`,
        reason: reason.trim(),
        targetId: t.id,
        targetLabel: t.student_name ?? t.description ?? "流水",
        amount: t.amount,
        payload: { p_txn_id: t.id },
      });
      alert("已提交流水撤销审批。管理员通过后会生成反向账务记录，原流水保留并标记为已撤销。");
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const exportCsv = () => {
    const header = ["时间", "类型", "学员", "编号", "说明", "金额", "变动前余额", "变动后余额"];
    const lines = filtered.map((t) =>
      [
        formatDate(t.created_at, true),
        financeTransactionLabel(t.type),
        t.student_name ?? "",
        t.student_code ?? "",
        t.description ?? "",
        String(t.amount),
        String(t.balance_before),
        String(t.balance_after),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["\uFEFF", header.join(","), "\n", lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `财务流水-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1.2fr_160px_140px_140px_120px_120px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => resetPage(() => setQuery(e.target.value))}
              placeholder="搜索学员 / 编号 / 说明"
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
            />
          </div>
          <select
            value={type}
            onChange={(e) => resetPage(() => setType(e.target.value as TxType | ""))}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="">全部类型</option>
            {Object.entries(TYPE_LABEL).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => resetPage(() => setFrom(e.target.value))} className="h-9 rounded-md border border-slate-200 px-3 text-sm" />
          <input type="date" value={to} onChange={(e) => resetPage(() => setTo(e.target.value))} className="h-9 rounded-md border border-slate-200 px-3 text-sm" />
          <input value={min} onChange={(e) => resetPage(() => setMin(e.target.value))} type="number" min={0} placeholder="最小金额" className="h-9 rounded-md border border-slate-200 px-3 text-sm" />
          <input value={max} onChange={(e) => resetPage(() => setMax(e.target.value))} type="number" min={0} placeholder="最大金额" className="h-9 rounded-md border border-slate-200 px-3 text-sm" />
          <button onClick={exportCsv} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" />
            导出
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <SummaryCard label="筛选充值" value={summary.recharge} tone="emerald" />
        <SummaryCard label="筛选退费" value={summary.refund} tone="amber" />
        <SummaryCard label="筛选消费" value={summary.consume} tone="red" />
        <SummaryCard label="筛选报课合同" value={summary.courseFee} tone="blue" />
        <SummaryCard label="筛选现金净额" value={summary.net} tone="slate" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>
            当前筛选 <span className="font-medium text-slate-900">{filtered.length}</span> 条
          </span>
          <span>数据源：最近 {rows.length} 条流水</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left">时间</th>
                <th className="px-3 py-3 text-left">类型</th>
                <th className="px-3 py-3 text-left">学员</th>
                <th className="px-3 py-3 text-left">说明</th>
                <th className="px-3 py-3 text-right">金额</th>
                <th className="px-3 py-3 text-right">余额变化</th>
                <th className="px-3 py-3 text-right">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                    暂无流水
                  </td>
                </tr>
              )}
              {paged.map((t) => {
                const meta = TYPE_LABEL[t.type] ?? { label: financeTransactionLabel(t.type), cls: "text-slate-700" };
                const isOpen = expanded === t.id;
                const lockedCourseEvent = isCourseContractMetadata(t.metadata);
                const voided = isVoidedMetadata(t.metadata);
                const balanceDisplay = lockedCourseEvent
                  ? "不影响钱包余额"
                  : `${formatCurrency(t.balance_before)} → ${formatCurrency(t.balance_after)}`;
                return (
                  <Fragment key={t.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600">{formatDate(t.created_at, true)}</td>
                      <td className="px-3 py-2">
                        <span className={cn("font-medium", meta.cls)}>{meta.label}</span>
                        {voided && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">已撤销</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {t.student_name ?? "未知学员"}
                        {t.student_code && <span className="ml-1 font-mono text-[11px] text-slate-400">{t.student_code}</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{t.description ?? "无备注"}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", meta.cls)}>{formatCurrency(t.amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {lockedCourseEvent
                          ? <span className="text-blue-600">不影响钱包余额</span>
                          : <>{formatCurrency(t.balance_before)} → <span className="text-slate-800">{formatCurrency(t.balance_after)}</span></>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => setExpanded(isOpen ? null : t.id)} className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50">
                          <Eye className="h-3.5 w-3.5" />
                          {isOpen ? "收起" : "查看"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 px-4 py-3">
                          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                              <Info label="发起人" value={t.created_by_name ?? "系统"} />
                              <Info label="发起时间" value={formatDate(t.created_at, true)} />
                              <Info label="学员" value={`${t.student_name ?? "未知学员"}${t.student_code ? ` (${t.student_code})` : ""}`} />
                              <Info
                                label="关联"
                                value={t.reference_type
                                  ? `${financeReferenceLabel(t.reference_type)}${t.reference_id ? ` · 记录号 ${shortRecordId(t.reference_id)}` : ""}`
                                  : "无"}
                              />
                              <Info label="余额变化" value={balanceDisplay} />
                              <Info label="说明" value={t.description ?? "无备注"} />
                            </dl>
                            <div className="flex items-start justify-end">
                              {!lockedCourseEvent && !voided && <Gate keys="finance.refund">
                                <button
                                  onClick={() => requestTxnDelete(t)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  撤销流水（提交审批）
                                </button>
                              </Gate>}
                              {lockedCourseEvent && (
                                <span className="rounded bg-blue-50 px-2.5 py-1.5 text-xs text-blue-600">
                                  课程联动流水，请在课程记录中修改
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <ListPagination
          page={currentPage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="shrink-0 text-slate-400">{label}：</dt>
      <dd className="min-w-0 truncate text-slate-700">{value}</dd>
    </div>
  );
}

function isCourseContractMetadata(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && "domain" in metadata
    && (metadata as { domain?: unknown }).domain === "course_contract");
}

function isVoidedMetadata(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && "voided" in metadata
    && (metadata as { voided?: unknown }).voided === true);
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "red" | "blue" | "slate" }) {
  const cls = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-500",
    blue: "text-blue-600",
    slate: "text-slate-800",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", cls)}>{formatCurrency(value)}</div>
    </div>
  );
}
