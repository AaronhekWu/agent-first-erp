# 墨曦系统 — 项目结构文档

> **版本**: v0.1.0  
> **项目名**: agent-erp-admin  
> **框架**: Next.js 14.2.18 (App Router)  
> **后端**: Supabase (PostgreSQL) @ aliyun-shanghai  
> **代码行数**: ~6,300 lines (TypeScript/TSX)  
> **部署目标**: Alibaba Cloud SAE + Docker  

---

## 一、目录树总览

```
agent-first-erp/
│
├── app/                    # Next.js App Router 页面 + API 路由
│   ├── layout.tsx          # 根布局：侧边栏 + 顶栏 + 权限上下文
│   ├── page.tsx            # 根页面（重定向到 /students）
│   ├── globals.css         # 全局样式
│   │
│   ├── api/                # API 路由 (3 个)
│   │   ├── health/         # 健康检查（SAE 存活探针用）
│   │   └── ai/             # AI Agent 辅助接口
│   │       ├── recommend-followup/   # AI 跟进建议
│   │       └── recommend-recharge/   # AI 充值建议
│   │
│   ├── students/           # 学员管理（核心页面）
│   │   ├── page.tsx        # 列表页：表格 + 筛选 + 新建
│   │   └── [id]/           # 详情页（327 行，含 Tabs：档案/课程/财务/跟进/考勤）
│   ├── courses/            # 课程管理
│   ├── campus/             # 校区管理（部门树 + 员工表）
│   ├── finance/            # 财务管理（充值/消费/退款）
│   ├── followups/          # 跟进记录
│   ├── dashboard/          # 数据看板（占位，待开发）
│   ├── audits/             # 操作审计日志（占位，待开发）
│   └── settings/           # 系统设置（公司信息 + 个人资料）
│
├── components/             # UI 组件（40 个文件，按模块分目录）
│   ├── layout/             # 布局组件
│   │   ├── sidebar.tsx         # 侧边栏导航
│   │   ├── topbar.tsx          # 顶部栏
│   │   ├── layout-context.tsx  # 布局状态（侧边栏折叠等）
│   │   ├── user-menu.tsx       # 用户下拉菜单
│   │   └── placeholder.tsx     # 占位组件
│   │
│   ├── students/           # 学员相关组件（10 个）
│   │   ├── student-table.tsx       # 学员列表（427 行，最大组件）
│   │   ├── student-drawer.tsx      # 右侧抽屉（快速查看）
│   │   ├── student-filters.tsx     # 筛选条件
│   │   ├── student-signals.tsx     # 预警信号（欠费/流失风险）
│   │   ├── kpi-cards.tsx           # 统计卡片
│   │   ├── month-calendar.tsx      # 月度日历视图
│   │   ├── status-badge.tsx        # 状态标签
│   │   ├── new-student-button.tsx  # 新建按钮
│   │   ├── new-student-modal.tsx   # 新建弹窗
│   │   └── attendance-edit-modal.tsx # 考勤编辑弹窗
│   │
│   ├── courses/            # 课程相关组件（7 个）
│   │   ├── course-card.tsx         # 课程卡片
│   │   ├── course-manage-modal.tsx # 课程管理弹窗
│   │   ├── new-course-button.tsx   # 新建按钮
│   │   ├── new-course-modal.tsx    # 新建弹窗
│   │   ├── roster-tab.tsx          # 花名册 Tab（310 行，最大）
│   │   ├── enroll-tab.tsx          # 报名 Tab
│   │   └── attendance-tab.tsx      # 考勤 Tab
│   │
│   ├── finance/            # 财务组件（5 个）
│   │   ├── recharge-form.tsx       # 充值表单
│   │   ├── consume-form.tsx        # 消费表单
│   │   ├── refund-form.tsx         # 退费表单
│   │   ├── transaction-list.tsx    # 流水列表
│   │   └── student-picker.tsx      # 学员选择器
│   │
│   ├── followups/          # 跟进组件（2 个）
│   │   ├── followups-shell.tsx     # 跟进外壳页（249 行）
│   │   └── new-followup-modal.tsx  # 新建跟进弹窗
│   │
│   ├── campus/             # 校区组件（4 个）
│   │   ├── department-tree.tsx     # 部门树（223 行）
│   │   ├── department-edit-modal.tsx # 部门编辑弹窗
│   │   ├── staff-table.tsx         # 员工列表
│   │   └── staff-edit-modal.tsx    # 员工编辑弹窗
│   │
│   ├── settings/           # 设置组件（3 个）
│   │   ├── company-form.tsx        # 公司信息表单
│   │   ├── profile-form.tsx        # 个人资料表单
│   │   └── tabs.tsx                # 设置 Tab 栏
│   │
│   └── ui/                 # 通用 UI 组件（3 个）
│       ├── modal.tsx               # 通用弹窗
│       ├── form.tsx                # 表单组件
│       └── phone-input.tsx         # 手机号输入
│
├── lib/                    # 业务逻辑与工具层（18 个文件）
│   ├── api/                # API 客户端（14 个，每个对应一个数据域）
│   │   ├── students.ts         # 学员 CRUD API
│   │   ├── student-detail.ts   # 学员详情 API
│   │   ├── courses.ts          # 课程 API
│   │   ├── courses-client.ts   # 课程客户端 API
│   │   ├── finance.ts          # 财务 API
│   │   ├── finance-client.ts   # 财务客户端 API
│   │   ├── followups.ts        # 跟进 API
│   │   ├── campus.ts           # 校区 API
│   │   ├── create.ts           # 创建操作 API
│   │   ├── lookups.ts          # 查找/搜索 API
│   │   ├── signals.ts          # 预警信号 API
│   │   ├── signals-client.ts   # 预警信号客户端 API
│   │   ├── settings.ts         # 设置 API
│   │   └── company.ts          # 公司信息 API
│   │
│   ├── auth/               # 鉴权上下文
│   │   └── permissions-context.tsx  # 权限 Provider（角色/部门）
│   │
│   ├── supabase/           # Supabase SDK 实例
│   │   ├── client.ts       # 浏览器端 Client（createBrowserClient）
│   │   └── server.ts       # 服务端 Client（createServerClient）
│   │
│   ├── format.ts           # 格式化工具（金额/日期/枚举）
│   ├── permissions.ts      # 权限检查函数
│   └── utils.ts            # 通用工具函数
│
├── public/                 # 静态资源（当前仅 .gitkeep，无文件）
│   └── .gitkeep
│
├── Dockerfile              # 多阶段 Docker 构建（node:20-alpine）
├── DEPLOY.md               # 阿里云 SAE 部署指南（197 行）
├── tailwind.config.ts      # Tailwind 主题配置（品牌色/中文字体）
├── next.config.mjs         # Next.js 配置（standalone 输出）
├── tsconfig.json           # TypeScript 配置（strict / @ 路径别名）
├── postcss.config.js       # PostCSS 配置
├── package.json            # 项目依赖与脚本
├── .env.local.example      # 环境变量模板
├── .dockerignore           # Docker 构建忽略
└── .gitignore              # Git 忽略规则
```

---

## 二、架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────┐
│  Page Layer (app/)                       │
│  pages + layouts + API routes            │
├─────────────────────────────────────────┤
│  Component Layer (components/)           │
│  模块化 UI 组件（students/courses/...）  │
├─────────────────────────────────────────┤
│  API Client Layer (lib/api/)             │
│  Supabase 查询封装，按数据域拆分         │
├─────────────────────────────────────────┤
│  Auth Layer (lib/auth/)                  │
│  权限上下文（角色 + 部门边界）            │
├─────────────────────────────────────────┤
│  Supabase Layer (lib/supabase/)          │
│  Client/Server SDK 实例                  │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Supabase Backend (aliyun-shanghai)      │
│  PostgreSQL + PostgREST + RLS + Realtime │
└─────────────────────────────────────────┘
```

### 2.2 数据流

1. **读操作**: Page → `lib/api/*.ts` → `supabase.from(...).select()` → PostgREST → PostgreSQL
2. **写操作**: Page → `lib/api/*.ts` → `supabase.rpc('rpc_*')` → PostgreSQL SECURITY DEFINER RPC（含审计 + 业务校验）
3. **权限**: Layout → `PermissionsProvider` → `get_my_role()` via JWT → RLS 策略在 DB 层生效
4. **实时**: `audit` channel → `postgres_changes` → Realtime WebSocket → 审计日志实时推送

### 2.3 关键设计决策

| 决策 | 理由 |
|------|------|
| 所有写操作走 RPC | 保证审计完整性 + 业务校验 + 行锁防并发 |
| 按数据域拆分 `lib/api/` | 单一职责，每文件 < 150 行，便于维护 |
| 无第三方 UI 库 | 纯 Tailwind + 自建 `components/ui/`，零外部依赖 |
| standalone 输出模式 | Docker 镜像瘦身至 ~150MB，适配 SAE 无冷启动 |
| `@/*` 路径别名 | `import { X } from "@/components/..."` 避免深层相对路径 |

---

## 三、页面路由详解

| 路由 | 文件 | 大小 | 状态 | 功能描述 |
|------|------|------|------|----------|
| `/` | `app/page.tsx` | 5 行 | ✅ | 重定向到 `/students` |
| `/students` | `app/students/page.tsx` | 81 行 | ✅ | 学员列表（表格 + 筛选 + 新建 + KPI 卡片） |
| `/students/[id]` | `app/students/[id]/page.tsx` | 327 行 | ✅ | 学员详情（档案/课程/财务/跟进/考勤 五 Tab） |
| `/courses` | `app/courses/page.tsx` | 67 行 | ✅ | 课程列表（卡片视图 + 课程管理弹窗） |
| `/finance` | `app/finance/page.tsx` | 61 行 | ✅ | 财务中心（充值/消费/退款 三操作 + 流水） |
| `/followups` | `app/followups/page.tsx` | 24 行 | ✅ | 跟进记录列表 |
| `/campus` | `app/campus/page.tsx` | 39 行 | ✅ | 校区管理（部门树 + 员工表） |
| `/settings` | `app/settings/page.tsx` | 53 行 | ✅ | 系统设置（公司 + 个人资料） |
| `/dashboard` | `app/dashboard/page.tsx` | 4 行 | 🚧 占位 | 数据看板（待开发） |
| `/audits` | `app/audits/page.tsx` | 4 行 | 🚧 占位 | 审计日志（待开发） |
| `/api/health` | `app/api/health/route.ts` | 13 行 | ✅ | 健康检查（SAE 存活探针） |
| `/api/ai/recommend-followup` | `app/api/ai/recommend-followup/route.ts` | 62 行 | ✅ | AI 生成跟进建议 |
| `/api/ai/recommend-recharge` | `app/api/ai/recommend-recharge/route.ts` | 40 行 | ✅ | AI 生成充值建议 |

---

## 四、组件模块详解

### 4.1 学员模块 (`components/students/`) — 10 个组件，1687 行

最复杂的模块，核心组件：

- **`student-table.tsx`** (427 行): 学员表格，含排序、分页、行内操作（查看/编辑/跟进/充值）
- **`student-drawer.tsx`**: 右侧快速查看抽屉，无需离开列表页
- **`student-signals.tsx`**: 预警信号系统（余额不足 / 7 天未跟进 / 课程即将到期 / 流失风险）
- **`kpi-cards.tsx`**: 顶部统计卡片（总学员/在读/新签/退费 等数字）
- **`month-calendar.tsx`**: 按月的出勤日历视图

### 4.2 课程模块 (`components/courses/`) — 7 个组件，1010 行

- **`roster-tab.tsx`** (310 行): 课程花名册，含学员名单、消课记录、课时统计
- **`course-card.tsx`**: 课程卡片（含进度条、剩余名额、上课时间）
- **`course-manage-modal.tsx`**: 课程编辑弹窗（含 Tab：基本信息/学员花名册/考勤）

### 4.3 财务模块 (`components/finance/`) — 5 个组件，508 行

- **`recharge-form.tsx`**: 充值表单（学员选取 + 金额 + 支付方式 + 备注）
- **`consume-form.tsx`**: 消课表单（选择报名记录 + 课时数 + 单价）
- **`refund-form.tsx`**: 退费表单（校验当前余额）
- **`transaction-list.tsx`**: 交易流水列表（筛选：类型/日期/学员）

### 4.4 校区模块 (`components/campus/`) — 4 个组件，762 行

- **`department-tree.tsx`** (223 行): 递归部门树（展开/折叠/拖拽排序）
- **`staff-table.tsx`**: 员工列表（关联部门 + 角色）
- **`staff-edit-modal.tsx`**: 员工编辑弹窗

### 4.5 布局模块 (`components/layout/`) — 5 个组件，342 行

- **`sidebar.tsx`**: 侧边栏导航（图标 + 名称 + 当前路由高亮 + 折叠/展开）
- **`topbar.tsx`**: 顶部栏（面包屑 + 搜索 + 通知 + 用户头像）
- **`layout-context.tsx`**: 布局状态 Context（侧边栏折叠状态）
- **`user-menu.tsx`**: 用户下拉菜单（个人信息/设置/退出登录）

### 4.6 UI 通用组件 (`components/ui/`) — 3 个组件，119 行

- **`modal.tsx`**: 通用弹窗（支持 confirm/cancel，标题 + 内容 + 底部操作）
- **`form.tsx`**: 表单组件（统一错误状态展示 + 提交 Loading）
- **`phone-input.tsx`**: 中国手机号输入（自动格式化 138-0000-0001）

---

## 五、lib/api 层详解（14 个 API 文件）

API 层按**数据域**拆分，每个文件封装对该域的全部 Supabase 调用。命名规则：`<domain>.ts` 为服务端 API，`<domain>-client.ts` 为浏览器端 API。

| 文件 | 行数 | 职责 |
|------|------|------|
| `students.ts` | ~100 | 学员列表查询 + RPC 写操作 |
| `student-detail.ts` | ~150 | 学员详情页全部数据（含 JOIN 查询） |
| `courses.ts` | ~80 | 课程 CRUD + 报名查询 |
| `courses-client.ts` | ~50 | 课程浏览器端查询 |
| `finance.ts` | ~120 | 财务操作：充值/消课/退费 RPC 调用 |
| `finance-client.ts` | ~60 | 财务数据浏览器端查询 |
| `followups.ts` | ~70 | 跟进记录 CRUD |
| `campus.ts` | ~80 | 部门 + 员工管理 |
| `create.ts` | ~90 | 新建学员/课程/部门等创建操作 |
| `lookups.ts` | ~60 | 模糊搜索 + 下拉选项数据 |
| `signals.ts` | ~80 | 预警信号计算逻辑 |
| `signals-client.ts` | ~40 | 浏览器端信号数据获取 |
| `settings.ts` | ~60 | 用户个人设置 CRUD |
| `company.ts` | ~50 | 公司信息 CRUD |

**总计**: ~1,143 行 API 封装代码

---

## 六、权限体系

### 6.1 角色

| 角色 | 数据库角色 | 权限范围 |
|------|-----------|---------|
| admin | `acct_roles.role = 'admin'` | 全表读写 + 审计 + 系统配置 |
| teacher | `acct_roles.role = 'teacher'` | 课程/考勤读写 + 学员只读 |
| counselor | `acct_roles.role = 'counselor'` | 仅自己 assigned 的学员 |
| viewer | `acct_roles.role = 'viewer'` | 全表只读（不含审计） |

### 6.2 实现方式

1. **DB 层**: PostgreSQL RLS（Row Level Security）策略，基于 `auth.uid()` + `get_my_role()`
2. **前端层**: `PermissionsProvider` Context，注入角色 + 部门 ID
3. **API 层**: `lib/permissions.ts` 提供 `canEdit()`, `canView()`, `isAssignedTo()` 等辅助函数
4. **UI 层**: 按钮/菜单条件渲染，如只有 counselor 看到"仅我的学员"筛选

---

## 七、技术栈

### 运行时
| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14.2.18 | React 框架（App Router） |
| React | 18.3.1 | UI 框架 |
| TypeScript | 5.6.3 | 类型系统 |
| Tailwind CSS | 3.4.15 | 原子化 CSS |
| Supabase JS | 2.46.1 | 数据库 + Auth + Realtime SDK |
| Supabase SSR | 0.5.2 | Next.js 服务端渲染鉴权 |

### 工具库
| 库 | 版本 | 用途 |
|------|------|------|
| lucide-react | 0.460.0 | 图标库 |
| clsx | 2.1.1 | 条件 className 拼接 |
| tailwind-merge | 2.5.4 | 智能 Tailwind class 合并 |

### 部署链
| 环节 | 技术 |
|------|------|
| 构建 | `next build` → standalone output |
| 容器 | Docker (node:20-alpine, 多阶段构建) |
| 镜像仓库 | Alibaba Cloud ACR (cn-shanghai) |
| 运行平台 | Alibaba Cloud SAE (Serverless App Engine) |
| 负载均衡 | ALB (Application Load Balancer) + HTTPS |
| CDN | Alibaba Cloud DCDN (可选) |
| 监控 | SLS 日志 + ARMS 监控 + 云监控告警 |

---

## 八、构建与部署流程

```
本地开发               CI/CD / 手动                 阿里云
───────              ─────────────               ──────
npm run dev    →     npm run build        →     SAE 拉取镜像
(localhost:3000)     (standalone output)        (容器运行 :3000)
                           │                         │
                           ▼                         ▼
                     docker build             ALB (HTTPS:443)
                     docker push              → /api/health 探活
                     → ACR 镜像仓库           → 静态走 DCDN
```

**快速启动**:

```bash
# 本地开发
cd agent-first-erp
cp .env.local.example .env.local   # 填入 SUPABASE_URL + ANON_KEY
npm install
npm run dev                        # http://localhost:3000
```

**生产构建**:

```bash
npm run build                      # → .next/standalone/
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://47.102.28.236:80 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<key> \
  -t registry.cn-shanghai.aliyuncs.com/agent-erp/admin:v1 .
docker push registry.cn-shanghai.aliyuncs.com/agent-erp/admin:v1
```

---

## 九、文件规模统计

| 类别 | 文件数 | 总行数 |
|------|--------|--------|
| 页面 (`app/`) | 14 | ~745 |
| 组件 (`components/`) | 40 | ~5,100 |
| API 层 (`lib/api/`) | 14 | ~1,143 |
| 工具 (`lib/*.ts`) | 3 | ~135 |
| Auth (`lib/auth/`) | 1 | ~78 |
| Supabase (`lib/supabase/`) | 2 | ~32 |
| 配置文件 | 7 | ~200 |
| 部署文档 | 1  | ~197 |
| **总计** | **82** | **~7,630** |

---

## 十、开发规范

### 10.1 文件命名
- 页面: `page.tsx`, `layout.tsx`, `route.ts`
- 组件: `kebab-case.tsx`
- 工具: `camelCase.ts`
- API 客户端: `domain-client.ts` (浏览器端), `domain.ts` (服务端)

### 10.2 导入规范
- 始终使用 `@/` 路径别名，禁止超过 2 层的相对路径
- 组件导入: `@/components/students/student-table`
- lib 导入: `@/lib/api/students`

### 10.3 API 调用规范
```typescript
// ✅ 读操作：直接 Supabase 查询
const { data } = await supabase
  .from('v_student_overview')
  .select('*')
  .order('created_at', { ascending: false })

// ✅ 写操作：必须走 RPC
const { error } = await supabase.rpc('rpc_create_student', {
  p_name: '李小明',
  p_parent_phone: '13800001001'
})

// ✅ 错误处理：解析自定义错误码
if (error?.message?.startsWith('DUPLICATE_ENROLLMENT')) {
  toast.error('该学员已报名此课程')
}
```

### 10.4 组件规范
- 每个组件文件只导出**一个**主组件
- 使用 TypeScript 接口定义 Props
- 状态管理优先用 `useState` / `useEffect`，复杂状态考虑 `useReducer`
- UI 禁用态、加载态、空态、错误态全部覆盖

---

## 十一、待开发功能

| 优先级 | 功能 | 预计工时 |
|--------|------|----------|
| 🔴 P0 | 登录页（`/login`）+ Supabase Auth 集成 | 1 天 |
| 🔴 P0 | 数据库 Views 安全加固（PII 泄漏修复） | 0.5 天 |
| 🟡 P1 | Dashboard 数据看板（recharts 图表） | 3 天 |
| 🟡 P1 | 审计日志页面（Realtime 实时流） | 2 天 |
| 🟢 P2 | 家长 APP 后端 API 对接 | 1 周 |
| 🟢 P2 | 论坛模块 | 2 周 |
| 🔵 P3 | CMS 公告模块 | 1 周 |
| 🔵 P3 | BI 看板（Metabase/Superset 接入） | 持续 |

---

## 十二、参考资源

- **项目对接总览**: `../project-overview.md`
- **前端 PRD**: `docs/frontend-prd.md` (PR `claude/blissful-spence` 分支)
- **部署指南**: `DEPLOY.md`
- **数据库 Schema**: `migrations/010_full_schema.sql`
- **MCP 工具定义**: `mcp-tools/tool-schemas.json`
- **GitHub**: `https://github.com/AaronhekWu/agent-first-erp`
- **Supabase 实例**: `http://47.102.28.236:80` (aliyun-shanghai)
