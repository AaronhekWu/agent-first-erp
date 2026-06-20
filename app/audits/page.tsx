import { AlertTriangle } from "lucide-react";
import { ApprovalList, type ApprovalRow } from "@/components/audits/approval-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { getMe } from "@/lib/auth/me";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditsPage() {
  const [{ rows, unavailable, message }, me] = await Promise.all([listApprovals(), getMe()]);
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

      {!unavailable && <ApprovalList rows={rows} canReview={me?.user.primary_role === "admin"} />}
    </div>
  );
}

async function listApprovals(): Promise<{ rows: ApprovalRow[]; unavailable: boolean; message: string }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("aud_approvals")
    .select("id, type, title, reason, target_label, amount, payload, status, requested_by, reviewed_by, reviewer_note, execution_status, execution_error, execution_result, created_at, reviewed_at, executed_at")
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
