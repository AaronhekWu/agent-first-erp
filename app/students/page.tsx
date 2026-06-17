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

const PAGE_SIZE = 20;

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
  };
}

export default async function StudentsPage({ searchParams }: PageProps) {
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);

  const filters: F = {
    keyword: searchParams.q,
    status: (searchParams.status as StudentStatus | "" | undefined) ?? "",
    counselorId: searchParams.counselor,
    school: searchParams.school,
    grade: searchParams.grade,
    departmentId: searchParams.dept,
    createdFrom: searchParams.from,
    createdTo: searchParams.to,
  };

  const [kpis, list, lookups] = await Promise.all([
    getStudentKpis(),
    listStudents(filters, page, PAGE_SIZE),
    getLookups(),
  ]);
  const { counselors, departments, schools, grades } = lookups;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">学员查询</h1>
          <p className="mt-1 text-sm text-slate-500">
            面向后台列表场景：先筛选，再查看，再进入详情
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
        total={list.total}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
