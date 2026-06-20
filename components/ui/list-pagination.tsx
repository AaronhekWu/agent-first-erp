"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const PAGE_SIZE_OPTIONS = [15, 30, 45, 60, 75, 90] as const;

interface Props {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  compact?: boolean;
}

export function ListPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  compact = false,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const pages = compactPages(current, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm">
      <label className="flex items-center gap-2 text-slate-500">
        <span>每页显示</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
        >
          {PAGE_SIZE_OPTIONS.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1.5">
        <PageButton label="上一页" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </PageButton>
        {!compact && pages.map((value, index) => value === "…" ? (
          <span key={`ellipsis-${index}`} className="px-1 text-slate-400">…</span>
        ) : (
          <button
            key={value}
            type="button"
            onClick={() => onPageChange(value)}
            className={cn(
              "grid h-8 min-w-8 place-items-center rounded-md border px-2 text-sm",
              value === current
                ? "border-brand-500 bg-brand-50 font-medium text-brand-600"
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {value}
          </button>
        ))}
        {compact && <span className="px-2 text-slate-500">{current} / {totalPages}</span>}
        <PageButton label="下一页" disabled={current >= totalPages} onClick={() => onPageChange(current + 1)}>
          <ChevronRight className="h-4 w-4" />
        </PageButton>
        {!compact && totalPages > 1 && (
          <label className="ml-2 flex items-center gap-1 text-slate-500">
            <span>跳至</span>
            <input
              key={current}
              defaultValue={current}
              inputMode="numeric"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const value = Number(event.currentTarget.value);
                if (value >= 1 && value <= totalPages) onPageChange(value);
              }}
              className="h-8 w-12 rounded-md border border-slate-200 px-2 text-center focus:border-brand-500 focus:outline-none"
            />
            <span>页</span>
          </label>
        )}
      </div>
    </div>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function compactPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const values = new Set([1, 2, 3, total, current - 1, current, current + 1]);
  const ordered = [...values].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  ordered.forEach((value, index) => {
    if (index > 0 && value - ordered[index - 1] > 1) result.push("…");
    result.push(value);
  });
  return result;
}
