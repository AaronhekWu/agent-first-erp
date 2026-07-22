"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Field, inputCls, textareaCls } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { createStudent, enrollStudent } from "@/lib/api/create";
import { listActiveCourseOptions } from "@/lib/api/courses-client";
import type { ActiveCourseOption } from "@/lib/api/courses";
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
  const [birthDate, setBirthDate] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [source, setSource] = useState("");
  const [counselorId, setCounselorId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentRelation, setParentRelation] = useState("");
  const [notes, setNotes] = useState("");
  const [courses, setCourses] = useState<ActiveCourseOption[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const teachingDepartmentId = useMemo(
    () => departments.find((department) => department.name.trim() === "教学部")?.id ?? "",
    [departments],
  );

  useEffect(() => {
    if (!open) return;
    if (!departmentId && teachingDepartmentId) setDepartmentId(teachingDepartmentId);
    void listActiveCourseOptions()
      .then(setCourses)
      .catch((caught) => setError((caught as Error).message));
  }, [open, departmentId, teachingDepartmentId]);

  const reset = () => {
    setName("");
    setPhone("");
    setGender("");
    setBirthDate("");
    setSchool("");
    setGrade("");
    setSource("");
    setCounselorId("");
    setDepartmentId(teachingDepartmentId);
    setParentName("");
    setParentPhone("");
    setParentRelation("");
    setNotes("");
    setSelectedCourseIds([]);
    setError(null);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("姓名必填");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("学员手机号必须为 6-15 位数字");
      return;
    }
    if (!isValidPhone(parentPhone)) {
      setError("家长手机号必须为 6-15 位数字");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createStudent({
        p_name: name.trim(),
        p_phone: phone.trim() || null,
        p_gender: gender || null,
        p_birth_date: birthDate || null,
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
      const studentId = (created as { student_id?: string } | null)?.student_id;
      let failedEnrollments = 0;
      if (studentId && selectedCourseIds.length > 0) {
        const results = await Promise.allSettled(
          selectedCourseIds.map((courseId) => enrollStudent({
            p_student_id: studentId,
            p_course_id: courseId,
          })),
        );
        failedEnrollments = results.filter((result) => result.status === "rejected").length;
      }
      reset();
      onClose();
      router.refresh();
      if (failedEnrollments > 0) {
        alert(`学员已创建，其中 ${failedEnrollments} 门课程报名失败，请到学员详情补录。`);
      }
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
            placeholder=""
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
        <Field label="出生日期">
          <input
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            className={inputCls}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
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
            disabled
          >
            <option value="">教学部（系统统一）</option>
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
            placeholder=""
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
            <option value="grandpa_paternal">爷爷</option>
            <option value="grandma_paternal">奶奶</option>
            <option value="grandpa_maternal">外公</option>
            <option value="grandma_maternal">外婆</option>
            <option value="brother">哥哥</option>
            <option value="sister">姐姐</option>
            <option value="uncle">叔叔/舅舅</option>
            <option value="aunt">姑姑/阿姨</option>
            <option value="guardian">其他监护人</option>
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
        <Field label="同时报名课程（可多选）" className="col-span-2">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {courses.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-slate-400">暂无可报名课程</div>
            ) : courses.map((course) => {
              const checked = selectedCourseIds.includes(course.id);
              return (
                <label key={course.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedCourseIds((current) => checked
                      ? current.filter((id) => id !== course.id)
                      : [...current, course.id])}
                  />
                  <span className="font-medium text-slate-700">{course.name}</span>
                  <span className="text-xs text-slate-400">{course.subject ?? "未设学科"} · {course.level ?? "未设年级"}</span>
                </label>
              );
            })}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
