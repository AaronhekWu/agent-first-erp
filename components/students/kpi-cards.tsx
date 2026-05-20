import { ArrowUp, ArrowDown, Users, GraduationCap, TrendingUp, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudentKPIs } from "@/lib/api/students";

interface CardProps {
  label: string;
  value: number;
  hint: React.ReactNode;
  Icon: typeof Users;
  iconBg: string;
  iconColor: string;
}

function Card({ label, value, hint, Icon, iconBg, iconColor }: CardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card">
      <div className={cn("grid h-12 w-12 place-items-center rounded-xl", iconBg)}>
        <Icon className={cn("h-6 w-6", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
          {value.toLocaleString("zh-CN")}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
      </div>
    </div>
  );
}

function Delta({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null || value === undefined) return <span>—</span>;
  if (value === 0) return <span className="text-slate-400">持平</span>;
  const up = value > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  const cls = up ? "text-emerald-600" : "text-red-500";
  return (
    <span className={cn("inline-flex items-center gap-0.5", cls)}>
      {up ? "+" : ""}
      {value}
      {suffix ?? ""}
      <Arrow className="h-3 w-3" />
    </span>
  );
}

export function KpiCards({ kpis }: { kpis: StudentKPIs }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card
        label="学员总数"
        value={kpis.total.value}
        Icon={Users}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        hint={
          <>
            较上月 <Delta value={kpis.total.delta_pct} suffix="%" />
          </>
        }
      />
      <Card
        label="在读学员"
        value={kpis.active.value}
        Icon={GraduationCap}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        hint={
          <>
            占比{" "}
            <span className="font-medium text-slate-700">
              {kpis.active.ratio_pct ?? 0}%
            </span>
          </>
        }
      />
      <Card
        label="本周新增"
        value={kpis.new_week.value}
        Icon={TrendingUp}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        hint={
          <>
            较上周 <Delta value={kpis.new_week.delta} />
          </>
        }
      />
      <Card
        label="待跟进"
        value={kpis.pending.value}
        Icon={Bell}
        iconBg="bg-violet-50"
        iconColor="text-violet-600"
        hint={
          <>
            较上周 <Delta value={kpis.pending.delta} />
          </>
        }
      />
    </div>
  );
}
