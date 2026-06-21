import Link from "next/link";
import { ArrowUpRight, BookOpen, Building2, Search, SearchX, UserRound, Users } from "lucide-react";
import { globalSearch, type GlobalSearchGroup, type SearchKind } from "@/lib/api/global-search";
import { UrlListPagination } from "@/components/ui/url-list-pagination";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { q?: string; type?: string; page?: string; pageSize?: string };
}

const SEARCH_TYPES: Array<{ key: "all" | SearchKind; label: string }> = [
  { key: "all", label: "全部" },
  { key: "student", label: "学员" },
  { key: "course", label: "课程" },
  { key: "staff", label: "员工与顾问" },
  { key: "department", label: "部门" },
];

const GROUP_ICONS = {
  student: UserRound,
  course: BookOpen,
  staff: Users,
  department: Building2,
} satisfies Record<SearchKind, typeof UserRound>;

export default async function SearchPage({ searchParams }: PageProps) {
  const query = (searchParams.q ?? "").trim();
  const selectedType = SEARCH_TYPES.some((item) => item.key === searchParams.type)
    ? (searchParams.type as "all" | SearchKind)
    : "all";
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const requestedPageSize = Number(searchParams.pageSize ?? "15");
  const pageSize = [15, 30, 45, 60, 75, 90].includes(requestedPageSize) ? requestedPageSize : 15;
  const offset = selectedType === "all" ? 0 : (page - 1) * pageSize;
  const result = await globalSearch(query, pageSize, offset);
  const visibleGroups = selectedType === "all"
    ? result.groups
    : result.groups.filter((group) => group.kind === selectedType);
  const selectedGroup = selectedType === "all" ? null : visibleGroups[0];

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Search className="h-5 w-5 text-brand-500" />
          全局搜索
        </h1>
        <p className="mt-1 text-sm text-slate-500">搜索学员、课程、员工、顾问和部门。</p>
      </div>

      <div className="border-b border-slate-200">
        <nav className="flex flex-wrap gap-1">
          {SEARCH_TYPES.map((item) => {
            const count = item.key === "all"
              ? result.total
              : result.groups.find((group) => group.kind === item.key)?.total ?? 0;
            const params = new URLSearchParams({ q: query });
            if (item.key !== "all") params.set("type", item.key);
            return (
              <Link
                key={item.key}
                href={`/search?${params.toString()}`}
                className={cn(
                  "border-b-2 px-4 py-2.5 text-sm",
                  selectedType === item.key
                    ? "border-brand-500 font-medium text-brand-600"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {item.label} <span className="ml-1 tabular-nums text-xs text-slate-400">{count}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {!query ? (
        <EmptyState title="输入关键词开始搜索" description="可搜索姓名、编号、手机号、课程名称、学科、员工或部门。" />
      ) : result.total === 0 ? (
        <EmptyState title={`没有找到“${query}”`} description="请尝试更短的关键词，或检查名称和编号。" />
      ) : (
        <div className="space-y-5">
          <div className="text-sm text-slate-500">
            关键词 <span className="font-medium text-slate-800">「{query}」</span>，共找到 {result.total} 条结果
          </div>
          {visibleGroups.map((group) => <ResultGroup key={group.kind} group={group} query={query} showAllLink={selectedType === "all"} />)}
          {selectedGroup && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <UrlListPagination page={page} pageSize={pageSize} totalItems={selectedGroup.total} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ group, query, showAllLink }: { group: GlobalSearchGroup; query: string; showAllLink: boolean }) {
  const Icon = GROUP_ICONS[group.kind];
  if (group.total === 0) return null;
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4 text-brand-500" />
          {group.label}
          <span className="font-normal tabular-nums text-slate-400">{group.total}</span>
        </h2>
        {showAllLink && group.total > group.items.length && (
          <Link href={`/search?q=${encodeURIComponent(query)}&type=${group.kind}`} className="text-xs text-brand-600 hover:text-brand-700">
            查看全部
          </Link>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {group.items.map((item) => (
          <Link key={`${item.kind}-${item.id}`} href={item.href} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{item.title}</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{item.subtitle}</div>
            </div>
            {item.meta && <div className="hidden shrink-0 text-xs text-slate-500 sm:block">{item.meta}</div>}
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="py-20 text-center">
      <SearchX className="mx-auto h-8 w-8 text-slate-300" />
      <div className="mt-3 text-sm font-medium text-slate-700">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{description}</div>
    </div>
  );
}
