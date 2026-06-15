"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert, LogOut } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/**
 * 已登录但 未分配角色 / 账号停用 的过渡页.
 * 此类用户在 DB 层 RLS 下无任何数据访问权, 须由管理员在「员工管理」分配角色后方可使用.
 */
export function PendingApproval({
  name,
  reason,
}: {
  name: string;
  reason: "norole" | "inactive";
}) {
  const router = useRouter();

  async function onSignOut() {
    await getSupabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-500">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">
          {reason === "inactive" ? "账号已停用" : "账号待分配权限"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {name}，
          {reason === "inactive"
            ? "您的账号已被停用，请联系管理员。"
            : "您的账号已创建，但尚未分配角色。请联系管理员在「员工管理」中为您分配权限后再使用。"}
        </p>
        <button
          onClick={onSignOut}
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>
    </div>
  );
}
