"use client";

import { Clock3 } from "lucide-react";
import { inputCls } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const PRESETS = [
  ["09:00-10:30", "上午 09:00–10:30"],
  ["10:30-12:00", "上午 10:30–12:00"],
  ["13:30-15:00", "下午 13:30–15:00"],
  ["15:00-16:30", "下午 15:00–16:30"],
  ["16:30-18:00", "傍晚 16:30–18:00"],
  ["18:00-19:30", "晚上 18:00–19:30"],
  ["18:00-20:00", "晚上 18:00–20:00"],
  ["19:00-20:30", "晚上 19:00–20:30"],
] as const;

export function TimeRangeInput({
  start,
  end,
  onChange,
  className,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  className?: string;
}) {
  const current = `${start}-${end}`;
  const presetValue = PRESETS.some(([value]) => value === current) ? current : "";

  return (
    <div className={cn("grid gap-2 sm:grid-cols-[1fr_auto_1fr_1.35fr]", className)}>
      <label className="relative">
        <span className="sr-only">开始时间</span>
        <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="time"
          step={300}
          value={start}
          onChange={(event) => onChange(event.target.value, end)}
          className={cn(inputCls, "pl-9")}
          aria-label="开始时间"
        />
      </label>
      <span className="hidden self-center text-xs text-slate-400 sm:block">至</span>
      <label className="relative">
        <span className="sr-only">结束时间</span>
        <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="time"
          step={300}
          value={end}
          onChange={(event) => onChange(start, event.target.value)}
          className={cn(inputCls, "pl-9")}
          aria-label="结束时间"
        />
      </label>
      <select
        value={presetValue}
        onChange={(event) => {
          const [nextStart, nextEnd] = event.target.value.split("-");
          if (nextStart && nextEnd) onChange(nextStart, nextEnd);
        }}
        className={inputCls}
        aria-label="选择常用上课时段"
      >
        <option value="">常用时段</option>
        {PRESETS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  );
}
