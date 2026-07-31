"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus } from "lucide-react";
import { Field, inputCls } from "@/components/ui/form";
import { StudentPicker } from "./student-picker";
import { requestApproval } from "@/lib/api/approvals-client";
import { listActiveEnrollmentsClient } from "@/lib/api/finance-client";
import type { ActiveEnrollment } from "@/lib/api/finance";
import { formatCurrency } from "@/lib/format";
import type { StudentSearchResult } from "@/lib/api/courses";

export function ConsumeForm() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [enrollments, setEnrollments] = useState<ActiveEnrollment[]>([]);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [lessons, setLessons] = useState("1");
  const [consumeDate, setConsumeDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!student) {
      setEnrollments([]);
      setEnrollmentId("");
      return;
    }
    void (async () => {
      try {
        const rows = await listActiveEnrollmentsClient(student.id);
        setEnrollments(rows);
        if (rows[0]) {
          setEnrollmentId(rows[0].id);
        } else {
          setEnrollmentId("");
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [student]);

  const submit = async () => {
    if (!student) return setError("请选择学员");
    if (!enrollmentId) return setError("请选择课程");
    const n = Number(lessons);
    if (!n || n <= 0 || !Number.isInteger(n * 2)) return setError("课时数必须大于 0 并按 0.5 递增");
    if (!consumeDate) return setError("请选择消课日期");
    if (!reason.trim()) return setError("请填写手动消课原因");
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const enrollment = enrollments.find((item) => item.id === enrollmentId);
      const amount = n * Number(enrollment?.unit_price ?? 0);
      await requestApproval({
        type: "finance_consume",
        title: `手动消课审批：${student.name}`,
        reason: reason.trim(),
        targetId: enrollmentId,
        targetLabel: `${student.name} · ${enrollment?.course_name ?? "课程"}`,
        amount,
        payload: {
          p_enrollment_id: enrollmentId,
          p_lesson_count: n,
          p_unit_price: null,
          p_consume_date: consumeDate,
          p_reason: reason.trim(),
        },
      });
      setInfo(`已提交审批：${n} 课时（预计 ${formatCurrency(amount)}），通过后才会扣减`);
      setLessons("1");
      setReason("");
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
        <Minus className="h-4 w-4 text-red-500" />
        手动消课
      </div>
      <Field label="学员" required>
        <StudentPicker value={student} onChange={setStudent} />
      </Field>
      {student && (
        <Field label="课程" required>
          <select
            className={inputCls}
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
          >
            <option value="">选择课程</option>
            {enrollments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.course_name} (剩 {e.remaining_lessons ?? "∞"} × ¥{e.unit_price})
              </option>
            ))}
          </select>
        </Field>
      )}
      <div>
        <Field label="扣课时数" required>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className={inputCls}
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
          />
        </Field>
        {Number(lessons) % 1 !== 0 && (
          <p className="mt-1 text-xs text-amber-600">0.5 课时属于异常调整，必须在右侧填写具体原因并进入审批。</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="消课日期" required>
          <input type="date" className={inputCls} value={consumeDate} onChange={(event) => setConsumeDate(event.target.value)} />
        </Field>
        <Field label="消课原因" required>
          <input className={inputCls} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="如：补录 7 月 20 日课程" />
        </Field>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>}
      {info && <div className="rounded bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{info}</div>}
      <button
        onClick={submit}
        disabled={submitting}
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-red-500 px-5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
      >
        {submitting ? "提交中…" : "提交消课审批"}
      </button>
    </div>
  );
}
