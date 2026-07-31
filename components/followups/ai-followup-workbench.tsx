"use client";

import { useState } from "react";
import { Bot, BrainCircuit, CircleDollarSign, GraduationCap, MessageSquareText, ShieldAlert, Sparkles } from "lucide-react";
import type { FollowupOverview } from "@/lib/api/followups";

interface OntologyPreview {
  signals?: {
    student?: { name?: string; status?: string; tenure_days?: number };
    finance?: { balance?: number; burn_rate_30d?: number; days_left_at_rate?: number | null };
    attendance?: { rate_30d?: number | null; total_30d?: number };
    courses?: unknown[];
    risk_flags?: string[];
  };
  lesson_batches?: unknown[];
  followup_history?: unknown[];
}

interface FollowupSuggestion {
  suggested_type: "phone" | "wechat" | "visit" | "other";
  suggested_content: string;
  suggested_next_plan: string;
  suggested_next_date: string | null;
  reasoning: string;
  risk_summary: string[];
  confidence: number;
}

const RISK_LABELS: Record<string, string> = {
  low_balance: "余额偏低",
  balance_runway_short: "余额预计不足两周",
  no_class_7d: "七天未上课",
  no_followup_14d: "十四天未跟进",
  followup_overdue: "跟进计划逾期",
  attendance_below_70: "近三十天出勤率低于 70%",
};

const FOLLOWUP_TYPE_LABELS: Record<FollowupSuggestion["suggested_type"], string> = {
  phone: "电话",
  wechat: "微信",
  visit: "到访",
  other: "其他",
};

export function AiFollowupWorkbench({ overview, model }: { overview: FollowupOverview; model: string }) {
  const [studentId, setStudentId] = useState(overview.students[0]?.student_id ?? "");
  const [ontology, setOntology] = useState<OntologyPreview | null>(null);
  const [suggestion, setSuggestion] = useState<FollowupSuggestion | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const student = overview.students.find((item) => item.student_id === studentId);

  const prepare = async () => {
    if (!studentId) return;
    setLoading(true);
    setMessage(null);
    setSuggestion(null);
    try {
      const response = await fetch(`/api/ai/recommend-followup?student_id=${studentId}`, { method: "POST" });
      const value = await response.json() as { error?: string; message?: string; ontology?: OntologyPreview; result?: FollowupSuggestion };
      if (!response.ok) throw new Error(value.error ?? "AI 分析失败");
      setOntology(value.ontology ?? null);
      setSuggestion(value.result ?? null);
      setMessage(value.message ?? "AI 分析已生成，请核对后使用");
    } catch (caught) {
      setMessage(`AI 分析失败：${(caught as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const signals = ontology?.signals;
  const risks = signals?.risk_flags ?? [];
  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-sky-50 p-5 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-violet-600" /><h2 className="font-semibold text-slate-900">学员知识图谱与推进话术</h2></div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">整合学员基本档案、课程批次、余额、出勤、课消、风险与历史跟进，形成可审计的 AI 输入；生成结果仍需顾问确认后使用。</p>
        </div>
        <div className="rounded-lg bg-white/80 px-4 py-3 text-xs text-slate-600">
          <div>模型：<span className="font-medium text-slate-800">{model}</span></div>
          <div className="mt-1 text-emerald-600">密钥：由 Edge Function 安全托管</div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-slate-200 p-4">
          <label className="text-xs text-slate-500">选择分析学员</label>
          <select value={studentId} onChange={(event) => { setStudentId(event.target.value); setOntology(null); setSuggestion(null); setMessage(null); }} className="mt-1 h-10 w-full rounded border border-slate-200 px-3 text-sm">
            {overview.students.map((item) => <option key={item.student_id} value={item.student_id}>{item.student_name} · {item.student_code ?? "无编号"}</option>)}
          </select>
          {student && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><div>课程顾问：{student.counselor_name ?? "未分配"}</div><div>历史跟进：{student.record_count} 条</div><div>距上次跟进：{student.days_since_last == null ? "从未跟进" : `${student.days_since_last} 天`}</div></div>}
          <button type="button" onClick={prepare} disabled={!studentId || loading} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"><Sparkles className="h-4 w-4" />{loading ? "AI 分析中…" : "生成推进话术"}</button>
          {message && <div className="mt-3 rounded-lg bg-violet-50 p-3 text-xs leading-5 text-violet-700">{message}</div>}
        </section>

        <section className="rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">学员知识图谱预览</h3><span className="text-xs text-slate-400">仅展示授权可见数据</span></div>
          {!ontology ? <div className="grid min-h-72 place-items-center text-sm text-slate-400">选择学员后点击“生成推进话术”，先整理知识图谱输入</div> : (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Node Icon={GraduationCap} title="学员核心" text={`${signals?.student?.name ?? student?.student_name ?? "学员"} · 在校 ${signals?.student?.tenure_days ?? 0} 天`} />
                <Node Icon={CircleDollarSign} title="财务状态" text={`余额 ¥${Number(signals?.finance?.balance ?? 0).toFixed(2)} · 预计 ${signals?.finance?.days_left_at_rate ?? "未知"} 天`} />
                <Node Icon={Bot} title="课程关系" text={`${signals?.courses?.length ?? 0} 门在读课程 · ${ontology.lesson_batches?.length ?? 0} 个课时批次`} />
                <Node Icon={MessageSquareText} title="跟进记忆" text={`${ontology.followup_history?.length ?? 0} 条历史记录`} />
              </div>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><ShieldAlert className="h-4 w-4 text-amber-500" />风险与话术依据</div>
                <div className="mt-3 flex flex-wrap gap-2">{risks.length === 0 ? <span className="text-xs text-emerald-600">当前未识别明显风险</span> : risks.map((risk) => <span key={risk} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-700">{RISK_LABELS[risk] ?? "其他需关注信号"}</span>)}</div>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-violet-900">AI 推进话术</div>
                  {suggestion && <span className="rounded-full bg-white px-2.5 py-1 text-xs text-violet-700">建议渠道：{FOLLOWUP_TYPE_LABELS[suggestion.suggested_type] ?? "其他"} · 置信度 {Math.round(suggestion.confidence * 100)}%</span>}
                </div>
                {!suggestion ? <p className="mt-2 text-sm leading-6 text-violet-700">生成后将在这里显示联系渠道、话术、下一步计划、建议日期和分析依据。</p> : <div className="mt-3 space-y-3 text-sm leading-6 text-violet-900">
                  <div className="rounded-lg bg-white/80 p-3 whitespace-pre-wrap">{suggestion.suggested_content}</div>
                  <div><span className="font-medium">下一步：</span>{suggestion.suggested_next_plan}{suggestion.suggested_next_date ? `（建议 ${suggestion.suggested_next_date} 跟进）` : ""}</div>
                  <div className="text-xs text-violet-700"><span className="font-medium">分析依据：</span>{suggestion.reasoning || "模型未提供额外依据"}</div>
                  {suggestion.risk_summary.length > 0 && <div className="flex flex-wrap gap-2">{suggestion.risk_summary.map((risk) => <span key={risk} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-700">{risk}</span>)}</div>}
                </div>}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Node({ Icon, title, text }: { Icon: typeof Bot; title: string; text: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><Icon className="h-5 w-5 text-brand-500" /><div className="mt-2 text-xs font-medium text-slate-800">{title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{text}</div></div>; }
