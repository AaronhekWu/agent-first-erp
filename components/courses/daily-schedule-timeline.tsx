import Link from "next/link";
import { CalendarDays, Clock3, Users } from "lucide-react";
import { courseEventsForDate, type SchedulableCourse } from "@/lib/schedule";
import { formatDate } from "@/lib/format";

export function DailyScheduleTimeline({
  courses,
  date,
  title = "日常课程表",
}: {
  courses: SchedulableCourse[];
  date: string;
  title?: string;
}) {
  const events = courseEventsForDate(courses, date);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><CalendarDays className="h-4 w-4 text-brand-500" />{title}</div>
        <span className="text-xs text-slate-400">{formatDate(date)}</span>
      </div>
      <div className="px-5 py-4">
        {events.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">当天没有排课</div>
        ) : (
          <div className="relative space-y-0 before:absolute before:bottom-4 before:left-[4.45rem] before:top-4 before:w-px before:bg-slate-200">
            {events.map((event) => (
              <div key={`${event.courseId}-${event.date}`} className="relative grid grid-cols-[4rem_1fr] items-center gap-5 py-3">
                <div className="text-right text-sm font-semibold tabular-nums text-slate-700">{event.startTime}</div>
                <span className="absolute left-[4.08rem] top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500 shadow-sm" />
                <Link
                  href={`/courses?course=${event.courseId}&tab=attendance&date=${event.date}`}
                  className="group flex min-h-[84px] flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-brand-200 hover:bg-brand-50"
                  title={`进入「${event.courseName}」每日点名`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><div className="font-medium text-slate-800 group-hover:text-brand-700">{event.courseName}</div><div className="mt-1 text-xs text-slate-500">{event.teacherName}</div></div>
                    <span className="rounded bg-white px-2 py-1 text-[11px] text-brand-600 ring-1 ring-brand-100">进入点名</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{event.timeLabel}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />应到 {event.headcount} 人</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
