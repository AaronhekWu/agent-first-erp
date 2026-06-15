"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type Mode = "login" | "register";

/** 简单判断输入是手机号还是邮箱: 纯数字(可带 +) 视为手机号 */
function isPhone(v: string) {
  return /^\+?\d{6,15}$/.test(v.replace(/\s/g, ""));
}
function normalizePhone(v: string) {
  return v.replace(/\s/g, "");
}

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>("login");
  const [identifier, setIdentifier] = useState(""); // 登录: 邮箱或手机
  const [phone, setPhone] = useState(""); // 注册: 手机号
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function goHome() {
    const next = params.get("next") || "/";
    router.replace(next);
    router.refresh();
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const sb = getSupabaseBrowser();
    const creds = isPhone(identifier)
      ? { phone: normalizePhone(identifier), password }
      : { email: identifier.trim(), password };
    const { error } = await sb.auth.signInWithPassword(creds);
    setLoading(false);
    if (error) {
      setError("账号或密码错误，请重试");
      return;
    }
    goHome();
  }

  // 注册第一步: 手机号 + 密码 → 发送短信验证码
  async function onSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const sb = getSupabaseBrowser();
    const { data, error } = await sb.auth.signUp({
      phone: normalizePhone(phone),
      password,
      options: { channel: "sms" },
    });
    setLoading(false);
    if (error) {
      setError(error.message || "发送验证码失败，请稍后重试");
      return;
    }
    // 若已直接返回会话 (未开启短信确认) 则直接进入
    if (data.session) {
      goHome();
      return;
    }
    setOtpSent(true);
    setInfo("验证码已发送至手机，请输入以完成注册");
  }

  // 注册第二步: 校验短信验证码
  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const sb = getSupabaseBrowser();
    const { error } = await sb.auth.verifyOtp({
      phone: normalizePhone(phone),
      token: otp,
      type: "sms",
    });
    setLoading(false);
    if (error) {
      setError("验证码错误或已过期");
      return;
    }
    goHome();
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
    setOtpSent(false);
    setOtp("");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-pink-300 to-orange-300 text-lg font-semibold text-white">
            墨
          </div>
          <h1 className="text-lg font-semibold text-slate-800">墨曦系统</h1>
          <p className="mt-1 text-sm text-slate-500">教育机构 ERP 管理系统</p>
        </div>

        {/* 模式切换 */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={
              mode === "login"
                ? "rounded-md bg-white py-1.5 font-medium text-slate-800 shadow-sm"
                : "rounded-md py-1.5 text-slate-500"
            }
          >
            密码登录
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={
              mode === "register"
                ? "rounded-md bg-white py-1.5 font-medium text-slate-800 shadow-sm"
                : "rounded-md py-1.5 text-slate-500"
            }
          >
            手机注册
          </button>
        </div>

        {mode === "login" && (
          <form onSubmit={onLogin} className="space-y-4">
            <Field
              label="邮箱 / 手机号"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={setIdentifier}
              placeholder="you@example.com 或 13800000000"
            />
            <Field
              label="密码"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />
            <Alerts error={error} info={info} />
            <Submit loading={loading} label="登录" />
          </form>
        )}

        {mode === "register" && !otpSent && (
          <form onSubmit={onSendOtp} className="space-y-4">
            <Field
              label="手机号"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={setPhone}
              placeholder="13800000000"
            />
            <Field
              label="设置密码"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              placeholder="至少 6 位"
            />
            <Alerts error={error} info={info} />
            <Submit loading={loading} label="发送验证码" />
            <p className="text-center text-xs text-slate-400">
              注册后需管理员分配角色方可使用
            </p>
          </form>
        )}

        {mode === "register" && otpSent && (
          <form onSubmit={onVerifyOtp} className="space-y-4">
            <Field
              label="短信验证码"
              type="text"
              autoComplete="one-time-code"
              value={otp}
              onChange={setOtp}
              placeholder="6 位验证码"
            />
            <Alerts error={error} info={info} />
            <Submit loading={loading} label="完成注册" />
            <button
              type="button"
              onClick={() => setOtpSent(false)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
            >
              返回修改手机号
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        type={type}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}

function Alerts({ error, info }: { error: string | null; info: string | null }) {
  if (!error && !info) return null;
  return error ? (
    <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
      {error}
    </div>
  ) : (
    <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
      {info}
    </div>
  );
}

function Submit({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="h-10 w-full rounded-md bg-brand-600 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {loading ? "处理中…" : label}
    </button>
  );
}
