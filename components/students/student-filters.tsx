"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { Counselor, Department } from "@/lib/api/students";

interface Props {
  counselors: Counselor[];
  departments: Department[];
  schools: string[];
  grades: string[];
}

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "active", label: "在读" },
  { value: "inactive", label: "停课" },
  { value: "graduated", label: "已毕业" },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const baseInputCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-100";

export function StudentFilters({
  counselors,
  departments,
  schools,
  grades,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [keyword, setKeyword] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [counselorId, setCounselorId] = useState(sp.get("counselor") ?? "");
  const [school, setSchool] = useState(sp.get("school") ?? "");
  const [grade, setGrade] = useState(sp.get("grade") ?? "");
  const [departmentId, setDepartmentId] = useState(sp.get("dept") ?? "");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  const apply = () => {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (status) params.set("status", status);
    if (counselorId) params.set("counselor", counselorId);
    if (school) params.set("school", school);
    if (grade) params.set("grade", grade);
    if (departmentId) params.set("dept", departmentId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", "1");
    router.push(`/students?${params.toString()}`);
  };

  const reset = () => {
    setKeyword("");
    setStatus("");
    setCounselorId("");
    setSchool("");
    setGrade("");
    setDepartmentId("");
    setFrom("");
    setTo("");
    router.push("/students");
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="关键词">
          <div className="relative">
            <input
              className={`${baseInputCls} pl-9`}
              placeholder="姓名 / 手机号"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </Field>

        <Field label="状态">
          <select
            className={baseInputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="顾问">
          <select
            className={baseInputCls}
            value={counselorId}
            onChange={(e) => setCounselorId(e.target.value)}
          >
            <option value="">全部顾问</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="学校">
          <select
            className={baseInputCls}
            value={school}
            onChange={(e) => setSchool(e.target.value)}
          >
            <option value="">全部学校</option>
            {schools.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="年级">
          <select
            className={baseInputCls}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            <option value="">全部年级</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="部门">
          <select
            className={baseInputCls}
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">全部部门</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="创建时间">
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={baseInputCls}
              placeholder="开始日期"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-slate-400">~</span>
            <input
              type="date"
              className={baseInputCls}
              placeholder="结束日期"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </Field>

        <div className="md:col-span-2 lg:col-span-1" />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={apply}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Search className="h-4 w-4" />
          搜索
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" />
          重置
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
        >
          <SlidersHorizontal className="h-4 w-4" />
          高级筛选
        </button>
        <span className="ml-1 text-xs text-slate-400">
          支持后台常用模糊搜索：输入 &ldquo;王&rdquo; 可匹配 &ldquo;王A&rdquo;
        </span>
      </div>
    </div>
  );
}
