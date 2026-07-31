import Link from "next/link";
import { Users, ArrowRight, Bot } from "lucide-react";
import { AccountManager } from "@/components/settings/account-manager";
import { CompanyForm } from "@/components/settings/company-form";
import { getCompany } from "@/lib/api/company";
import { listStaff } from "@/lib/api/campus";
import { listStudents } from "@/lib/api/students";
import { getMe } from "@/lib/auth/me";
import { hasServerPermission } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { AiEdgeStatus } from "@/components/settings/ai-edge-status";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await getMe();
  if (!hasServerPermission(me, "settings.manage")) redirect("/dashboard");
  const meId = me?.user.id ?? null;
  const isAdmin = me?.user.primary_role === "admin";

  // 公司信息仅管理员需要; 员工档案对非管理员可能受 RLS 限制, 容错处理
  const [company, staff] = await Promise.all([
    isAdmin ? getCompany().catch(() => null) : Promise.resolve(null),
    listStaff().catch(() => []),
  ]);

  // 当前账号: 优先用登录用户匹配员工档案, 回退到登录基础信息
  const staffRow = meId ? staff.find((s) => s.id === meId) ?? null : null;
  const current = meId
    ? {
        id: meId,
        display_name: staffRow?.display_name ?? me!.user.display_name,
        phone: staffRow?.phone ?? null,
        email: staffRow?.email ?? me!.user.email ?? null,
        primary_role: me!.user.primary_role,
        department_id: staffRow?.department_id ?? null,
      }
    : null;

  // 名下学员 (作为顾问/负责人)
  const myStudents = meId
    ? await listStudents({ counselorId: meId }, 1, 6)
    : { rows: [], total: 0 };

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">账号管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          维护本人账号资料与登录密码{isAdmin ? "，并管理公司机构信息" : ""}。组织架构请前往「校区管理」。
        </p>
      </div>

      <AccountManager current={current} />

      <section className="rounded-2xl bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet-50 text-violet-600"><Bot className="h-5 w-5" /></div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-800">AI 分析服务</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">用于学员知识图谱分析、推进话术、充值沟通建议与校区经营分析。密钥仅由 Edge Function 从 API_KEY 读取，不会进入网页或应用服务器。</p>
            <AiEdgeStatus />
          </div>
        </div>
      </section>

      {/* 名下学员 */}
      <section className="rounded-2xl bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Users className="h-4 w-4 text-brand-500" />
            我的学员
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              共 {myStudents.total} 名
            </span>
          </div>
          {meId && myStudents.total > 0 && (
            <Link
              href={`/students?counselor=${meId}`}
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
            >
              查看全部
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        {myStudents.total === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">当前账号名下暂无学员</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {myStudents.rows.map((s) => (
              <Link
                key={s.id}
                href={`/students/${s.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs text-slate-500">
                  {s.name.slice(0, 1)}
                </span>
                {s.name}
              </Link>
            ))}
            {myStudents.total > myStudents.rows.length && (
              <span className="inline-flex items-center px-2 text-sm text-slate-400">
                等 {myStudents.total} 名…
              </span>
            )}
          </div>
        )}
      </section>

      {/* 公司信息 (仅管理员) */}
      {isAdmin && (
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <CompanyForm company={company} />
        </section>
      )}
    </div>
  );
}
