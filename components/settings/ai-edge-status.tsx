"use client";

import { useEffect, useState } from "react";

interface AiStatus {
  ok: boolean;
  configured: boolean;
  model?: string;
  error?: string;
}

export function AiEdgeStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/status", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as AiStatus }))
      .then(({ response, payload }) => {
        if (active) setStatus(response.ok ? payload : { ...payload, ok: false });
      })
      .catch(() => {
        if (active) setStatus({ ok: false, configured: false, error: "Edge Function 暂时不可用" });
      });
    return () => { active = false; };
  }, []);

  const available = status?.ok && status.configured;
  return <div className="mt-4 grid gap-3 md:grid-cols-3">
    <ConfigField label="模型" value={status?.model ?? "deepseek-v4-flash"} />
    <ConfigField label="调用方式" value="Supabase Edge Function" />
    <ConfigField label="API_KEY 状态" value={!status ? "检测中…" : available ? "已配置并可调用" : status.error ?? "尚未配置"} warning={!!status && !available} />
  </div>;
}

function ConfigField({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-400">{label}</div><div className={`mt-1 truncate text-xs font-medium ${warning ? "text-amber-600" : "text-slate-700"}`} title={value}>{value}</div></div>;
}
