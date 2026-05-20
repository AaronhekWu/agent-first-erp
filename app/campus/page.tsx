import { listDepartmentsDetail, listStaff } from "@/lib/api/campus";
import { Tabs } from "@/components/settings/tabs";
import { DepartmentTree } from "@/components/campus/department-tree";
import { StaffTable } from "@/components/campus/staff-table";

export const dynamic = "force-dynamic";

export default async function CampusPage() {
  const [departments, staff] = await Promise.all([
    listDepartmentsDetail(),
    listStaff(),
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
        tabs={[
          {
            key: "departments",
            label: "部门管理",
            content: <DepartmentTree departments={departments} staff={staff} />,
          },
          {
            key: "staff",
            label: "教师 / 顾问",
            content: <StaffTable staff={staff} departments={departments} />,
          },
        ]}
      />
    </div>
  );
}
