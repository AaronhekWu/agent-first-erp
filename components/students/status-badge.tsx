import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; cls: string }> = {
  active: {
    label: "在读",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  inactive: {
    label: "已停用",
    cls: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  graduated: {
    label: "已毕业",
    cls: "bg-blue-50 text-blue-700 ring-blue-200",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const it = MAP[status] ?? { label: status, cls: "bg-slate-100 text-slate-600 ring-slate-200" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        it.cls,
      )}
    >
      {it.label}
    </span>
  );
}
