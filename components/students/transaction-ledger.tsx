"use client";

import { useMemo, useState } from "react";
import { CalendarSearch, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { financeTransactionLabel } from "@/lib/finance-display";

export interface LedgerTransaction {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

const TX_TYPE_LABEL: Record<string, string> = {
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

const TX_TYPE_CLS: Record<string, string> = {
  recharge: "text-emerald-600",
  consume: "text-red-500",
  refund: "text-amber-600",
  transfer_in: "text-emerald-600",
  transfer_out: "text-slate-600",
  gift: "text-violet-600",
  adjustment: "text-slate-600",
  enrollment: "text-blue-600",
  lesson_purchase: "text-brand-600",
  prepayment_lock: "text-blue-600",
  prepayment_release: "text-cyan-600",
  prepayment_adjustment: "text-indigo-600",
};

// 快捷筛选组: 覆盖用户最常定位的三类记录
const QUICK_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "全部" },
  { key: "consume", label: "消课" },
  { key: "recharge", label: "充值" },
  { key: "refund", label: "退费" },
];

function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function TransactionLedger({ transactions }: { transactions: LedgerTransaction[] }) {
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (type && t.type !== type) return false;
      // 按本地日期比较 (显示也是本地时间); 直接截 ISO 串会用 UTC 日期, 东八区晚间记录会错归前一天
      const day = localDay(t.created_at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [transactions, type, from, to]);

  const summary = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const t of filtered) {
      if (t.type === "consume" || t.type === "transfer_out") outflow += Number(t.amount);
      else if (t.type === "recharge" || t.type === "transfer_in") inflow += Number(t.amount);
    }
    return { count: filtered.length, inflow, outflow };
  }, [filtered]);

  const hasFilter = Boolean(type || from || to);
  const clear = () => {
    setType("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <CalendarSearch className="h-4 w-4 text-brand-500" />
          交易台账
        </div>

        <div className="flex overflow-hidden rounded-md border border-slate-200 text-xs">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              onClick={() => setType(f.key)}
              className={
                type === f.key
                  ? "bg-brand-600 px-3 py-1.5 font-medium text-white"
                  : "bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50"
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-slate-700 focus:border-brand-500 focus:outline-none"
          />
          <span>至</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-slate-700 focus:border-brand-500 focus:outline-none"
          />
        </div>

        {hasFilter && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" />
            清除
          </button>
        )}

        <div className="ml-auto text-xs text-slate-500">
          共 {summary.count} 笔 · 入账 <span className="text-emerald-600">{formatCurrency(summary.inflow)}</span> · 消课/转出{" "}
          <span className="text-red-500">{formatCurrency(summary.outflow)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            {hasFilter ? "所选条件下暂无记录" : "暂无交易流水"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">时间</th>
                <th className="px-3 py-2 text-left">类型</th>
                <th className="px-3 py-2 text-left">说明</th>
                <th className="px-3 py-2 text-right">金额</th>
                <th className="px-3 py-2 text-right">余额（前 → 后）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-slate-600">{formatDate(t.created_at, true)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-sm font-medium ${TX_TYPE_CLS[t.type] ?? "text-slate-700"}`}>
                      {TX_TYPE_LABEL[t.type] ?? financeTransactionLabel(t.type)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.description ?? "无备注"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${TX_TYPE_CLS[t.type] ?? "text-slate-700"}`}>
                    {formatCurrency(t.amount)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">
                    {t.metadata?.available_before !== undefined && t.metadata?.available_after !== undefined ? (
                      <>
                        可用 {formatCurrency(Number(t.metadata.available_before))} →{" "}
                        <span className="text-slate-800">{formatCurrency(Number(t.metadata.available_after))}</span>
                        <div className="text-[11px] text-blue-600">
                          预付款 {formatCurrency(Number(t.metadata.frozen_before ?? 0))} →{" "}
                          {formatCurrency(Number(t.metadata.frozen_after ?? 0))}
                        </div>
                      </>
                    ) : (
                      <>
                        {formatCurrency(t.balance_before)} →{" "}
                        <span className="text-slate-800">{formatCurrency(t.balance_after)}</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
