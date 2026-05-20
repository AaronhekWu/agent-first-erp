"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { StudentPicker } from "./student-picker";
import { recharge } from "@/lib/api/create";
import { formatCurrency } from "@/lib/format";
import type { StudentSearchResult } from "@/lib/api/courses";

const PAY_METHODS = [
  { value: "wechat", label: "微信" },
  { value: "alipay", label: "支付宝" },
  { value: "cash", label: "现金" },
  { value: "bank_transfer", label: "银行转账" },
  { value: "other", label: "其他" },
];

export function RechargeForm() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("wechat");
  const [bonus, setBonus] = useState("0");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    if (!student) return setError("请选择学员");
    const n = Number(amount);
    if (!n || n <= 0) return setError("充值金额必须大于 0");
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await recharge({
        p_student_id: student.id,
        p_amount: n,
        p_payment_method: method,
        p_bonus_amount: Number(bonus) || 0,
        p_payment_ref: ref.trim() || null,
        p_notes: notes.trim() || null,
      });
      setInfo(`已为 ${student.name} 充值 ${formatCurrency(n)}`);
      setStudent(null);
      setAmount("");
      setBonus("0");
      setRef("");
      setNotes("");
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
        <StudentPicker value={student} onChange={setStudent} />
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
      </div>
      <Field label="备注">
        <textarea className={textareaCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
