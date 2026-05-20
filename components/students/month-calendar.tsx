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

interface Props {
  studentId: string;
}

export function MonthCalendar({ studentId }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<MonthCalendar | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeDay, setActiveDay] = useState<MonthCalendarDay | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const v = await getMonthlyCalendarClient(studentId, year, month);
      setData(v);
    } finally {
      setLoading(false);
    }
  }, [studentId, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const grid = useMemo(() => {
    if (!data) return [];
    const firstDow = new Date(year, month - 1, 1).getDay();
    const cells: (MonthCalendarDay | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (const d of data.days) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [data, year, month]);

  const prev = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  };

  // 统计
  const stats = useMemo(() => {
    if (!data) return { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
    let p = 0, a = 0, l = 0, lv = 0, t = 0;
    for (const d of data.days) {
      for (const s of d.slots) {
        t += 1;
        if (s.status === "present") p++;
        else if (s.status === "absent") a++;
        else if (s.status === "late") l++;
        else if (s.status === "leave") lv++;
      }
    }
    return { present: p, absent: a, late: l, leave: lv, total: t };
  }, [data]);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">本月课消</h3>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 tabular-nums">
            {year} 年 {month} 月
          </span>
          <button onClick={next} className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => void load()} className="ml-1 grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell, i) => {
          if (!cell) return <div key={`_${i}`} />;
          const date = new Date(cell.date);
          const dayNum = date.getDate();
          const slots = cell.slots;
          // 决定单元格颜色：取第一个状态；多课时用 multi
          const cellCls =
            slots.length === 0
              ? "bg-slate-50 text-slate-400 ring-slate-100"
              : slots.length > 1
                ? STATUS_CLS.multi
                : STATUS_CLS[slots[0].status] ?? STATUS_CLS.multi;
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <button
              key={cell.date}
              onClick={() => slots.length > 0 && setActiveDay(cell)}
              disabled={slots.length === 0}
              className={cn(
                "relative grid aspect-square place-items-center rounded text-xs ring-1 ring-inset transition",
                cellCls,
                slots.length > 0 ? "hover:scale-[1.03] cursor-pointer" : "cursor-default",
                isToday && "ring-2 ring-brand-500",
              )}
              title={slots.map((s) => `${s.course_name}: ${s.status}`).join("\n") || "无课"}
            >
              <span className="font-medium">{dayNum}</span>
              {slots.length === 1 && (
                <span className="absolute bottom-0.5 right-1 text-[9px] opacity-70">
                  {STATUS_LABEL[slots[0].status]}
                </span>
              )}
              {slots.length > 1 && (
                <span className="absolute bottom-0.5 right-1 text-[9px] opacity-70">
                  ×{slots.length}
                </span>
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

      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
        <Legend cls="bg-emerald-100" label="到" />
        <Legend cls="bg-amber-100" label="迟" />
        <Legend cls="bg-red-100" label="缺" />
        <Legend cls="bg-slate-200" label="假" />
        <Legend cls="bg-blue-100" label="多门课" />
      </div>

      {activeDay && (
        <AttendanceEditModal day={activeDay} onClose={() => setActiveDay(null)} onSaved={() => { setActiveDay(null); void load(); }} />
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div>
      <div className={cn("text-sm font-semibold tabular-nums", cls)}>{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", cls)} /> {label}
    </span>
  );
}
