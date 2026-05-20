import { Construction } from "lucide-react";

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-6">
      <div className="rounded-2xl bg-white p-12 shadow-card">
        <div className="flex flex-col items-center text-center">
          <Construction className="h-10 w-10 text-amber-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-800">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">该模块即将上线，敬请期待</p>
        </div>
      </div>
    </div>
  );
}
