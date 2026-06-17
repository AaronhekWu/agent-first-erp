import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ApprovalStatus = "pending" | "approved" | "rejected";

interface ApprovalRow {
  id: string;
  type: string;
  title: string;
  reason: string | null;
  target_label: string | null;
  amount: number | null;
  status: ApprovalStatus;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_META: Record<ApprovalStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  pending: { label: "待审批", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: Clock },
  approved: { label: "已通过", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  rejected: { label: "已驳回", cls: "bg-red-50 text-red-600 ring-red-200", Icon: XCircle },
};

export default async function AuditsPage() {
  const { rows, unavailable, message } = await listApprovals();
  const pending = rows.filter((r) => r.status === "pending").length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">审批中心</h1>
        <p className="mt-1 text-sm text-slate-500">
          统一处理退费、退课、转课、删除与停用等高风险操作。
        </p>
      </div>

      {unavailable && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">审批后端尚未部署</div>
            <div className="mt-1 text-amber-700">
              {message} 当前页面已接好 `aud_approvals` 读取口径，破坏性操作会尝试提交审批，不会直接执行原 RPC。
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="待审批" value={pending} tone="amber" />
        <Kpi label="已通过" value={approved} tone="emerald" />
        <Kpi label="已驳回" value={rejected} tone="red" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">
          最近审批申请
        </div>
        <div className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-slate-400">
              暂无审批记录
            </div>
          )}
          {rows.map((row) => {
            const meta = STATUS_META[row.status] ?? STATUS_META.pending;
            const Icon = meta.Icon;
            return (
              <div key={row.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_160px_160px]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{row.title}</span>
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ring-1 ring-inset", meta.cls)}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {row.target_label ?? row.type} · {row.reason ?? "未填写原因"}
                  </div>
                  {row.reviewer_note && (
                    <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      审批意见：{row.reviewer_note}
                    </div>
                  )}
                </div>
                <div className="text-sm text-slate-600">
                  金额：{row.amount == null ? "—" : formatCurrency(row.amount)}
                </div>
                <div className="text-sm text-slate-500 md:text-right">
                  {formatDate(row.created_at, true)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

async function listApprovals(): Promise<{ rows: ApprovalRow[]; unavailable: boolean; message: string }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("aud_approvals")
    .select("id, type, title, reason, target_label, amount, status, requested_by, reviewed_by, reviewer_note, created_at, reviewed_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return { rows: [], unavailable: true, message: error.message };
  }
  return { rows: (data ?? []) as ApprovalRow[], unavailable: false, message: "" };
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "red" }) {
  const cls = {
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    red: "text-red-500",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", cls)}>{value}</div>
    </div>
  );
}
