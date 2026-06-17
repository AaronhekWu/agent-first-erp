"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Edit2, Trash2, Crown, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { requestApproval } from "@/lib/api/approvals-client";
import { DepartmentEditModal } from "./department-edit-modal";
import type { DepartmentDetail, StaffRow } from "@/lib/api/campus";

interface TreeNode extends DepartmentDetail {
  children: TreeNode[];
  members: StaffRow[];
  manager?: StaffRow | null;
}

interface Props {
  departments: DepartmentDetail[];
  staff: StaffRow[];
}

function buildTree(departments: DepartmentDetail[], staff: StaffRow[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const membersByDept = new Map<string, StaffRow[]>();
  for (const s of staff) {
    if (!s.is_active) continue;
    if (!s.department_id) continue;
    (membersByDept.get(s.department_id) ?? membersByDept.set(s.department_id, []).get(s.department_id))!.push(s);
  }
  for (const d of departments) {
    byId.set(d.id, {
      ...d,
      children: [],
      members: membersByDept.get(d.id) ?? [],
      manager: d.manager_id ? staff.find((s) => s.id === d.manager_id) ?? null : null,
    });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots.sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
}

export function DepartmentTree({ departments, staff }: Props) {
  const router = useRouter();
  const tree = useMemo(() => buildTree(departments, staff), [departments, staff]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(departments.map((d) => d.id)),
  );
  const [editing, setEditing] = useState<DepartmentDetail | "new" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(departments[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const selected = departments.find((d) => d.id === selectedId) ?? departments[0] ?? null;
  const selectedMembers = selected ? staff.filter((s) => s.is_active && s.department_id === selected.id) : [];
  const selectedChildren = selected ? departments.filter((d) => d.parent_id === selected.id) : [];

  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDelete = async (d: DepartmentDetail) => {
    const reason = prompt(`请填写删除部门「${d.name}」的审批原因`);
    if (reason === null) return;
    if (!reason.trim()) return alert("审批原因必填");
    setBusy(true);
    try {
      await requestApproval({
        type: "department_delete",
        title: `删除部门审批：${d.name}`,
        reason: reason.trim(),
        targetId: d.id,
        targetLabel: d.name,
        payload: { p_id: d.id },
      });
      alert("已提交删除部门审批");
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          共 <span className="font-medium text-slate-800">{departments.length}</span> 个部门 ·
          点击三角图标展开 / 折叠；通过「编辑」可设置主管与上级部门
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> 新增部门
        </button>
      </div>

      {tree.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-5 py-8 text-center">
          <div className="text-sm font-medium text-amber-800">暂无部门架构</div>
          <div className="mt-1 text-sm text-amber-700">
            请先新增“总部”，再添加教学部、销售部、行政部等子部门。生产库可通过 `acct_departments` 种子数据初始化。
          </div>
          <button
            onClick={() => setEditing("new")}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> 新增第一个部门
          </button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <OrgChart nodes={tree} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            <div className="rounded-lg border border-slate-200 bg-white">
        {tree.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-slate-400">暂无部门</div>
        )}
        {tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onEdit={(d) => setEditing(d)}
            onDelete={handleDelete}
            busy={busy}
          />
        ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-800">部门详情</div>
            {selected ? (
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="text-xs text-slate-400">部门名称</div>
                  <div className="font-medium text-slate-900">{selected.name}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">说明</div>
                  <div className="text-slate-600">{selected.description ?? "—"}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="成员" value={selectedMembers.length} />
                  <Stat label="子部门" value={selectedChildren.length} />
                </div>
                <div>
                  <div className="mb-2 text-xs text-slate-400">成员</div>
                  <div className="space-y-1">
                    {selectedMembers.length === 0 && <div className="text-slate-400">暂无成员</div>}
                    {selectedMembers.slice(0, 8).map((m) => (
                      <div key={m.id} className="rounded bg-slate-50 px-2 py-1 text-slate-600">
                        {m.display_name} {m.primary_role ? `· ${m.primary_role}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-sm text-slate-400">选择一个部门查看详情</div>
            )}
          </div>
      </div>
      )}

      <DepartmentEditModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        editing={editing === "new" ? null : editing}
        departments={departments}
        staff={staff}
      />
    </div>
  );
}

function TreeRow({
  node, depth, expanded, toggle, selectedId, onSelect, onEdit, onDelete, busy,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (d: DepartmentDetail) => void;
  onDelete: (d: DepartmentDetail) => void;
  busy: boolean;
}) {
  const hasKids = node.children.length > 0 || node.members.length > 0;
  const isOpen = expanded.has(node.id);
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div
        className={cn("flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50", selectedId === node.id && "bg-brand-50")}
        style={{ paddingLeft: 12 + depth * 24 }}
      >
        {hasKids ? (
          <button
            onClick={() => toggle(node.id)}
            className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block h-5 w-5" />
        )}
        <button onClick={() => onSelect(node.id)} className="text-sm font-medium text-slate-800 hover:text-brand-600">
          {node.name}
        </button>
        {node.manager && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
            <Crown className="h-3 w-3" /> 主管: {node.manager.display_name}
          </span>
        )}
        <span className="text-xs text-slate-400">
          · 下属 {node.members.length} 人 · 子部门 {node.children.length} 个
        </span>
        {node.description && (
          <span className="text-xs text-slate-400">— {node.description}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => onEdit(node)}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <Edit2 className="h-3 w-3" /> 编辑
          </button>
          <button
            onClick={() => onDelete(node)}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1 rounded border border-red-100 bg-red-50 px-2 text-xs text-red-600 hover:bg-red-100"
          >
            <Trash2 className="h-3 w-3" /> 删除
          </button>
        </div>
      </div>

      {isOpen && (
        <>
          {node.members.length > 0 && (
            <ul className="bg-slate-50/40">
              {node.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 py-1.5 text-sm text-slate-600"
                  style={{ paddingLeft: 12 + (depth + 1) * 24 + 24 }}
                >
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-700">{m.display_name}</span>
                  {m.is_dept_manager && (
                    <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700">主管</span>
                  )}
                  {m.primary_role && (
                    <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">
                      {m.primary_role}
                    </span>
                  )}
                  <span className="ml-auto pr-3 text-xs text-slate-400">{m.phone ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
          {node.children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              busy={busy}
            />
          ))}
        </>
      )}
    </div>
  );
}

function OrgChart({ nodes, selectedId, onSelect }: { nodes: TreeNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex min-w-max items-start gap-4">
        {nodes.map((node) => (
          <OrgNode key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function OrgNode({ node, selectedId, onSelect }: { node: TreeNode; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => onSelect(node.id)}
        className={cn(
          "min-w-36 rounded-lg border px-3 py-2 text-center shadow-sm",
          selectedId === node.id
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        )}
      >
        <div className="text-sm font-medium">{node.name}</div>
        <div className="mt-1 text-xs text-slate-400">{node.members.length} 人</div>
      </button>
      {node.children.length > 0 && (
        <div className="flex items-start gap-3 border-t border-slate-200 pt-3">
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
