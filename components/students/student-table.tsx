"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  MoreHorizontal,
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
  Wallet,
  GraduationCap,
  RotateCcw,
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
import { Gate } from "@/lib/auth/permissions-context";
import { requestApproval } from "@/lib/api/approvals-client";
import { batchDeleteStudents } from "@/lib/api/students-edge-client";
import { graduateStudent, reactivateStudent } from "@/lib/api/create";
import type { StudentRow } from "@/lib/api/students";

interface Props {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
}

const COLS: { key: string; label: string; w?: string; align?: string }[] = [
  { key: "name", label: "姓名", w: "w-24" },
  { key: "phone", label: "手机号", w: "w-36" },
  { key: "status", label: "状态", w: "w-24" },
  { key: "school", label: "学校", w: "w-36" },
  { key: "grade", label: "年级", w: "w-16" },
  { key: "department_name", label: "部门", w: "w-32" },
  { key: "counselor_name", label: "顾问", w: "w-24" },
  { key: "balance", label: "余额", w: "w-32", align: "text-right" },
  { key: "total_recharged", label: "累计充值", w: "w-36", align: "text-right" },
  { key: "active_enrollment_count", label: "在读课程", w: "w-20", align: "text-center" },
  { key: "last_followup_at", label: "最后跟进", w: "w-40" },
  { key: "created_at", label: "创建时间", w: "w-32" },
  { key: "action", label: "操作", w: "w-16", align: "text-left" },
];

export function StudentTable({ rows, total, page, pageSize }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [active, setActive] = useState<StudentRow | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActionMenuId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [graduationTarget, setGraduationTarget] = useState<StudentRow | null>(null);
  const [reactivationTarget, setReactivationTarget] = useState<StudentRow | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const batchAction = (label: string) =>
    alert(
      `${label} — 共 ${selected.size} 个学员\n` +
        selectedRows.map((r) => `· ${r.name} (${r.student_code ?? r.id.slice(0, 8)})`).join("\n") +
        `\n\n该批量操作已收敛到 Edge Function 路径，待接入后将真实执行。`,
    );

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
            <BatchBtn icon={UserCog} label="批量转移顾问" onClick={() => batchAction("批量转移顾问")} />
            <BatchBtn icon={Mail} label="批量发短信" onClick={() => batchAction("批量发短信")} />
            <BatchBtn icon={Download} label="导出选中" onClick={() => batchAction("导出选中学员")} />
            <Gate keys="students.delete">
              <BatchBtn icon={Trash2} label={batchDeleting ? "删除中…" : "批量删除"} danger onClick={batchDelete} />
            </Gate>
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
        <table className="w-full min-w-[1550px] text-sm">
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
              const isActive = r.status === "active";
              const isGraduated = r.status === "graduated";
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
                  className="relative px-3 py-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setActionMenuId(actionMenuId === r.id ? null : r.id)}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600",
                      actionMenuId === r.id && "bg-slate-100 text-slate-700",
                    )}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {actionMenuId === r.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-11 z-40 min-w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                    >
                      <Gate keys="students.view">
                        <Link
                          href={`/students/${r.id}`}
                          onClick={() => setActionMenuId(null)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-4 w-4 text-slate-400" />
                          查看详情
                        </Link>
                      </Gate>
                      {isActive && (
                        <>
                          <Gate keys="finance.recharge">
                            <Link
                              href={`/finance?tab=recharge&student=${r.id}`}
                              onClick={() => setActionMenuId(null)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                            >
                              <Wallet className="h-4 w-4 text-amber-500" />
                              充值
                            </Link>
                          </Gate>
                          <Gate keys="students.graduate">
                            <button
                              onClick={() => {
                                setActionMenuId(null);
                                setGraduationTarget(r);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"
                            >
                              <GraduationCap className="h-4 w-4 text-blue-500" />
                              毕业
                            </button>
                          </Gate>
                          <Gate keys="students.delete">
                            <button
                              onClick={() => {
                                setActionMenuId(null);
                                requestStudentDelete(r);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                              删除
                            </button>
                          </Gate>
                        </>
                      )}
                      {isGraduated && (
                        <Gate keys="students.graduate">
                          <button
                            onClick={() => {
                              setActionMenuId(null);
                              setReactivationTarget(r);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                          >
                            <RotateCcw className="h-4 w-4 text-emerald-500" />
                            恢复在读
                          </button>
                        </Gate>
                      )}
                    </div>
                  )}
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
      {graduationTarget && (
        <StudentStatusModal
          student={graduationTarget}
          mode="graduate"
          onClose={() => setGraduationTarget(null)}
          onDone={() => {
            setGraduationTarget(null);
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
  mode: "graduate" | "reactivate";
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graduating = mode === "graduate";

  const submit = async () => {
    if (graduating && !date) return setError("请选择毕业日期");
    if (!graduating && !reason.trim()) return setError("请填写恢复在读原因");
    setSubmitting(true);
    setError(null);
    try {
      if (graduating) {
        await graduateStudent({ p_student_id: student.id, p_graduated_at: date, p_note: reason.trim() || null });
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
          {graduating ? <GraduationCap className="h-5 w-5 text-blue-600" /> : <RotateCcw className="h-5 w-5 text-emerald-600" />}
          <h3 className="font-semibold text-slate-900">{graduating ? "办理毕业" : "恢复在读"}</h3>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">
          <p className="text-slate-600">
            学员：<span className="font-medium text-slate-900">{student.name}</span>
          </p>
          {graduating && (
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
              系统将确认该学员没有在读课程、账户余额及冻结金额均为零，并且没有待处理审批。毕业后保留全部历史记录。
            </div>
          )}
          {graduating && (
            <label className="block text-xs font-medium text-slate-600">
              毕业日期
              <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none" />
            </label>
          )}
          <label className="block text-xs font-medium text-slate-600">
            {graduating ? "毕业备注（可选）" : "恢复原因"}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={graduating ? "例如：完成全部课程，正常毕业" : "必填，例如：学员重新报名学习"} className="mt-1 min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          </label>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={submitting} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700">取消</button>
          <button type="button" onClick={submit} disabled={submitting} className={cn("h-9 rounded-md px-4 text-sm font-medium text-white disabled:opacity-50", graduating ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700")}>
            {submitting ? "处理中…" : graduating ? "确认毕业" : "确认恢复"}
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
