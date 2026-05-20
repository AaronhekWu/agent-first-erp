import { BookOpen, Users, Wallet, CheckCircle } from "lucide-react";
import { listCourses } from "@/lib/api/courses";
import { getLookups } from "@/lib/api/lookups";
import { NewCourseButton } from "@/components/courses/new-course-button";
import { CourseCard } from "@/components/courses/course-card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const [courses, lookups] = await Promise.all([listCourses(), getLookups()]);
  const { departments } = lookups;

  const total = courses.length;
  const activeCount = courses.filter((c) => c.status === "active").length;
  const enrolled = courses.reduce((s, c) => s + c.active_enrolled, 0);
  const revenue = courses.reduce((s, c) => s + Number(c.total_revenue ?? 0), 0);

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">课程管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            点击任一课程卡片进入「班级花名册 / 添加学员 / 每日点名」管理面板
          </p>
        </div>
        <NewCourseButton departments={departments} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="课程总数" value={total} Icon={BookOpen} bg="bg-blue-50" color="text-blue-600" />
        <StatCard label="招生中" value={activeCount} Icon={CheckCircle} bg="bg-emerald-50" color="text-emerald-600" />
        <StatCard label="在读人次" value={enrolled} Icon={Users} bg="bg-amber-50" color="text-amber-600" />
        <StatCard label="累计收入" value={formatCurrency(revenue)} Icon={Wallet} bg="bg-violet-50" color="text-violet-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {courses.length === 0 && (
          <div className="col-span-full rounded-2xl bg-white p-12 text-center text-sm text-slate-400 shadow-card">
            暂无课程，点击右上角「新增课程」创建第一门课
          </div>
        )}
        {courses.map((c) => (
          <CourseCard key={c.course_id} course={c} />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, Icon, bg, color }: { label: string; value: number | string; Icon: typeof BookOpen; bg: string; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card">
      <div className={cn("grid h-12 w-12 place-items-center rounded-xl", bg)}>
        <Icon className={cn("h-6 w-6", color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
          {typeof value === "number" ? value.toLocaleString("zh-CN") : value}
        </div>
      </div>
    </div>
  );
}
