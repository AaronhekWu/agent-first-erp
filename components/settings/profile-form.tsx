"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, User } from "lucide-react";
import { Field, inputCls } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { upsertStaff } from "@/lib/api/create";
import { isValidPhone } from "@/lib/format";

// 当前版本未接入登录, 这里用一个占位"当前用户"
// 接入登录后, 将 currentId 替换为 supabase.auth.getUser().id
interface Props {
  current: {
    id: string;
    display_name: string;
    phone: string | null;
    email: string | null;
    primary_role: string | null;
  } | null;
}

export function ProfileForm({ current }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(current?.display_name ?? "张老师");
  const [phone, setPhone] = useState(current?.phone ?? "");
  const [email, setEmail] = useState(current?.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidPhone(phone)) {
      setError("手机号必须为 6-15 位数字");
      return;
    }
    if (!current) {
      setError("尚未识别到当前账号，请先登录");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await upsertStaff({
        p_id: current.id,
        p_display_name: displayName.trim(),
        p_phone: phone || null,
        p_email: email.trim() || null,
        p_primary_role: current.primary_role ?? null,
        p_department_id: null,
        p_permissions: undefined,
      });
      setMessage("已保存");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
        <User className="h-4 w-4 text-emerald-500" />
        个人信息
      </div>

      <div className="mb-5 flex items-center gap-4 rounded-lg bg-slate-50 p-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-pink-300 to-orange-300 text-xl font-medium text-white">
          {displayName.slice(0, 1)}
        </div>
        <div>
          <div className="text-base font-semibold text-slate-800">{displayName}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            角色：{current?.primary_role ?? "未设置（接入登录后自动同步）"}
          </div>
          <div className="font-mono text-[11px] text-slate-400">{current?.id ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="显示名" required>
          <input
            className={inputCls}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label="手机号">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="邮箱" className="col-span-2">
          <input
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={submitting || !current}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {submitting ? "保存中…" : "保存修改"}
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
        {message && <span className="text-xs text-emerald-600">{message}</span>}
      </div>
    </div>
  );
}
