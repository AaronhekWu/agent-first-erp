export function formatCurrency(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}¥ ${abs}`;
}

// 只保留数字, 上限 15 位 (国际号最长)
export function sanitizePhone(input: string): string {
  return input.replace(/\D+/g, "").slice(0, 15);
}

// 6-15 位纯数字
export function isValidPhone(input: string | null | undefined): boolean {
  if (!input) return true; // 选填
  return /^[0-9]{6,15}$/.test(input);
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "未填写";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function displayPhone(phone: string | null | undefined): string {
  return phone?.trim() || "未填写";
}

export function formatDate(
  iso: string | null | undefined,
  withTime = false,
): string {
  if (!iso) return "暂无";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "暂无";
  // 服务端和浏览器统一使用校区所在的东八区，避免 SSR 水合时因运行环境时区不同而产生文本跳动。
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const yyyy = part("year");
  const mm = part("month");
  const dd = part("day");
  if (!withTime) return `${yyyy}-${mm}-${dd}`;
  const hh = part("hour");
  const mi = part("minute");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function followupTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case "phone":
      return "电话沟通";
    case "wechat":
      return "微信沟通";
    case "visit":
      return "面谈";
    case "other":
      return "其他";
    default:
      return "未记录";
  }
}

export function studentStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "active":
      return "在读";
    case "inactive":
      return "已停用";
    case "frozen":
      return "已冻结";
    case "graduated":
      return "已毕业";
    default:
      return "未知状态";
  }
}
