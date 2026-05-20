"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Field, inputCls } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { upsertStaff } from "@/lib/api/create";
import { isValidPhone } from "@/lib/format";
import { PERMISSION_CATALOG, ROLE_DEFAULTS } from "@/lib/permissions";
import type { DepartmentDetail, StaffRow } from "@/lib/api/campus";

interface Props {
  open: boolean;
  onClose: () => void;
  editing: StaffRow | null;
  departments: DepartmentDetail[];
}

const ROLE_OPTIONS = [
  { value: "", label: "未指定" },
  { value: "admin", label: "系统管理员" },
  { value: "counselor", label: "课程顾问" },
  { value: "teacher", label: "教师" },
  { value: "viewer", label: "只读用户" },
];

export function StaffEditModal({ open, onClose, editing, departments }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(editing?.display_name ?? "");
    setPhone(editing?.phone ?? "");
    setEmail(editing?.email ?? "");
    setRole(editing?.primary_role ?? "");
    setDepartmentId(editing?.department_id ?? "");
    setPerms(editing?.permissions ?? []);
    setError(null);
  }, [open, editing]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof PERMISSION_CATALOG> = {};
    for (const it of PERMISSION_CATALOG) (g[it.group] ??= []).push(it);
    return g;
  }, []);

  const applyRoleDefaults = (r: string) => {
    setRole(r);
    if (r && ROLE_DEFAULTS[r]) setPerms(ROLE_DEFAULTS[r]);
  };

  const toggle = (k: string) =>
    setPerms((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const submit = async () => {
    if (!displayName.trim()) {
      setError("INVALID_INPUT: 姓名必填");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("INVALID_INPUT: 手机号必须为 6-15 位数字");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await upsertStaff({
        p_id: editing?.id ?? null,
        p_display_name: displayName.trim(),
        p_phone: phone || null,
        p_email: email.trim() || null,
        p_primary_role: role || null,
        p_department_id: departmentId || null,
        p_permissions: perms,
      });
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      size="lg"
      title={editing ? `编辑成员 — ${editing.display_name}` : "新增教师 / 顾问"}
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
        <Field label="姓名" required>
          <input
            className={inputCls}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="如 李老师"
          />
        </Field>
        <Field label="手机号">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="邮箱">
          <input
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="li@moxi.edu"
          />
        </Field>
        <Field label="角色">
          <select
            className={inputCls}
            value={role}
            onChange={(e) => applyRoleDefaults(e.target.value)}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="所属部门" className="col-span-2">
          <select
            className={inputCls}
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">未指定</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-800">权限</h4>
          <span className="text-xs text-slate-400">
            勾选 = 拥有该权限。已选择角色会自动套用预设，可再单独勾选覆盖。
          </span>
        </div>
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="mb-1.5 text-xs font-medium text-slate-600">{group}</div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((it) => {
                  const on = perms.includes(it.key);
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => toggle(it.key)}
                      className={`h-7 rounded-md border px-2.5 text-xs transition ${
                        on
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
