import { listFollowupOverview } from "@/lib/api/followups";
import { FollowupsShell } from "@/components/followups/followups-shell";

export const dynamic = "force-dynamic";

export default async function FollowupsPage() {
  const overview = await listFollowupOverview();
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">跟进记录</h1>
          <p className="mt-1 text-sm text-slate-500">
            学员卡片 + 时间线 · 余额预警学员自动浮顶 · AI 推荐入口预留
          </p>
        </div>
        <div className="text-xs text-slate-400">
          数据源：v_followup_timeline + v_balance_warnings
        </div>
      </div>
      <FollowupsShell overview={overview} />
    </div>
  );
}
