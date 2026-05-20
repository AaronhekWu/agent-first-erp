"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Plus, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteStaff } from "@/lib/api/create";
import { maskPhone } from "@/lib/format";
import { StaffEditModal } from "./staff-edit-modal";
import type { DepartmentDetail, StaffRow } from "@/lib/api/campus";

const ROLE_LABEL: Record<string, string> = {
  admin: "系统管理员",
  counselor: "课程顾问",
  teacher: "教师",
  viewer: "只读用户",
};

const ROLE_CLS: Record<string, string> = {
  admin: "bg-violet-50 text-violet-700 ring-violet-200",
  counselor: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  teacher: "bg-blue-50 text-blue-700 ring-blue-200",
  viewer: "bg-slate-100 text-slate-600 ring-slate-200",
};

interface Props {
  staff: StaffRow[];
  departments: DepartmentDetail[];
}

export function StaffTable({ staff, departments }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<StaffRow | "new" | null>(null);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const filtered = staff.filter((s) => {
    if (!s.is_active) return false;
    if (roleFilter && s.primary_role !== roleFilter) return false;
    if (!filter.trim()) return true;
    const kw = filter.trim().toLowerCase();
    return (
      s.display_name.toLowerCase().includes(kw) ||
      (s.phone ?? "").includes(kw) ||
      (s.email ?? "").toLowerCase().includes(kw)
    );
  });

  const handleDelete = async (s: StaffRow) => {
    if (!confirm(`确认停用「${s.display_name}」？停用后将无法登录。`)) return;
    try {
      await deleteStaff(s.id);
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="按姓名 / 手机 / 邮箱搜索"
          className="h-9 w-64 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">全部角色</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="text-sm text-slate-500">
          共 <span className="font-medium text-slate-800">{filtered.length}</span> /{" "}
          {staff.filter((s) => s.is_active).length} 人
        </div>
        <button
          onClick={() => setEditing("new")}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          <UserPlus className="h-4 w-4" /> 新增教师 / 顾问
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">姓名</th>
              <th className="px-3 py-3 text-left">角色</th>
              <th className="px-3 py-3 text-left">部门</th>
              <th className="px-3 py-3 text-left">手机号</th>
              <th className="px-3 py-3 text-left">邮箱</th>
              <th className="px-3 py-3 text-center">权限数</th>
              <th className="px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                  暂无成员
                </td>
              </tr>
            )}
            {filtered.map((s) => {
              const role = s.primary_role ?? "";
              const cls = ROLE_CLS[role] ?? "bg-slate-100 text-slate-600 ring-slate-200";
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{s.display_name}</div>
                    {s.is_dept_manager && (
                      <span className="mt-0.5 inline-flex rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700">
                        部门主管
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {role ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          cls,
                        )}
                      >
                        {ROLE_LABEL[role] ?? role}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{s.department_name ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-600">{maskPhone(s.phone)}</td>
                  <td className="px-3 py-3 text-slate-600">{s.email ?? "—"}</td>
                  <td className="px-3 py-3 text-center text-slate-600">
                    {Array.isArray(s.permissions) ? s.permissions.length : 0}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(s)}
                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        <Edit2 className="h-3 w-3" /> 编辑 & 权限
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="inline-flex h-7 items-center gap-1 rounded border border-red-100 bg-red-50 px-2 text-xs text-red-600 hover:bg-red-100"
                      >
                        <Trash2 className="h-3 w-3" /> 停用
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <StaffEditModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        editing={editing === "new" ? null : editing}
        departments={departments}
      />
    </div>
  );
}
