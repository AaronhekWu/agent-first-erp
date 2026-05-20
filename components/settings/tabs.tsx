"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

export function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="rounded-2xl bg-white shadow-card">
      <div className="flex items-center gap-1 border-b border-slate-100 px-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
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
