"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Sparkles, AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, followupTypeLabel, maskPhone } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { NewFollowupModal } from "./new-followup-modal";
import type { FollowupItem, FollowupOverview } from "@/lib/api/followups";

interface Props {
  overview: FollowupOverview;
}

const RISK_META: Record<string, { label: string; cls: string }> = {
  critical: { label: "高风险", cls: "bg-red-50 text-red-700 ring-red-200" },
  warning: { label: "需关注", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  ok: { label: "正常", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

export function FollowupsShell({ overview }: Props) {
  const router = useRouter();
  const [students, setStudents] = useState(overview.students);
  const [selectedId, setSelectedId] = useState<string | null>(overview.students[0]?.student_id ?? null);
  const [timeline, setTimeline] = useState<FollowupItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  useEffect(() => {
    setStudents(overview.students);
  }, [overview]);

  const loadTimeline = useCallback(async () => {
    if (!selectedId) return setTimeline([]);
    setLoadingTimeline(true);
    try {
      const sb = getSupabaseBrowser();
      const { data, error } = await sb
        .from("v_followup_timeline")
        .select("*")
        .eq("student_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setTimeline((data ?? []) as FollowupItem[]);
    } catch (e) {
      console.error(e);
      setTimeline([]);
    } finally {
      setLoadingTimeline(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  const askAi = async () => {
    if (!selectedId) return;
    setAiBusy(true);
    setAiMsg(null);
    try {
      const r = await fetch(`/api/ai/recommend-followup?student_id=${selectedId}`, { method: "POST" });
      const j = await r.json();
      if (r.status === 501) {
        setAiMsg(`AI 推荐尚未接通: ${j.message ?? "501"}`);
      } else {
        setAiMsg(JSON.stringify(j));
      }
    } catch (e) {
      setAiMsg((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  const selectedStudent = students.find((s) => s.student_id === selectedId);

  return (
    <div className="grid h-[calc(100vh-12rem)] grid-cols-12 gap-4">
      {/* 左：学员列表 */}
      <aside className="col-span-12 flex min-h-0 flex-col rounded-2xl bg-white shadow-card md:col-span-4 xl:col-span-3">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">跟进学员</h3>
          <span className="text-xs text-slate-500">共 {students.length}</span>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {students.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-slate-400">暂无跟进数据</li>
          )}
          {students.map((s) => (
            <li key={s.student_id}>
              <button
                onClick={() => setSelectedId(s.student_id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50",
                  selectedId === s.student_id && "bg-brand-50/40",
                )}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-200 to-indigo-300 text-sm font-medium text-white">
                  {s.student_name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{s.student_name}</span>
                    {s.risk_level && s.risk_level !== "ok" && RISK_META[s.risk_level] && (
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center whitespace-nowrap gap-0.5 rounded-md px-1 py-0.5 text-[10px] ring-1 ring-inset",
                          RISK_META[s.risk_level].cls,
                        )}
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {RISK_META[s.risk_level].label}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-mono">{s.student_code ?? "—"}</span>
                    <span>·</span>
                    <span className="tabular-nums">{formatCurrency(s.balance)}</span>
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-[11px]",
                      (s.days_since_last ?? 0) > 14 ? "text-red-500" : "text-slate-400",
                    )}
                  >
                    {s.last_followup_at
                      ? `上次跟进 ${s.days_since_last} 天前`
                      : "从未跟进"}
                    {s.record_count > 0 && ` · ${s.record_count} 条`}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* 右：详情 + 时间线 */}
      <section className="col-span-12 flex min-h-0 flex-col rounded-2xl bg-white shadow-card md:col-span-8 xl:col-span-9">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {selectedStudent?.student_name ?? "请选择学员"}
            </h3>
            {selectedStudent && (
              <p className="text-xs text-slate-500">
                {selectedStudent.student_code ?? "—"} · 顾问 {selectedStudent.counselor_name ?? "—"} · 余额{" "}
                <span className="tabular-nums">{formatCurrency(selectedStudent.balance)}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadTimeline()}
              disabled={loadingTimeline || !selectedId}
              className="grid h-9 w-9 place-items-center rounded text-slate-500 hover:bg-slate-100"
              title="刷新"
            >
              <RefreshCw className={cn("h-4 w-4", loadingTimeline && "animate-spin")} />
            </button>
            <button
              onClick={askAi}
              disabled={!selectedId || aiBusy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {aiBusy ? "请求中…" : "AI 推荐跟进"}
            </button>
            <button
              onClick={() => setNewOpen(true)}
              disabled={!selectedId}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              新增跟进
            </button>
          </div>
        </div>

        {aiMsg && (
          <div className="border-b border-violet-100 bg-violet-50 px-5 py-2 text-xs text-violet-700">{aiMsg}</div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedId && (
            <div className="grid h-full place-items-center text-sm text-slate-400">请选择学员</div>
          )}
          {selectedId && loadingTimeline && (
            <div className="grid h-full place-items-center text-sm text-slate-400">加载中…</div>
          )}
          {selectedId && !loadingTimeline && timeline.length === 0 && (
            <div className="grid h-full place-items-center text-sm text-slate-400">该学员暂无跟进记录</div>
          )}
          {selectedId && !loadingTimeline && timeline.length > 0 && (
            <ul className="relative space-y-4 pl-6">
              <span aria-hidden className="absolute left-2 top-1 bottom-1 w-px bg-slate-200" />
              {timeline.map((f) => (
                <li key={f.id} className="relative">
                  <span aria-hidden className="absolute -left-[18px] top-1.5 h-3 w-3 rounded-full bg-brand-500 ring-2 ring-white" />
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-700">
                        {followupTypeLabel(f.type)}
                      </span>
                      <span className="font-medium text-slate-800">{f.creator_name ?? "—"}</span>
                      <span className="ml-auto text-xs text-slate-400">
                        {formatDate(f.created_at, true)}
                      </span>
                    </div>
                    {f.content && (
                      <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{f.content}</div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      {f.result && <span>结果：{f.result}</span>}
                      {f.next_plan && <span>下次计划：{f.next_plan}</span>}
                      {f.next_date && <span>下次时间：{formatDate(f.next_date, true)}</span>}
                      {f.student_phone && <span>电话：{maskPhone(f.student_phone)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {selectedStudent && (
        <NewFollowupModal
          open={newOpen}
          onClose={() => setNewOpen(false)}
          studentId={selectedStudent.student_id}
          studentName={selectedStudent.student_name}
          onSaved={async () => {
            setNewOpen(false);
            await loadTimeline();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
