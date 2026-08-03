"use client";

import { FormEvent, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  MessageSquareText,
  RefreshCcw,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import type { CampusCourseKpi, CampusKpis, CampusStaffKpi } from "@/lib/api/campus-kpis";
import { validateCampusKpiRange } from "@/lib/campus-kpi-range";
import { formatCurrency, formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";

interface CampusAnalysis {
  summary: string;
  highlights: string[];
  risks: string[];
  actions: Array<{ title: string; owner_role: string; due_in_days: number; reason: string }>;
  confidence: number;
}

type Tone = "blue" | "violet" | "emerald" | "amber";

const TONES: Record<Tone, { icon: string; bar: string; soft: string; text: string }> = {
  blue: { icon: "bg-blue-100 text-blue-600", bar: "bg-blue-500", soft: "bg-blue-50", text: "text-blue-700" },
  violet: { icon: "bg-violet-100 text-violet-600", bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700" },
  emerald: { icon: "bg-emerald-100 text-emerald-600", bar: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700" },
  amber: { icon: "bg-amber-100 text-amber-600", bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700" },
};

export function CampusKpiDashboard({
  data,
  notice,
}: {
  data: CampusKpis;
  notice?: string | null;
}) {
  const [from, setFrom] = useState(data.period.from);
  const [to, setTo] = useState(data.period.to);
  const [analysis, setAnalysis] = useState<CampusAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const rangeError = validateCampusKpiRange(from, to);

  const totals = data.daily.reduce((sum, day) => ({
    followups: sum.followups + Number(day.followups),
    attendance: sum.attendance + Number(day.attendance_actions),
    personTimes: sum.personTimes + Number(day.actual_person_times),
    lessons: sum.lessons + Number(day.consumed_lessons),
    income: sum.income + Number(day.consumed_amount),
  }), { followups: 0, attendance: 0, personTimes: 0, lessons: 0, income: 0 });

  const activeDays = data.daily.filter(hasDailyActivity).length;
  const activeStaff = data.staff.filter((row) => staffScore(row) > 0).length;
  const assignedCourses = data.courses.filter((row) => Boolean(row.homeroom_teacher)).length;
  const coursesWithAttendance = data.courses.filter((row) => row.attendance_rate != null);
  const averageAttendance = coursesWithAttendance.length > 0
    ? coursesWithAttendance.reduce((sum, row) => sum + Number(row.attendance_rate), 0) / coursesWithAttendance.length
    : null;
  const staff = [...data.staff].sort((a, b) => staffScore(b) - staffScore(a) || a.name.localeCompare(b.name, "zh-CN"));
  const courses = [...data.courses].sort((a, b) => (
    Number(b.actual_person_times) - Number(a.actual_person_times)
    || Number(b.active_enrolled) - Number(a.active_enrolled)
    || a.course_name.localeCompare(b.course_name, "zh-CN")
  ));

  const submitRange = (event: FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    const error = validateCampusKpiRange(String(form.get("from") ?? ""), String(form.get("to") ?? ""));
    if (error) {
      event.preventDefault();
      setSubmitError(error);
      return;
    }
    setSubmitError(null);
  };

  const setPreset = (preset: "week" | "month" | "quarter") => {
    const today = new Date();
    const end = toLocalIso(today);
    const start = new Date(today);
    if (preset === "week") {
      const mondayOffset = (today.getDay() + 6) % 7;
      start.setDate(today.getDate() - mondayOffset);
    } else if (preset === "month") {
      start.setDate(1);
    } else {
      start.setMonth(today.getMonth() - 2, 1);
    }
    setFrom(toLocalIso(start));
    setTo(end);
    setSubmitError(null);
  };

  const runAnalysis = async () => {
    const error = validateCampusKpiRange(data.period.from, data.period.to);
    if (error) {
      setAnalysisError(error);
      return;
    }
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);
    try {
      const response = await fetch("/api/ai/campus-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: data.period.from, to: data.period.to }),
      });
      const payload = await response.json() as { error?: string; result?: CampusAnalysis };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "智能校区分析失败");
      setAnalysis(payload.result);
    } catch (caught) {
      setAnalysisError((caught as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div data-testid="campus-kpi-dashboard" className="min-w-0 space-y-5">
      <div data-testid="campus-kpi-hero-grid" className="min-w-0 space-y-5">
        <section data-testid="campus-kpi-overview" className="min-w-0 overflow-hidden rounded-2xl bg-slate-900 p-5 text-white sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-sky-300">
              <Activity className="h-4 w-4" />
              校区运营体温
            </div>
            <h2 className="mt-2 text-xl font-semibold">{formatPeriod(data.period.from, data.period.to)} 考核概览</h2>
            <p className="mt-1 text-sm text-slate-300">用活跃天数、人员参与和班级执行情况判断校区运行状态。</p>
          </div>
          <div className="min-w-52 rounded-xl bg-white/10 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-300"><CircleDollarSign className="h-4 w-4" />本期课消收入</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(totals.income)}</div>
            <div className="mt-1 text-xs text-slate-400">来自实际课消，不包含预付款充值</div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <HealthBar label="有业务记录的日期" value={activeDays} total={data.daily.length} detail={`${activeDays} / ${data.daily.length || 0} 天`} />
          <HealthBar label="本期有动作的人员" value={activeStaff} total={data.staff.length} detail={`${activeStaff} / ${data.staff.length || 0} 人`} />
          <HealthBar label="已分配班主任的班级" value={assignedCourses} total={data.courses.length} detail={`${assignedCourses} / ${data.courses.length || 0} 班`} />
          <HealthBar
            label="有考勤班级平均出勤率"
            value={averageAttendance ?? 0}
            total={100}
            detail={averageAttendance == null ? "暂无考勤" : `${formatNumber(averageAttendance)}%`}
          />
        </div>
        </section>
        <div className="mx-auto w-full max-w-5xl">
          <AiAnalysisPanel
            analysis={analysis}
            error={analysisError}
            analyzing={analyzing}
            onAnalyze={runAnalysis}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricVisual
              Icon={MessageSquareText}
              label="学员跟进"
              value={formatNumber(totals.followups)}
              unit="次"
              hint="沟通与推进记录"
              series={data.daily.map((day) => Number(day.followups))}
              tone="blue"
            />
            <MetricVisual
              Icon={CalendarCheck}
              label="点名执行"
              value={formatNumber(totals.attendance)}
              unit="次"
              hint="教师与班主任操作"
              series={data.daily.map((day) => Number(day.attendance_actions))}
              tone="violet"
            />
            <MetricVisual
              Icon={Users}
              label="实消人次"
              value={formatNumber(totals.personTimes)}
              unit="人次"
              hint="到课及迟到学员"
              series={data.daily.map((day) => Number(day.actual_person_times))}
              tone="emerald"
            />
            <MetricVisual
              Icon={Clock3}
              label="实际课消"
              value={formatNumber(totals.lessons)}
              unit="课时"
              hint="含半课时记录"
              series={data.daily.map((day) => Number(day.consumed_lessons))}
              tone="amber"
            />
        </div>
      </div>

      <form onSubmit={submitRange} action="/campus" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <input type="hidden" name="tab" value="kpi" />
        <div className="flex flex-wrap items-end gap-3">
          <DateField label="开始日期" name="from" value={from} onChange={(value) => { setFrom(value); setSubmitError(null); }} />
          <DateField label="结束日期" name="to" value={to} onChange={(value) => { setTo(value); setSubmitError(null); }} />
          <button
            aria-invalid={Boolean(rangeError || submitError)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            <RefreshCcw className="h-4 w-4" />更新统计
          </button>
          <div className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <PresetButton label="本周" onClick={() => setPreset("week")} />
            <PresetButton label="本月" onClick={() => setPreset("month")} />
            <PresetButton label="近三月" onClick={() => setPreset("quarter")} />
          </div>
          <span className="ml-auto whitespace-nowrap text-xs text-slate-400">更新于 {formatDate(data.source_updated_at, true)}</span>
        </div>
        {(rangeError || submitError || notice) && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${rangeError || submitError ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{rangeError ?? submitError ?? notice}</span>
          </div>
        )}
      </form>

      <ActivityTrend data={data} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <StaffPerformance rows={staff} />
        <CourseHealth rows={courses} />
      </div>
    </div>
  );
}

function AiAnalysisPanel({ analysis, error, analyzing, onAnalyze }: {
  analysis: CampusAnalysis | null;
  error: string | null;
  analyzing: boolean;
  onAnalyze: () => void;
}) {
  return (
    <aside data-testid="campus-kpi-ai" className="min-w-0 overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/70 shadow-sm">
      <div className="flex flex-col items-center gap-4 bg-violet-600 p-5 text-center text-white sm:flex-row sm:justify-between sm:text-left">
        <div>
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-violet-100 sm:justify-start"><Bot className="h-4 w-4" />智能校区经营分析</div>
          <h3 className="mt-2 text-lg font-semibold">把考核数据变成下一步行动</h3>
          <p className="mt-1 text-xs leading-5 text-violet-100">由云端智能模型提炼亮点、风险与责任人建议。</p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-70 sm:w-auto"
        >
          <Sparkles className="h-4 w-4" />{analyzing ? "正在分析当前区间…" : analysis ? "重新生成分析" : "立即生成分析"}
        </button>
      </div>
      <div className="max-h-[30rem] overflow-y-auto p-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        {!analysis && !error && (
          <div className="space-y-2">
            <AiPreviewRow Icon={CheckCircle2} tone="text-emerald-600 bg-emerald-50" title="经营亮点" description="识别本期增长与执行优势" />
            <AiPreviewRow Icon={AlertTriangle} tone="text-amber-600 bg-amber-50" title="风险提醒" description="定位低活跃与异常班级" />
            <AiPreviewRow Icon={UserCheck} tone="text-blue-600 bg-blue-50" title="行动建议" description="明确责任角色和处理时限" />
          </div>
        )}
        {analysis && (
          <div className="space-y-4 text-sm text-slate-700">
            <div className="rounded-lg bg-white p-3 leading-6 shadow-sm">{analysis.summary}</div>
            <AnalysisList title="经营亮点" items={analysis.highlights} color="emerald" />
            <AnalysisList title="风险提醒" items={analysis.risks} color="amber" />
            {analysis.actions.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-700">建议行动</div>
                <div className="mt-2 space-y-2">
                  {analysis.actions.map((action, index) => (
                    <div key={`${action.title}-${index}`} className="rounded-lg border border-violet-100 bg-white p-3">
                      <div className="font-medium text-slate-800">{action.title}</div>
                      <div className="mt-1 text-[11px] text-slate-400">{ROLE_LABELS[action.owner_role] ?? "管理人员"} · {action.due_in_days} 天内</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{action.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="text-right text-[11px] text-slate-400">分析置信度 {Math.round(analysis.confidence * 100)}% · 请核对后执行</div>
          </div>
        )}
      </div>
    </aside>
  );
}

function AiPreviewRow({ Icon, tone, title, description }: { Icon: typeof Activity; tone: string; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
      <span className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></span>
      <div><div className="text-xs font-semibold text-slate-700">{title}</div><div className="mt-0.5 text-[11px] text-slate-400">{description}</div></div>
    </div>
  );
}

function ActivityTrend({ data }: { data: CampusKpis }) {
  const values = data.daily.flatMap((day) => [Number(day.followups), Number(day.attendance_actions), Number(day.actual_person_times)]);
  const max = Math.max(0, ...values);
  const hasData = values.some((value) => value > 0);
  const labelStep = Math.max(1, Math.ceil(data.daily.length / 12));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header title="每日运营节奏" sub="同一刻度对比跟进、点名和实消人次，悬停或聚焦可查看当天详情。" />
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <Legend color="bg-blue-500" label="跟进" />
          <Legend color="bg-violet-500" label="点名" />
          <Legend color="bg-emerald-500" label="实消人次" />
        </div>
      </div>
      {hasData ? (
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="flex h-64 items-end border-b border-slate-200" style={{ minWidth: `${Math.max(640, data.daily.length * 34)}px` }}>
            {data.daily.map((day, index) => {
              const dayValues = [Number(day.followups), Number(day.attendance_actions), Number(day.actual_person_times)];
              return (
                <div key={day.day} tabIndex={0} className="group relative flex h-full min-w-8 flex-1 flex-col items-center justify-end outline-none">
                  <div className="pointer-events-none absolute bottom-full z-20 mb-2 hidden w-52 rounded-lg bg-slate-900 p-3 text-xs leading-5 text-white shadow-xl group-hover:block group-focus:block">
                    <div className="font-semibold">{formatFullDay(day.day)}</div>
                    <div className="mt-1 text-slate-300">跟进 {formatNumber(day.followups)} 次 · 点名 {formatNumber(day.attendance_actions)} 次</div>
                    <div className="text-slate-300">实消 {formatNumber(day.actual_person_times)} 人次 · {formatNumber(day.consumed_lessons)} 课时</div>
                    <div className="text-slate-300">课消收入 {formatCurrency(day.consumed_amount)}</div>
                  </div>
                  <div className="flex h-52 items-end gap-0.5" aria-label={`${day.day}：跟进 ${dayValues[0]} 次，点名 ${dayValues[1]} 次，实消 ${dayValues[2]} 人次`}>
                    <TrendBar value={dayValues[0]} max={max} color="bg-blue-500" />
                    <TrendBar value={dayValues[1]} max={max} color="bg-violet-500" />
                    <TrendBar value={dayValues[2]} max={max} color="bg-emerald-500" />
                  </div>
                  <span className="mt-2 h-4 whitespace-nowrap text-[10px] text-slate-400">
                    {(index % labelStep === 0 || index === data.daily.length - 1) ? formatDayLabel(day.day) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState Icon={Activity} title="这个时段还没有运营记录" description="调整日期后可查看跟进、点名与课消趋势。" />
      )}
    </section>
  );
}

function StaffPerformance({ rows }: { rows: CampusStaffKpi[] }) {
  const max = Math.max(1, ...rows.map(staffScore));
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <Header title="人员活跃度" sub="用行为条直观看出谁在跟进学员、执行点名并带来实际课消。" />
      </div>
      {rows.length === 0 ? (
        <EmptyState Icon={UserCheck} title="暂无人员考核数据" description="人员产生跟进或点名后会在这里形成对比。" />
      ) : (
        <div className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
          {rows.map((row, index) => {
            const score = staffScore(row);
            const width = score > 0 ? Math.max(4, score / max * 100) : 0;
            return (
              <div key={row.staff_id} className="px-5 py-4 transition-colors hover:bg-slate-50/70">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${index < 3 && score > 0 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                    {row.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">{row.name}</div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {ROLE_LABELS[row.role] ?? "管理人员"}{row.homeroom_courses > 0 ? ` · 管理 ${formatNumber(row.homeroom_courses)} 个班级` : ""}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${score > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {score > 0 ? "本期有动作" : "本期暂无动作"}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={max}>
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />跟进 {formatNumber(row.followup_actions)}</span>
                      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />点名 {formatNumber(row.attendance_actions)}</span>
                      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />实消 {formatNumber(row.actual_person_times)} 人次</span>
                      <span className="ml-auto font-medium text-slate-700">{formatCurrency(row.consumed_amount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CourseHealth({ rows }: { rows: CampusCourseKpi[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <Header title="班级健康度" sub="出勤率、实消节奏和班主任分配集中在同一行查看。" />
      </div>
      {rows.length === 0 ? (
        <EmptyState Icon={GraduationCap} title="暂无班级考核数据" description="建立课程并完成点名后会显示班级健康度。" />
      ) : (
        <div className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
          {rows.map((row) => {
            const attendance = row.attendance_rate == null ? null : clamp(Number(row.attendance_rate), 0, 100);
            const state = courseState(attendance);
            return (
              <div key={row.course_id} className="px-5 py-4 transition-colors hover:bg-slate-50/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{row.course_name}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                      <UserCheck className="h-3.5 w-3.5" />班主任：{row.homeroom_teacher ?? "未分配"}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${state.className}`}>{state.label}</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${row.course_name} 出勤率`} aria-valuenow={attendance ?? 0} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full rounded-full ${state.bar}`} style={{ width: `${attendance ?? 0}%` }} />
                  </div>
                  <span className="w-12 text-right text-xs font-semibold text-slate-700">{attendance == null ? "暂无" : `${formatNumber(attendance)}%`}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="在读" value={`${formatNumber(row.active_enrolled)} 人`} />
                  <MiniStat label="实消" value={`${formatNumber(row.actual_person_times)} 人次`} />
                  <MiniStat label="课时" value={formatNumber(row.consumed_lessons)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MetricVisual({ Icon, label, value, unit, hint, series, tone }: {
  Icon: typeof Activity;
  label: string;
  value: string;
  unit: string;
  hint: string;
  series: number[];
  tone: Tone;
}) {
  const colors = TONES[tone];
  const max = Math.max(1, ...series);
  const visible = series.length > 20 ? series.slice(-20) : series;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className={`rounded-lg p-1.5 ${colors.icon}`}><Icon className="h-4 w-4" /></span>{label}
          </div>
          <div className="mt-3 whitespace-nowrap text-2xl font-semibold tracking-tight text-slate-900">{value}<span className="ml-1 text-xs font-normal text-slate-400">{unit}</span></div>
          <div className="mt-1 text-xs text-slate-400">{hint}</div>
        </div>
        <div className="flex h-14 w-24 items-end justify-end gap-0.5" aria-hidden="true">
          {visible.map((item, index) => (
            <div
              key={index}
              className={`min-w-0 flex-1 rounded-t ${item > 0 ? colors.bar : "bg-slate-100"}`}
              style={{ height: `${item > 0 ? Math.max(8, item / max * 52) : 3}px` }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function HealthBar({ label, value, total, detail }: { label: string; value: number; total: number; detail: string }) {
  const percent = total > 0 ? clamp(value / total * 100, 0, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="font-medium text-white">{detail}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={label} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-sky-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function DateField({ label, name, value, onChange }: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-slate-500">
      <span className="mb-1 block">{label}</span>
      <input
        type="date"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="h-7 rounded-md px-2.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">{label}</button>;
}

function Header({ title, sub }: { title: string; sub: string }) {
  return <div><h3 className="text-sm font-semibold text-slate-800">{title}</h3><p className="mt-1 text-xs text-slate-400">{sub}</p></div>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>;
}

function TrendBar({ value, max, color }: { value: number; max: number; color: string }) {
  return <div className={`w-1.5 rounded-t ${value > 0 ? color : "bg-slate-100"}`} style={{ height: `${value > 0 ? Math.max(4, value / Math.max(1, max) * 190) : 2}px` }} />;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 px-2 py-2"><div className="text-[10px] text-slate-400">{label}</div><div className="mt-0.5 text-xs font-semibold text-slate-700">{value}</div></div>;
}

function EmptyState({ Icon, title, description }: { Icon: typeof Activity; title: string; description: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="rounded-full bg-slate-100 p-3"><Icon className="h-6 w-6 text-slate-400" /></div>
      <div className="mt-3 text-sm font-medium text-slate-700">{title}</div>
      <div className="mt-1 text-xs text-slate-400">{description}</div>
    </div>
  );
}

function AnalysisList({ title, items, color }: { title: string; items: string[]; color: "emerald" | "amber" }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-700">{title}</div>
      <div className="mt-2 space-y-1.5">
        {items.length === 0
          ? <div className="text-xs text-slate-400">暂无明确项目</div>
          : items.map((item) => <div key={item} className={`rounded-lg px-3 py-2 text-xs leading-5 ${color === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item}</div>)}
      </div>
    </div>
  );
}

function staffScore(row: CampusStaffKpi): number {
  return Number(row.followup_actions) + Number(row.attendance_actions) + Number(row.actual_person_times);
}

function hasDailyActivity(day: CampusKpis["daily"][number]): boolean {
  return Number(day.followups) + Number(day.attendance_actions) + Number(day.actual_person_times) + Number(day.consumed_lessons) > 0;
}

function courseState(attendance: number | null): { label: string; className: string; bar: string } {
  if (attendance == null) return { label: "暂无考勤", className: "bg-slate-100 text-slate-500", bar: "bg-slate-300" };
  if (attendance >= 90) return { label: "出勤稳定", className: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" };
  if (attendance >= 75) return { label: "基本稳定", className: "bg-blue-50 text-blue-700", bar: "bg-blue-500" };
  return { label: "需要关注", className: "bg-amber-50 text-amber-700", bar: "bg-amber-500" };
}

function formatNumber(value: number): string {
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toLocalIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPeriod(from: string, to: string): string {
  return from === to ? from : `${from} 至 ${to}`;
}

function formatDayLabel(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatFullDay(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][new Date(year, month - 1, day).getDay()];
  return `${value} ${weekday}`;
}
