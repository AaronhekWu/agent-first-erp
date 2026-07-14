"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgePercent, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { usePermissions } from "@/lib/auth/permissions-context";
import {
  CAMPAIGN_DISCOUNT_LABELS,
  CAMPAIGN_TYPE_LABELS,
  type Campaign,
  type CampaignDiscountType,
  type CampaignInput,
  type CampaignType,
  createCampaign,
  listCampaigns,
  setCampaignStatus,
  updateCampaign,
} from "@/lib/api/campaigns-client";
import { formatCurrency } from "@/lib/format";

interface CourseOption {
  id: string;
  name: string;
}

const emptyForm: CampaignInput = {
  name: "",
  type: "enrollment_discount",
  description: "",
  discount_type: "fixed",
  discount_value: null,
  gift_lessons: 0,
  applicable_course_ids: [],
  start_date: null,
  end_date: null,
  max_usage: null,
};

export function CampaignManager({ courseOptions }: { courseOptions: CourseOption[] }) {
  const { has } = usePermissions();
  const canManage = has("courses.pricing");
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const courseName = useMemo(
    () => new Map(courseOptions.map((c) => [c.id, c.name])),
    [courseOptions],
  );

  const refresh = () => {
    setLoading(true);
    listCampaigns()
      .then(setItems)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const toggleStatus = async (c: Campaign) => {
    try {
      await setCampaignStatus(c.id, c.status === "active" ? "inactive" : "active");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const describeDiscount = (c: Campaign) => {
    if (c.discount_type === "percentage") return `${c.discount_value ?? 0}% 折扣`;
    if (c.discount_type === "fixed") return `减 ${formatCurrency(Number(c.discount_value ?? 0))}`;
    if (c.discount_type === "gift_lessons" || c.gift_lessons > 0) return `赠 ${c.gift_lessons} 课时`;
    return "无直接减免";
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          共 {items.length} 个优惠组合，其中 {items.filter((i) => i.status === "active").length} 个启用中
        </div>
        {canManage && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            新建优惠组合
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-3 font-medium">名称 / 类型</th>
              <th className="px-4 py-3 font-medium">优惠内容</th>
              <th className="px-4 py-3 font-medium">适用课程</th>
              <th className="px-4 py-3 font-medium">有效期</th>
              <th className="px-4 py-3 font-medium">用量</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">暂无优惠组合，点击右上角新建</td></tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className={c.status === "inactive" ? "bg-slate-50/60 text-slate-400" : ""}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 font-medium text-slate-800">
                    <BadgePercent className="h-3.5 w-3.5 text-brand-500" />
                    {c.name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{CAMPAIGN_TYPE_LABELS[c.type]}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{describeDiscount(c)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {!c.applicable_course_ids || c.applicable_course_ids.length === 0
                    ? "全部课程"
                    : c.applicable_course_ids.map((id) => courseName.get(id) ?? "未知课程").join("、")}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {c.start_date || c.end_date
                    ? `${c.start_date ?? "不限"} ~ ${c.end_date ?? "不限"}`
                    : "长期有效"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {c.used_count}
                  {c.max_usage ? ` / ${c.max_usage}` : ""}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      c.status === "active"
                        ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600"
                        : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                    }
                  >
                    {c.status === "active" ? "启用中" : "已停用"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(c)}
                        title="编辑"
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleStatus(c)}
                        title={c.status === "active" ? "停用" : "启用"}
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                      >
                        {c.status === "active" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <CampaignForm
          courseOptions={courseOptions}
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CampaignForm({
  courseOptions,
  initial,
  onClose,
  onSaved,
}: {
  courseOptions: CourseOption[];
  initial: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CampaignInput>(
    initial
      ? {
          name: initial.name,
          type: initial.type,
          description: initial.description ?? "",
          discount_type: initial.discount_type ?? "fixed",
          discount_value: initial.discount_value,
          gift_lessons: initial.gift_lessons,
          applicable_course_ids: initial.applicable_course_ids ?? [],
          start_date: initial.start_date,
          end_date: initial.end_date,
          max_usage: initial.max_usage,
        }
      : emptyForm,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CampaignInput>(k: K, v: CampaignInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleCourse = (id: string) => {
    const ids = form.applicable_course_ids ?? [];
    set("applicable_course_ids", ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError("请填写优惠组合名称");
      return;
    }
    if (form.discount_type === "gift_lessons") {
      if (!(Number(form.gift_lessons) > 0)) {
        setError("赠送课时必须大于 0");
        return;
      }
    } else if (!(Number(form.discount_value) > 0)) {
      setError("请填写有效的优惠数值");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateCampaign(initial.id, form);
      else await createCampaign(form);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "编辑优惠组合" : "新建优惠组合"}
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          {error ? <span className="text-xs text-red-600">{error}</span> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 rounded-md border border-slate-200 px-4 text-sm text-slate-600 hover:bg-white">取消</button>
            <button onClick={submit} disabled={saving} className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-slate-300">
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="组合名称">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="活动类型">
            <select value={form.type} onChange={(e) => set("type", e.target.value as CampaignType)} className={inputCls}>
              {(Object.keys(CAMPAIGN_TYPE_LABELS) as CampaignType[]).map((t) => (
                <option key={t} value={t}>{CAMPAIGN_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="优惠方式">
            <select
              value={form.discount_type ?? "fixed"}
              onChange={(e) => set("discount_type", e.target.value as CampaignDiscountType)}
              className={inputCls}
            >
              {(Object.keys(CAMPAIGN_DISCOUNT_LABELS) as CampaignDiscountType[]).map((t) => (
                <option key={t} value={t}>{CAMPAIGN_DISCOUNT_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          {form.discount_type === "gift_lessons" ? (
            <Field label="赠送课时">
              <input type="number" min="0" value={form.gift_lessons ?? ""} onChange={(e) => set("gift_lessons", Number(e.target.value))} className={inputCls} />
            </Field>
          ) : (
            <Field label={form.discount_type === "percentage" ? "折扣比例 (%)" : "减免金额 (元)"}>
              <input
                type="number"
                min="0"
                max={form.discount_type === "percentage" ? 100 : undefined}
                value={form.discount_value ?? ""}
                onChange={(e) => set("discount_value", e.target.value === "" ? null : Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="生效日期">
            <input type="date" value={form.start_date ?? ""} onChange={(e) => set("start_date", e.target.value || null)} className={inputCls} />
          </Field>
          <Field label="结束日期">
            <input type="date" value={form.end_date ?? ""} onChange={(e) => set("end_date", e.target.value || null)} className={inputCls} />
          </Field>
          <Field label="使用次数上限（留空不限）">
            <input type="number" min="0" value={form.max_usage ?? ""} onChange={(e) => set("max_usage", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} />
          </Field>
        </div>

        <Field label="适用课程（不选则适用全部课程）">
          <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 p-2">
            {courseOptions.length === 0 && <div className="px-1 py-2 text-xs text-slate-400">暂无可选课程</div>}
            <div className="grid gap-1 sm:grid-cols-2">
              {courseOptions.map((c) => {
                const checked = (form.applicable_course_ids ?? []).includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" checked={checked} onChange={() => toggleCourse(c.id)} className="h-3.5 w-3.5" />
                    <span className="truncate">{c.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </Field>

        <Field label="说明（可选）">
          <textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} className="min-h-16 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        </Field>
      </div>
    </Modal>
  );
}

const inputCls = "mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}
