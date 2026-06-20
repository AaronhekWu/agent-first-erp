"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { upsertDepartment } from "@/lib/api/create";
import type { DepartmentDetail, StaffRow } from "@/lib/api/campus";

interface Props {
  open: boolean;
  onClose: () => void;
  editing: DepartmentDetail | null;
  departments: DepartmentDetail[];
  staff: StaffRow[];
}

export function DepartmentEditModal({ open, onClose, editing, departments, staff }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setParentId(editing?.parent_id ?? "");
    setManagerId(editing?.manager_id ?? "");
    setSortOrder(editing?.sort_order != null ? String(editing.sort_order) : "");
    setError(null);
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) {
      setError("部门名称必填");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await upsertDepartment({
        p_id: editing?.id ?? null,
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_parent_id: parentId || null,
        p_manager_id: managerId || null,
        p_sort_order: sortOrder ? Number(sortOrder) : null,
      });
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // 避免把自己设为自己的上级
  const parentOptions = departments.filter((d) => d.id !== editing?.id);

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={editing ? `编辑部门 — ${editing.name}` : "新增部门"}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-red-500">{error}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="部门名称" required className="col-span-2">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 教学部 / 上海徐汇校区"
          />
        </Field>
        <Field label="上级部门">
          <select
            className={inputCls}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">无（顶层部门）</option>
            {parentOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="部门主管">
          <select
            className={inputCls}
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            <option value="">未指定</option>
            {staff
              .filter((s) => s.is_active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                  {s.primary_role ? ` (${s.primary_role})` : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field label="排序值">
          <input
            type="number"
            className={inputCls}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder="数字越小越靠前"
          />
        </Field>
        <div />
        <Field label="部门描述" className="col-span-2">
          <textarea
            className={textareaCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="职能 / 负责区域 …"
          />
        </Field>
      </div>
    </Modal>
  );
}
