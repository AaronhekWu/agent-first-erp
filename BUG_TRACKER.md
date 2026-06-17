# 墨曦系统 — Bug & 需求追踪清单

> **创建日期**: 2026-06-16  
> **文档目的**: 列出当前所有高感知度的功能缺失/缺陷，标注具体位置与影响范围，作为后续迭代开发的任务清单。

---

## 一、学员管理 — 缺少子页分类与权限分配

### 1.1 当前状态

`/students` 页面是一个单纯的列表查询页，没有功能型子页划分：

```12:14:app/students/page.tsx
export const dynamic = "force-dynamic";
```

```52:80:app/students/page.tsx
  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">学员查询</h1>
          <p className="mt-1 text-sm text-slate-500">
            面向后台列表场景：先筛选，再查看，再进入详情
          </p>
        </div>
        <NewStudentButton counselors={counselors} departments={departments} />
      </div>
      ...
```

**问题所在**：
- 学员新增：只有右上角一个 `NewStudentButton`，点击弹出 `NewStudentModal`。没有独立的「学员增加」操作页面，无法批量新增或引导式录入。
- 学员删除：完全不存在。`components/students/` 目录下的 `student-table.tsx` 没有删除按钮，没有删除确认流程。
- 学员信息查看：实际上是 `/students/[id]/page.tsx` 详情页，但它是通过点击表格行进入的，没有单独的「信息查看」Tab 或入口。

### 1.2 缺失内容

| 缺失功能 | 位置 | 说明 |
|----------|------|------|
| 学员新增子页 | `app/students/new/` (新路由) 或 `app/students/` 下 Tab | 独立的新增学员页面，含必填校验、家长绑定、钱包初始化 |
| 学员删除子页 | `app/students/delete/` 或列表操作列 | 软删除/停用操作，需审批流程（见第五节） |
| 学员信息查看子页 | `app/students/view/` 或在列表页嵌入「查看」Tab | 除了详情页，列表页应可快速展开查看 |
| 权限分配（增/删/查） | `components/layout/sidebar.tsx` + `lib/permissions.ts` | 三个子页需各自受权限控制，使用已有的 `Gate` 组件做条件渲染。现有 `PERMISSION_CATALOG` 已有 `students.create`/`students.delete`/`students.view` 权限，只需在 UI 层接入 `Gate` |

### 1.3 影响范围

- `app/students/page.tsx` — 需重构为 Tab 布局或子路由
- `components/students/student-table.tsx` — 需增加「删除」操作列 + `Gate` 权限包裹
- `components/students/new-student-modal.tsx` — 可能需要升级为完整页面
- `lib/permissions.ts` — `Gate` 组件需应用到列表页按钮等 UI 元素

---

## 二、课程管理 — 缺少报课流程与优惠折扣

### 2.1 当前状态

`/courses` 页面目前展示课程卡片列表 + 统计卡片：

```11:50:app/courses/page.tsx
export default async function CoursesPage() {
  const [courses, lookups] = await Promise.all([listCourses(), getLookups()]);
  ...
  return (
    ...
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {courses.map((c) => (
          <CourseCard key={c.course_id} course={c} />
        ))}
      </div>
    </div>
  );
}
```

课程管理弹窗中包含三个 Tab：

```19:23:components/courses/course-manage-modal.tsx
const TABS = [
  { key: "roster", label: "班级花名册", Icon: Users },
  { key: "enroll", label: "添加学员", Icon: UserPlus },
  { key: "attendance", label: "每日点名", Icon: CalendarCheck },
] as const;
```

### 2.2 缺失内容

**a) 课程列表缺少删除功能**

当前 `CourseCard` 组件只做展示 + 点开管理弹窗，没有删除/归档课程的操作按钮。

```16:94:components/courses/course-card.tsx
export function CourseCard({ course }: { course: CourseRow }) {
  const [open, setOpen] = useState(false);
  ...
  return (
    <>
      <button ... onClick={() => setOpen(true)} ...>
        {/* 卡片内容：名称、科目、级别、报名进度、费用等 */}
      </button>
      <CourseManageModal open={open} ... />
    </>
  );
}
```

**缺失**：每个卡片应有一个菜单或按钮组（编辑 / 删除 / 归档），当前完全没有。

**b) 学员报课缺少转课/优惠折扣场景**

当前的 `EnrollTab` 只有搜索 + 一键报课：

```44:57:components/courses/enroll-tab.tsx
  const handleEnroll = async (s: StudentSearchResult) => {
    ...
    try {
      await enrollStudent({ p_student_id: s.id, p_course_id: course.course_id, p_source: "manual" });
      ...
    }
    ...
  };
```

这是极简的 `enrollStudent` RPC 调用，没有处理以下场景：
- **转课**（transfer）：学员从 A 课程转到 B 课程，携带剩余课时（`roster-tab.tsx` 中已有 `TransferModal`，但仅限于花名册操作，不在报课流程中）
- **优惠折扣**：批量报名折扣、老带新优惠、促销活动折扣 —— 完全不存在
- **课时定价**：不同报名方案（次卡/月卡/学期卡）的选择

**c) 课程列表与报课应分为两个独立页面/Tab**

当前设计是将「花名册 + 报课 + 点名」放在课程卡片的弹窗内，不符合用户要求的「课程列表（卡片式增减删）」+「学员报课（含转课/折扣）」两个独立子页。

### 2.3 影响范围

| 文件 | 改动类型 |
|------|----------|
| `app/courses/page.tsx` | 重构为 Tab 布局：课程列表 / 学员报课 |
| `components/courses/course-card.tsx` | 增加删除/归档按钮，接入 `Gate` 权限 |
| `components/courses/enroll-tab.tsx` | 重新设计为独立页面，增加转课/折扣逻辑 |
| `components/courses/roster-tab.tsx` | 转课/退课操作需改为走审批 |
| `lib/api/create.ts` | 新增 `enrollWithDiscount` 等 RPC 调用 |
| 新增 `components/courses/enroll-page.tsx` | 独立报课页面组件 |

---

## 三、财务管理 — 全部流水功能未完成

### 3.1 当前状态

`/finance` 页面有 4 个 Tab：充值、退费、手动消课、全部流水。

```36:43:app/finance/page.tsx
      <Tabs
        tabs={[
          { key: "recharge", label: "充值", content: <RechargeForm /> },
          { key: "refund", label: "退费", content: <RefundForm /> },
          { key: "consume", label: "手动消课", content: <ConsumeForm /> },
          { key: "transactions", label: "全部流水", content: <TransactionList rows={txs} /> },
        ]}
      />
```

`TransactionList` 组件存在且可渲染：

```15:70:components/finance/transaction-list.tsx
export function TransactionList({ rows }: { rows: Transaction[] }) {
  return (
    <div className="rounded-2xl bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          ...
        </table>
      </div>
    </div>
  );
}
```

### 3.2 缺失内容

| 缺失功能 | 说明 |
|----------|------|
| **筛选器** | 当前无按类型/日期范围/学员/金额范围的筛选，服务端 `listTransactions()` 已支持 `type`/`from`/`to` 参数但 UI 层没接 |
| **分页** | 当前一次性加载 100 条，无分页控件 |
| **搜索** | 无法按学员姓名/编号搜索流水 |
| **导出** | 无 Excel/CSV 导出功能 |
| **统计汇总** | 无当前筛选结果的总金额合计（充值/退费/消费分别汇总） |
| **流水详情** | 点击某条流水无详情展开（metadata JSONB 字段中有附加信息但不可见） |
| **Realtime 实时更新** | `fin_transactions` 在 Supabase 已启用 Realtime，但 UI 无 WebSocket 订阅 |

### 3.3 影响范围

- `components/finance/transaction-list.tsx` — 需重写为带筛选/分页/搜索/实时更新的完整功能
- `lib/api/finance-client.ts` — 增加客户端筛选查询
- `app/finance/page.tsx` — 将「全部流水」从 Tab 中独立出来或改为独立组件

---

## 四、审批中心未完成

### 4.1 当前状态

`/audits` 页面是纯占位符：

```1:4:app/audits/page.tsx
import { Placeholder } from "@/components/layout/placeholder";
export default function Page() {
  return <Placeholder title="审批中心" />;
}
```

`Placeholder` 组件只显示一个施工图标 + "该模块即将上线，敬请期待"：

```1:15:components/layout/placeholder.tsx
import { Construction } from "lucide-react";

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-6">
      <div className="rounded-2xl bg-white p-12 shadow-card">
        <div className="flex flex-col items-center text-center">
          <Construction className="h-10 w-10 text-amber-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-800">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">该模块即将上线，敬请期待</p>
        </div>
      </div>
    </div>
  );
}
```

### 4.2 缺失内容

审批中心是整个系统的关键缺少项。它需要：

| 功能 | 说明 |
|------|------|
| **审批列表** | 展示待审批/已审批/已驳回的操作请求（学员删除、退课、退费、转课等） |
| **审批详情** | 展示操作类型、申请人、申请时间、涉及学员/金额、原因 |
| **审批操作** | 通过/驳回按钮，附带审批意见输入 |
| **审批历史** | 个人/全局审批记录查询 |
| **审批规则** | 哪些操作需要审批（如退费 > 500 元需管理员审批） |

### 4.3 影响范围

- 新建 `app/audits/page.tsx` — 替代占位符
- 新建 `components/audits/` — 审批列表、审批详情、审批操作组件
- 数据库 — 可能需要新增 `aud_approvals` 表或复用 `aud_operation_logs` 加审批状态字段
- 所有 RPC 写操作（退费/退课/转课/删除）需改为先创建审批单，审批通过后再执行

---

## 五、删除/退费操作需通过审批完成

### 5.1 当前状态

以下操作当前是**直接执行**，无审批环节：

| 操作 | 位置 | 当前行为 |
|------|------|----------|
| 退课（含退费） | `components/courses/roster-tab.tsx` → `dropEnrollment()` | 直接调用 RPC，传入 `p_refund_remaining` 参数立即退费 |
| 删除部门 | `components/campus/department-tree.tsx` → `deleteDepartment()` | `confirm()` 弹窗后直接执行 |
| 停用员工 | `components/campus/staff-table.tsx` → `deleteStaff()` | `confirm()` 弹窗后直接执行 |
| 退费 | `components/finance/refund-form.tsx` → RPC | 直接退费到学员账户 |

示例 — 退课操作在 `roster-tab.tsx` 中：

```133:200:components/courses/roster-tab.tsx
function DropConfirmModal({ enrollment, onClose, onDone }: {...}) {
  ...
  const handleSubmit = async () => {
    await dropEnrollment({
      p_enrollment_id: enrollment.enrollment_id,
      p_refund_remaining: refund,      // ← 立即退费，无审批
      p_reason: reason.trim() || null,
    });
  };
  ...
}
```

示例 — 删除部门在 `department-tree.tsx` 中：

```66:77:components/campus/department-tree.tsx
  const handleDelete = async (d: DepartmentDetail) => {
    if (!confirm(`确认删除部门「${d.name}」？`)) return;
    setBusy(true);
    try {
      await deleteDepartment(d.id);    // ← 直接删除，无审批
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
    ...
  };
```

### 5.2 缺失内容

所有「破坏性操作」应由「直接执行」改为「创建审批单 → 管理员审批 → 执行」的流程：

```
用户点击退课 → 创建审批单(状态: pending) → 通知管理员
管理员查看审批中心 → 通过/驳回 → 审批通过后触发 RPC 执行
```

### 5.3 影响范围

| 文件 | 改动 |
|------|------|
| `components/courses/roster-tab.tsx` | 退课/转课改为创建审批 |
| `components/campus/department-tree.tsx` | 删除部门改为创建审批 |
| `components/campus/staff-table.tsx` | 停用员工改为创建审批 |
| `components/finance/refund-form.tsx` | 退费改为创建审批 |
| `components/students/` | 删除学员改为创建审批 |
| 新增审批相关组件与 API | `components/audits/` + `lib/api/approvals.ts` |

---

## 六、校区管理 — 部门管理架构空白

### 6.1 当前状态

`/campus` 页面有「部门管理」和「教师/顾问」两个 Tab：

```23:36:app/campus/page.tsx
      <Tabs
        tabs={[
          {
            key: "departments",
            label: "部门管理",
            content: <DepartmentTree departments={departments} staff={staff} />,
          },
          {
            key: "staff",
            label: "教师 / 顾问",
            content: <StaffTable staff={staff} departments={departments} />,
          },
        ]}
      />
```

`DepartmentTree` 组件实现了树形结构展示：

```49:121:components/campus/department-tree.tsx
export function DepartmentTree({ departments, staff }: Props) {
  const tree = useMemo(() => buildTree(departments, staff), [departments, staff]);
  ...
  return (
    <div>
      ...
      <div className="rounded-lg border border-slate-200 bg-white">
        {tree.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-slate-400">暂无部门</div>
        )}
        {tree.map((node) => (
          <TreeRow key={node.id} node={node} ... />
        ))}
      </div>
      <DepartmentEditModal ... />
    </div>
  );
}
```

### 6.2 缺失内容 — 当数据库中无部门数据时

用户反馈「部门管理架构是空白的」，意味着生产数据库的 `acct_departments` 表可能为空（没有预置种子数据），导致页面展示「暂无部门」。但即使有数据，当前也缺失以下功能：

| 缺失功能 | 说明 |
|----------|------|
| **组织架构图** | 树形列表而非可视化组织架构图（Org Chart），缺少直观的层级关系展示 |
| **部门详情面板** | 点击部门后无右侧详情面板显示部门成员、子部门、课程数等统计 |
| **拖拽排序** | 无法拖拽调整部门层级和排序 |
| **批量导入** | 无法从 Excel 批量导入部门结构 |
| **种子数据** | 数据库可能缺省部门种子数据，首次使用时 `acct_departments` 为空表 |

数据源在 `lib/api/campus.ts`：

```39:47:lib/api/campus.ts
export async function listDepartmentsDetail(): Promise<DepartmentDetail[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("acct_departments")
    .select("id, name, description, parent_id, manager_id, sort_order, created_at")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as DepartmentDetail[];
}
```

`StaffTable` 和 `StaffEditModal` 的管理功能是完整的，问题集中在部门端。

### 6.3 影响范围

- `components/campus/department-tree.tsx` — 增强为可视化组织架构图
- 数据库 — 添加种子部门数据（如 "总部 → 教学部 / 销售部 / 行政部"）
- 新增 `components/campus/org-chart.tsx` — 组织架构图组件

---

## 七、全局搜索未实现

### 7.1 当前状态

顶部栏有一个搜索输入框，但完全无功能：

```68:73:components/layout/topbar.tsx
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="全局搜索"
            className="h-9 w-72 rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none"
          />
        </div>
```

这是一个纯展示的输入框，没有：
- `onChange` 事件处理
- `onKeyDown` (Enter 触发搜索)
- 搜索建议下拉（autocomplete）
- 搜索结果展示
- 键盘快捷键（如 `⌘K`）

### 7.2 面包屑跳转的当前状态

顶部栏的面包屑**已经实现**但逻辑简单：

```20:31:components/layout/topbar.tsx
function buildBreadcrumb(segments: string[]): string[] {
  if (segments.length === 0) return ["仪表盘"];
  const first = segments[0];
  const root = SEGMENT_LABELS[first] ?? first;
  if (first === "students") {
    return segments[1] ? [root, "学员详情"] : [root, "学员查询"];
  }
  if (first === "courses") {
    return [root, "课程列表"];
  }
  return [root];
}
```

面包屑是纯文本展示，**不可点击**（不是 `<Link>`），无法通过面包屑跳转到上级页面。这是用户说的「面包屑跳转没做」。

### 7.3 缺失内容

| 缺失功能 | 说明 |
|----------|------|
| 全局搜索输入联动 | `onChange` → 防抖调用 `searchStudents` API → 下拉建议列表 |
| 键盘导航 | `⌘K` / `Ctrl+K` 唤起搜索、上下键选择结果、Enter 跳转 |
| 搜索结果页 | 独立的 `/search?q=xxx` 路由，聚合学员/课程/财务等搜索结果 |
| 面包屑可点击 | `buildBreadcrumb` 中的每段应为 `<Link href="...">` 跳转 |

### 7.4 影响范围

- `components/layout/topbar.tsx` — 搜索输入加交互逻辑，面包屑改为链接
- 新增 `components/layout/search-panel.tsx` — 搜索下拉面板
- 新增 `app/search/page.tsx` — 搜索结果页
- `lib/api/lookups.ts` — 搜索可能需新增跨表搜索 API

---

## 八、通知栏未实现

### 8.1 当前状态

顶部栏右侧有一个铃铛图标，显示硬编码的未读数量 `12`，点击无反应：

```75:83:components/layout/topbar.tsx
        <button
          type="button"
          className="relative grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[10px] font-medium text-white">
            12
          </span>
        </button>
```

当前实现只有一个空的 `<button>`，没有 `onClick` 事件，没有下拉面板。

### 8.2 缺失内容

| 缺失功能 | 说明 |
|----------|------|
| **通知下拉面板** | 点击铃铛展开下拉列表，展示最近通知 |
| **通知数据源** | 需要后端通知来源：待审批提醒、余额预警、跟进到期提醒等 |
| **未读计数** | 从数据库或 Supabase Realtime 获取真实未读数 |
| **通知分类** | 审批通知 / 系统通知 / 预警通知 |
| **已读/未读状态** | 点击某条通知标记已读 |
| **全部已读** | 一键标记全部已读 |
| **通知跳转** | 点击通知跳转到对应页面（如点击审批通知 → 跳转审批中心） |
| **Realtime 推送** | WebSocket 实时推送新通知 |

### 8.3 数据来源

通知可以从以下来源生成：
- 审批系统：新审批申请需要管理员处理
- 余额预警：`v_balance_warnings` 视图中的学员余额低于阈值
- 跟进到期：`v_pending_followups` 中到期未跟进的学员
- 系统通知：数据库已有 `pg_cron` 每日提醒任务

### 8.4 影响范围

- `components/layout/topbar.tsx` — 铃铛按钮加 `onClick` + 下拉面板
- 新增 `components/layout/notifications-panel.tsx` — 通知下拉面板
- 新增 `lib/api/notifications.ts` — 通知数据 API
- 数据库 — 可能需要 `sys_notifications` 表存储通知记录

---

## 九、总结 — 全部 Bug 影响矩阵

| # | Bug | 严重程度 | 所在文件 | 类型 |
|---|-----|----------|----------|------|
| 1 | 学员管理无增/删/查子页 + 权限分配 | 🔴 高 | `app/students/page.tsx`, `components/students/*` | 功能缺失 |
| 2 | 课程管理缺少删除功能 | 🔴 高 | `components/courses/course-card.tsx` | 功能缺失 |
| 3 | 学员报课缺少转课/优惠折扣场景 | 🔴 高 | `components/courses/enroll-tab.tsx` | 功能缺失 |
| 4 | 课程列表与报课未分页 | 🟡 中 | `app/courses/page.tsx` | 架构问题 |
| 5 | 全部流水功能不完整 | 🟡 中 | `components/finance/transaction-list.tsx` | 功能缺失 |
| 6 | 审批中心完全未开发 | 🔴 高 | `app/audits/page.tsx` (占位符) | 功能缺失 |
| 7 | 退课/退费/删除无审批流程 | 🔴 高 | `roster-tab.tsx`, `department-tree.tsx`, `staff-table.tsx`, `refund-form.tsx` | 安全缺陷 |
| 8 | 部门管理架构空白 | 🟡 中 | `app/campus/page.tsx`, `department-tree.tsx` | 功能缺失 |
| 9 | 全局搜索未实现 | 🟡 中 | `components/layout/topbar.tsx` | 功能缺失 |
| 10 | 面包屑不可点击跳转 | 🟢 低 | `components/layout/topbar.tsx` (buildBreadcrumb) | 功能缺失 |
| 11 | 通知栏硬编码未实现 | 🟡 中 | `components/layout/topbar.tsx` | 功能缺失 |

### 依赖关系

```
审批中心完成 (#6)
    ↑ 被依赖
退课/退费/删除改为审批 (#7)

    ↑ 独立于审批系统

学员管理子页 (#1) ← → 课程管理子页 (#2, #3, #4) ← → 财务报表 (#5)
    ↓ 共享组件                              ↓ 共享组件
全局搜索 (#9)                              面包屑 (#10)
    ↓ 共享数据源
通知栏 (#11) ← 审批通知 + 余额预警 + 跟进到期
```

### 建议开发顺序

| 阶段 | 任务 | 原因 |
|------|------|------|
| **阶段 A** | #6 审批中心 + #7 审批流程改造 | 破坏性操作的安全底线，必须最先完成 |
| **阶段 B** | #1 学员管理子页 + #2/#3/#4 课程管理改造 | 核心业务页面，用户使用频率最高 |
| **阶段 C** | #5 全部流水 + #8 部门架构 | 报表与管理功能 |
| **阶段 D** | #9 全局搜索 + #10 面包屑 + #11 通知栏 | 体验增强功能，依赖前三个阶段的数据就绪 |
