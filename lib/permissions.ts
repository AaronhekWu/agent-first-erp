// 顾问/教师可配置的细粒度权限清单
// 持久化到 acct_profiles.permissions JSONB (string[])

export interface PermissionItem {
  key: string;
  label: string;
  group: string;
}

export const PERMISSION_CATALOG: PermissionItem[] = [
  { key: "students.view",   label: "查看学员", group: "学员" },
  { key: "students.create", label: "新增学员", group: "学员" },
  { key: "students.update", label: "编辑学员", group: "学员" },
  { key: "students.delete", label: "删除学员", group: "学员" },
  { key: "students.export", label: "导出学员", group: "学员" },

  { key: "courses.view",    label: "查看课程", group: "课程" },
  { key: "courses.create",  label: "新增课程", group: "课程" },
  { key: "courses.update",  label: "编辑课程", group: "课程" },
  { key: "courses.archive", label: "归档课程", group: "课程" },

  { key: "finance.view",     label: "查看财务", group: "财务" },
  { key: "finance.recharge", label: "充值",     group: "财务" },
  { key: "finance.refund",   label: "退费",     group: "财务" },
  { key: "finance.consume",  label: "消课",     group: "财务" },

  { key: "followups.view",   label: "查看跟进", group: "跟进" },
  { key: "followups.create", label: "新增跟进", group: "跟进" },

  { key: "audits.view",      label: "查看审计", group: "审批" },
  { key: "campus.manage",    label: "校区管理", group: "校区" },
  { key: "settings.manage",  label: "系统设置", group: "校区" },
];

export const ROLE_DEFAULTS: Record<string, string[]> = {
  admin: PERMISSION_CATALOG.map((p) => p.key),
  counselor: [
    "students.view", "students.create", "students.update",
    "courses.view", "finance.view", "finance.recharge",
    "followups.view", "followups.create",
  ],
  teacher: [
    "students.view", "courses.view", "courses.update", "followups.view",
  ],
  viewer: PERMISSION_CATALOG
    .filter((p) => p.key.endsWith(".view"))
    .map((p) => p.key),
};

export function groupByCategory(keys: string[]) {
  const groups: Record<string, PermissionItem[]> = {};
  for (const item of PERMISSION_CATALOG) {
    if (!keys.includes(item.key)) continue;
    (groups[item.group] ??= []).push(item);
  }
  return groups;
}
