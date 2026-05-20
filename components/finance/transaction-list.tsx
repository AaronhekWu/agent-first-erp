import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Transaction } from "@/lib/api/finance";

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  recharge: { label: "充值", cls: "text-emerald-600" },
  consume: { label: "消费", cls: "text-red-500" },
  refund: { label: "退费", cls: "text-amber-600" },
  transfer_in: { label: "转入", cls: "text-emerald-600" },
  transfer_out: { label: "转出", cls: "text-slate-600" },
  gift: { label: "赠送", cls: "text-violet-600" },
  adjustment: { label: "调整", cls: "text-slate-600" },
};

export function TransactionList({ rows }: { rows: Transaction[] }) {
  return (
    <div className="rounded-2xl bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3 text-left">时间</th>
              <th className="px-3 py-3 text-left">类型</th>
              <th className="px-3 py-3 text-left">学员</th>
              <th className="px-3 py-3 text-left">说明</th>
              <th className="px-3 py-3 text-right">金额</th>
              <th className="px-3 py-3 text-right">余额变化</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                  暂无流水
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const meta = TYPE_LABEL[t.type] ?? { label: t.type, cls: "text-slate-700" };
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-600">{formatDate(t.created_at, true)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("font-medium", meta.cls)}>{meta.label}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {t.student_name ?? "—"}
                    {t.student_code && (
                      <span className="ml-1 font-mono text-[11px] text-slate-400">
                        {t.student_code}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.description ?? "—"}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", meta.cls)}>
                    {formatCurrency(t.amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {formatCurrency(t.balance_before)} →{" "}
                    <span className="text-slate-800">{formatCurrency(t.balance_after)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
