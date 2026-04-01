# Agent-First ERP · 教育企业智能学员信息平台

> 面向教育企业内部员工的智能学员信息平台。<br/>
> 员工通过 **微信** 或 **网页后台** 获取和更新学员信息；<br/>
> AI Agent 通过 **Tool Gateway** 调用共享业务能力；<br/>
> 系统采用 **Django 单体模块化架构 + Supabase 数据层**，强调 **业务解耦、低预算起步、可分块上线、可逐步扩展本地 AI 能力**。

---

## 当前开发状态（2026-03-30）

> **给接手的开发者 / AI：请先读这一节，再看下面的详细规格。**

### 已完成

#### Supabase 数据库层（全部就绪）

Supabase 项目 `nartypzacmsvfskcxfki`（ap-northeast-1）已完成 9 次迁移，24 张表已上线：

| 模块前缀 | 表 | 状态 |
|---|---|---|
| `acct_` | profiles / departments / roles / user_roles / user_departments | ✅ 已上线 |
| `stu_` | students / parents / tags / student_tags | ✅ 已上线 |
| `crs_` | courses / **course_prices** / enrollments（扩展财务字段） / attendance | ✅ 已上线 |
| `flup_` | records | ✅ 已上线 |
| `fin_` | **accounts / transactions / recharges / consumption_logs / transfers** | ✅ 已上线 |
| `promo_` | **campaigns / referrals** | ✅ 已上线 |
| `ai_` | **knowledge_docs / embeddings**（pgvector RAG） | ✅ 已上线 |
| `aud_` | operation_logs / agent_call_logs | ✅ 已上线 |

- RLS 行级安全策略已配置（admin / teacher / counselor / viewer 四级角色）
- `auth.users` 触发器已配置（新用户注册自动创建 `acct_profiles`）
- `pg_trgm` 模糊搜索、`moddatetime` 自动更新时间戳均已启用
- `pgvector` 扩展已启用，HNSW 索引支持向量相似度搜索
- 旧 `agt_*` 表已删除（Agent 配置/会话/消息由后端 Claude 管理）

#### Django 服务层（骨架完成，待接 Supabase 凭证运行）

```
apps/
├── core/         # Supabase 客户端、泛型 Repository、Pydantic 基础模型、依赖注入
├── accounts/     # 用户档案、角色、部门
├── students/     # 学员、家长、标签（含模糊搜索）
├── courses/      # 课程、价格方案、报名（含财务字段）、考勤
├── followups/    # 跟进记录、待提醒查询
├── finance/      # 学生账户、交易流水、充值、课消、转课
├── promotions/   # 促销活动、老带新推荐
├── agents/       # RAG 知识库文档、向量嵌入、工具执行接口
├── audits/       # 操作日志、Agent 调用日志（仅追加）
└── tools/        # ToolGateway + 工具注册表 + student/followup/course/finance 工具
```

每个模块结构一致：`models.py → repositories.py → services.py → views.py + urls.py`

### 尚未完成（下一步重点）

- **Django 后台页面**：模板、登录页、学员管理页、跟进管理页（当前只有 JSON API）
- **Supabase 凭证配置**：`.env` 文件中填写真实密钥后即可运行
- **AI 模型对接**：`agents/views.py` 中 `execute_tool` 端点已就绪，需接入真实 LLM（调用链：LLM → ToolGateway → Service → Supabase）
- **微信 Webhook**：预留了 `channel=wechat` 会话类型，需接入企业微信回调
- **身份认证中间件**：当前视图用 `HTTP_X_USER_ID` 头占位，需替换为 Supabase JWT 校验
- **files / reports 模块**：数据库层暂未建表，属于阶段 3

---

## 快速启动

```bash
# 1. 安装依赖
pip install -r requirements/dev.txt

# 2. 配置环境变量（填入真实 Supabase 密钥）
cp .env.example .env
# 编辑 .env，填写 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY

# 3. 启动
python manage.py runserver

# 健康检查
curl http://localhost:8000/health/
```

**Supabase 项目地址**：`https://supabase.com/dashboard/project/nartypzacmsvfskcxfki`

---

## 架构核心约束（开发者必读）

### AI Agent 不允许直接访问数据库

```
AI Agent
   │
   ▼
apps/tools/gateway.py  ← ToolGateway（唯一入口）
   │  ├─ 验证工具是否存在
   │  ├─ 执行工具函数
   │  └─ 写入 aud_agent_call_logs
   ▼
apps/tools/*_tools.py  ← 工具函数（通过 ToolContext 获取 Service）
   │
   ▼
apps/*/services.py     ← 业务逻辑（通过 Repository 访问数据）
   │
   ▼
apps/*/repositories.py ← 数据访问（通过 Supabase 客户端）
   │
   ▼
Supabase（RLS 兜底）
```

### 新增业务模块的正确姿势

1. 在 Supabase 执行 DDL 迁移（通过 MCP 工具 `apply_migration`）
2. 在 `apps/core/constants.py` 添加表名常量
3. 新建 `apps/<module>/models.py`（Pydantic，继承 `SupabaseModel`）
4. 新建 `apps/<module>/repositories.py`（继承 `BaseRepository[T]`）
5. 新建 `apps/<module>/services.py`（注入 Repository + `AuditService`）
6. 如需暴露给 AI Agent，在 `apps/tools/<module>_tools.py` 用 `@register_tool` 注册
7. 新建 `apps/<module>/views.py` + `urls.py`，在 `config/urls.py` 挂载
8. 在 `apps/core/deps.py` 注册服务实例

> **原则**：每层只依赖下一层，不跨层调用。Service 不直接用 Supabase 客户端，View 不直接用 Repository。

### 双客户端策略

| 客户端 | 用于 | RLS |
|---|---|---|
| `anon_client`（anon key） | 普通用户 API 请求 | 生效（用户只看自己权限内的数据） |
| `service_client`（service_role key） | ToolGateway、后台定时任务 | 绕过（Gateway 自行鉴权） |

---

## 项目结构

```
project-root/
├── manage.py
├── pyproject.toml
├── .env.example             # 环境变量模板
├── requirements/
│   ├── base.txt             # Django, supabase-py, pydantic
│   ├── dev.txt
│   └── prod.txt
├── config/
│   ├── settings/
│   │   ├── base.py          # 公共配置
│   │   ├── dev.py
│   │   └── prod.py
│   └── urls.py              # 主路由
├── apps/
│   ├── core/                # 基础设施（db, constants, models, repositories, deps, middleware）
│   ├── accounts/            # 用户、角色、部门
│   ├── students/            # 学员（含模糊搜索）
│   ├── courses/             # 课程、价格方案、报名、考勤
│   ├── followups/           # 跟进记录
│   ├── finance/             # 学生账户、交易流水、充值、课消、转课
│   ├── promotions/          # 促销活动、老带新推荐
│   ├── agents/              # RAG 知识库、向量嵌入、工具执行接口
│   ├── audits/              # 审计日志（仅追加）
│   └── tools/               # ToolGateway + 工具注册
└── templates/               # Django 模板（待填充）
```

---

## 设计原则

### 业务解耦

- 微信入口与网页入口解耦
- AI Agent 与业务系统解耦（通过 ToolGateway）
- 各模块独立，按需上线
- 不同层之间通过接口依赖，不直接引用实现

### 前后端不分离

- 主系统采用 Django 单体架构，服务端渲染
- 避免单独维护前端 SPA，降低初期复杂度
- API 端点仅供 Agent 和未来移动端使用

### 低预算优先

- 第一阶段不强依赖本地大模型
- AI 能力优先接入远程 AI API（已预置 `default_assistant` Agent 配置）
- 预留本地轻量模型、向量库（`vector` 扩展已在 Supabase 可用）、GPU 扩展位

### 安全与审计

- AI 不直接操作数据库
- 所有写操作自动写入 `aud_operation_logs`（通过 Service 层）
- 所有工具调用自动写入 `aud_agent_call_logs`（通过 ToolGateway）
- 审计日志仅支持追加，代码层面禁止 update / delete

---

## 分阶段施工进度

### 阶段 0：项目初始化 ✅ 完成

- [x] 初始化 Git 仓库
- [x] 建立 Django 项目骨架
- [x] 建立基础 README
- [x] 明确模块边界
- [x] 明确环境变量规范（`.env.example`）

### 阶段 1：业务数据底座 ✅ 完成（数据库层 + 服务层骨架）

- [x] accounts 模块
  - [x] 用户模型（`acct_profiles`）
  - [x] 角色模型（`acct_roles`，含权限字符串数组）
  - [x] 部门模型（`acct_departments`，支持层级）
  - [x] 基础 RBAC（`AccountService.user_has_role / user_has_permission`）
- [x] students 模块
  - [x] 学员基础信息（含软删除）
  - [x] 家长信息
  - [x] 标签关系（多对多）
  - [x] 模糊搜索（`pg_trgm` GIN 索引）
- [x] courses 模块
  - [x] 课程
  - [x] 报名
  - [x] 考勤统计
- [x] followups 模块
  - [x] 跟进记录
  - [x] 待提醒查询（部分索引）
- [x] audits 模块
  - [x] 操作日志（仅追加）
  - [x] Agent 调用日志
- [ ] **Django 后台页面（待做）**
  - [ ] 登录页
  - [ ] 学员管理页（列表 / 详情 / 编辑）
  - [ ] 跟进管理页
  - [ ] 首页 / 仪表盘

### 阶段 2：AI 接入层 ✅ 骨架完成，待对接真实 LLM

- [x] Tool Gateway（`apps/tools/gateway.py`）
- [x] 工具注册表（`@register_tool` 装饰器）
- [x] 学员查询工具（`search_students`, `get_student_detail`）
- [x] 跟进工具（`get_followup_history`, `create_followup`）
- [x] 课程工具（`get_enrollments`, `get_attendance_summary`）
- [x] 会话管理 API（`POST /api/v1/agents/sessions/`）
- [x] 工具执行 API（`POST /api/v1/agents/tools/execute/`）
- [x] Agent 调用日志自动记录
- [ ] **接入真实 LLM（待做）**：在 `agents/views.py` 中实现消息路由逻辑（用户消息 → LLM → 工具调用 → 回复）
- [ ] **Supabase JWT 认证中间件（待做）**：替换当前 `HTTP_X_USER_ID` 占位
- [ ] **微信 Webhook（待做）**：企业微信回调 → 创建 `channel=wechat` 会话 → 调用 Agent

### 阶段 3：文件池与报表（未开始）

- [ ] `stu_files` / `stu_file_permissions` 表迁移
- [ ] files 模块（元数据 + Supabase Storage 适配）
- [ ] reports 模块（学员统计 / 跟进统计 / 课程分析）
- [ ] 报表导出审计

### 阶段 4：多 Agent 系统与 AI 能力

- [x] `pgvector` 扩展启用，知识库表 `ai_knowledge_docs` / `ai_embeddings` 已建
- [x] RAG 知识库服务（KnowledgeService）已实现
- [ ] **校长 Agent**（统管全局）+ 4 个部门 Sub-Agent（行政/市场/教学/财务）后端集成
- [ ] 向量嵌入生成（接入 LLM Embedding API）
- [ ] 部门知识库内容填充
- [ ] 校区助手 AI 界面（预留接口已就绪，待后续实现）
- [ ] 本地轻量模型插拔

---

## API 端点一览

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/health/` | 健康检查 |
| `GET` | `/api/v1/accounts/roles/` | 角色列表 |
| `GET` | `/api/v1/accounts/departments/` | 部门列表 |
| `GET` | `/api/v1/students/` | 学员列表（分页） |
| `GET` | `/api/v1/students/search/?q=张三` | 学员模糊搜索 |
| `POST` | `/api/v1/students/create/` | 创建学员 |
| `GET` | `/api/v1/students/<id>/` | 学员详情（含家长、标签） |
| `GET` | `/api/v1/courses/` | 课程列表 |
| `GET` | `/api/v1/courses/enrollments/<student_id>/` | 学员报名记录 |
| `GET` | `/api/v1/courses/attendance/<student_id>/` | 学员考勤统计 |
| `GET` | `/api/v1/followups/<student_id>/` | 学员跟进历史 |
| `POST` | `/api/v1/followups/create/` | 创建跟进记录 |
| `GET` | `/api/v1/followups/reminders/` | 待发送提醒列表 |
| `GET` | `/api/v1/finance/accounts/<student_id>/` | 学生账户余额 |
| `GET` | `/api/v1/finance/transactions/<student_id>/` | 交易流水 |
| `POST` | `/api/v1/finance/recharge/` | 充值 |
| `GET` | `/api/v1/promotions/campaigns/` | 活跃促销活动列表 |
| `GET` | `/api/v1/promotions/campaigns/<id>/` | 促销活动详情 |
| `POST` | `/api/v1/promotions/campaigns/create/` | 创建促销活动 |
| `POST` | `/api/v1/promotions/referrals/create/` | 创建老带新推荐 |
| `GET` | `/api/v1/promotions/referrals/<student_id>/` | 学生推荐记录 |
| `GET` | `/api/v1/agents/knowledge/` | 知识库文档列表 |
| `GET` | `/api/v1/agents/knowledge/<id>/` | 知识库文档详情 |
| `POST` | `/api/v1/agents/knowledge/create/` | 创建知识库文档 |
| `POST` | `/api/v1/agents/tools/execute/` | 执行工具调用（ToolGateway） |
| `GET` | `/api/v1/agents/tools/` | 可用工具列表 |
| `GET` | `/api/v1/audits/operations/` | 操作日志查询 |
| `GET` | `/api/v1/audits/agent-calls/<session_id>/` | Agent 调用日志 |

---

## 技术决策

### 已确定

- **主框架**：Django 5.x，前后端不分离，服务端渲染
- **数据层**：Supabase（PostgreSQL 17.6）+ supabase-py 客户端（非 Django ORM）
- **数据模型**：Pydantic v2（与 Django ORM 解耦，便于未来迁移数据库）
- **认证**：Supabase Auth（JWT），通过 `acct_profiles` 扩展用户信息
- **AI 接入**：Tool Gateway 模式，AI 不直连数据库
- **审计**：双轨日志（操作日志 + Agent 调用日志），仅追加不可修改

### 暂不确定 / 待评估

- 企业微信正式接入方式
- 远程 LLM 供应商（`default_assistant` 配置中预置 `claude-sonnet-4-20250514`，可改）
- 文件存储：Supabase Storage vs 本地 OSS
- 是否引入 Celery（当前跟进提醒依赖轮询，量大时需要）
- 是否在阶段 3 引入 `pgvector`
- 本地轻量模型选型

---

## 给 AI 开发助手的指引

### 必须遵守

1. **Django 单体模块化**，不要拆微服务
2. **前后端不分离**，页面用 Django 模板
3. **AI Agent 不允许直接读写数据库**，必须通过 ToolGateway
4. **新工具用 `@register_tool` 注册**，在 `agents/views.py` 的导入列表中添加
5. **所有写操作调用 `AuditService.log_operation`**
6. **新模块遵循 models → repositories → services → views 四层结构**
7. **表名使用常量**（`apps/core/constants.py`），不硬编码字符串

### 当前最高优先级任务

1. **填充 `.env`**，验证 Supabase 连接
2. **Django 模板**：登录页 + 学员管理页 + 跟进管理页
3. **LLM 对接**：在 `agents/views.py` 中实现完整的对话循环（用户消息 → LLM → 工具调用 → 回复 → 保存消息）
4. **JWT 中间件**：用 Supabase JWT 替换 `HTTP_X_USER_ID` 占位头

### 不要做的事

- 不要构建复杂微服务
- 不要先写前后端分离 SPA
- 不要先接入重型本地大模型
- 不要让 Agent 绕过 ToolGateway 直连 Supabase
- 不要在没有审计日志的情况下执行写操作
- 不要修改 `aud_*` 表的仅追加约束

---

## License

待定

## Maintainers

待补充
