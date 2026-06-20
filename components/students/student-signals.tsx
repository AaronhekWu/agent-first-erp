import { AlertTriangle, TrendingDown, ZapOff, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { StudentSignals } from "@/lib/api/signals";

const RISK_LABEL: Record<string, { label: string; cls: string; Icon: typeof AlertTriangle }> = {
  low_balance: { label: "余额偏低", cls: "bg-red-50 text-red-700 ring-red-200", Icon: TrendingDown },
  balance_runway_short: { label: "余额支撑 <14 天", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: Clock },
  no_class_7d: { label: "7 天未上课", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: ZapOff },
  no_followup_14d: { label: "14 天未跟进", cls: "bg-violet-50 text-violet-700 ring-violet-200", Icon: AlertTriangle },
  followup_overdue: { label: "跟进过期", cls: "bg-red-50 text-red-700 ring-red-200", Icon: AlertTriangle },
  attendance_below_70: { label: "出勤率 <70%", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: TrendingDown },
};

export function StudentSignalsCard({ signals }: { signals: StudentSignals }) {
  const f = signals.finance;
  const a = signals.attendance;
  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        学员风险信号
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Tile
          title="余额"
          value={formatCurrency(f.balance)}
          hint={
            f.burn_rate_30d > 0
              ? `日均 ${formatCurrency(f.burn_rate_30d)}, 可上 ${f.days_left_at_rate ?? "—"} 天`
              : "近 30 天无消课"
          }
          tone={f.balance < 200 ? "red" : f.low_balance ? "amber" : "default"}
        />
        <Tile
          title="30 天出勤率"
          value={a.rate_30d != null ? `${a.rate_30d}%` : "—"}
          hint={`到 ${a.present_count_30d} · 迟 ${a.late_count_30d} · 缺 ${a.absent_count_30d}`}
          tone={a.rate_30d != null && a.rate_30d < 70 ? "amber" : "default"}
        />
        <Tile
          title="跟进"
          value={signals.followups.days_since_last != null ? `${signals.followups.days_since_last} 天前` : "—"}
          hint={signals.followups.overdue_count > 0 ? `${signals.followups.overdue_count} 条过期` : "正常"}
          tone={signals.followups.overdue_count > 0 || (signals.followups.days_since_last ?? 0) > 14 ? "amber" : "default"}
        />
      </div>

      {signals.risk_flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {signals.risk_flags.map((k) => {
            const v = RISK_LABEL[k] ?? { label: k, cls: "bg-slate-100 text-slate-600 ring-slate-200", Icon: AlertTriangle };
            return (
              <span
                key={k}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ring-1 ring-inset",
                  v.cls,
                )}
              >
                <v.Icon className="h-3 w-3" />
                {v.label}
              </span>
            );
          })}
        </div>
      )}
      {signals.risk_flags.length === 0 && (
        <div className="mt-3 text-xs text-emerald-600">✓ 状态良好，无风险信号</div>
      )}
    </div>
  );
}

function Tile({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint: string;
  tone: "default" | "amber" | "red";
}) {
  const cls =
    tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{title}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", cls)}>{value}</div>
      <div className="text-[11px] text-slate-400">{hint}</div>
    </div>
  );
}
