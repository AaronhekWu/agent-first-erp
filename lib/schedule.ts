export interface SchedulableCourse {
  course_id: string;
  course_name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  active_enrolled: number;
  schedule_info: {
    weekdays?: string[];
    time?: string;
    teacher_name?: string;
  } | null;
}

export interface CourseScheduleEvent {
  courseId: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  timeLabel: string;
  teacherName: string;
  headcount: number;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function courseEventsForDate(
  courses: SchedulableCourse[],
  date: string,
): CourseScheduleEvent[] {
  const target = new Date(`${date}T12:00:00`);
  const weekday = DAY_KEYS[target.getDay()];
  return courses
    .filter((course) => {
      if (course.status === "archived" || course.status === "completed") return false;
      if (course.start_date && date < course.start_date) return false;
      if (course.end_date && date > course.end_date) return false;
      return course.schedule_info?.weekdays?.includes(weekday);
    })
    .map((course) => {
      const rawTime = course.schedule_info?.time?.trim() || "时间未设置";
      const [startTime = "23:59", endTime = ""] = rawTime.split(/\s*[-—~至]\s*/);
      return {
        courseId: course.course_id,
        courseName: course.course_name,
        date,
        startTime,
        endTime,
        timeLabel: rawTime,
        teacherName: course.schedule_info?.teacher_name?.trim() || "老师未设置",
        headcount: Number(course.active_enrolled ?? 0),
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.courseName.localeCompare(b.courseName, "zh-CN"));
}

export function countScheduledPersonTimes(
  courses: SchedulableCourse[],
  from: string,
  to: string,
): number {
  let total = 0;
  const date = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (date <= end) {
    const key = localDate(date);
    total += courseEventsForDate(courses, key).reduce((sum, event) => sum + event.headcount, 0);
    date.setDate(date.getDate() + 1);
  }
  return total;
}

export function localDate(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
