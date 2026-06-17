import Link from "next/link";
import { Search } from "lucide-react";
import { listStudents, type StudentFilters } from "@/lib/api/students";
import { maskPhone, formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { q?: string };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const q = (searchParams.q ?? "").trim();
  const filters: StudentFilters = { keyword: q };
  const result = q ? await listStudents(filters, 1, 30) : { rows: [], total: 0 };

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Search className="h-5 w-5 text-brand-500" />
          全局搜索
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          当前已接入学员搜索，课程、财务与审批搜索将在对应数据源稳定后合并。
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
          {q ? (
            <>
              关键词 <span className="font-medium text-slate-900">「{q}」</span> · 找到{" "}
              <span className="font-medium text-slate-900">{result.total}</span> 条学员结果
            </>
          ) : (
            "从顶部搜索框输入关键词后查看结果"
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {q && result.rows.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-slate-400">暂无匹配结果</div>
          )}
          {result.rows.map((student) => (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className="grid gap-3 px-5 py-4 hover:bg-slate-50 md:grid-cols-[1fr_180px_160px]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{student.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                    {student.student_code ?? "—"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {maskPhone(student.phone)} · {student.school ?? "未填写学校"} · {student.grade ?? "未填写年级"}
                </div>
              </div>
              <div className="text-sm text-slate-600">
                顾问：{student.counselor_name ?? "—"}
              </div>
              <div className="text-sm text-amber-600 md:text-right">
                余额 {formatCurrency(student.balance)}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
