"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { enrollStudent } from "@/lib/api/create";
import { searchStudents } from "@/lib/api/courses-client";
import type { CourseEnrollment, CourseRow, StudentSearchResult } from "@/lib/api/courses";
import { maskPhone } from "@/lib/format";

interface Props {
  course: CourseRow;
  enrollments: CourseEnrollment[];
  onMutate: () => Promise<void>;
}

export function EnrollTab({ course, enrollments, onMutate }: Props) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const alreadyIn = new Set(enrollments.map((e) => e.student_id));

  useEffect(() => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const rows = await searchStudents(keyword.trim(), 12);
        if (!cancelled) setResults(rows);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [keyword]);

  const handleEnroll = async (s: StudentSearchResult) => {
    setBusyId(s.id);
    setError(null);
    setInfo(null);
    try {
      await enrollStudent({ p_student_id: s.id, p_course_id: course.course_id, p_source: "manual" });
      setInfo(`已为 ${s.name} 报课`);
      await onMutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="rounded-lg bg-slate-50 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按姓名 / 手机号 / 学员编号搜索"
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        {error && <div className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>}
        {info && <div className="mt-2 rounded bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{info}</div>}
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white">
        {keyword.trim() === "" && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">输入关键词搜索学员</div>
        )}
        {keyword.trim() !== "" && results.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">未找到匹配学员</div>
        )}
        <ul className="divide-y divide-slate-100">
          {results.map((s) => {
            const dup = alreadyIn.has(s.id);
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs text-slate-500">
                  {s.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{s.name}</span>
                    <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-500">
                      {s.student_code ?? "—"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{maskPhone(s.phone)} · {s.status}</div>
                </div>
                <button
                  onClick={() => handleEnroll(s)}
                  disabled={dup || busyId === s.id}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:bg-slate-300"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {dup ? "已报名" : busyId === s.id ? "报名中…" : "报课"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
