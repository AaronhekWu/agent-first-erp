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
import { formatCurrency, maskPhone } from "@/lib/format";

interface Props {
  course: CourseRow;
  enrollments: CourseEnrollment[];
  onMutate: () => Promise<void>;
}

type EnrollmentMode = "normal" | "campaign" | "referral" | "custom";

export function EnrollTab({ course, enrollments, onMutate }: Props) {
  const { has } = usePermissions();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [plans, setPlans] = useState<CoursePricePlan[]>([]);
  const [campaigns, setCampaigns] = useState<EnrollmentCampaign[]>([]);
  const [mode, setMode] = useState<EnrollmentMode>("normal");
  const [priceId, setPriceId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [customType, setCustomType] = useState("fixed");
  const [customValue, setCustomValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [referrerKeyword, setReferrerKeyword] = useState("");
  const [referrerResults, setReferrerResults] = useState<StudentSearchResult[]>([]);
  const [referrer, setReferrer] = useState<StudentSearchResult | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const alreadyIn = new Set(enrollments.map((e) => e.student_id));

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

  useEffect(() => {
    if (mode !== "referral" || !referrerKeyword.trim() || referrer) {
      setReferrerResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchStudents(referrerKeyword.trim(), 8)
        .then((rows) => !cancelled && setReferrerResults(rows))
        .catch((e) => !cancelled && setError((e as Error).message));
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, referrerKeyword, referrer]);

  const availableCampaigns = campaigns.filter((campaign) =>
    mode === "referral" ? campaign.type === "referral" : campaign.type !== "referral",
  );
  const selectedPlan = plans.find((plan) => plan.id === priceId);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const quote = useMemo(() => {
    const baseLessons = Number(selectedPlan?.total_lessons ?? course.total_lessons ?? 0);
    const listUnit = Number(selectedPlan?.unit_price ?? course.fee ?? 0);
    const gross = Number(selectedPlan?.total_price ?? listUnit * baseLessons);
    const discountType = mode === "custom" ? customType : selectedCampaign?.discount_type;
    const discountValue = mode === "custom" ? Number(customValue || 0) : Number(selectedCampaign?.discount_value ?? 0);
    const giftLessons = mode === "campaign" || mode === "referral" ? Number(selectedCampaign?.gift_lessons ?? 0) : 0;
    let discount = 0;
    if (discountType === "percentage" || discountType === "percent") discount = gross * discountValue / 100;
    if (discountType === "fixed" || discountType === "amount") discount = discountValue;
    discount = Math.max(0, Math.min(gross, discount));
    const net = Math.max(0, gross - discount);
    const totalLessons = baseLessons + giftLessons;
    return { listUnit, gross, discount, net, totalLessons, effectiveUnit: totalLessons > 0 ? net / totalLessons : 0, giftLessons };
  }, [course.fee, course.total_lessons, customType, customValue, mode, selectedCampaign, selectedPlan]);

  const chooseMode = (nextMode: EnrollmentMode) => {
    setMode(nextMode);
    setCampaignId("");
    setReferrer(null);
    setReferrerKeyword("");
    setError(null);
  };

  const handleEnroll = async (student: StudentSearchResult) => {
    if ((mode === "campaign" || mode === "referral") && !campaignId) {
      setError("请选择有效的优惠活动");
      return;
    }
    if (mode === "referral" && !referrer) {
      setError("请选择推荐本次报名的老学员");
      return;
    }
    if (mode === "custom" && (!(Number(customValue) > 0) || !discountReason.trim())) {
      setError("请填写有效的优惠数值和优惠原因");
      return;
    }
    if (referrer?.id === student.id) {
      setError("报名学员不能同时作为自己的推荐人");
      return;
    }
    setBusyId(student.id);
    setError(null);
    setInfo(null);
    try {
      await enrollStudent({
        p_student_id: student.id,
        p_course_id: course.course_id,
        p_source: mode,
        p_price_id: priceId || null,
        p_campaign_id: mode === "campaign" || mode === "referral" ? campaignId : null,
        p_custom_discount_type: mode === "custom" ? customType : null,
        p_custom_discount_value: mode === "custom" ? Number(customValue) : null,
        p_discount_reason: mode === "custom" ? discountReason.trim() : null,
        p_referrer_student_id: mode === "referral" ? referrer?.id ?? null : null,
        p_notes: notes.trim() || null,
      });
      setInfo(`已为 ${student.name} 报课，应收 ${formatCurrency(quote.net)}，按实际上课逐节扣费`);
      setKeyword("");
      setResults([]);
      await onMutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
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
            <div className="mt-1 grid h-10 grid-cols-4 rounded-md border border-slate-200 bg-white p-0.5 text-xs">
              {([['normal', '正常'], ['campaign', '活动'], ['referral', '老带新'], ...(has("courses.pricing") ? [['custom', '自定义'] as const] : [])] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => chooseMode(value)} className={mode === value ? "rounded bg-brand-600 font-medium text-white" : "rounded text-slate-600 hover:bg-slate-50"}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {(mode === "campaign" || mode === "referral") && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              优惠活动
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none">
                <option value="">请选择活动</option>
                {availableCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
              {availableCampaigns.length === 0 && <span className="mt-1 block text-amber-600">当前没有适用于本课程的有效活动</span>}
            </label>
            {mode === "referral" && (
              <div className="relative text-xs font-medium text-slate-600">
                推荐老学员
                <input value={referrer ? `${referrer.name} · ${referrer.student_code ?? "无编号"}` : referrerKeyword} onChange={(e) => { setReferrer(null); setReferrerKeyword(e.target.value); }} placeholder="搜索姓名 / 手机号 / 学员编号" className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal focus:border-brand-500 focus:outline-none" />
                {referrerResults.length > 0 && <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">{referrerResults.map((student) => <button key={student.id} type="button" onClick={() => { setReferrer(student); setReferrerKeyword(""); }} className="flex w-full justify-between px-3 py-2 text-left text-sm font-normal hover:bg-slate-50"><span>{student.name}</span><span className="text-slate-400">{student.student_code ?? maskPhone(student.phone)}</span></button>)}</div>}
              </div>
            )}
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
          <QuoteItem label="报名课时" value={`${quote.totalLessons} 节${quote.giftLessons ? `（赠 ${quote.giftLessons}）` : ""}`} />
          <QuoteItem label="原价" value={formatCurrency(quote.gross)} />
          <QuoteItem label="优惠" value={`-${formatCurrency(quote.discount)}`} accent={quote.discount > 0} />
          <QuoteItem label="应收 / 实际课时单价" value={`${formatCurrency(quote.net)} / ${formatCurrency(quote.effectiveUnit)}`} strong />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="报名备注（可选）" className="mt-3 min-h-14 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><BadgePercent className="h-3.5 w-3.5" />报名仅锁定合同价格；余额将在实际到课时逐节扣除，余额不足会阻止消课。</div>
        {error && <div className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>}
        {info && <div className="mt-2 rounded bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{info}</div>}
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white">
        <div className="relative m-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按姓名 / 手机号 / 学员编号搜索报名学员" className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
        {!keyword.trim() && <div className="px-4 py-8 text-center text-sm text-slate-400">先确认上方价格，再搜索并选择学员</div>}
        {keyword.trim() && results.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">未找到匹配学员</div>}
        <ul className="divide-y divide-slate-100">
          {results.map((student) => {
            const duplicate = alreadyIn.has(student.id);
            return <li key={student.id} className="flex items-center gap-3 px-4 py-2.5"><div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs text-slate-500">{student.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm"><span className="font-medium text-slate-800">{student.name}</span><span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-500">{student.student_code ?? "—"}</span></div><div className="text-xs text-slate-500">{maskPhone(student.phone)} · {student.status}</div></div><button onClick={() => handleEnroll(student)} disabled={duplicate || busyId === student.id} className="inline-flex h-8 items-center gap-1 rounded-md bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:bg-slate-300"><UserPlus className="h-3.5 w-3.5" />{duplicate ? "已报名" : busyId === student.id ? "报名中…" : `确认报名 ${formatCurrency(quote.net)}`}</button></li>;
          })}
        </ul>
      </div>
    </div>
  );
}

function QuoteItem({ label, value, accent = false, strong = false }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return <div><div className="text-xs text-slate-400">{label}</div><div className={`mt-1 text-sm ${accent ? "text-emerald-600" : strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>{value}</div></div>;
}
