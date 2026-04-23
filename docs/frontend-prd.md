# Agent-First ERP · 前端对接文档 (PRD)

---

## 目录

1. [基础连接配置](#1-基础连接配置)
2. [鉴权与角色体系](#2-鉴权与角色体系)
3. [数据读取 API（视图 + 直查表）](#3-数据读取-api)
4. [写操作 API（RPC 函数）](#4-写操作-api-rpc-函数)
5. [模块枚举值速查](#5-枚举值速查)
6. [各页面表单字段规范](#6-各页面表单字段规范)
7. [错误码处理](#7-错误码处理)
8. [Realtime 实时订阅](#8-realtime-实时订阅)
9. [GraphQL 接口](#9-graphql-接口)
10. [种子数据（部门 / 角色）](#10-种子数据)
11. [技术栈建议](#11-技术栈建议)

---

## 1. 基础连接配置

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  'http://47.102.28.236:80',   // NEXT_PUBLIC_SUPABASE_URL
  '<anon_key>'                   // NEXT_PUBLIC_SUPABASE_ANON_KEY
)
```

```ts
// lib/supabase/server.ts  (Server Component / Route Handler)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
}
```

**.env.local**
```
NEXT_PUBLIC_SUPABASE_URL=http://47.102.28.236:80
NEXT_PUBLIC_SUPABASE_ANON_KEY=<从后端获取>
```

> 所有写操作通过 **RPC 函数** 调用（见第 4 节），前端永远不直接 INSERT/UPDATE/DELETE 业务表。

---

## 2. 鉴权与角色体系

### 2.1 登录 / 登出

```ts
// 邮箱密码登录
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// 登出
await supabase.auth.signOut()

// 获取当前用户
const { data: { user } } = await supabase.auth.getUser()
```

### 2.2 JWT 中的角色信息

登录后从 `user.app_metadata` 读取角色，**不需要额外请求**：

```ts
const role = user.app_metadata?.role          // 'admin' | 'teacher' | 'counselor' | 'viewer'
const deptIds = user.app_metadata?.department_ids  // string[] — 所属部门 ID 列表
```

### 2.3 四角色权限矩阵

| 操作 | admin | counselor | teacher | viewer |
|---|:---:|:---:|:---:|:---:|
| 查看所有学员 | ✅ | 仅本部门/assigned | ✅ | ✅ |
| 创建/编辑学员 | ✅ | ✅（仅 assigned） | — | — |
| 充值 / 退费 | ✅ | ✅ | — | — |
| 报名 / 消课 | ✅ | ✅ | ✅ | — |
| 记录考勤 | ✅ | — | ✅ | — |
| 建课程 / 促销 | ✅ | — | — | — |
| 查看审计日志 | ✅ | — | — | — |

> RLS 在数据库层自动过滤，前端只需根据 `role` 控制 UI 入口的显示/隐藏，无需自行做数据过滤。

### 2.4 middleware.ts（路由保护）

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/login')) return NextResponse.next()

  // 验证 session
  const supabase = createServerClient(/* ... */)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.redirect(new URL('/login', request.url))

  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next|favicon).*)'] }
```

---

## 3. 数据读取 API

### 3.1 学员列表（推荐使用视图）

**视图：`v_student_overview`**

```ts
// 分页查询（20条/页）
const { data, count } = await supabase
  .from('v_student_overview')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(offset, offset + 19)

// 按状态筛选
  .eq('status', 'active')

// 按顾问筛选
  .eq('assigned_to', counselorId)
```

**返回字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 学员 ID |
| name | varchar | 姓名 |
| phone | varchar | 手机号 |
| gender | varchar | male / female |
| status | varchar | active / inactive / graduated |
| school | varchar | 学校 |
| grade | varchar | 年级 |
| source | varchar | 来源渠道 |
| department_id | uuid | 所属部门 |
| department_name | varchar | 部门名称 |
| assigned_to | uuid | 负责顾问 ID |
| counselor_name | varchar | 顾问姓名 |
| balance | numeric | 当前余额 |
| total_recharged | numeric | 累计充值 |
| total_consumed | numeric | 累计消费 |
| enrollment_count | bigint | 报名课程总数 |
| active_enrollment_count | bigint | 在读课程数 |
| last_followup_at | timestamptz | 最后跟进时间 |
| last_followup_type | varchar | 最后跟进方式 |
| created_at | timestamptz | 创建时间 |

### 3.2 模糊搜索学员（RPC）

```ts
const { data } = await supabase.rpc('search_students_by_name', {
  p_query: '张三',    // 支持中文模糊
  p_limit: 10
})
// 返回: id, name, phone, status, school, grade, assigned_to, department_id, similarity
```

### 3.3 学员完整生命周期（RPC）

```ts
const { data } = await supabase.rpc('rpc_get_student_lifecycle', {
  p_student_id: studentId
})
```

**返回结构：**
```json
{
  "student": {
    "id": "uuid", "name": "张三", "phone": "138...", "gender": "male",
    "school": "...", "grade": "初一", "status": "active", "source": "wechat",
    "assigned_to": "uuid", "department_id": "uuid",
    "counselor_name": "顾问姓名", "department_name": "教学部",
    "created_at": "...", "updated_at": "...", "deleted_at": null
  },
  "account": {
    "balance": 4300.00, "total_recharged": 5000.00,
    "total_consumed": 200.00, "total_refunded": 500.00,
    "frozen_amount": 0.00, "status": "active"
  },
  "parents": [
    { "name": "王父", "phone": "138...", "relationship": "父亲", "is_primary_contact": true }
  ],
  "enrollments": [
    {
      "id": "uuid", "course_id": "uuid", "course_name": "数学培训班", "subject": "数学",
      "status": "enrolled", "unit_price": 200.00, "consumed_lessons": 1,
      "remaining_lessons": null, "enrolled_at": "..."
    }
  ],
  "transactions": [
    {
      "type": "recharge", "amount": 5000.00,
      "balance_before": 0.00, "balance_after": 5000.00,
      "description": "充值 5000", "created_at": "..."
    }
  ],
  "followups": [
    {
      "type": "wechat", "content": "...", "result": "interested",
      "next_plan": "下周回访", "next_date": "2026-04-28T10:00:00+08:00",
      "creator_name": "顾问姓名"
    }
  ],
  "tags": []
}
```

### 3.4 报名列表

```ts
const { data } = await supabase
  .from('crs_enrollments')
  .select(`
    id, status, enrolled_at, unit_price, total_lessons,
    consumed_lessons, remaining_lessons, total_amount,
    crs_courses(id, name, subject, level)
  `)
  .eq('student_id', studentId)
  .order('enrolled_at', { ascending: false })
```

### 3.5 财务流水

```ts
const { data } = await supabase
  .from('fin_transactions')
  .select('id, type, amount, balance_before, balance_after, description, reference_type, reference_id, created_at')
  .eq('account_id', accountId)
  .order('created_at', { ascending: false })
  .limit(50)

// 单独查退费记录（退费没有独立表，通过 type='refund' 过滤流水即可）
const { data: refunds } = await supabase
  .from('fin_transactions')
  .select('id, amount, description, created_at')
  .eq('account_id', accountId)
  .eq('type', 'refund')
  .order('created_at', { ascending: false })
```

> `fin_refunds` 表**不存在**。退费记录统一通过 `fin_transactions WHERE type='refund'` 查询，`description` 字段含退费原因。

### 3.6 跟进历史

```ts
const { data } = await supabase
  .from('flup_records')
  .select('id, type, content, result, next_plan, next_date, created_at')
  .eq('student_id', studentId)
  .order('created_at', { ascending: false })
```

### 3.7 待跟进列表（视图）

```ts
const { data } = await supabase
  .from('v_pending_followups')
  .select('*')
  .order('next_date', { ascending: true })
// urgency 字段值: 'overdue' | 'today' | 'upcoming'
```

### 3.8 仪表盘数据（RPC）

```ts
const { data } = await supabase.rpc('rpc_get_dashboard_summary', {
  p_date_from: '2026-04-01',
  p_date_to: '2026-04-30'
})
```

**返回结构（实测）：**
```json
{
  "period": { "from": "2026-04-01", "to": "2026-04-30" },
  "students": {
    "total": 128,
    "active": 96,
    "new_in_period": 12
  },
  "finance": {
    "recharges": 52000.00,
    "consumption": 8600.00,
    "refunds": 1200.00,
    "net_revenue": 50800.00
  },
  "courses": {
    "active": 14,
    "active_enrollments": 96
  },
  "followups": { "pending": 8 },
  "monthly_revenue": [
    { "month": "2026-04", "recharge": 52000.00, "consume": 8600.00, "refund": 1200.00 }
  ]
}
```

### 3.9 顾问业绩（视图）

```ts
const { data } = await supabase
  .from('v_counselor_performance')
  .select('*')
  .order('recharge_amount_30d', { ascending: false })
```

### 3.10 课程统计（视图）

```ts
const { data } = await supabase
  .from('v_course_stats')
  .select('*')
  .eq('status', 'active')
```

### 3.11 收入汇总（视图）

```ts
const { data } = await supabase
  .from('v_revenue_summary')
  .select('*')
  .order('month', { ascending: false })
  .limit(12)
```

### 3.12 课程列表

```ts
const { data } = await supabase
  .from('crs_courses')
  .select('id, name, subject, level, status, fee, max_capacity, start_date, end_date, schedule_info')
  .eq('status', 'active')
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
```

### 3.13 考勤记录

```ts
const { data } = await supabase
  .from('crs_attendance')
  .select('id, class_date, status, notes, created_at')
  .eq('enrollment_id', enrollmentId)
  .order('class_date', { ascending: false })
```

### 3.14 审计日志（仅 admin）

```ts
const { data } = await supabase
  .from('aud_operation_logs')
  .select('id, action, resource_type, resource_id, changes, created_at, acct_profiles(display_name)')
  .order('created_at', { ascending: false })
  .limit(100)
```

---

## 4. 写操作 API（RPC 函数）

> 所有写操作通过 `supabase.rpc()` 调用，禁止直接 INSERT/UPDATE 业务表。

### 4.1 创建学员

```ts
const { data, error } = await supabase.rpc('rpc_create_student', {
  p_name: '张三',              // 必填
  p_phone: '13800138000',      // 可选
  p_gender: 'male',            // 可选: male | female
  p_birth_date: '2012-05-20',  // 可选: YYYY-MM-DD
  p_email: null,               // 可选
  p_school: '北京第一中学',    // 可选
  p_grade: '初一',             // 可选
  p_source: 'wechat',          // 可选: wechat|referral|walk_in|phone|other
  p_notes: null,               // 可选
  p_assigned_to: counselorId,  // 可选: 顾问 UUID
  p_department_id: deptId,     // 可选: 部门 UUID
  p_parent_name: '张父',       // 可选: 家长姓名
  p_parent_phone: '138...',    // 可选: 家长手机
  p_parent_relation: '父亲',   // 可选: 家长关系
  // p_operator_id 留空，由服务端取 auth.uid()
})
// 成功: { student_id: "uuid", account_id: "uuid", message: "学员创建成功" }
```

### 4.2 更新学员

```ts
const { data, error } = await supabase.rpc('rpc_update_student', {
  p_student_id: studentId,    // 必填
  p_name: '张三（改）',       // 以下全部可选，传 null 或不传 = 保持原值
  p_phone: null,
  p_gender: 'female',         // male | female
  p_birth_date: null,         // YYYY-MM-DD
  p_email: null,
  p_school: '北京二中',
  p_grade: '初二',
  p_status: 'active',         // active | inactive | graduated
  p_source: null,
  p_notes: null,
  p_assigned_to: null,        // UUID
  p_department_id: null       // UUID
})
// 成功: { message: "学员更新成功", student_id: "uuid" }
// 失败: STUDENT_NOT_FOUND
```

> 所有可选字段传 `null` 表示"不修改"，已写入的值会保留。审计日志自动记录变更前后的快照。

### 4.3 学员充值

```ts
const { data, error } = await supabase.rpc('rpc_recharge', {
  p_student_id: studentId,          // 必填
  p_amount: 2000.00,                // 必填: 充值金额 (> 0)
  p_payment_method: 'wechat',       // 必填: 见枚举值
  p_campaign_id: null,              // 可选: 活动 UUID
  p_bonus_amount: 0.00,             // 可选: 赠送金额
  p_notes: '年度会员充值',           // 可选
  p_payment_ref: 'WX202604210001'   // 可选: 支付流水号
})
// 成功: { message: "充值成功", recharge_id: "uuid", transaction_id: "uuid", new_balance: 2000.00 }
// 失败: STUDENT_NOT_FOUND / INVALID_AMOUNT / INVALID_INPUT（payment_method 不合法）
```

### 4.4 退费

```ts
const { data, error } = await supabase.rpc('rpc_refund', {
  p_student_id: studentId,   // 必填
  p_amount: 500.00,          // 必填: 退费金额 (> 0, <= 余额)
  p_reason: '学员申请退课'   // 必填: 退费原因
})
// 成功: { message: "退费成功", transaction_id: "uuid", new_balance: 1500.00 }
// 失败: STUDENT_NOT_FOUND / ACCOUNT_NOT_FOUND / INSUFFICIENT_BALANCE / INVALID_AMOUNT / INVALID_INPUT（reason 为空）
```

### 4.5 报名课程

```ts
const { data, error } = await supabase.rpc('rpc_enroll_student', {
  p_student_id: studentId,  // 必填
  p_course_id: courseId,    // 必填
  p_price_id: priceId,      // 可选: 套餐 UUID
  p_campaign_id: null,      // 可选: 活动 UUID
  p_notes: null,            // 可选
  p_source: 'normal'        // 可选: normal | referral | transfer
})
// 成功: { message: "报名成功", enrollment_id: "uuid", unit_price: 200.00 }
// 失败: STUDENT_NOT_FOUND / COURSE_NOT_FOUND / COURSE_INACTIVE / DUPLICATE_ENROLLMENT / COURSE_FULL / CAMPAIGN_INVALID
```

### 4.6 记录考勤（可触发消课）

```ts
const { data, error } = await supabase.rpc('rpc_mark_attendance', {
  p_enrollment_id: enrollmentId,  // 必填
  p_class_date: '2026-04-21',     // 必填: YYYY-MM-DD
  p_status: 'present',            // 必填: present|absent|late|leave
  p_trigger_consume: true,        // 可选: 出勤时自动消课
  p_notes: null                   // 可选
})
// 成功: { message: "考勤记录成功", attendance_id: "uuid" }
```

### 4.7 手动消课

```ts
const { data, error } = await supabase.rpc('rpc_consume_lesson', {
  p_enrollment_id: enrollmentId,  // 必填
  p_lesson_count: 1,              // 可选: 默认 1
  p_unit_price: 200.00,           // 可选: 不传则用报名时单价
  p_attendance_id: null           // 可选: 关联考勤记录
})
// 成功: { message: "消课成功", log_id: "uuid", new_balance: 1300.00 }
// 失败: INSUFFICIENT_BALANCE / INSUFFICIENT_LESSONS
```

### 4.8 创建跟进记录

```ts
const { data, error } = await supabase.rpc('rpc_create_followup', {
  p_student_id: studentId,           // 必填
  p_type: 'wechat',                  // 必填: phone|wechat|visit|other
  p_content: '今日电话沟通，家长...',  // 必填: 跟进内容
  p_result: 'interested',            // 可选: 跟进结果
  p_next_plan: '下周再次电话',        // 可选: 下次计划
  p_next_date: '2026-04-28T10:00:00+08:00'  // 可选: ISO 8601
})
// 成功: { message: "跟进记录创建成功", followup_id: "uuid" }
```

### 4.9 创建课程

```ts
const { data, error } = await supabase.rpc('rpc_create_course', {
  p_name: '2026春季数学培训班',   // 必填
  p_subject: '数学',              // 可选
  p_level: '初一',                // 可选
  p_description: null,            // 可选
  p_max_capacity: 20,             // 可选: 班级容量
  p_fee: 200.00,                  // 可选: 单课费用
  p_start_date: '2026-05-01',     // 可选
  p_end_date: '2026-07-31',       // 可选
  p_schedule_info: {              // 可选: 排课信息 (JSON)
    "weekday": 3,                 // 0=周日 ... 6=周六
    "time": "15:00",
    "duration_minutes": 90
  },
  p_department_id: deptId         // 可选
})
// 成功: { message: "课程创建成功", course_id: "uuid" }
```

### 4.10 转移顾问

```ts
const { data, error } = await supabase.rpc('rpc_transfer_counselor', {
  p_student_id: studentId,
  p_new_counselor: newCounselorId,
  p_reason: '顾问离职转移'
})
// 成功: { message: "顾问转移成功" }
```

### 4.11 创建促销活动

```ts
const { data, error } = await supabase.rpc('rpc_create_campaign', {
  p_name: '五一充值送课时',       // 必填
  p_type: 'recharge_bonus',       // 必填
  p_description: null,
  p_discount_type: 'fixed',       // 可选: percent | fixed
  p_discount_value: 100.00,       // 可选: 折扣值
  p_gift_lessons: 2,              // 可选: 赠送课时
  p_applicable_course_ids: [],    // 可选: 适用课程 UUID 数组
  p_start_date: '2026-05-01',
  p_end_date: '2026-05-05',
  p_max_usage: 100                // 可选: 最大使用次数
})
// 成功: { message: "促销活动创建成功", campaign_id: "uuid" }
```

---

## 5. 枚举值速查

| 字段 | 枚举值 | 说明 |
|---|---|---|
| `student.status` | `active` / `inactive` / `graduated` | 在读 / 停课 / 毕业 |
| `student.gender` | `male` / `female` | — |
| `student.source` | `wechat` / `referral` / `walk_in` / `phone` / `other` | 来源渠道 |
| `enrollment.status` | `enrolled` / `completed` / `cancelled` / `transferred` | 报名状态 |
| `attendance.status` | `present` / `absent` / `late` / `leave` | 出勤 / 缺勤 / 迟到 / 请假 |
| `followup.type` | `phone` / `wechat` / `visit` / `other` | 跟进方式 |
| `transaction.type` | `recharge` / `consume` / `refund` / `transfer_out` / `transfer_in` / `gift` / `adjustment` | 交易类型 |
| `payment_method` | `cash` / `wechat` / `alipay` / `bank_transfer` / `other` | 支付方式 |
| `course.status` | `active` / `inactive` / `archived` | 课程状态 |
| `campaign.discount_type` | `percent` / `fixed` | 折扣类型 |
| `followup urgency` | `overdue` / `today` / `upcoming` | v_pending_followups 中 urgency 字段 |

---

## 6. 各页面表单字段规范

### 6.1 新建学员表单

```
必填:
  name           文本  最长 100 字

可选:
  phone          文本  手机号格式校验 /^1[3-9]\d{9}$/
  gender         单选  male | female
  birth_date     日期  YYYY-MM-DD，不超过今天
  school         文本
  grade          文本  建议下拉: 小学/初一/初二/初三/高一/高二/高三
  source         下拉  wechat|referral|walk_in|phone|other
  notes          多行文本
  assigned_to    搜索选择  搜索 acct_profiles，限 counselor 角色
  department_id  下拉  从 acct_departments 加载

家长信息（可选扩展区）:
  parent_name      文本
  parent_phone     文本  手机号格式
  parent_relation  文本  父亲|母亲|爷爷|奶奶|其他
```

### 6.2 充值表单

```
必填:
  student_id      搜索选择  先用 search_students_by_name 搜索
  amount          数字  > 0，精确到分（两位小数）
  payment_method  下拉  cash|wechat|alipay|bank_transfer|other

可选:
  campaign_id     下拉  加载 promo_campaigns WHERE status='active'
  bonus_amount    数字  赠送金额，>= 0
  payment_ref     文本  第三方支付流水号
  notes           文本

前端显示:
  当前余额 (从 v_student_overview.balance 读取)
  充值后余额 = 当前余额 + amount + bonus_amount（预览）
```

### 6.3 报名表单

```
必填:
  student_id  搜索选择
  course_id   搜索选择  加载 crs_courses WHERE status='active'

可选:
  campaign_id  下拉  活动列表
  notes        文本

前端逻辑:
  选课程后自动填充 unit_price（来自 crs_courses.fee）
  提交前展示报名费 = unit_price × total_lessons（如有套餐）
  余额不足时前端预警（balance < 应付金额）
```

### 6.4 考勤表单

```
必填:
  enrollment_id  下拉  学员当前 enrolled 状态的报名列表
  class_date     日期  默认今天，不超过今天
  status         单选  present|absent|late|leave

可选:
  trigger_consume  开关  默认开（出勤自动消课）
  notes            文本
```

### 6.5 跟进记录表单

```
必填:
  student_id  搜索选择（或由列表页传入）
  type        单选  phone|wechat|visit|other
  content     多行文本  跟进详情，最短 5 字

可选:
  result     文本  跟进结果（interested/follow_later/not_interested 等自定义）
  next_plan  文本  下次计划
  next_date  日期时间  下次联系时间，格式 YYYY-MM-DDTHH:MM:SS+08:00
```

### 6.6 创建课程表单

```
必填:
  name  文本  课程名称

可选:
  subject       文本  学科（数学/语文/英语/物理/...）
  level         下拉  小学/初一/初二/初三/高一/高二/高三
  description   多行文本
  max_capacity  数字  班级容量，正整数
  fee           数字  单课费用，精确到分
  start_date    日期
  end_date      日期
  department_id 下拉
  schedule_info 结构化: weekday(0-6) + time(HH:MM) + duration_minutes(整数)
```

---

## 7. 错误码处理

所有 RPC 调用失败时，`error.message` 格式为 `ERROR_CODE: 中文描述`。

```ts
async function callRpc(name: string, params: object) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    const [code, msg] = error.message.split(': ')
    throw new ERPError(code.trim(), msg?.trim() ?? error.message)
  }
  return data
}
```

**错误码速查：**

| 错误码 | 含义 | 触发场景 | 建议操作 |
|---|---|---|---|
| `STUDENT_NOT_FOUND` | 学员不存在或已删除 | recharge / refund / enroll / update | 刷新学员列表 |
| `ACCOUNT_NOT_FOUND` | 财务账户不存在 | refund | 联系管理员 |
| `INSUFFICIENT_BALANCE` | 余额不足 | refund / consume_lesson | 提示先充值，显示当前余额 |
| `INSUFFICIENT_LESSONS` | 课时不足 | consume_lesson | 提示剩余课时数 |
| `DUPLICATE_ENROLLMENT` | 已报名该课程 | enroll_student | 提示不能重复报名 |
| `COURSE_NOT_FOUND` | 课程不存在或已删除 | enroll_student | 刷新课程列表 |
| `COURSE_INACTIVE` | 课程非 active 状态 | enroll_student | 提示课程未开放报名 |
| `COURSE_FULL` | 课程已满员 | enroll_student | 提示联系管理员 |
| `CAMPAIGN_INVALID` | 活动无效或已过期 | recharge / enroll | 清空活动选项，重新选择 |
| `INVALID_AMOUNT` | 金额非法（<= 0） | recharge / refund | 高亮金额输入框 |
| `INVALID_INPUT` | 参数格式/枚举不合法 | recharge（payment_method）/ refund（reason 为空） | 高亮对应字段，展示提示 |

> **双重枚举保护**：payment_method / transaction.type / attendance.status / followup.type / student.status / student.gender / enrollment.status / course.status 均同时受 **RPC 前置校验**（返回 `INVALID_INPUT`）和**数据库 CHECK 约束**（返回 `23514`）保护。前端只需处理 `INVALID_INPUT`，无需关心 `23514`。

**通用错误处理组件示例：**
```ts
try {
  await callRpc('rpc_recharge', params)
  toast.success('充值成功')
} catch (e) {
  if (e instanceof ERPError) {
    if (e.code === 'INSUFFICIENT_BALANCE') {
      toast.error(`余额不足，当前余额 ¥${currentBalance}`)
    } else {
      toast.error(e.message)
    }
  }
}
```

---

## 8. Realtime 实时订阅

以下 4 张表已加入 `supabase_realtime` publication，前端可订阅实时变更：

```ts
// 审计日志实时流（admin 页面）
const channel = supabase
  .channel('audit-stream')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'aud_operation_logs'
  }, (payload) => {
    // payload.new — 新插入的日志记录
    setLogs(prev => [payload.new, ...prev])
  })
  .subscribe()

// 财务流水实时通知
supabase.channel('finance-stream')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'fin_transactions',
    filter: `account_id=eq.${accountId}`  // 过滤指定账户
  }, (payload) => { /* 更新余额显示 */ })
  .subscribe()

// 跟进记录实时（counselor 首页待办）
supabase.channel('followup-stream')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'flup_records'
  }, () => { refetchPendingFollowups() })
  .subscribe()

// 清理
supabase.removeChannel(channel)
```

---

## 9. GraphQL 接口

GraphQL 端点：`http://47.102.28.236:80/graphql/v1`

所有 25 张 ERP 表自动暴露，支持嵌套查询：

```graphql
# 学员 + 账户 + 报名（示例）
query StudentDetail($id: UUID!) {
  stuStudentsCollection(filter: { id: { eq: $id } }) {
    edges {
      node {
        id
        name
        phone
        status
        finAccountsCollection {
          edges {
            node { balance totalRecharged totalConsumed }
          }
        }
        crsEnrollmentsCollection(
          filter: { status: { eq: "enrolled" } }
        ) {
          edges {
            node {
              id status remainingLessons
              crsCourses { name subject level }
            }
          }
        }
      }
    }
  }
}
```

**GraphQL 请求头：**
```ts
const headers = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${session.access_token}`,
  'Content-Type': 'application/json'
}
```

> 注意：GraphQL 同样受 RLS 约束，counselor 只看到自己部门学员。

---

## 10. 种子数据

### 部门列表（固定，前端可硬编码或查表）

| id | name |
|---|---|
| `8e0422de-f874-468e-8efa-5573810adbfc` | 管理部 |
| `07f828ff-4aaa-49d9-b453-d97c490eacc3` | 市场部 |
| `edb7a501-ddf9-4649-b44f-cd04cf9bd111` | 教学部 |
| `0a731438-123a-45ea-a532-89426f1a456e` | 财务部 |

### 角色列表

| id | name | 说明 |
|---|---|---|
| `2f94dfe9-006a-447d-84f5-fc91ea808dce` | admin | 系统管理员 |
| `2cadca44-b031-47b1-bc65-0a829ce92317` | counselor | 课程顾问 |
| `a8ea2343-6042-4540-a912-953530ff6998` | teacher | 教师 |
| `c18c3a77-6081-4dce-964f-2bb0c82e75e4` | viewer | 只读用户 |

### 动态加载（推荐）

```ts
// 部门
const { data: departments } = await supabase
  .from('acct_departments')
  .select('id, name')
  .order('sort_order')

// 顾问列表（给学员选负责人用）
const { data: counselors } = await supabase
  .from('acct_profiles')
  .select('id, display_name')
  .eq('is_active', true)
```

> `display_name` 在用户注册时自动从 email 前缀兜底填充（如 `admin@erp.com` → `"admin"`）。若显示姓名为空，说明该用户是旧账号，可由 admin 在 `/settings/users` 补填。

---

## 11. 技术栈建议

```
框架:    Next.js 15 (App Router)
UI:      shadcn/ui + Tailwind CSS
数据:    @supabase/supabase-js @supabase/ssr
状态:    @tanstack/react-query v5（查询缓存 + 乐观更新）
图表:    recharts
表单:    react-hook-form + zod（字段校验）
时间:    dayjs（ISO 8601 处理）
```

### 推荐页面结构

```
/login                  登录
/dashboard              仪表盘 (KPI卡片 + 收入图表 + 待跟进)
/students               学员列表 (分页、搜索、筛选)
/students/[id]          学员详情 (Tab: 基本信息/财务/报名/跟进)
/students/new           新建学员
/finance                财务总览
/finance/recharge       充值操作
/finance/transactions   流水列表
/courses                课程列表
/courses/[id]           课程详情 (报名统计、考勤)
/courses/new            新建课程
/followups              跟进列表 + 待办提醒
/promotions             促销活动
/audit                  操作审计 (仅 admin, Realtime)
/settings/users         用户管理 (仅 admin)
```

### 关键实现提示

1. **写操作二次确认**：所有 RPC 写操作在提交前弹出 Modal 显示完整参数，用户确认后再调用。
2. **乐观更新**：充值/消课后立即更新本地余额显示，无需等待重新查询。
3. **搜索防抖**：`search_students_by_name` 建议 300ms 防抖，避免频繁调用。
4. **分页策略**：学员列表用 `range(offset, offset+19)` + `count: 'exact'`，每页 20 条。
5. **软删除过滤**：查询 `stu_students` / `crs_courses` 时加 `.is('deleted_at', null)`。
6. **时区处理**：所有 `timestamptz` 字段在数据库存 UTC，前端用 `dayjs(value).local()` 转本地时间显示。

---

---

## 12. 变更日志

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v1.1 | 2026-04-21 | 补充 `rpc_update_student`（migration 016）；修正仪表盘/生命周期返回结构；退费无独立表说明；新增 `COURSE_NOT_FOUND` / `COURSE_INACTIVE` 错误码；补充双重枚举约束说明；`display_name` email 兜底说明 |
| v1.0 | 2026-04-21 | 初版发布 |

---

*如有接口疑问，联系后端维护方提供 service_role key 用于 Postman/API 测试（勿用于前端代码）。*
