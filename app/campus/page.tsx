import { listDepartmentsDetail, listStaff } from "@/lib/api/campus";
import { Tabs } from "@/components/settings/tabs";
import { DepartmentTree } from "@/components/campus/department-tree";
import { StaffTable } from "@/components/campus/staff-table";
import { getMe } from "@/lib/auth/me";
import { hasServerPermission } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { EMPTY_REGISTRATION_METRICS, getCampusKpis } from "@/lib/api/campus-kpis";
import { CampusKpiDashboard } from "@/components/campus/campus-kpi-dashboard";
import { normalizeCampusKpiRange } from "@/lib/campus-kpi-range";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { tab?: string; q?: string; from?: string; to?: string };
}

export default async function CampusPage({ searchParams }: PageProps) {
  const me = await getMe();
  if (!hasServerPermission(me, "campus.manage")) redirect("/dashboard");
  const range = normalizeCampusKpiRange(searchParams.from, searchParams.to);
  const [departments, staff, kpiResult] = await Promise.all([
    listDepartmentsDetail(),
    listStaff(),
    getCampusKpis(range.from, range.to)
      .then((data) => ({ data, error: null as string | null }))
      .catch((error: unknown) => {
        console.error("Failed to load campus assessment data", error);
        return {
          data: {
            period: { from: range.from, to: range.to },
            staff: [],
            courses: [],
            daily: [],
            registrations: { ...EMPTY_REGISTRATION_METRICS, period: { from: range.from, to: range.to } },
            source_updated_at: new Date().toISOString(),
          },
          error: "考核数据暂时无法加载，页面其他功能仍可正常使用，请稍后重试",
        };
      }),
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
            label: "校区考核",
            content: (
              <CampusKpiDashboard
                data={kpiResult.data}
                notice={[range.notice, kpiResult.error].filter(Boolean).join("；") || null}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
