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
const TIME_RANGE_PATTERN = /([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|—|–|~|～|至)\s*([01]?\d|2[0-3]):([0-5]\d)/;

export function parseTimeRange(value: string | null | undefined): { start: string; end: string } {
  const match = value?.match(TIME_RANGE_PATTERN);
  if (!match) return { start: "", end: "" };
  return {
    start: `${match[1].padStart(2, "0")}:${match[2]}`,
    end: `${match[3].padStart(2, "0")}:${match[4]}`,
  };
}

export function formatTimeRange(start: string, end: string): string {
  return start && end ? `${start}-${end}` : "";
}

export function isValidTimeRange(start: string, end: string): boolean {
  return /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start < end;
}

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
      const rawTime = course.schedule_info?.time?.trim() || "";
      const parsedTime = parseTimeRange(rawTime);
      const startTime = parsedTime.start || "23:59";
      const endTime = parsedTime.end;
      return {
        courseId: course.course_id,
        courseName: course.course_name,
        date,
        startTime,
        endTime,
        timeLabel: formatTimeRange(parsedTime.start, parsedTime.end) || rawTime || "时间未设置",
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
