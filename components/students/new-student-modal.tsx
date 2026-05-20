"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { createStudent } from "@/lib/api/create";
import { isValidPhone } from "@/lib/format";
import type { Counselor, Department } from "@/lib/api/students";

interface Props {
  open: boolean;
  onClose: () => void;
  counselors: Counselor[];
  departments: Department[];
}

export function NewStudentModal({ open, onClose, counselors, departments }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [source, setSource] = useState("");
  const [counselorId, setCounselorId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentRelation, setParentRelation] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setName("");
    setPhone("");
    setGender("");
    setSchool("");
    setGrade("");
    setSource("");
    setCounselorId("");
    setDepartmentId("");
    setParentName("");
    setParentPhone("");
    setParentRelation("");
    setNotes("");
    setError(null);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("INVALID_INPUT: 姓名必填");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("INVALID_INPUT: 学员手机号必须为 6-15 位数字");
      return;
    }
    if (!isValidPhone(parentPhone)) {
      setError("INVALID_INPUT: 家长手机号必须为 6-15 位数字");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createStudent({
        p_name: name.trim(),
        p_phone: phone.trim() || null,
        p_gender: gender || null,
        p_school: school.trim() || null,
        p_grade: grade.trim() || null,
        p_source: source.trim() || null,
        p_assigned_to: counselorId || null,
        p_department_id: departmentId || null,
        p_parent_name: parentName.trim() || null,
        p_parent_phone: parentPhone.trim() || null,
        p_parent_relation: parentRelation || null,
        p_notes: notes.trim() || null,
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
      title="新增学员"
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
              {submitting ? "提交中…" : "保存学员"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="姓名" required>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 王梓涵"
          />
        </Field>
        <Field label="手机号">
          <PhoneInput value={phone} onChange={setPhone} placeholder="138XXXXXXXX" />
        </Field>
        <Field label="性别">
          <select
            className={inputCls}
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <option value="">未设置</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </Field>
        <Field label="来源">
          <input
            className={inputCls}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="如 转介绍 / 地推 / 网络"
          />
        </Field>
        <Field label="学校">
          <input
            className={inputCls}
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="如 启明中学"
          />
        </Field>
        <Field label="年级">
          <input
            className={inputCls}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="如 高二"
          />
        </Field>
        <Field label="顾问">
          <select
            className={inputCls}
            value={counselorId}
            onChange={(e) => setCounselorId(e.target.value)}
          >
            <option value="">未分配</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="部门">
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
        <Field label="家长姓名">
          <input
            className={inputCls}
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="如 王爸"
          />
        </Field>
        <Field label="家长手机号">
          <PhoneInput value={parentPhone} onChange={setParentPhone} placeholder="138XXXXXXXX" />
        </Field>
        <Field label="家长关系">
          <select
            className={inputCls}
            value={parentRelation}
            onChange={(e) => setParentRelation(e.target.value)}
          >
            <option value="">未指定</option>
            <option value="father">爸爸</option>
            <option value="mother">妈妈</option>
            <option value="other">其他</option>
          </select>
        </Field>
        <Field label="备注" className="col-span-2">
          <textarea
            className={textareaCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="任何对顾问有帮助的信息"
          />
        </Field>
      </div>
    </Modal>
  );
}
