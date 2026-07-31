import { Activity, Bot, CalendarCheck, MessageSquareText, Wallet } from "lucide-react";
import type { CampusKpis } from "@/lib/api/campus-kpis";
import { formatCurrency, formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";

export function CampusKpiDashboard({ data, aiConfigured, aiModel }: { data: CampusKpis; aiConfigured: boolean; aiModel: string }) {
  const totals = data.daily.reduce((sum, day) => ({
    followups: sum.followups + Number(day.followups),
    attendance: sum.attendance + Number(day.attendance_actions),
    personTimes: sum.personTimes + Number(day.actual_person_times),
    lessons: sum.lessons + Number(day.consumed_lessons),
    income: sum.income + Number(day.consumed_amount),
  }), { followups: 0, attendance: 0, personTimes: 0, lessons: 0, income: 0 });
  const maxDaily = Math.max(1, ...data.daily.map((day) => Number(day.actual_person_times)));
  const staff = [...data.staff].sort((a, b) => (
    b.followup_actions + b.attendance_actions - a.followup_actions - a.attendance_actions
  ));

  return (
    <div className="space-y-5">
      <form action="/campus" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <input type="hidden" name="tab" value="kpi" />
        <DateField label="开始日期" name="from" value={data.period.from} />
        <DateField label="结束日期" name="to" value={data.period.to} />
        <button className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white">更新统计</button>
        <span className="ml-auto text-xs text-slate-400">数据更新：{formatDate(data.source_updated_at, true)}</span>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric Icon={MessageSquareText} label="跟进行为" value={totals.followups} unit="次" />
        <Metric Icon={CalendarCheck} label="点名操作" value={totals.attendance} unit="次" />
        <Metric Icon={Activity} label="实消人次" value={totals.personTimes} unit="人次" />
        <Metric Icon={Activity} label="实际课消" value={totals.lessons} unit="课时" />
        <Metric Icon={Wallet} label="实收入" value={formatCurrency(totals.income)} />
      </div>

      <section className="rounded-xl border border-slate-200 p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-800">每日行为与课消趋势</h3>
          <p className="mt-1 text-xs text-slate-400">柱形高度按每日实消人次归一；悬停查看跟进、点名、课时与金额。</p>
        </div>
        <div className="flex h-44 items-end gap-1 overflow-x-auto border-b border-slate-200 px-1">
          {data.daily.map((day) => (
            <div key={day.day} className="group relative flex min-w-7 flex-1 flex-col items-center justify-end">
              <div className="absolute bottom-full z-10 mb-2 hidden w-48 rounded-lg bg-slate-900 p-2 text-xs leading-5 text-white shadow-xl group-hover:block">
                <div className="font-medium">{day.day}</div>
                <div>跟进 {day.followups} · 点名 {day.attendance_actions}</div>
                <div>实消 {day.actual_person_times} 人次 · {day.consumed_lessons} 课时</div>
                <div>实收入 {formatCurrency(day.consumed_amount)}</div>
              </div>
              <div className="w-4 rounded-t bg-gradient-to-t from-brand-600 to-sky-400" style={{ height: `${Math.max(3, Number(day.actual_person_times) / maxDaily * 140)}px` }} />
              <span className="mt-1 text-[9px] text-slate-400">{day.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-200">
          <Header title="人员行为与绩效" sub="课程顾问看学员和跟进；班主任看班级点名与课消" />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><Th>人员</Th><Th>职责</Th><Th>跟进</Th><Th>点名</Th><Th>实消人次</Th><Th>课消金额</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">{staff.map((row) => <tr key={row.staff_id}>
                <Td strong>{row.name}</Td><Td>{ROLE_LABELS[row.role] ?? "管理人员"}{row.homeroom_courses > 0 ? ` · 班主任 ${row.homeroom_courses} 班` : ""}</Td>
                <Td>{row.followup_actions}</Td><Td>{row.attendance_actions}</Td><Td>{row.actual_person_times}</Td><Td>{formatCurrency(row.consumed_amount)}</Td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200">
          <Header title="班主任班级课消" sub="每门班级按当前筛选日期范围统计" />
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><Th>课程</Th><Th>班主任</Th><Th>实消人次</Th><Th>课时</Th><Th>出勤率</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">{data.courses.map((row) => <tr key={row.course_id}>
                <Td strong>{row.course_name}</Td><Td>{row.homeroom_teacher ?? "未分配"}</Td><Td>{row.actual_person_times}</Td><Td>{row.consumed_lessons}</Td><Td>{row.attendance_rate == null ? "暂无" : `${row.attendance_rate}%`}</Td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-dashed border-violet-300 bg-violet-50/50 p-5">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-5 w-5 text-violet-600" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-violet-900">AI 校区经营分析（预留）</h3>
            <p className="mt-1 text-xs leading-5 text-violet-700">将基于当前 KPI、学员知识图谱、课消和跟进记录生成管理摘要、异常人员提醒与行动建议。当前模型：{aiModel}。</p>
            <div className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-600">API Key：{aiConfigured ? "已由服务端环境变量配置" : "待配置 DEEPSEEK_API_KEY=sk-..."}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DateField({ label, name, value }: { label: string; name: string; value: string }) { return <label className="text-xs text-slate-500"><span className="mb-1 block">{label}</span><input type="date" name={name} defaultValue={value} className="h-9 rounded border border-slate-200 bg-white px-3 text-sm" /></label>; }
function Metric({ Icon, label, value, unit = "" }: { Icon: typeof Activity; label: string; value: number | string; unit?: string }) { return <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4 text-brand-500" />{label}</div><div className="mt-2 text-xl font-semibold text-slate-900">{typeof value === "number" ? value.toLocaleString("zh-CN") : value}<span className="ml-1 text-xs font-normal text-slate-400">{unit}</span></div></div>; }
function Header({ title, sub }: { title: string; sub: string }) { return <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold text-slate-800">{title}</h3><p className="mt-0.5 text-xs text-slate-400">{sub}</p></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-3 py-2 text-left font-medium">{children}</th>; }
function Td({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) { return <td className={`whitespace-nowrap px-3 py-2.5 ${strong ? "font-medium text-slate-800" : "text-slate-600"}`}>{children}</td>; }
