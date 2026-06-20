"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { reviewApproval } from "@/lib/api/approvals-client";
import { usePermissions } from "@/lib/auth/permissions-context";

/**
 * 审批操作按钮 (仅管理员可见). 「通过」后端会立即执行对应破坏性操作。
 */
export function ApprovalActions({ id }: { id: string }) {
  const router = useRouter();
  const { user } = usePermissions();
  const [busy, setBusy] = useState(false);

  if (user.primary_role !== "admin") return null;

  async function act(status: "approved" | "rejected") {
    let note: string | undefined;
    if (status === "rejected") {
      const r = prompt("驳回原因（可选）");
      if (r === null) return;
      note = r.trim() || undefined;
    } else if (!confirm("确认通过该审批？通过后将立即执行对应操作（退费/删除等不可撤销）。")) {
      return;
    }
    setBusy(true);
    try {
      await reviewApproval(id, status, note);
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 md:justify-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => act("approved")}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        通过
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("rejected")}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        驳回
      </button>
    </div>
  );
}
