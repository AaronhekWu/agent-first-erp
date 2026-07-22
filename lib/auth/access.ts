import type { MeResult } from "@/lib/auth/me";
import { ROLE_DEFAULTS } from "@/lib/permissions";

export function hasServerPermission(me: MeResult | null, key: string): boolean {
  const role = me?.user.primary_role;
  if (!role) return false;
  if (role === "admin") return true;
  const permissions = me?.permissions ?? ROLE_DEFAULTS[role] ?? [];
  return permissions.includes(key);
}
