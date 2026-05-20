import { Wallet, Undo2, Minus, ListOrdered } from "lucide-react";
import { getFinanceKpis, listTransactions } from "@/lib/api/finance";
import { Tabs } from "@/components/settings/tabs";
import { RechargeForm } from "@/components/finance/recharge-form";
import { RefundForm } from "@/components/finance/refund-form";
import { ConsumeForm } from "@/components/finance/consume-form";
import { TransactionList } from "@/components/finance/transaction-list";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [kpis, txs] = await Promise.all([
    getFinanceKpis(),
    listTransactions({ limit: 100 }),
  ]);

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">财务管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          学员充值、退费、手动消课、流水审计 —— 全部走 SECURITY DEFINER RPC，自动生成审计与交易流水
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KCard label="本月充值" value={kpis.recharge_mtd} Icon={Wallet} bg="bg-emerald-50" color="text-emerald-600" />
        <KCard label="本月退费" value={kpis.refund_mtd} Icon={Undo2} bg="bg-amber-50" color="text-amber-600" />
        <KCard label="本月消课" value={kpis.consume_mtd} Icon={Minus} bg="bg-red-50" color="text-red-500" />
        <KCard label="本月净收入" value={kpis.net_mtd} Icon={ListOrdered} bg="bg-violet-50" color="text-violet-600" />
      </div>

      <Tabs
        tabs={[
          { key: "recharge", label: "充值", content: <RechargeForm /> },
          { key: "refund", label: "退费", content: <RefundForm /> },
          { key: "consume", label: "手动消课", content: <ConsumeForm /> },
          { key: "transactions", label: "全部流水", content: <TransactionList rows={txs} /> },
        ]}
      />
    </div>
  );
}

function KCard({ label, value, Icon, bg, color }: { label: string; value: number; Icon: typeof Wallet; bg: string; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card">
      <div className={cn("grid h-12 w-12 place-items-center rounded-xl", bg)}>
        <Icon className={cn("h-6 w-6", color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
          {formatCurrency(value)}
        </div>
      </div>
    </div>
  );
}
