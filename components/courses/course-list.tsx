import { CourseCard } from "./course-card";
import { UrlListPagination } from "@/components/ui/url-list-pagination";
import type { CourseRow } from "@/lib/api/courses";
import type { Department, HomeroomTeacher } from "@/lib/api/lookups";
import { COURSE_SORT_OPTIONS, type CourseSort } from "@/lib/list-sorting";
import { UrlSortSelect } from "@/components/ui/url-sort-select";

export function CourseList({ courses, departments, homeroomTeachers, page, pageSize, emptyMessage, selectedCourseId, selectedTab, selectedDate, sort }: { courses: CourseRow[]; departments: Department[]; homeroomTeachers: HomeroomTeacher[]; page: number; pageSize: number; emptyMessage: string; selectedCourseId?: string; selectedTab?: string; selectedDate?: string; sort: CourseSort }) {
  const totalPages = Math.max(1, Math.ceil(courses.length / pageSize));
  const selectedIndex = selectedCourseId ? courses.findIndex((course) => course.course_id === selectedCourseId) : -1;
  const currentPage = selectedIndex >= 0
    ? Math.floor(selectedIndex / pageSize) + 1
    : Math.min(page, totalPages);
  const pagedCourses = courses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <span className="text-sm text-slate-500">
          共 <span className="font-medium text-slate-800">{courses.length.toLocaleString("zh-CN")}</span> 门课程
        </span>
        <UrlSortSelect value={sort} options={COURSE_SORT_OPTIONS} ariaLabel="课程排序" />
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {courses.length === 0 && (
          <div className="col-span-full py-12 text-center text-sm text-slate-400">
            {emptyMessage}
          </div>
        )}
        {pagedCourses.map((course) => <CourseCard key={course.course_id} course={course} departments={departments} homeroomTeachers={homeroomTeachers} initialOpen={course.course_id === selectedCourseId} initialTab={course.course_id === selectedCourseId ? selectedTab : undefined} initialDate={course.course_id === selectedCourseId ? selectedDate : undefined} />)}
      </div>
      <UrlListPagination page={currentPage} pageSize={pageSize} totalItems={courses.length} />
    </div>
  );
}
