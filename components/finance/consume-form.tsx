"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus } from "lucide-react";
import { Field, inputCls } from "@/components/ui/form";
import { StudentPicker } from "./student-picker";
import { consumeLesson } from "@/lib/api/create";
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
  const [unitPrice, setUnitPrice] = useState("");
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
          setUnitPrice(String(rows[0].unit_price));
        } else {
          setEnrollmentId("");
          setUnitPrice("");
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [student]);

  useEffect(() => {
    const e = enrollments.find((x) => x.id === enrollmentId);
    if (e) setUnitPrice(String(e.unit_price));
  }, [enrollmentId, enrollments]);

  const submit = async () => {
    if (!student) return setError("请选择学员");
    if (!enrollmentId) return setError("请选择课程");
    const n = Number(lessons);
    if (!n || n <= 0) return setError("课时数必须大于 0");
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const r = await consumeLesson({
        p_enrollment_id: enrollmentId,
        p_lesson_count: n,
        p_unit_price: Number(unitPrice) || null,
      });
      const amt = (r as { amount?: number } | null)?.amount ?? 0;
      setInfo(`已扣 ${n} 课时 (${formatCurrency(amt)})`);
      setLessons("1");
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="扣课时数" required>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
          />
        </Field>
        <Field label="单价 (¥) 默认沿用">
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </Field>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>}
      {info && <div className="rounded bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{info}</div>}
      <button
        onClick={submit}
        disabled={submitting}
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-red-500 px-5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
      >
        {submitting ? "扣减中…" : "确认消课"}
      </button>
    </div>
  );
}
