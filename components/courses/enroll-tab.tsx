"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgePercent, Search, UserPlus } from "lucide-react";
import { usePermissions } from "@/lib/auth/permissions-context";
import { enrollStudent } from "@/lib/api/create";
import { getEnrollmentPricingOptions, searchStudents } from "@/lib/api/courses-client";
import type {
  CourseEnrollment,
  CoursePricePlan,
  CourseRow,
  EnrollmentCampaign,
  StudentSearchResult,
} from "@/lib/api/courses";
import { displayPhone, formatCurrency } from "@/lib/format";

interface Props {
  course: CourseRow;
  enrollments: CourseEnrollment[];
  onMutate: () => Promise<void>;
}

type EnrollmentMode = "normal" | "campaign" | "custom";

export function EnrollTab({ course, enrollments, onMutate }: Props) {
  const { has } = usePermissions();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Map<string, StudentSearchResult>>(new Map());
  const [plans, setPlans] = useState<CoursePricePlan[]>([]);
  const [campaigns, setCampaigns] = useState<EnrollmentCampaign[]>([]);
  const [mode, setMode] = useState<EnrollmentMode>("normal");
  const [priceId, setPriceId] = useState("");
  const [lessonsOverride, setLessonsOverride] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [customType, setCustomType] = useState("fixed");
  const [customValue, setCustomValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [notes, setNotes] = useState("");
  const [giftLessons, setGiftLessons] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const existingByStudent = useMemo(() => {
    const grouped = new Map<string, CourseEnrollment[]>();
    for (const enrollment of enrollments) {
      const current = grouped.get(enrollment.student_id) ?? [];
      current.push(enrollment);
      grouped.set(enrollment.student_id, current);
    }
    return grouped;
  }, [enrollments]);

  useEffect(() => {
    let cancelled = false;
    void getEnrollmentPricingOptions(course.course_id)
      .then(({ plans: nextPlans, campaigns: nextCampaigns }) => {
        if (cancelled) return;
        setPlans(nextPlans);
        setCampaigns(nextCampaigns);
        setPriceId(nextPlans.find((plan) => plan.is_default)?.id ?? nextPlans[0]?.id ?? "");
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
  }, [course.course_id]);

  useEffect(() => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchStudents(keyword.trim(), 12)
        .then((rows) => !cancelled && setResults(rows))
        .catch((e) => !cancelled && setError((e as Error).message));
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [keyword]);

  const availableCampaigns = campaigns;
  const selectedPlan = plans.find((plan) => plan.id === priceId);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const quote = useMemo(() => {
    const resolvedLessons = Number(selectedPlan?.total_lessons ?? course.total_lessons ?? 0);
    const listUnit = Number(selectedPlan?.unit_price ?? course.fee ?? 0);
    const resolvedGross = Number(selectedPlan?.total_price ?? listUnit * resolvedLessons);
    // 报名课时覆盖: 保持每节单价不变, 按指定课时缩放原价 (与 rpc_enroll_student_v2 一致)
    const override = Number(lessonsOverride);
    const useOverride = lessonsOverride.trim() !== "" && override > 0;
    const perLesson = resolvedLessons > 0 ? resolvedGross / resolvedLessons : listUnit;
    const baseLessons = useOverride ? override : resolvedLessons;
    const gross = useOverride ? Math.round(perLesson * override * 100) / 100 : resolvedGross;
    const discountType = mode === "custom" ? customType : selectedCampaign?.discount_type;
    const discountValue = mode === "custom" ? Number(customValue || 0) : Number(selectedCampaign?.discount_value ?? 0);
    const campaignGiftLessons = mode === "campaign" ? Number(selectedCampaign?.gift_lessons ?? 0) : 0;
    const manualGiftLessons = Math.max(0, Number(giftLessons || 0));
    let discount = 0;
    if (discountType === "percentage" || discountType === "percent") discount = gross * discountValue / 100;
    if (discountType === "fixed" || discountType === "amount") discount = discountValue;
    discount = Math.max(0, Math.min(gross, discount));
    const net = Math.max(0, gross - discount);
    const totalGiftLessons = campaignGiftLessons + manualGiftLessons;
    const totalLessons = baseLessons + totalGiftLessons;
    return { listUnit, gross, discount, net, baseLessons, totalLessons, effectiveUnit: baseLessons > 0 ? net / baseLessons : 0, giftLessons: totalGiftLessons };
  }, [course.fee, course.total_lessons, customType, customValue, giftLessons, lessonsOverride, mode, selectedCampaign, selectedPlan]);

  const chooseMode = (nextMode: EnrollmentMode) => {
    setMode(nextMode);
    setCampaignId("");
    setError(null);
  };

  const validateEnrollment = () => {
    if (mode === "campaign" && !campaignId) {
      return "请选择有效的优惠组合";
    }
    if (mode === "custom" && (!(Number(customValue) > 0) || !discountReason.trim())) {
      return "请填写有效的优惠数值和优惠原因";
    }
    if (Number(giftLessons || 0) > 0 && !giftNote.trim()) {
      return "赠送课时必须填写备注";
    }
    if (!(quote.net > 0)) {
      return "付费报名金额必须大于 0；纯赠送课时请在班级花名册中操作";
    }
    return null;
  };

  const enrollOne = (student: StudentSearchResult) => enrollStudent({
    p_student_id: student.id,
    p_course_id: course.course_id,
    p_source: mode,
    p_price_id: priceId || null,
    p_campaign_id: mode === "campaign" ? campaignId : null,
    p_custom_discount_type: mode === "custom" ? customType : null,
    p_custom_discount_value: mode === "custom" ? Number(customValue) : null,
    p_discount_reason: mode === "custom" ? discountReason.trim() : null,
    p_referrer_student_id: null,
    p_lessons_override: lessonsOverride.trim() !== "" && Number(lessonsOverride) > 0 ? Number(lessonsOverride) : null,
    p_gift_lessons: Number(giftLessons || 0) || 0,
    p_gift_note: giftNote.trim() || null,
    p_notes: notes.trim() || null,
  });

  const handleEnroll = async (student: StudentSearchResult) => {
    const validationError = validateEnrollment();
    if (validationError) return setError(validationError);
    setBusyId(student.id);
    setError(null);
    setInfo(null);
    try {
      await enrollOne(student);
      const additional = (existingByStudent.get(student.id) ?? []).some((item) => item.status === "enrolled");
      setInfo(
        `已为 ${student.name}${additional ? "追加" : ""}报名：锁定预付款 ${formatCurrency(quote.net)}，消课时逐节确认为收入`,
      );
      setKeyword("");
      setResults([]);
      await onMutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleBatchEnroll = async () => {
    const validationError = validateEnrollment();
    if (validationError) return setError(validationError);
    const students = [...selectedStudents.values()];
    if (students.length === 0) return;
    setBusyId("batch");
    setError(null);
    setInfo(null);
    const outcomes = await Promise.allSettled(students.map(enrollOne));
    const failed = outcomes.filter((outcome) => outcome.status === "rejected").length;
    const succeeded = outcomes.length - failed;
    setSelectedStudents(new Map());
    setBusyId(null);
    setInfo(`批量报名完成：成功 ${succeeded} 人${failed ? `，失败 ${failed} 人` : ""}`);
    if (failed > 0) setError("部分学员报名失败，通常是可用余额不足、账户已为负或课程容量不足。请刷新后核对。");
    if (succeeded > 0) await onMutate();
  };

  return (
    <div>
      <div className="rounded-lg bg-slate-50 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            报名价格
            <select value={priceId} onChange={(e) => setPriceId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none">
              {plans.length === 0 && <option value="">标准价格</option>}
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.total_lessons ?? course.total_lessons} 课时 · {formatCurrency(plan.total_price ?? Number(plan.unit_price) * Number(plan.total_lessons))}</option>)}
            </select>
          </label>
          <div>
            <div className="text-xs font-medium text-slate-600">报名方式</div>
            <div className="mt-1 grid h-10 grid-cols-3 rounded-md border border-slate-200 bg-white p-0.5 text-xs">
              {([['normal', '正常'], ['campaign', '优惠组合'], ...(has("courses.pricing") ? [['custom', '自定义'] as const] : [])] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => chooseMode(value)} className={mode === value ? "rounded bg-brand-600 font-medium text-white" : "rounded text-slate-600 hover:bg-slate-50"}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            报名课时
            <input
              type="number"
              min="1"
              step="1"
              value={lessonsOverride}
              onChange={(e) => setLessonsOverride(e.target.value)}
              placeholder={`默认 ${selectedPlan?.total_lessons ?? course.total_lessons ?? "按方案"} 节，可自定义`}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal focus:border-brand-500 focus:outline-none"
            />
            <span className="mt-1 block font-normal text-slate-400">留空按价格方案课时；填写后保持每节单价不变，按节数重新计价</span>
          </label>
        </div>

        {mode === "campaign" && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              优惠组合
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none">
                <option value="">请选择优惠组合</option>
                {availableCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
              {availableCampaigns.length === 0 && <span className="mt-1 block text-amber-600">当前没有适用于本课程的有效优惠组合，请先到「优惠组合管理」创建</span>}
            </label>
          </div>
        )}

        {mode === "custom" && (
          <div className="mt-3 grid gap-3 md:grid-cols-[160px_180px_1fr]">
            <label className="text-xs font-medium text-slate-600">优惠类型<select value={customType} onChange={(e) => setCustomType(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="fixed">固定减免</option><option value="percentage">折扣百分比</option></select></label>
            <label className="text-xs font-medium text-slate-600">{customType === "percentage" ? "减免比例 (%)" : "减免金额"}<input type="number" min="0" max={customType === "percentage" ? 100 : undefined} value={customValue} onChange={(e) => setCustomValue(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" /></label>
            <label className="text-xs font-medium text-slate-600">优惠原因<input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="必填，用于财务追溯" className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" /></label>
          </div>
        )}

        <div className="mt-3 grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-5">
          <QuoteItem label="标准单价" value={formatCurrency(quote.listUnit)} />
          <QuoteItem label="报名课时" value={`${quote.totalLessons} 节（正常 ${quote.baseLessons}${quote.giftLessons ? ` + 赠送 ${quote.giftLessons}` : ""}）`} />
          <QuoteItem label="原价" value={formatCurrency(quote.gross)} />
          <QuoteItem label="优惠" value={`-${formatCurrency(quote.discount)}`} accent={quote.discount > 0} />
          <QuoteItem label="应收 / 实际课时单价" value={`${formatCurrency(quote.net)} / ${formatCurrency(quote.effectiveUnit)}`} strong />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            额外赠送课时
            <input type="number" min="0" step="1" value={giftLessons} onChange={(event) => setGiftLessons(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" placeholder="0" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            赠送备注 {Number(giftLessons || 0) > 0 && <span className="text-red-500">*</span>}
            <input value={giftNote} onChange={(event) => setGiftNote(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" placeholder="如：暑期报名赠送 2 课时" />
          </label>
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="报名备注（可选）" className="mt-3 min-h-14 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><BadgePercent className="h-3.5 w-3.5" />报名会从可用余额中锁定本次合同金额；消课时释放对应预付款并确认为实际收入。同一课程可按不同时间、单价多次报名；总余额为负或可用余额不足时不能新增付费报名。</div>
        {error && <div className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>}
        {info && <div className="mt-2 rounded bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{info}</div>}
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white">
        <div className="relative m-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按姓名 / 手机号 / 学员编号搜索报名学员" className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
        {selectedStudents.size > 0 && (
          <div className="mx-3 mb-3 flex items-center justify-between rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <span>已选择 {selectedStudents.size} 名学员</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedStudents(new Map())} className="text-xs hover:underline">清空</button>
              <button
                type="button"
                disabled={busyId === "batch"}
                onClick={handleBatchEnroll}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {busyId === "batch" ? "批量报名中…" : "批量确认报名"}
              </button>
            </div>
          </div>
        )}
        {!keyword.trim() && <div className="px-4 py-8 text-center text-sm text-slate-400">先确认上方价格，再搜索并选择学员</div>}
        {keyword.trim() && results.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">未找到匹配学员</div>}
        <ul className="divide-y divide-slate-100">
          {results.map((student) => {
            const existing = existingByStudent.get(student.id) ?? [];
            const active = existing.find((item) => item.status === "enrolled");
            const selected = selectedStudents.has(student.id);
            const available = Number(student.available_balance ?? student.balance ?? 0);
            const insufficient = Number(student.balance ?? 0) < 0 || available < quote.net;
            return (
              <li key={student.id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={insufficient}
                  onChange={() => setSelectedStudents((current) => {
                    const next = new Map(current);
                    if (next.has(student.id)) next.delete(student.id);
                    else next.set(student.id, student);
                    return next;
                  })}
                  aria-label={`选择 ${student.name}`}
                  className="mt-2"
                />
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs text-slate-500">
                  {student.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{student.name}</span>
                    <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-500">
                      {student.student_code ?? "无编号"}
                    </span>
                    {active && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-600">
                        本课程已有 {active.lesson_lots.length} 条报名批次
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {displayPhone(student.phone)} · 总余额 {formatCurrency(student.balance ?? 0)} ·
                    可用 {formatCurrency(available)}
                  </div>
                  {active && (
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
                      {active.lesson_lots.map((lot) => (
                        <span key={lot.id} className="rounded border border-slate-200 bg-white px-1.5 py-0.5">
                          {lot.source_type === "gift" ? "赠送" : "付费"}：
                          {lot.remaining_lessons}/{lot.total_lessons} 节 · 单价 {formatCurrency(lot.unit_price)}
                        </span>
                      ))}
                    </div>
                  )}
                  {insufficient && (
                    <div className="mt-1 text-[11px] text-red-500">
                      可用余额不足，本次报名需先充值至至少 {formatCurrency(quote.net)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleEnroll(student)}
                  disabled={insufficient || busyId !== null}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:bg-slate-300"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {busyId === student.id
                    ? "报名中…"
                    : `${active ? "追加报名" : "报名"} ${formatCurrency(quote.net)}`}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function QuoteItem({ label, value, accent = false, strong = false }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return <div><div className="text-xs text-slate-400">{label}</div><div className={`mt-1 text-sm ${accent ? "text-emerald-600" : strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>{value}</div></div>;
}
