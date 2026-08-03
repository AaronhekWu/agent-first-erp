export const MAX_CAMPUS_KPI_DAYS = 366;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateStamp(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const stamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(stamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return stamp;
}

function shiftDate(value: string, days: number): string {
  const stamp = dateStamp(value);
  if (stamp == null) return value;
  return new Date(stamp + days * 86_400_000).toISOString().slice(0, 10);
}

function localDate(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function validateCampusKpiRange(from: string, to: string): string | null {
  const fromStamp = dateStamp(from);
  const toStamp = dateStamp(to);
  if (fromStamp == null || toStamp == null) return "请选择有效的开始和结束日期";
  if (fromStamp > toStamp) return "开始日期不能晚于结束日期";
  const days = Math.floor((toStamp - fromStamp) / 86_400_000) + 1;
  if (days > MAX_CAMPUS_KPI_DAYS) return `单次统计范围不能超过 ${MAX_CAMPUS_KPI_DAYS} 天`;
  return null;
}

export function normalizeCampusKpiRange(
  rawFrom: string | undefined,
  rawTo: string | undefined,
  now = new Date(),
): { from: string; to: string; notice: string | null } {
  const today = localDate(now);
  const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  let from = rawFrom && dateStamp(rawFrom) != null ? rawFrom : monthStart;
  let to = rawTo && dateStamp(rawTo) != null ? rawTo : today;
  const notices: string[] = [];

  if (rawFrom && dateStamp(rawFrom) == null) notices.push("开始日期无效，已恢复为本月第一天");
  if (rawTo && dateStamp(rawTo) == null) notices.push("结束日期无效，已恢复为今天");

  if (from > to) {
    [from, to] = [to, from];
    notices.push("开始日期晚于结束日期，系统已自动调换日期顺序");
  }

  const fromStamp = dateStamp(from)!;
  const toStamp = dateStamp(to)!;
  const days = Math.floor((toStamp - fromStamp) / 86_400_000) + 1;
  if (days > MAX_CAMPUS_KPI_DAYS) {
    from = shiftDate(to, -(MAX_CAMPUS_KPI_DAYS - 1));
    notices.push(`统计范围过长，已保留最近 ${MAX_CAMPUS_KPI_DAYS} 天`);
  }

  return { from, to, notice: notices.length > 0 ? notices.join("；") : null };
}
