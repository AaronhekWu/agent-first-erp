"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { searchStudents } from "@/lib/api/courses-client";
import type { StudentSearchResult } from "@/lib/api/courses";
import { maskPhone } from "@/lib/format";

interface Props {
  value: StudentSearchResult | null;
  onChange: (s: StudentSearchResult | null) => void;
  placeholder?: string;
}

export function StudentPicker({ value, onChange, placeholder }: Props) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchStudents(keyword.trim(), 8);
        if (!cancel) setResults(r);
      } catch {}
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [keyword]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <div className="text-sm font-medium text-slate-800">{value.name}</div>
          <div className="text-xs text-slate-500">
            {value.student_code ?? "—"} · {maskPhone(value.phone)} · {value.status}
          </div>
        </div>
        <button onClick={() => onChange(null)} className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-200">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={keyword}
        onChange={(e) => {
          setKeyword(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "搜索学员（姓名 / 手机 / 编号）"}
        className="h-9 w-full rounded border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
      />
      {open && keyword.trim() && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400">无匹配结果</div>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s);
                  setKeyword("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm font-medium text-slate-800">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.student_code ?? "—"} · {maskPhone(s.phone)}
                  </div>
                </div>
                <span className="text-[11px] text-slate-400">{s.status}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
