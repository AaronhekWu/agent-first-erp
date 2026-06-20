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
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function formatDate(
  iso: string | null | undefined,
  withTime = false,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  if (!withTime) return `${yyyy}-${mm}-${dd}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
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
      return "—";
  }
}

export function studentStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "active":
      return "在读";
    case "inactive":
      return "已停用";
    case "graduated":
      return "已毕业";
    default:
      return s ?? "—";
  }
}
