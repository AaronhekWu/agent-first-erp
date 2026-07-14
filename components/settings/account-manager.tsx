"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Save, ShieldCheck, User } from "lucide-react";
import { Field, inputCls } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { upsertStaff } from "@/lib/api/create";
import { isValidPhone } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/auth/permissions-context";

interface CurrentAccount {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  primary_role: string | null;
}

export function AccountManager({ current }: { current: CurrentAccount | null }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(current?.display_name ?? "");
  const [phone, setPhone] = useState(current?.phone ?? "");
  const [email, setEmail] = useState(current?.email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const saveProfile = async () => {
    if (!current) {
      setProfileErr("尚未识别到当前账号，请先登录");
      return;
    }
    if (phone && !isValidPhone(phone)) {
      setProfileErr("手机号必须为 6-15 位数字");
      return;
    }
    setSavingProfile(true);
    setProfileErr(null);
    setProfileMsg(null);
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
      setProfileMsg("已保存");
      router.refresh();
    } catch (e) {
      setProfileErr((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 账号资料 */}
      <section className="rounded-2xl bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <User className="h-4 w-4 text-emerald-500" />
          账号资料
        </div>

        <div className="mb-5 flex items-center gap-4 rounded-lg bg-slate-50 p-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-pink-300 to-orange-300 text-xl font-medium text-white">
            {(displayName || "?").slice(0, 1)}
          </div>
          <div>
            <div className="text-base font-semibold text-slate-800">{displayName || "未命名"}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              角色：{current?.primary_role ? ROLE_LABELS[current.primary_role] ?? current.primary_role : "未分配"}
            </div>
            <div className="font-mono text-[11px] text-slate-400">{current?.id ?? "未登录"}</div>
          </div>
        </div>

        <div className="grid max-w-xl grid-cols-2 gap-4">
          <Field label="显示名" required>
            <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="手机号">
            <PhoneInput value={phone} onChange={setPhone} />
          </Field>
          <Field label="邮箱" className="col-span-2">
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={saveProfile}
            disabled={savingProfile || !current}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingProfile ? "保存中…" : "保存修改"}
          </button>
          {profileErr && <span className="text-xs text-red-500">{profileErr}</span>}
          {profileMsg && <span className="text-xs text-emerald-600">{profileMsg}</span>}
        </div>
      </section>

      {/* 修改密码 (短信验证码) */}
      <PasswordSection phone={current?.phone ?? null} />
    </div>
  );
}

function PasswordSection({ phone }: { phone: string | null }) {
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const startCooldown = () => {
    setCooldown(60);
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    setErr(null);
    setMsg(null);
    setSending(true);
    try {
      // 向当前登录账号注册的手机/邮箱发送验证码 (复用登录短信通道)
      const { error } = await getSupabaseBrowser().auth.reauthenticate();
      if (error) throw new Error(error.message);
      setSent(true);
      setMsg("验证码已发送，请查收短信");
      startCooldown();
    } catch (e) {
      setErr((e as Error).message || "发送验证码失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    setErr(null);
    setMsg(null);
    if (!code.trim()) {
      setErr("请输入短信验证码");
      return;
    }
    if (newPassword.length < 8) {
      setErr("新密码至少 8 位");
      return;
    }
    if (newPassword !== confirm) {
      setErr("两次输入的新密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      // 携带验证码 nonce 更新密码 (Supabase 安全改密流程)
      const { error } = await getSupabaseBrowser().auth.updateUser({
        password: newPassword,
        nonce: code.trim(),
      });
      if (error) throw new Error(error.message);
      setMsg("密码修改成功");
      setCode("");
      setNewPassword("");
      setConfirm("");
      setSent(false);
    } catch (e) {
      setErr((e as Error).message || "改密失败，请确认验证码是否正确");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-5 shadow-card">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
        <KeyRound className="h-4 w-4 text-amber-500" />
        修改密码
      </div>
      <p className="mb-4 flex items-center gap-1 text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        通过注册手机 {phone ? `（${phone}）` : ""} 接收短信验证码校验身份后设置新密码
      </p>

      <div className="grid max-w-xl gap-4">
        <Field label="短信验证码">
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请输入 6 位验证码"
              inputMode="numeric"
            />
            <button
              onClick={sendCode}
              disabled={sending || cooldown > 0}
              className="h-10 shrink-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-brand-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {cooldown > 0 ? `${cooldown}s 后重试` : sending ? "发送中…" : sent ? "重新发送" : "获取验证码"}
            </button>
          </div>
        </Field>
        <Field label="新密码">
          <input type="password" autoComplete="new-password" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 8 位" />
        </Field>
        <Field label="确认新密码">
          <input type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={submitting}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" />
          {submitting ? "提交中…" : "确认修改密码"}
        </button>
        {err && <span className="text-xs text-red-500">{err}</span>}
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
      </div>
    </section>
  );
}
