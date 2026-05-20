"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { createFollowup } from "@/lib/api/create";

const TYPES = [
  { value: "phone", label: "电话" },
  { value: "wechat", label: "微信" },
  { value: "visit", label: "面谈" },
  { value: "other", label: "其他" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  onSaved: () => Promise<void>;
}

export function NewFollowupModal({ open, onClose, studentId, studentName, onSaved }: Props) {
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("phone");
  const [content, setContent] = useState("");
  const [result, setResult] = useState("");
  const [nextPlan, setNextPlan] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setType("phone");
    setContent("");
    setResult("");
    setNextPlan("");
    setNextDate("");
    setError(null);
  };

  const submit = async () => {
    if (!content.trim()) {
      setError("跟进内容必填");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createFollowup({
        p_student_id: studentId,
        p_type: type,
        p_content: content.trim(),
        p_result: result.trim() || null,
        p_next_plan: nextPlan.trim() || null,
        p_next_date: nextDate ? new Date(nextDate).toISOString() : null,
      });
      reset();
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && (reset(), onClose())}
      title={`新增跟进 — ${studentName}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-red-500">{error}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={submitting}
              className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="跟进类型" required>
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="结果">
          <input
            className={inputCls}
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="如 已联系 / 未接通"
          />
        </Field>
        <Field label="跟进内容" required className="col-span-2">
          <textarea
            className={textareaCls}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="家长反馈 / 学员动态 / 问题"
          />
        </Field>
        <Field label="下次计划" className="col-span-2">
          <input
            className={inputCls}
            value={nextPlan}
            onChange={(e) => setNextPlan(e.target.value)}
            placeholder="如 下周一确认报名"
          />
        </Field>
        <Field label="下次跟进时间">
          <input
            type="datetime-local"
            className={inputCls}
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
