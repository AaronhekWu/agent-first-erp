"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

export function Tabs({
  tabs,
  defaultActiveKey,
  queryParam,
}: {
  tabs: Tab[];
  defaultActiveKey?: string;
  queryParam?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialKey = tabs.some((tab) => tab.key === defaultActiveKey)
    ? defaultActiveKey
    : tabs[0]?.key;
  const [active, setActive] = useState(initialKey);
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];

  useEffect(() => {
    if (defaultActiveKey && tabs.some((tab) => tab.key === defaultActiveKey)) {
      setActive(defaultActiveKey);
    }
  }, [defaultActiveKey]);

  const selectTab = (key: string) => {
    setActive(key);
    if (!queryParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(queryParam, key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="rounded-2xl bg-white shadow-card">
      <div className="flex items-center gap-1 border-b border-slate-100 px-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={cn(
              "relative px-4 py-3 text-sm transition-colors",
              t.key === active
                ? "font-medium text-brand-600"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
            {t.key === active && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-brand-600" />
            )}
          </button>
        ))}
      </div>
      <div className="px-5 py-4">{cur?.content}</div>
    </div>
  );
}
