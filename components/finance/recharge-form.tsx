"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { StudentPicker } from "./student-picker";
import { recharge } from "@/lib/api/create";
import { listActiveCourseOptions } from "@/lib/api/courses-client";
import { formatCurrency } from "@/lib/format";
import type { ActiveCourseOption, StudentSearchResult } from "@/lib/api/courses";

const PAY_METHODS = [
  { value: "shouqianba", label: "收钱吧" },
  { value: "digital_wallet", label: "支付宝/微信" },
  { value: "cash", label: "现金" },
  { value: "corporate_transfer", label: "对公转账" },
];

export function RechargeForm({ initialStudent = null }: { initialStudent?: StudentSearchResult | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [student, setStudent] = useState<StudentSearchResult | null>(initialStudent);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("shouqianba");
  const [bonus, setBonus] = useState("0");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courses, setCourses] = useState<ActiveCourseOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setStudent(initialStudent);
  }, [initialStudent]);

  useEffect(() => {
    void listActiveCourseOptions()
      .then(setCourses)
      .catch((caught) => setError((caught as Error).message));
  }, []);

  const clearStudentContext = () => {
    setStudent(null);
    if (!searchParams.has("student")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("student");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const submit = async () => {
    if (!student) return setError("请选择学员");
    const n = toMoney(Number(amount));
    if (!n || n <= 0) return setError("充值金额必须大于 0");
    if (!notes.trim()) return setError("充值用途或原因必填");
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await recharge({
        p_student_id: student.id,
        p_amount: n,
        p_payment_method: method,
        p_bonus_amount: toMoney(Number(bonus) || 0),
        p_payment_ref: ref.trim() || null,
        p_notes: notes.trim(),
        p_course_id: courseId || null,
      });
      setInfo(`已为 ${student.name} 充值 ${formatCurrency(n)}`);
      clearStudentContext();
      setAmount("");
      setBonus("0");
      setRef("");
      setNotes("");
      setCourseId("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Wallet className="h-4 w-4 text-emerald-500" />
        学员账户充值
      </div>
      <Field label="学员" required>
        <StudentPicker
          value={student}
          onChange={(next) => {
            if (next) setStudent(next);
            else clearStudentContext();
          }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="充值金额 (¥)" required>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="赠送金额 (¥)">
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
        </Field>
        <Field label="支付方式" required>
          <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="支付参考号">
          <input
            className={inputCls}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="如 微信交易号"
          />
        </Field>
        <Field label="充值用途课程">
          <select className={inputCls} value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">通用账户余额</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="充值用途 / 原因" required>
        <textarea
          className={textareaCls}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="如：中国舞 4 级班续费 / 补足追加报名预付款"
        />
      </Field>
      {error && <div className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>}
      {info && <div className="rounded bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{info}</div>}
      <button
        onClick={submit}
        disabled={submitting}
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting ? "提交中…" : "确认充值"}
      </button>
    </div>
  );
}

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
