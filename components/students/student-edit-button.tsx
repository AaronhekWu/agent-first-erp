"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { updateStudent } from "@/lib/api/create";
import { isValidPhone } from "@/lib/format";
import { usePermissions } from "@/lib/auth/permissions-context";
import type { StudentDetail } from "@/lib/api/student-detail";
import type { Counselor, Department } from "@/lib/api/lookups";

export function StudentEditButton({
  detail,
  counselors,
  departments,
}: {
  detail: StudentDetail;
  counselors: Counselor[];
  departments: Department[];
}) {
  const { has } = usePermissions();
  const router = useRouter();
  const student = detail.student;
  const parents = [...detail.parents].sort((a, b) => Number(Boolean(b.is_primary_contact)) - Number(Boolean(a.is_primary_contact)));
  const primary = parents[0];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(student.name);
  const [gender, setGender] = useState(student.gender ?? "");
  const [birthDate, setBirthDate] = useState(student.birth_date ?? "");
  const [school, setSchool] = useState(student.school ?? "");
  const [grade, setGrade] = useState(student.grade ?? "");
  const [source, setSource] = useState(student.source ?? "");
  const [notes, setNotes] = useState(student.notes ?? "");
  const [counselorId, setCounselorId] = useState(student.assigned_to ?? "");
  const [departmentId, setDepartmentId] = useState(student.department_id ?? "");
  const [parentName, setParentName] = useState(primary?.name ?? "");
  const [parentRelation, setParentRelation] = useState(primary?.relationship ?? "");
  const [parentPhone1, setParentPhone1] = useState(parents[0]?.phone ?? "");
  const [parentPhone2, setParentPhone2] = useState(parents[1]?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!has("students.update")) return null;

  const submit = async () => {
    if (!name.trim()) return setError("学员姓名必填");
    if (!isValidPhone(parentPhone1) || !isValidPhone(parentPhone2)) {
      return setError("家长电话必须是 6-15 位数字");
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateStudent({
        p_student_id: student.id,
        p_name: name.trim(),
        p_gender: gender || null,
        p_birth_date: birthDate || null,
        p_school: school.trim() || null,
        p_grade: grade.trim() || null,
        p_source: source.trim() || null,
        p_notes: notes.trim() || null,
        p_assigned_to: counselorId || null,
        p_department_id: departmentId || null,
        p_parent_name: parentName.trim() || null,
        p_parent_relation: parentRelation || null,
        p_parent_phones: [parentPhone1.trim(), parentPhone2.trim()].filter(Boolean),
      });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"
      >
        <Pencil className="h-3.5 w-3.5" />
        修改学员信息
      </button>
      <Modal
        open={open}
        onClose={() => !submitting && setOpen(false)}
        title={`修改学员信息 · ${student.name}`}
        size="lg"
        footer={(
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-red-500">{error}</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={submitting} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm">
                取消
              </button>
              <button type="button" onClick={submit} disabled={submitting} className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50">
                {submitting ? "保存中…" : "保存修改"}
              </button>
            </div>
          </div>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="姓名" required>
            <input className={inputCls} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="性别">
            <select className={inputCls} value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="">未设置</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </Field>
          <Field label="出生日期">
            <input type="date" max={new Date().toISOString().slice(0, 10)} className={inputCls} value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
          </Field>
          <Field label="学校">
            <input className={inputCls} value={school} onChange={(event) => setSchool(event.target.value)} />
          </Field>
          <Field label="年级">
            <input className={inputCls} value={grade} onChange={(event) => setGrade(event.target.value)} />
          </Field>
          <Field label="来源">
            <input className={inputCls} value={source} onChange={(event) => setSource(event.target.value)} />
          </Field>
          <Field label="顾问">
            <select className={inputCls} value={counselorId} onChange={(event) => setCounselorId(event.target.value)}>
              <option value="">未分配</option>
              {counselors.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </select>
          </Field>
          <Field label="部门">
            <select className={inputCls} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">未分配</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field label="家长姓名">
            <input className={inputCls} value={parentName} onChange={(event) => setParentName(event.target.value)} />
          </Field>
          <Field label="家长关系">
            <select className={inputCls} value={parentRelation} onChange={(event) => setParentRelation(event.target.value)}>
              <option value="">未指定</option>
              <option value="father">爸爸</option>
              <option value="mother">妈妈</option>
              <option value="guardian">监护人</option>
              <option value="other">其他</option>
            </select>
          </Field>
          <Field label="家长电话 1">
            <PhoneInput value={parentPhone1} onChange={setParentPhone1} />
          </Field>
          <Field label="家长电话 2">
            <PhoneInput value={parentPhone2} onChange={setParentPhone2} />
          </Field>
          <Field label="备注" className="col-span-2">
            <textarea className={textareaCls} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
