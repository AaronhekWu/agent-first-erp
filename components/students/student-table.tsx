"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RefreshCw,
  Settings2,
  CheckSquare,
  Square,
  Minus,
  X,
  UserCog,
  Trash2,
  Wallet,
  Snowflake,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDate,
  followupTypeLabel,
  displayPhone,
  studentStatusLabel,
} from "@/lib/format";
import { StatusBadge } from "./status-badge";
import { StudentDrawer } from "./student-drawer";
import { Gate } from "@/lib/auth/permissions-context";
import { requestApproval } from "@/lib/api/approvals-client";
import { batchDeleteStudents } from "@/lib/api/students-edge-client";
import { batchAssignStudents, reactivateStudent } from "@/lib/api/create";
import type { Counselor, StudentRow } from "@/lib/api/students";
import { parseStudentSort, STUDENT_SORT_OPTIONS } from "@/lib/list-sorting";
import { UrlSortSelect } from "@/components/ui/url-sort-select";

interface Props {
  rows: StudentRow[];
  counselors: Counselor[];
  total: number;
  page: number;
  pageSize: number;
  sort?: string;
}

const COLS: { key: string; label: string; min: number; max: number; align?: string; fixed?: number }[] = [
  { key: "name", label: "姓名", min: 88, max: 176 },
  { key: "phone", label: "家长电话", min: 128, max: 240 },
  { key: "status", label: "状态", min: 84, max: 112 },
  { key: "school", label: "学校", min: 88, max: 240 },
  { key: "grade", label: "年级", min: 80, max: 128 },
  { key: "department_name", label: "部门", min: 88, max: 176 },
  { key: "counselor_name", label: "顾问", min: 88, max: 160 },
  { key: "balance", label: "余额", min: 112, max: 152, align: "text-right" },
  { key: "total_recharged", label: "累计充值", min: 120, max: 168, align: "text-right" },
  { key: "active_enrollment_count", label: "在读课程", min: 88, max: 112, align: "text-center" },
  { key: "last_followup_at", label: "最后跟进", min: 160, max: 280 },
  { key: "created_at", label: "创建时间", min: 148, max: 172 },
  { key: "action", label: "操作", min: 152, max: 152, fixed: 152, align: "text-left" },
];

function displayColumnValue(row: StudentRow, key: string): string {
  switch (key) {
    case "name": return row.name;
    case "phone": return displayPhone(row.phone);
    case "status": return studentStatusLabel(row.status);
    case "school": return row.school ?? "未填写";
    case "grade": return row.grade ?? "未填写";
    case "department_name": return row.department_name ?? "未分配";
    case "counselor_name": return row.counselor_name ?? "未分配";
    case "balance": return formatCurrency(row.balance);
    case "total_recharged": return formatCurrency(row.total_recharged);
    case "active_enrollment_count": return `${row.active_enrollment_count} 门`;
    case "last_followup_at":
      return row.last_followup_at
        ? `${formatDate(row.last_followup_at, true)} · ${row.counselor_name ?? "未分配"} · ${followupTypeLabel(row.last_followup_type)}`
        : "暂无跟进";
    case "created_at": return formatDate(row.created_at, true);
    default: return "";
  }
}

function visualLength(value: string): number {
  return Array.from(value).reduce((total, character) => total + (/[\u0000-\u00ff]/.test(character) ? 1 : 2), 0);
}

export function StudentTable({ rows, counselors, total, page, pageSize, sort: rawSort }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [active, setActive] = useState<StudentRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freezeTarget, setFreezeTarget] = useState<StudentRow | null>(null);
  const [reactivationTarget, setReactivationTarget] = useState<StudentRow | null>(null);
  const [batchCounselorId, setBatchCounselorId] = useState("");
  const [batchTransferring, setBatchTransferring] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sort = parseStudentSort(rawSort);
  const columnWidths = useMemo(() => COLS.map((column) => {
    if (column.fixed) return column.fixed;
    const contentLength = rows.reduce(
      (longest, row) => Math.max(longest, visualLength(displayColumnValue(row, column.key))),
      visualLength(column.label),
    );
    return Math.min(column.max, Math.max(column.min, Math.ceil(contentLength * 7.5 + 32)));
  }), [rows]);
  const tableWidth = 48 + columnWidths.reduce((sum, width) => sum + width, 0);

  const allOnPageIds = useMemo(
    () => rows.filter((r) => r.status === "active").map((r) => r.id),
    [rows],
  );
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

  const changePageSize = (nextPageSize: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set("page", "1");
    params.set("pageSize", String(nextPageSize));
    router.push(`/students?${params.toString()}`);
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const exportRows = (items: StudentRow[], label: string) => {
    const columns: Array<[string, (row: StudentRow) => unknown]> = [
      ["学员编号", (row) => row.student_code ?? ""], ["姓名", (row) => row.name],
      ["家长电话", (row) => row.phone ?? ""], ["状态", (row) => row.status],
      ["学校", (row) => row.school ?? ""], ["年级", (row) => row.grade ?? ""],
      ["部门", (row) => row.department_name ?? ""], ["顾问", (row) => row.counselor_name ?? ""],
      ["余额", (row) => row.balance], ["在读课程", (row) => row.active_enrollment_count],
      ["创建时间", (row) => row.created_at],
    ];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = `\uFEFF${columns.map(([header]) => escape(header)).join(",")}\r\n${items
      .map((row) => columns.map(([, get]) => escape(get(row))).join(","))
      .join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const batchTransferCounselor = async () => {
    if (!batchCounselorId) return alert("请选择目标顾问");
    setBatchTransferring(true);
    try {
      const result = await batchAssignStudents({
        p_student_ids: [...selected],
        p_counselor_id: batchCounselorId,
      }) as { updated?: number };
      alert(`已转移 ${result.updated ?? selected.size} 名学员`);
      clearSelection();
      router.refresh();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setBatchTransferring(false);
    }
  };

  const [batchDeleting, setBatchDeleting] = useState(false);
  const batchDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const names = selectedRows.map((r) => `· ${r.name} (${r.student_code ?? r.id.slice(0, 8)})`).join("\n");
    if (!confirm(`确认删除以下 ${ids.length} 名学员？将通过管理员边缘函数立即软删除（不可撤销）：\n\n${names}`)) {
      return;
    }
    setBatchDeleting(true);
    try {
      const r = await batchDeleteStudents(ids);
      alert(`已删除 ${r.deleted} / ${r.requested} 名学员`);
      clearSelection();
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBatchDeleting(false);
    }
  };

  const requestStudentDelete = async (student: StudentRow) => {
    const blockers: string[] = [];
    if (student.status !== "active") {
      blockers.push("只有在读学员可以提交删除审批");
    }
    if (student.active_enrollment_count > 0) {
      blockers.push(`仍有 ${student.active_enrollment_count} 门在读课程，请先完成退课或转课`);
    }
    if (Number(student.balance) !== 0) {
      blockers.push(`账户余额为 ${formatCurrency(student.balance)}，请先完成结清`);
    }
    if (blockers.length > 0) {
      alert(`暂不能删除「${student.name}」：\n\n${blockers.map((item) => `• ${item}`).join("\n")}`);
      return;
    }

    const reason = prompt(`请填写删除学员「${student.name}」的审批原因`);
    if (reason === null) return;
    if (!reason.trim()) return alert("审批原因必填");
    try {
      await requestApproval({
        type: "student_delete",
        title: `删除学员审批：${student.name}`,
        reason: reason.trim(),
        targetId: student.id,
        targetLabel: student.name,
        payload: { p_student_id: student.id },
      });
      alert("已提交删除学员审批");
    } catch (e) {
      alert((e as Error).message);
    }
  };

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
            <Gate keys="students.update">
              <select
                value={batchCounselorId}
                onChange={(event) => setBatchCounselorId(event.target.value)}
                className="h-8 rounded-md border border-brand-200 bg-white px-2 text-xs text-slate-700"
                aria-label="目标顾问"
              >
                <option value="">选择目标顾问</option>
                {counselors.map((counselor) => <option key={counselor.id} value={counselor.id}>{counselor.display_name}</option>)}
              </select>
              <BatchBtn icon={UserCog} label={batchTransferring ? "转移中…" : "转移顾问"} onClick={batchTransferCounselor} />
            </Gate>
            <Gate keys="students.export">
              <BatchBtn icon={Download} label="导出选中" onClick={() => exportRows(selectedRows, "选中学员")} />
            </Gate>
            <Gate keys="students.delete">
              <BatchBtn icon={Trash2} label={batchDeleting ? "删除中…" : "批量删除"} danger onClick={batchDelete} />
            </Gate>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>
              共 <span className="font-medium text-slate-800">{total.toLocaleString()}</span> 条
            </span>
            <Gate keys="students.export">
              <button
                type="button"
                onClick={() => exportRows(rows, "当前页学员")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                导出当前页
              </button>
            </Gate>
          </div>
          <div className="flex items-center gap-2">
            <UrlSortSelect value={sort} options={STUDENT_SORT_OPTIONS} ariaLabel="学员排序" />
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
        <table className="min-w-full table-fixed text-sm" style={{ width: `${tableWidth}px` }}>
          <colgroup>
            <col style={{ width: "48px" }} />
            {COLS.map((column, index) => (
              <col key={column.key} style={{ width: `${columnWidths[index]}px` }} />
            ))}
          </colgroup>
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
                    c.align ?? "text-left",
                    // 操作列固定右侧, 与其他表头同层级
                    c.key === "action" && "sticky right-0 z-10 border-l border-slate-100 bg-slate-50",
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
              const isActive = r.status === "active";
              const canReactivate = r.status === "frozen" || r.status === "graduated";
              return (
              <tr
                key={r.id}
                className={cn(
                  "group cursor-pointer hover:bg-slate-50",
                  isChecked && "bg-brand-50/50",
                )}
                onClick={() => setActive(r)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {isActive && (
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
                  )}
                </td>
                <td className="truncate whitespace-nowrap px-3 py-3 font-medium text-slate-800" title={r.name}>{r.name}</td>
                <td className="truncate whitespace-nowrap px-3 py-3 text-slate-600" title={displayPhone(r.phone)}>{displayPhone(r.phone)}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="truncate whitespace-nowrap px-3 py-3 text-slate-600" title={r.school ?? "未填写"}>{r.school ?? "未填写"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{r.grade ?? "未填写"}</td>
                <td className="truncate whitespace-nowrap px-3 py-3 text-slate-600" title={r.department_name ?? "未分配"}>
                  {r.department_name ?? "未分配"}
                </td>
                <td className="truncate whitespace-nowrap px-3 py-3 text-slate-600" title={r.counselor_name ?? "未分配"}>
                  {r.counselor_name ?? "未分配"}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-3 py-3 text-right tabular-nums",
                    Number(r.balance) < 0 ? "text-red-500" : "text-amber-600",
                  )}
                >
                  {formatCurrency(r.balance)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">
                  {formatCurrency(r.total_recharged)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-center text-slate-700">
                  {r.active_enrollment_count} 门
                </td>
                <td className="truncate whitespace-nowrap px-3 py-3 text-slate-600" title={displayColumnValue(r, "last_followup_at")}>
                  {displayColumnValue(r, "last_followup_at")}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                  {formatDate(r.created_at, true)}
                </td>
                <td
                  className={cn(
                    "sticky right-0 z-10 border-l border-slate-100 px-3 py-3",
                    // sticky 需不透明背景, 跟随行的选中/悬停态
                    isChecked ? "bg-brand-50" : "bg-white group-hover:bg-slate-50",
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-0.5">
                    <Gate keys="students.view">
                      <Link href={`/students/${r.id}`} title="查看详情" className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Gate>
                    {isActive && (
                      <>
                        <Gate keys="finance.recharge">
                          <Link href={`/finance?tab=recharge&student=${r.id}`} title="充值" className="grid h-8 w-8 place-items-center rounded-md text-amber-600 hover:bg-amber-50">
                            <Wallet className="h-4 w-4" />
                          </Link>
                        </Gate>
                        <Gate keys="students.graduate">
                          <button type="button" onClick={() => setFreezeTarget(r)} title="冻结" className="grid h-8 w-8 place-items-center rounded-md text-cyan-600 hover:bg-cyan-50">
                            <Snowflake className="h-4 w-4" />
                          </button>
                        </Gate>
                        <Gate keys="students.delete">
                          <button type="button" onClick={() => requestStudentDelete(r)} title="删除" className="grid h-8 w-8 place-items-center rounded-md text-red-500 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </Gate>
                      </>
                    )}
                    {canReactivate && (
                      <Gate keys="students.graduate">
                        <button type="button" onClick={() => setReactivationTarget(r)} title="恢复在读" className="grid h-8 w-8 place-items-center rounded-md text-emerald-600 hover:bg-emerald-50">
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      </Gate>
                    )}
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
          <select
            value={pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            className="h-7 rounded border border-slate-200 bg-white px-1 text-xs"
          >
            {[20, 50, 100].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        <Pagination current={page} totalPages={totalPages} onChange={gotoPage} />
      </div>

      <StudentDrawer student={active} onClose={() => setActive(null)} />
      {freezeTarget && (
        <StudentStatusModal
          student={freezeTarget}
          mode="freeze"
          onClose={() => setFreezeTarget(null)}
          onDone={() => {
            setFreezeTarget(null);
            router.refresh();
          }}
        />
      )}
      {reactivationTarget && (
        <StudentStatusModal
          student={reactivationTarget}
          mode="reactivate"
          onClose={() => setReactivationTarget(null)}
          onDone={() => {
            setReactivationTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StudentStatusModal({
  student,
  mode,
  onClose,
  onDone,
}: {
  student: StudentRow;
  mode: "freeze" | "reactivate";
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const freezing = mode === "freeze";

  const submit = async () => {
    if (freezing && !date) return setError("请选择冻结日期");
    if (!reason.trim()) return setError(freezing ? "请填写冻结原因" : "请填写恢复在读原因");
    setSubmitting(true);
    setError(null);
    try {
      if (freezing) {
        await requestApproval({
          type: "student_freeze",
          title: `冻结学员审批：${student.name}`,
          reason: reason.trim(),
          targetId: student.id,
          targetLabel: student.student_code ? `${student.name}（${student.student_code}）` : student.name,
          payload: {
            p_student_id: student.id,
            p_frozen_at: date,
            p_note: reason.trim(),
          },
        });
        alert("冻结审批已提交，管理员通过后才会正式冻结学员。");
      } else {
        await reactivateStudent({ p_student_id: student.id, p_reason: reason.trim() });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          {freezing ? <Snowflake className="h-5 w-5 text-cyan-600" /> : <RotateCcw className="h-5 w-5 text-emerald-600" />}
          <h3 className="font-semibold text-slate-900">{freezing ? "申请冻结学员" : "恢复在读"}</h3>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">
          <p className="text-slate-600">
            学员：<span className="font-medium text-slate-900">{student.name}</span>
          </p>
          {freezing && (
            <div className="rounded-md bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-700">
              提交后进入审批中心，审批通过才会冻结。冻结后仍保留在原班级和全部历史记录，但不能新增报名、点名或产生课消；班级结束后会提醒顾问与班主任办理转课或退课。
            </div>
          )}
          {freezing && (
            <label className="block text-xs font-medium text-slate-600">
              冻结日期
              <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none" />
            </label>
          )}
          <label className="block text-xs font-medium text-slate-600">
            {freezing ? "冻结原因" : "恢复原因"}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={freezing ? "必填，例如：暂停学习，等待后续安排" : "必填，例如：学员恢复正常学习"} className="mt-1 min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          </label>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={submitting} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700">取消</button>
          <button type="button" onClick={submit} disabled={submitting || !reason.trim()} className={cn("h-9 rounded-md px-4 text-sm font-medium text-white disabled:opacity-50", freezing ? "bg-cyan-600 hover:bg-cyan-700" : "bg-emerald-600 hover:bg-emerald-700")}>
            {submitting ? "处理中…" : freezing ? "提交冻结审批" : "确认恢复"}
          </button>
        </div>
      </div>
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
