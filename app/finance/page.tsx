import { Wallet, Undo2, Minus, ListOrdered, BookOpenCheck } from "lucide-react";
import { getFinanceKpis, getRechargeStudent, listTransactions } from "@/lib/api/finance";
import { Tabs } from "@/components/settings/tabs";
import { RechargeForm } from "@/components/finance/recharge-form";
import { RefundForm } from "@/components/finance/refund-form";
import { ConsumeForm } from "@/components/finance/consume-form";
import { TransactionList } from "@/components/finance/transaction-list";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getMe } from "@/lib/auth/me";
import { hasServerPermission } from "@/lib/auth/access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { tab?: string; student?: string };
}

const FINANCE_TABS = ["recharge", "refund", "consume", "transactions"] as const;

export default async function FinancePage({ searchParams }: PageProps) {
  const me = await getMe();
  if (!hasServerPermission(me, "finance.view")) redirect("/dashboard");
  const activeTab = FINANCE_TABS.includes(searchParams.tab as (typeof FINANCE_TABS)[number])
    ? searchParams.tab
    : "recharge";
  const [kpis, txs, rechargeStudent] = await Promise.all([
    getFinanceKpis(),
    listTransactions({ limit: 100 }),
    getRechargeStudent(searchParams.student),
  ]);

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">财务管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          学员充值、退费、手动消课、流水审计
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KCard label="本月充值" value={kpis.recharge_mtd} sub="到账充值流水" Icon={Wallet} bg="bg-emerald-50" color="text-emerald-600" />
        <KCard label="本月退费" value={kpis.refund_mtd} sub="已执行退费流水" Icon={Undo2} bg="bg-amber-50" color="text-amber-600" />
        <KCard label="本月应课消" value={kpis.expected_consumption_mtd} sub="排期 × 在读报名实际单价" Icon={BookOpenCheck} bg="bg-blue-50" color="text-blue-600" />
        <KCard label="本月实课消" value={kpis.actual_consumption_mtd} sub="课消明细实际金额" Icon={Minus} bg="bg-red-50" color="text-red-500" />
        <KCard label="本月实收入" value={kpis.realized_income_mtd} sub="有效收入流水，应与实课消对账" Icon={ListOrdered} bg="bg-violet-50" color="text-violet-600" />
      </div>

      <Tabs
        defaultActiveKey={activeTab}
        queryParam="tab"
        tabs={[
          { key: "recharge", label: "充值", content: <RechargeForm initialStudent={rechargeStudent} /> },
          { key: "refund", label: "退费", content: <RefundForm /> },
          { key: "consume", label: "手动消课", content: <ConsumeForm /> },
          { key: "transactions", label: "全部流水", content: <TransactionList rows={txs} /> },
        ]}
      />
    </div>
  );
}

function KCard({ label, value, sub, Icon, bg, color }: { label: string; value: number; sub: string; Icon: typeof Wallet; bg: string; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card">
      <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl", bg)}>
        <Icon className={cn("h-6 w-6", color)} />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate text-sm text-slate-500">{label}</div>
        <div className="mt-0.5 truncate text-xl font-semibold tabular-nums text-slate-900">
          {formatCurrency(value)}
        </div>
        <div className="mt-1 truncate text-[11px] text-slate-400" title={sub}>{sub}</div>
      </div>
    </div>
  );
}
