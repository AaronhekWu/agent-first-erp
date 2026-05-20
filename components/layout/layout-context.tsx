"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface LayoutCtx {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const Ctx = createContext<LayoutCtx | null>(null);

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("sidebar.collapsed");
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("sidebar.collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });

  return (
    <Ctx.Provider value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
  return ctx;
}
