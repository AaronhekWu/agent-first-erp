import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listCourses } from "@/lib/api/courses";
import { CampaignManager } from "@/components/courses/campaign-manager";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const courses = await listCourses();
  const courseOptions = courses
    .filter((c) => !c.is_archived)
    .map((c) => ({ id: c.course_id, name: c.course_name }));

  return (
    <div className="space-y-5 p-6">
      <div>
        <Link
          href="/courses"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          返回课程管理
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">优惠组合管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          在此维护报名优惠、课程优惠与老带新组合；报名时在「优惠活动」下拉中直接选择已启用的组合。
        </p>
      </div>
      <CampaignManager courseOptions={courseOptions} />
    </div>
  );
}
