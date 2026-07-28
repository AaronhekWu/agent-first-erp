"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { StudentPicker } from "./student-picker";
import { requestApproval } from "@/lib/api/approvals-client";
import { formatCurrency } from "@/lib/format";
import { listActiveCourseOptions } from "@/lib/api/courses-client";
import type { ActiveCourseOption, StudentSearchResult } from "@/lib/api/courses";

export function RefundForm() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courses, setCourses] = useState<ActiveCourseOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void listActiveCourseOptions()
      .then(setCourses)
      .catch((caught) => setError((caught as Error).message));
  }, []);

  const submit = async () => {
    if (!student) return setError("请选择学员");
    const n = Number(amount);
    if (!n || n <= 0) return setError("退费金额必须大于 0");
    if (!reason.trim()) return setError("退费理由必填");
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await requestApproval({
        type: "finance_refund",
        title: `退费审批：${student.name}`,
        reason: reason.trim(),
        targetId: student.id,
        targetLabel: student.name,
        amount: n,
        payload: {
          p_student_id: student.id,
          p_amount: n,
          p_reason: reason.trim(),
          p_course_id: courseId || null,
        },
      });
      setInfo(`已提交 ${student.name} 的退费审批 ${formatCurrency(n)}`);
      setStudent(null);
      setAmount("");
      setReason("");
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
        <Undo2 className="h-4 w-4 text-amber-500" />
        学员账户退费
      </div>
      <Field label="学员" required>
        <StudentPicker value={student} onChange={setStudent} />
      </Field>
      <Field label="退费金额 (¥)" required>
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
      <Field label="关联课程">
        <select className={inputCls} value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          <option value="">非课程可用余额</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>{course.name}</option>
          ))}
        </select>
      </Field>
      {student && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          当前总余额 {formatCurrency(student.balance ?? 0)}；可退余额{" "}
          <span className="font-medium text-slate-800">
            {formatCurrency(student.available_balance ?? student.balance ?? 0)}
          </span>
          。课程已锁定的预付款不能直接退费，请先办理退课。
        </div>
      )}
      <Field label="退费理由" required>
        <textarea
          className={textareaCls}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="如 学员退学 / 重复充值"
        />
      </Field>
      {error && <div className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>}
      {info && <div className="rounded bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{info}</div>}
      <button
        onClick={submit}
        disabled={submitting}
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-amber-500 px-5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {submitting ? "提交中…" : "提交退费审批"}
      </button>
    </div>
  );
}
