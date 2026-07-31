import { listDepartmentsDetail, listStaff } from "@/lib/api/campus";
import { Tabs } from "@/components/settings/tabs";
import { DepartmentTree } from "@/components/campus/department-tree";
import { StaffTable } from "@/components/campus/staff-table";
import { getMe } from "@/lib/auth/me";
import { hasServerPermission } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { getCampusKpis } from "@/lib/api/campus-kpis";
import { CampusKpiDashboard } from "@/components/campus/campus-kpi-dashboard";
import { localDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { tab?: string; q?: string; from?: string; to?: string };
}

export default async function CampusPage({ searchParams }: PageProps) {
  const me = await getMe();
  if (!hasServerPermission(me, "campus.manage")) redirect("/dashboard");
  const now = new Date();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from ?? "") ? searchParams.from! : localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to ?? "") && searchParams.to! >= from ? searchParams.to! : localDate(now);
  const [departments, staff, kpis] = await Promise.all([
    listDepartmentsDetail(),
    listStaff(),
    getCampusKpis(from, to),
  ]);

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">校区管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          管理组织架构、部门主管以及全体教师 / 顾问的权限分配
        </p>
      </div>

      <Tabs
        defaultActiveKey={["staff", "kpi"].includes(searchParams.tab ?? "") ? searchParams.tab : "departments"}
        queryParam="tab"
        tabs={[
          {
            key: "departments",
            label: "部门管理",
            content: <DepartmentTree departments={departments} staff={staff} />,
          },
          {
            key: "staff",
            label: "教师 / 顾问",
            content: <StaffTable staff={staff} departments={departments} initialQuery={searchParams.q} />,
          },
          {
            key: "kpi",
            label: "校区 KPI",
            content: <CampusKpiDashboard data={kpis} aiConfigured={Boolean(process.env.DEEPSEEK_API_KEY)} aiModel={process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash"} />,
          },
        ]}
      />
    </div>
  );
}
