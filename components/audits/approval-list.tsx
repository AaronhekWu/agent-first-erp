"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronUp, Clock, PlayCircle, XCircle } from "lucide-react";
import { reviewApproval } from "@/lib/api/approvals-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ExecutionStatus = "not_started" | "running" | "succeeded" | "failed" | "not_required";

export interface ApprovalRow {
  id: string;
  type: string;
  title: string;
  reason: string | null;
  target_label: string | null;
  amount: number | null;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewer_note: string | null;
  execution_status: ExecutionStatus;
  execution_error: string | null;
  execution_result: Record<string, unknown> | null;
  created_at: string;
  reviewed_at: string | null;
  executed_at: string | null;
}

const STATUS_META = {
  pending: { label: "待审批", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: Clock },
  approved: { label: "已通过", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  rejected: { label: "已驳回", cls: "bg-red-50 text-red-600 ring-red-200", Icon: XCircle },
} satisfies Record<ApprovalStatus, { label: string; cls: string; Icon: typeof Clock }>;

const EXECUTION_LABEL: Record<ExecutionStatus, string> = {
  not_started: "尚未执行",
  running: "执行中",
  succeeded: "执行成功",
  failed: "执行失败",
  not_required: "无需执行",
};

export function ApprovalList({ rows, canReview }: { rows: ApprovalRow[]; canReview: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ApprovalRow | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.status === filter)),
    [filter, rows],
  );

  const openReview = (row: ApprovalRow, nextDecision: "approved" | "rejected") => {
    setReviewing(row);
    setDecision(nextDecision);
    setNote("");
    setError(null);
  };

  const submitReview = async () => {
    if (!reviewing) return;
    if (decision === "rejected" && !note.trim()) {
      setError("驳回时必须填写审批意见");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reviewApproval(reviewing.id, decision, note);
      setReviewing(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          {(["pending", "approved", "rejected", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "h-8 rounded-md px-3 text-sm",
                filter === value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {value === "all" ? "全部" : STATUS_META[value].label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">共 {filtered.length} 条</span>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-slate-400">暂无审批记录</div>
          )}
          {filtered.map((row) => {
            const meta = STATUS_META[row.status];
            const Icon = meta.Icon;
            const isExpanded = expanded === row.id;
            return (
              <div key={row.id} className="px-5 py-4">
                <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_150px_170px_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{row.title}</span>
                      <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ring-1 ring-inset", meta.cls)}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                      {row.execution_status === "failed" && (
                        <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-600 ring-1 ring-inset ring-red-200">
                          执行失败，可重试
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {row.target_label ?? row.type} · {row.reason ?? "未填写原因"}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">
                    {row.amount == null ? "无金额" : formatCurrency(row.amount)}
                  </div>
                  <div className="text-sm text-slate-500">{formatDate(row.created_at, true)}</div>
                  <div className="flex min-w-[190px] items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : row.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      详情
                    </button>
                    {row.status === "pending" && canReview && (
                      <>
                        <button
                          type="button"
                          onClick={() => openReview(row, "rejected")}
                          className="h-8 rounded-md border border-red-200 px-3 text-xs text-red-600 hover:bg-red-50"
                        >
                          驳回
                        </button>
                        <button
                          type="button"
                          onClick={() => openReview(row, "approved")}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          通过并执行
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 grid gap-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600 md:grid-cols-2">
                    <Detail label="申请人" value={row.requested_by ?? "未知"} />
                    <Detail label="执行状态" value={EXECUTION_LABEL[row.execution_status]} />
                    <Detail label="审批时间" value={row.reviewed_at ? formatDate(row.reviewed_at, true) : "—"} />
                    <Detail label="执行时间" value={row.executed_at ? formatDate(row.executed_at, true) : "—"} />
                    {row.reviewer_note && <Detail label="审批意见" value={row.reviewer_note} />}
                    {row.execution_error && <Detail label="执行错误" value={row.execution_error} danger />}
                    <div className="md:col-span-2">
                      <div className="mb-1 text-slate-400">执行参数</div>
                      <pre className="max-h-44 overflow-auto rounded bg-slate-900 p-3 leading-5 text-slate-100">
                        {JSON.stringify(row.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!canReview && (
          <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            当前账号可查看自己提交的审批；通过和驳回操作仅限管理员。
          </div>
        )}
      </div>

      {reviewing && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="font-semibold text-slate-900">
                {decision === "approved" ? "通过并执行审批" : "驳回审批"}
              </div>
              <div className="mt-1 text-sm text-slate-500">{reviewing.title}</div>
            </div>
            <div className="space-y-3 px-5 py-4">
              {decision === "approved" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  通过后将立即执行对应业务操作。执行失败时审批会保持待处理，并记录错误供重试。
                </div>
              )}
              <label className="block text-sm text-slate-600">
                审批意见{decision === "rejected" ? "（必填）" : "（选填）"}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  placeholder={decision === "approved" ? "填写通过说明" : "填写驳回原因"}
                />
              </label>
              {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setReviewing(null)}
                className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submitReview}
                className={cn(
                  "h-9 rounded-md px-4 text-sm font-medium text-white disabled:opacity-50",
                  decision === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-500 hover:bg-red-600",
                )}
              >
                {busy ? "处理中..." : decision === "approved" ? "确认通过并执行" : "确认驳回"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-slate-400">{label}</div>
      <div className={cn("mt-1 break-all", danger ? "text-red-600" : "text-slate-700")}>{value}</div>
    </div>
  );
}
