import Link from "next/link";
import { Archive, BookOpen, Users, Wallet, CheckCircle } from "lucide-react";
import { listCourses } from "@/lib/api/courses";
import { getLookups } from "@/lib/api/lookups";
import { NewCourseButton } from "@/components/courses/new-course-button";
import { CourseList } from "@/components/courses/course-list";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCourseLifecycle } from "@/lib/course-lifecycle";
import { Gate } from "@/lib/auth/permissions-context";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { page?: string; pageSize?: string; archived?: string; course?: string };
}

export default async function CoursesPage({ searchParams }: PageProps) {
  const [courses, lookups] = await Promise.all([listCourses(), getLookups()]);
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const requestedPageSize = Number(searchParams.pageSize ?? "15");
  const pageSize = [15, 30, 45, 60, 75, 90].includes(requestedPageSize) ? requestedPageSize : 15;
  const showArchived = searchParams.archived === "1";
  const displayCourses = courses.filter((course) => Boolean(course.is_archived) === showArchived);
  const { departments } = lookups;

  const total = displayCourses.length;
  const activeCount = displayCourses.filter((course) => getCourseLifecycle(course) === "enrolling").length;
  const enrolled = displayCourses.reduce((s, c) => s + c.active_enrolled, 0);
  const revenue = displayCourses.reduce((s, c) => s + Number(c.total_revenue ?? 0), 0);

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">课程管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            点击任一课程卡片进入「班级花名册 / 添加学员 / 每日点名」管理面板
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={showArchived ? "/courses" : "/courses?archived=1"}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "返回课程管理" : "查看归档课程"}
          </Link>
          {!showArchived && <Gate keys="courses.create"><NewCourseButton departments={departments} /></Gate>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="课程总数" value={total} Icon={BookOpen} bg="bg-blue-50" color="text-blue-600" />
        <StatCard label="招生中" value={activeCount} Icon={CheckCircle} bg="bg-emerald-50" color="text-emerald-600" />
        <StatCard label="在读人次" value={enrolled} Icon={Users} bg="bg-amber-50" color="text-amber-600" />
        <StatCard label="累计收入" value={formatCurrency(revenue)} Icon={Wallet} bg="bg-violet-50" color="text-violet-600" />
      </div>

      <CourseList
        courses={displayCourses}
        page={page}
        pageSize={pageSize}
        emptyMessage={showArchived ? "暂无归档课程" : "暂无课程，点击右上角「新增课程」创建第一门课"}
        selectedCourseId={searchParams.course}
      />
    </div>
  );
}

function StatCard({ label, value, Icon, bg, color }: { label: string; value: number | string; Icon: typeof BookOpen; bg: string; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card">
      <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl", bg)}>
        <Icon className={cn("h-6 w-6", color)} />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate text-sm text-slate-500">{label}</div>
        <div className="mt-0.5 truncate text-xl font-semibold text-slate-900">
          {typeof value === "number" ? value.toLocaleString("zh-CN") : value}
        </div>
      </div>
    </div>
  );
}
