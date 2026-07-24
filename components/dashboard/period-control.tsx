import Link from "next/link";

export function PeriodControl({
  active,
  from,
  to,
}: {
  active: string;
  from: string;
  to: string;
}) {
  const options = [
    ["half", "半个月"],
    ["month", "单月"],
    ["quarter", "季度"],
    ["year", "年度"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <span className="mr-1 text-xs font-medium text-slate-500">统计时段</span>
      {options.map(([value, label]) => (
        <Link key={value} href={`/dashboard?range=${value}`} className={`rounded-md px-3 py-1.5 text-xs ${active === value ? "bg-brand-600 font-medium text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{label}</Link>
      ))}
      <form action="/dashboard" className="ml-auto flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" defaultValue={from} className="h-8 rounded border border-slate-200 px-2 text-xs" />
        <span className="text-xs text-slate-400">至</span>
        <input type="date" name="to" defaultValue={to} className="h-8 rounded border border-slate-200 px-2 text-xs" />
        <button type="submit" className={`h-8 rounded-md px-3 text-xs ${active === "custom" ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>自定义</button>
      </form>
    </div>
  );
}
