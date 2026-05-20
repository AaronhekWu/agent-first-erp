import { Tabs } from "@/components/settings/tabs";
import { ProfileForm } from "@/components/settings/profile-form";
import { CompanyForm } from "@/components/settings/company-form";
import { getCompany } from "@/lib/api/company";
import { listStaff } from "@/lib/api/campus";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [company, staff] = await Promise.all([getCompany(), listStaff()]);
  // 登录尚未接入：暂用第一位活跃员工作为"当前账户"占位
  const current = staff.find((s) => s.is_active) ?? null;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">系统设置</h1>
        <p className="mt-1 text-sm text-slate-500">
          维护个人账户与公司机构信息。组织架构请前往「校区管理」。
        </p>
      </div>

      <Tabs
        tabs={[
          {
            key: "profile",
            label: "个人信息",
            content: (
              <ProfileForm
                current={
                  current
                    ? {
                        id: current.id,
                        display_name: current.display_name,
                        phone: current.phone,
                        email: current.email,
                        primary_role: current.primary_role,
                      }
                    : null
                }
              />
            ),
          },
          {
            key: "company",
            label: "公司信息",
            content: <CompanyForm company={company} />,
          },
        ]}
      />
    </div>
  );
}
