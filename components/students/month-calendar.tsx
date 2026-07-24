"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMonthlyCalendarClient } from "@/lib/api/signals-client";
import type { MonthCalendar, MonthCalendarDay } from "@/lib/api/signals";
import { AttendanceEditModal } from "./attendance-edit-modal";

const STATUS_CLS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  absent: "bg-red-100 text-red-700 ring-red-200",
  late: "bg-amber-100 text-amber-700 ring-amber-200",
  leave: "bg-slate-200 text-slate-600 ring-slate-300",
  multi: "bg-blue-100 text-blue-700 ring-blue-200",
};
const STATUS_LABEL: Record<string, string> = {
  present: "到",
  absent: "缺",
  late: "迟",
  leave: "假",
};
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function MonthCalendar({ studentId }: { studentId: string }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<MonthCalendar | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeDay, setActiveDay] = useState<MonthCalendarDay | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMonthlyCalendarClient(studentId, year, month));
    } finally {
      setLoading(false);
    }
  }, [studentId, year, month]);

  useEffect(() => { void load(); }, [load]);

  const grid = useMemo(() => {
    if (!data) return [];
    const cells: (MonthCalendarDay | null)[] = [];
    for (let index = 0; index < new Date(year, month - 1, 1).getDay(); index += 1) cells.push(null);
    for (const day of data.days) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [data, year, month]);

  const stats = useMemo(() => {
    const next = { present: 0, absent: 0, late: 0, leave: 0 };
    for (const day of data?.days ?? []) {
      for (const slot of day.slots) next[slot.status] += 1;
    }
    return next;
  }, [data]);

  const prev = () => {
    if (month === 1) { setYear((value) => value - 1); setMonth(12); }
    else setMonth((value) => value - 1);
  };
  const next = () => {
    if (month === 12) { setYear((value) => value + 1); setMonth(1); }
    else setMonth((value) => value + 1);
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">本月课消</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={prev} className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium tabular-nums text-slate-700">{year} 年 {month} 月</span>
          <button type="button" onClick={next} className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => void load()} className="ml-1 grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
        {WEEKDAYS.map((weekday) => <div key={weekday}>{weekday}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell, index) => {
          if (!cell) return <div key={`blank-${index}`} />;
          const date = new Date(`${cell.date}T00:00:00`);
          const slots = cell.slots;
          const cellCls = slots.length === 0
            ? "bg-slate-50 text-slate-500 ring-slate-100 hover:bg-brand-50 hover:text-brand-600"
            : slots.length > 1
              ? STATUS_CLS.multi
              : STATUS_CLS[slots[0].status] ?? STATUS_CLS.multi;
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => setActiveDay(cell)}
              className={cn(
                "relative grid aspect-square cursor-pointer place-items-center rounded text-xs ring-1 ring-inset transition hover:scale-[1.03]",
                cellCls,
                isToday && "ring-2 ring-brand-500",
              )}
              title={slots.length > 0
                ? slots.map((slot) => `${slot.course_name}：${STATUS_LABEL[slot.status]}`).join("\n")
                : "点击补录课消"}
            >
              <span className="font-medium">{date.getDate()}</span>
              {slots.length === 1 && <span className="absolute bottom-0.5 right-1 text-[9px] opacity-70">{STATUS_LABEL[slots[0].status]}</span>}
              {slots.length > 1 && <span className="absolute bottom-0.5 right-1 text-[9px] opacity-70">×{slots.length}</span>}
              {slots.reduce((sum, slot) => sum + slot.consumption_count, 0) > 0 && (
                <span className="absolute left-1 top-0.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-100 pt-2 text-center text-[11px]">
        <Stat label="到课" value={stats.present} cls="text-emerald-600" />
        <Stat label="迟到" value={stats.late} cls="text-amber-600" />
        <Stat label="缺勤" value={stats.absent} cls="text-red-500" />
        <Stat label="请假" value={stats.leave} cls="text-slate-500" />
      </div>
      <p className="mt-2 text-[10px] text-slate-400">点击任意日期查看课消明细、修改考勤；空白日期可补录课消。</p>
      {activeDay && data && (
        <AttendanceEditModal
          day={activeDay}
          eligibleEnrollments={data.eligible_enrollments}
          onClose={() => setActiveDay(null)}
          onSaved={() => { setActiveDay(null); void load(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return <div><div className={cn("text-sm font-semibold tabular-nums", cls)}>{value}</div><div className="text-[10px] text-slate-400">{label}</div></div>;
}
