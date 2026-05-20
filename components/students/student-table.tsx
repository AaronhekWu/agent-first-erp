"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Settings2,
  Info,
  CheckSquare,
  Square,
  Minus,
  X,
  UserCog,
  Mail,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDate,
  followupTypeLabel,
  maskPhone,
} from "@/lib/format";
import { StatusBadge } from "./status-badge";
import { StudentDrawer } from "./student-drawer";
import type { StudentRow } from "@/lib/api/students";

interface Props {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
}

const COLS: { key: string; label: string; w?: string; align?: string }[] = [
  { key: "name", label: "姓名", w: "w-24" },
  { key: "phone", label: "手机号", w: "w-32" },
  { key: "status", label: "状态", w: "w-24" },
  { key: "school", label: "学校", w: "w-32" },
  { key: "grade", label: "年级", w: "w-16" },
  { key: "department_name", label: "部门", w: "w-28" },
  { key: "counselor_name", label: "顾问", w: "w-20" },
  { key: "balance", label: "余额", w: "w-24", align: "text-right" },
  { key: "total_recharged", label: "累计充值", w: "w-28", align: "text-right" },
  { key: "active_enrollment_count", label: "在读课程", w: "w-20", align: "text-center" },
  { key: "last_followup_at", label: "最后跟进", w: "w-36" },
  { key: "created_at", label: "创建时间", w: "w-28" },
  { key: "action", label: "操作", w: "w-28", align: "text-right" },
];

export function StudentTable({ rows, total, page, pageSize }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [active, setActive] = useState<StudentRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const allOnPageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = allOnPageIds.length > 0 && allOnPageIds.every((id) => selected.has(id));
  const someSelected = !allSelected && allOnPageIds.some((id) => selected.has(id));

  const toggleOne = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((cur) => {
      if (allSelected) {
        const next = new Set(cur);
        for (const id of allOnPageIds) next.delete(id);
        return next;
      }
      const next = new Set(cur);
      for (const id of allOnPageIds) next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const gotoPage = (p: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(p));
    router.push(`/students?${params.toString()}`);
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const batchAction = (label: string) =>
    alert(
      `${label} — 共 ${selected.size} 个学员\n` +
        selectedRows.map((r) => `· ${r.name} (${r.student_code ?? r.id.slice(0, 8)})`).join("\n") +
        `\n\n该批量操作已收敛到 Edge Function 路径，待接入后将真实执行。`,
    );

  return (
    <div className="rounded-2xl bg-white shadow-card">
      {/* Toolbar */}
      {selected.size > 0 ? (
        <div className="flex items-center justify-between border-b border-brand-200 bg-brand-50 px-5 py-3">
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={clearSelection}
              className="grid h-7 w-7 place-items-center rounded text-brand-600 hover:bg-brand-100"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="font-medium text-brand-700">
              已选择 {selected.size} 个学员
            </span>
          </div>
          <div className="flex items-center gap-2">
            <BatchBtn icon={UserCog} label="批量转移顾问" onClick={() => batchAction("批量转移顾问")} />
            <BatchBtn icon={Mail} label="批量发短信" onClick={() => batchAction("批量发短信")} />
            <BatchBtn icon={Download} label="导出选中" onClick={() => batchAction("导出选中学员")} />
            <BatchBtn icon={Trash2} label="批量删除" danger onClick={() => batchAction("批量删除")} />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>
              共 <span className="font-medium text-slate-800">{total.toLocaleString()}</span> 条
            </span>
            <button
              type="button"
              onClick={() => alert("请先勾选学员，再选择批量操作")}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              批量操作
            </button>
            <button
              type="button"
              onClick={() => alert("导出当前筛选 (CSV) — 即将上线")}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              导出
            </button>
            <span className="text-xs text-slate-400 inline-flex items-center gap-1">
              主数据源: v_student_overview <Info className="h-3 w-3" />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.refresh()}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
              title="刷新"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
              title="列设置"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-3">
                <button
                  onClick={toggleAll}
                  className="text-slate-500 hover:text-brand-600"
                  aria-label="全选当前页"
                >
                  {allSelected ? (
                    <CheckSquare className="h-4 w-4 text-brand-600" />
                  ) : someSelected ? (
                    <Minus className="h-4 w-4 text-brand-600" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
              </th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-3 font-medium whitespace-nowrap",
                    c.w,
                    c.align ?? "text-left",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLS.length + 1}
                  className="px-4 py-16 text-center text-sm text-slate-400"
                >
                  没有匹配的数据
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isChecked = selected.has(r.id);
              return (
              <tr
                key={r.id}
                className={cn(
                  "cursor-pointer hover:bg-slate-50",
                  isChecked && "bg-brand-50/50",
                )}
                onClick={() => setActive(r)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleOne(r.id)}
                    className="text-slate-400 hover:text-brand-600"
                    aria-label="选中此行"
                  >
                    {isChecked ? (
                      <CheckSquare className="h-4 w-4 text-brand-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </td>
                <td className="px-3 py-3 font-medium text-slate-800">{r.name}</td>
                <td className="px-3 py-3 text-slate-600">{maskPhone(r.phone)}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-3 text-slate-600">{r.school ?? "—"}</td>
                <td className="px-3 py-3 text-slate-600">{r.grade ?? "—"}</td>
                <td className="px-3 py-3 text-slate-600">
                  {r.department_name ?? "—"}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {r.counselor_name ?? "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right tabular-nums",
                    Number(r.balance) < 0 ? "text-red-500" : "text-amber-600",
                  )}
                >
                  {formatCurrency(r.balance)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                  {formatCurrency(r.total_recharged)}
                </td>
                <td className="px-3 py-3 text-center text-slate-700">
                  {r.active_enrollment_count} 门
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {r.last_followup_at ? (
                    <div className="leading-tight">
                      <div>{formatDate(r.last_followup_at, true)}</div>
                      <div className="text-xs text-slate-400">
                        {r.counselor_name ?? "—"}{" "}
                        {followupTypeLabel(r.last_followup_type)}
                      </div>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <div className="leading-tight">
                    <div>{formatDate(r.created_at, true).split(" ")[0]}</div>
                    <div className="text-xs text-slate-400">
                      {formatDate(r.created_at, true).split(" ")[1]}
                    </div>
                  </div>
                </td>
                <td
                  className="px-3 py-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/students/${r.id}`}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      查看详情
                    </Link>
                    <button
                      onClick={() => alert("充值功能即将上线")}
                      className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"
                    >
                      充值
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <span>每页显示</span>
          <select className="h-7 rounded border border-slate-200 bg-white px-1 text-xs">
            <option value="20">20</option>
          </select>
        </div>
        <Pagination current={page} totalPages={totalPages} onChange={gotoPage} />
      </div>

      <StudentDrawer student={active} onClose={() => setActive(null)} />
    </div>
  );
}

function Pagination({
  current,
  totalPages,
  onChange,
}: {
  current: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const pages = compactPages(current, totalPages);
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <button
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
        className="grid h-8 w-8 place-items-center rounded border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={i} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={i}
            onClick={() => onChange(p as number)}
            className={cn(
              "grid h-8 w-8 place-items-center rounded text-sm",
              p === current
                ? "border border-brand-500 bg-brand-50 text-brand-600 font-medium"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(Math.min(totalPages, current + 1))}
        disabled={current >= totalPages}
        className="grid h-8 w-8 place-items-center rounded border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="ml-2 text-slate-500">跳至</span>
      <input
        defaultValue={current}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = Number((e.target as HTMLInputElement).value);
            if (n >= 1 && n <= totalPages) onChange(n);
          }
        }}
        className="h-8 w-12 rounded border border-slate-200 px-2 text-center text-sm focus:border-brand-500 focus:outline-none"
      />
      <span className="text-slate-500">页</span>
    </div>
  );
}

function BatchBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs",
        danger
          ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
          : "border-brand-200 bg-white text-brand-700 hover:bg-brand-100",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function compactPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, 2, 3, total, current - 1, current, current + 1]);
  const arr = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i > 0 && arr[i] - arr[i - 1] > 1) out.push("…");
    out.push(arr[i]);
  }
  return out;
}
