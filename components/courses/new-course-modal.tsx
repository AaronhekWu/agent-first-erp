"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { createCourse } from "@/lib/api/create";
import type { Department } from "@/lib/api/students";

interface Props {
  open: boolean;
  onClose: () => void;
  departments: Department[];
}

const WEEKDAYS = [
  { v: "mon", label: "周一" },
  { v: "tue", label: "周二" },
  { v: "wed", label: "周三" },
  { v: "thu", label: "周四" },
  { v: "fri", label: "周五" },
  { v: "sat", label: "周六" },
  { v: "sun", label: "周日" },
];

export function NewCourseModal({ open, onClose, departments }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [fee, setFee] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState("18:00-20:00");

  const toggleDay = (d: string) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const reset = () => {
    setName("");
    setSubject("");
    setLevel("");
    setDescription("");
    setCapacity("20");
    setFee("0");
    setStartDate("");
    setEndDate("");
    setDepartmentId("");
    setDays([]);
    setTime("18:00-20:00");
    setError(null);
  };

  const submit = async () => {
    if (!name.trim() || !subject.trim() || !level.trim()) {
      setError("课程名 / 学科 / 年级 必填");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createCourse({
        p_name: name.trim(),
        p_subject: subject.trim(),
        p_level: level.trim(),
        p_description: description.trim() || null,
        p_max_capacity: capacity ? Number(capacity) : null,
        p_fee: fee ? Number(fee) : null,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_department_id: departmentId || null,
        p_schedule_info:
          days.length > 0 ? { weekdays: days, time } : null,
      });
      reset();
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) {
          reset();
          onClose();
        }
      }}
      title="新增课程"
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
              {submitting ? "提交中…" : "创建课程"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="课程名" required className="col-span-2">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 高一数学一对一精品班"
          />
        </Field>
        <Field label="学科" required>
          <input
            className={inputCls}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="数学 / 物理 / 英语 …"
          />
        </Field>
        <Field label="年级 / 级别" required>
          <input
            className={inputCls}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="高一 / 初三 / K2 …"
          />
        </Field>
        <Field label="班级容量">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </Field>
        <Field label="课程费用 (¥)">
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </Field>
        <Field label="开始日期">
          <input
            type="date"
            className={inputCls}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="结束日期">
          <input
            type="date"
            className={inputCls}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        <Field label="部门" className="col-span-2">
          <select
            className={inputCls}
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">未指定</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="上课星期" className="col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w) => {
              const active = days.includes(w.v);
              return (
                <button
                  key={w.v}
                  type="button"
                  onClick={() => toggleDay(w.v)}
                  className={`h-8 rounded-md border px-3 text-xs transition ${
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="上课时段" className="col-span-2">
          <input
            className={inputCls}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="18:00-20:00"
          />
        </Field>
        <Field label="课程描述" className="col-span-2">
          <textarea
            className={textareaCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="教学大纲 / 主讲教师 / 特色…"
          />
        </Field>
      </div>
    </Modal>
  );
}
