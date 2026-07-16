import { CourseCard } from "./course-card";
import { UrlListPagination } from "@/components/ui/url-list-pagination";
import type { CourseRow } from "@/lib/api/courses";
import type { Department } from "@/lib/api/lookups";

export function CourseList({ courses, departments, page, pageSize, emptyMessage, selectedCourseId }: { courses: CourseRow[]; departments: Department[]; page: number; pageSize: number; emptyMessage: string; selectedCourseId?: string }) {
  const totalPages = Math.max(1, Math.ceil(courses.length / pageSize));
  const selectedIndex = selectedCourseId ? courses.findIndex((course) => course.course_id === selectedCourseId) : -1;
  const currentPage = selectedIndex >= 0
    ? Math.floor(selectedIndex / pageSize) + 1
    : Math.min(page, totalPages);
  const pagedCourses = courses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {courses.length === 0 && (
          <div className="col-span-full py-12 text-center text-sm text-slate-400">
            {emptyMessage}
          </div>
        )}
        {pagedCourses.map((course) => <CourseCard key={course.course_id} course={course} departments={departments} initialOpen={course.course_id === selectedCourseId} />)}
      </div>
      <UrlListPagination page={currentPage} pageSize={pageSize} totalItems={courses.length} />
    </div>
  );
}
