"use client";

import { ArrowUpDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Props {
  value: string;
  options: readonly { value: string; label: string }[];
  ariaLabel: string;
}

export function UrlSortSelect({ value, options, ariaLabel }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const changeSort = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "default") params.delete("sort");
    else params.set("sort", next);
    params.set("page", "1");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-500">
      <ArrowUpDown className="h-3.5 w-3.5" />
      <span className="whitespace-nowrap">排序</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => changeSort(event.target.value)}
        className="h-8 min-w-48 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
