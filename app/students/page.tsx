import { KpiCards } from "@/components/students/kpi-cards";
import { StudentFilters } from "@/components/students/student-filters";
import { StudentTable } from "@/components/students/student-table";
import { NewStudentButton } from "@/components/students/new-student-button";
import { Gate } from "@/lib/auth/permissions-context";
import {
  getLookups,
  getStudentKpis,
  listStudents,
  type StudentFilters as F,
  type StudentStatus,
} from "@/lib/api/students";

export const dynamic = "force-dynamic";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

interface PageProps {
  searchParams: {
    q?: string;
    status?: string;
    counselor?: string;
    school?: string;
    grade?: string;
    dept?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
  };
}

export default async function StudentsPage({ searchParams }: PageProps) {
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const requestedPageSize = Number(searchParams.pageSize ?? "20");
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize) ? requestedPageSize : 20;

  const filters: F = {
    keyword: searchParams.q,
    status: (searchParams.status as StudentStatus | "" | undefined) ?? "",
    counselorId: searchParams.counselor,
    school: searchParams.school,
    grade: searchParams.grade,
    departmentId: searchParams.dept,
    createdFrom: searchParams.from,
    createdTo: searchParams.to,
    sort: searchParams.sort as F["sort"],
  };

  const [kpis, list, lookups] = await Promise.all([
    getStudentKpis(),
    listStudents(filters, page, pageSize),
    getLookups(),
  ]);
  const { counselors, departments, schools, grades } = lookups;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">学员管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            增加（右上角新增学员）· 查询（下方筛选）· 删除/操作（列表每行按钮）
          </p>
        </div>
        <Gate keys="students.create">
          <NewStudentButton counselors={counselors} departments={departments} />
        </Gate>
      </div>

      <KpiCards kpis={kpis} />

      <StudentFilters
        counselors={counselors}
        departments={departments}
        schools={schools}
        grades={grades}
      />

      <StudentTable
        rows={list.rows}
        counselors={counselors}
        total={list.total}
        page={page}
        pageSize={pageSize}
        sort={searchParams.sort}
      />
    </div>
  );
}
