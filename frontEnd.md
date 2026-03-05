# 教育企业AI系统前端技术文档

## 执行摘要

本文档为教育企业AI集成系统的前端开发团队提供详细的技术规范、架构设计、开发指南和交付标准。前端团队负责构建五个核心业务模块的用户界面：财务管理仪表板、市场营销CRM系统、教学学习平台、内容运营系统和招生转化管理。

前端采用**React 18 + TypeScript + Redux Toolkit + Ant Design Pro**的现代技术栈，支持Web和移动跨平台应用。前端团队规模为5-6人，分别负责不同业务模块的UI/UX设计与实现。

---

## 一、前端技术栈详细规范

### 1.1 核心框架与库

**前端主框架**：
- React 18.2+ - 现代UI框架，提供声明式组件开发
- TypeScript 5+ - 静态类型系统，提升代码质量和可维护性
- Vite 5+ - 高性能构建工具，开发速度比Webpack快10倍以上
- pnpm 8+ - 高效的包管理器，节省磁盘空间和安装时间

**状态管理与数据流**：
- Redux Toolkit 1.9+ - 简化的Redux开发体验，内置中间件
- Redux-Persist - 状态持久化到localStorage
- React Query 4+ - 服务器状态管理，自动缓存与同步
- Immer - 不可变数据结构操作

**UI组件库与样式**：
- Ant Design 5+ - 企业级UI组件库，特别适合中后台应用
- Ant Design Pro - 针对管理系统的模板和布局
- TailwindCSS 3+ - 原子化CSS框架，用于快速样式开发
- styled-components 6+ - CSS-in-JS解决方案

**数据可视化与图表**：
- ECharts 5+ - 强大的数据可视化库，支持丰富的图表类型
- AntV G2 4+ - 蚂蚁集团图表库，特别适合复杂数据展示
- Recharts 2+ - React原生图表库，组件化设计
- VisuGL - 3D数据可视化（可选，用于高端展示）

**实时通信与WebSocket**：
- Socket.io-client 4+ - WebSocket客户端库，支持实时双向通信
- ws - 原生WebSocket实现（备选方案）

**表单与验证**：
- React Hook Form 7+ - 高性能表单库，减少重新渲染
- Zod 3+ - TypeScript优先的模式验证库
- Yup 1+ - 简单的对象模式验证（备选）

**国际化与本地化**：
- i18next 23+ - 国际化框架
- react-i18next 13+ - React集成库

**其他关键库**：
- Axios 1.4+ - HTTP客户端，用于API调用
- dayjs 1.11+ - 轻量级日期时间库
- lodash-es 4+ - 工具函数库
- classnames - CSS class名管理
- uuid - 唯一标识符生成

### 1.2 开发环境与工具

**开发工具链**：
```
编辑器：VS Code 1.85+
  推荐插件：
  - ES7+ React/Redux/React-Native snippets
  - ESLint
  - Prettier
  - TypeScript Vue Plugin (Volar)
  - Tailwind CSS IntelliSense

代码检查：
  - ESLint 8+ - 代码质量检查
  - Prettier 3+ - 代码格式化
  - Stylelint 15+ - 样式检查

测试框架：
  - Vitest 1+ - 高性能单元测试框架
  - React Testing Library 14+ - React组件测试
  - Playwright 1.40+ - E2E测试框架

浏览器开发工具：
  - Redux DevTools - Redux状态调试
  - React DevTools - React组件调试
  - Chrome DevTools - 性能分析、Network监控
```

### 1.3 依赖版本与兼容性

| 包名 | 版本 | 用途 | 兼容性 |
|------|------|------|--------|
| react | 18.2+ | UI框架 | Node 16+ |
| typescript | 5.2+ | 类型系统 | ESNext目标 |
| vite | 5.0+ | 构建工具 | ES2020+ |
| ant-design | 5.11+ | 组件库 | React 16.8+ |
| redux-toolkit | 1.9+ | 状态管理 | React 16.8+ |
| react-query | 4.32+ | 服务器状态 | React 16.8+ |
| socket.io-client | 4.7+ | WebSocket | 浏览器兼容 |
| echarts | 5.4+ | 图表库 | ES5+ |

---

## 二、项目结构与工程规范

### 2.1 前端项目目录结构

```
education-frontend/
├── src/
│   ├── app/
│   │   ├── App.tsx              # 应用入口
│   │   ├── App.module.css
│   │   └── index.tsx            # 启动文件
│   │
│   ├── pages/                   # 页面级组件
│   │   ├── dashboard/           # 财务仪表板模块
│   │   │   ├── Dashboard.tsx
│   │   │   ├── components/      # 页面专用组件
│   │   │   ├── hooks/           # 页面专用Hooks
│   │   │   ├── services/        # 数据服务
│   │   │   └── types/           # TypeScript类型
│   │   │
│   │   ├── crm/                 # CRM市场营销模块
│   │   │   ├── CustomerList.tsx
│   │   │   ├── CustomerDetail.tsx
│   │   │   ├── TransformFunnel.tsx
│   │   │   └── ...
│   │   │
│   │   ├── students/            # 教学学生模块
│   │   │   ├── StudentDashboard.tsx
│   │   │   ├── StudentProfile.tsx
│   │   │   ├── LearningProgress.tsx
│   │   │   └── ...
│   │   │
│   │   ├── content/             # 内容运营模块
│   │   │   ├── ContentFactory.tsx
│   │   │   ├── ContentReview.tsx
│   │   │   ├── LiveManagement.tsx
│   │   │   └── ...
│   │   │
│   │   ├── recruitment/         # 招生管理模块
│   │   │   ├── RecruitmentFunnel.tsx
│   │   │   ├── LeadManagement.tsx
│   │   │   └── ...
│   │   │
│   │   └── auth/                # 认证模块
│   │       ├── Login.tsx
│   │       ├── Register.tsx
│   │       └── PasswordReset.tsx
│   │
│   ├── components/              # 可复用组件库
│   │   ├── common/              # 通用组件
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Breadcrumb.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   │
│   │   ├── charts/              # 图表组件
│   │   │   ├── LineChart.tsx
│   │   │   ├── BarChart.tsx
│   │   │   ├── PieChart.tsx
│   │   │   ├── FunnelChart.tsx
│   │   │   └── KPIDashboard.tsx
│   │   │
│   │   ├── forms/               # 表单组件
│   │   │   ├── StudentForm.tsx
│   │   │   ├── CourseForm.tsx
│   │   │   ├── AIGenerationForm.tsx
│   │   │   └── AdvancedSearchForm.tsx
│   │   │
│   │   ├── tables/              # 表格组件
│   │   │   ├── DataTable.tsx
│   │   │   ├── StudentTable.tsx
│   │   │   ├── RevenueTable.tsx
│   │   │   └── LeadsTable.tsx
│   │   │
│   │   ├── dialogs/             # 对话框组件
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── FormDialog.tsx
│   │   │   ├── PreviewDialog.tsx
│   │   │   └── ReportExportDialog.tsx
│   │   │
│   │   └── layout/              # 布局组件
│   │       ├── MainLayout.tsx
│   │       ├── AuthLayout.tsx
│   │       └── AdminLayout.tsx
│   │
│   ├── hooks/                   # 自定义Hooks
│   │   ├── useAuth.ts           # 认证相关
│   │   ├── useStudent.ts        # 学生数据
│   │   ├── useFinance.ts        # 财务数据
│   │   ├── useCRM.ts            # CRM数据
│   │   ├── useAIRecommendation.ts # AI推荐
│   │   ├── usePagination.ts     # 分页逻辑
│   │   ├── useFilter.ts         # 过滤逻辑
│   │   ├── useWebSocket.ts      # WebSocket连接
│   │   ├── useLocalStorage.ts   # 本地存储
│   │   └── useTheme.ts          # 主题管理
│   │
│   ├── services/                # API服务层
│   │   ├── api.ts               # Axios实例与拦截器
│   │   ├── authService.ts
│   │   ├── studentService.ts
│   │   ├── financeService.ts
│   │   ├── crmService.ts
│   │   ├── contentService.ts
│   │   ├── recruitmentService.ts
│   │   ├── aiService.ts
│   │   └── analyticsService.ts
│   │
│   ├── store/                   # Redux状态管理
│   │   ├── index.ts             # store配置
│   │   ├── slices/              # Redux切片
│   │   │   ├── authSlice.ts
│   │   │   ├── studentSlice.ts
│   │   │   ├── financeSlice.ts
│   │   │   ├── crmSlice.ts
│   │   │   ├── contentSlice.ts
│   │   │   ├── recruitmentSlice.ts
│   │   │   └── uiSlice.ts
│   │   │
│   │   └── middleware/          # Redux中间件
│   │       ├── logger.ts
│   │       └── analytics.ts
│   │
│   ├── types/                   # TypeScript类型定义
│   │   ├── index.ts
│   │   ├── student.ts
│   │   ├── finance.ts
│   │   ├── crm.ts
│   │   ├── content.ts
│   │   ├── recruitment.ts
│   │   ├── api.ts
│   │   └── common.ts
│   │
│   ├── styles/                  # 全局样式
│   │   ├── globals.css
│   │   ├── variables.css
│   │   ├── tailwind.config.js
│   │   └── theme.ts             # Ant Design主题配置
│   │
│   ├── utils/                   # 工具函数
│   │   ├── format.ts            # 数据格式化
│   │   ├── validate.ts          # 数据验证
│   │   ├── storage.ts           # 本地存储
│   │   ├── date.ts              # 日期处理
│   │   ├── number.ts            # 数字处理
│   │   ├── request.ts           # 请求处理
│   │   ├── export.ts            # 导出功能
│   │   └── constants.ts         # 常量定义
│   │
│   ├── assets/                  # 静态资源
│   │   ├── images/
│   │   ├── icons/
│   │   ├── fonts/
│   │   └── videos/
│   │
│   ├── config/                  # 配置文件
│   │   ├── env.ts               # 环境变量
│   │   ├── api-endpoints.ts     # API端点
│   │   ├── constants.ts
│   │   └── feature-flags.ts     # 功能开关
│   │
│   └── i18n/                    # 国际化
│       ├── index.ts
│       └── locales/
│           ├── zh-CN.json
│           └── en-US.json
│
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── robots.txt
│
├── tests/
│   ├── unit/                    # 单元测试
│   ├── integration/             # 集成测试
│   └── e2e/                     # E2E测试
│
├── vite.config.ts              # Vite配置
├── tsconfig.json               # TypeScript配置
├── package.json
├── pnpm-lock.yaml
└── README.md
```

### 2.2 命名规范与编码标准

**文件与文件夹命名**：
```
组件文件：PascalCase (例: StudentList.tsx, UserProfile.tsx)
工具函数：camelCase (例: formatDate.ts, validateEmail.ts)
常量：UPPER_SNAKE_CASE (例: MAX_RETRY_ATTEMPTS, API_BASE_URL)
样式文件：与组件同名，使用.module.css后缀 (例: StudentList.module.css)
```

**TypeScript与React编码标准**：

所有组件使用函数式组件与React Hooks：
```typescript
// ✅ 推荐 - 函数式组件
export const StudentProfile: React.FC<StudentProfileProps> = ({ studentId }) => {
  const [studentData, setStudentData] = useState<Student | null>(null);
  
  useEffect(() => {
    fetchStudent(studentId).then(setStudentData);
  }, [studentId]);

  return (
    <div className="student-profile">
      {/* JSX */}
    </div>
  );
};

// ❌ 避免 - 类组件
class StudentProfile extends React.Component { }
```

**类型定义规范**：
```typescript
// 使用interfaces定义对象类型
interface Student {
  id: string;
  name: string;
  email: string;
  enrolledCourses: number;
  readonly createdAt: Date;  // 不可变属性
}

// 使用union types处理多种可能
type StudentStatus = 'active' | 'suspended' | 'graduated';

// 定义组件Props
interface StudentListProps {
  students: Student[];
  onSelectStudent: (student: Student) => void;
  loading?: boolean;  // 可选属性
}
```

**代码注释规范**：
```typescript
/**
 * 获取学生学习进度
 * @param studentId - 学生ID
 * @param courseId - 课程ID (可选)
 * @returns 返回学生的学习进度数据
 * @throws 如果学生不存在则抛出错误
 */
async function getStudentProgress(studentId: string, courseId?: string) {
  // 实现
}
```

---

## 三、5个核心业务模块前端设计

### 3.1 财务管理系统（Dashboard模块）

**模块概览**：财务管理系统提供实时的财务数据展示、分析和报表生成功能。主要针对财务人员和管理层。

**核心功能页面**：
1. 财务仪表板 - 关键指标总览
2. 收入分析 - 收入趋势、来源分析
3. 支出分析 - 成本结构、部门支出
4. 财务预测 - 基于AI的收入/支出预测
5. 报表生成 - 自动生成损益表等财务报表

**关键组件设计**：

```typescript
// 财务KPI卡片
interface KPICardProps {
  title: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
  icon: React.ReactNode;
}

export const KPICard: React.FC<KPICardProps> = ({ 
  title, value, unit, trend, trendPercent, icon 
}) => {
  const trendColor = trend === 'up' ? 'green' : trend === 'down' ? 'red' : 'gray';
  
  return (
    <Card className="kpi-card">
      <div className="kpi-header">
        {icon}
        <span>{title}</span>
      </div>
      <div className="kpi-value">
        {formatCurrency(value)} <span className="unit">{unit}</span>
      </div>
      <div className={`kpi-trend trend-${trendColor}`}>
        {trend === 'up' ? '↑' : '↓'} {trendPercent}%
      </div>
    </Card>
  );
};
```

**财务报表导出**：
```typescript
// 支持导出为PDF和Excel
export const FinancialReportExport: React.FC = () => {
  const handleExport = async (format: 'pdf' | 'excel') => {
    const reportData = await fetchFinancialReport();
    
    if (format === 'pdf') {
      exportToPDF(reportData, 'financial-report.pdf');
    } else {
      exportToExcel(reportData, 'financial-report.xlsx');
    }
  };

  return (
    <Button.Group>
      <Button onClick={() => handleExport('pdf')}>下载PDF</Button>
      <Button onClick={() => handleExport('excel')}>下载Excel</Button>
    </Button.Group>
  );
};
```

### 3.2 市场营销系统（CRM模块）

**模块概览**：CRM系统用于管理学员信息、转化漏斗跟踪、个性化营销和转介绍管理。

**核心功能页面**：
1. 客户列表 - 学员信息查询、搜索、分段
2. 客户详情 - 完整的客户档案与交互历史
3. 转化漏斗 - 可视化转化路径分析
4. AI推荐 - 个性化课程推荐
5. 转介绍管理 - 转介绍追踪与激励

**关键组件设计**：

```typescript
// 客户分段查询
interface CustomerFilter {
  status: StudentStatus[];
  priceRange: [number, number];
  enrolledCourses: number | null;
  lastActivityDays: number;
  aiScoreRange: [number, number];  // AI推断的转化意向分数
}

export const CustomerSearch: React.FC = () => {
  const [filters, setFilters] = useState<CustomerFilter>({
    status: ['active'],
    priceRange: [0, 10000],
    enrolledCourses: null,
    lastActivityDays: 30,
    aiScoreRange: [0, 100]
  });

  const { data: customers, isLoading } = useQuery(['customers', filters], 
    () => customerService.searchCustomers(filters)
  );

  return (
    <div className="customer-search">
      <AdvancedSearchForm onFiltersChange={setFilters} />
      <Table 
        columns={customerColumns} 
        dataSource={customers} 
        loading={isLoading}
      />
    </div>
  );
};
```

**转化漏斗可视化**：
```typescript
interface FunnelStage {
  name: string;
  value: number;
  rate: number;  // 该阶段的通过率
}

export const ConversionFunnel: React.FC = () => {
  const [funnelData, setFunnelData] = useState<FunnelStage[]>([]);

  useEffect(() => {
    analyticService.getFunnelData().then(setFunnelData);
  }, []);

  return (
    <ECharts
      option={{
        series: [{
          type: 'funnel',
          data: funnelData.map(stage => ({
            value: stage.value,
            name: `${stage.name} (${stage.rate.toFixed(1)}%)`
          }))
        }]
      }}
    />
  );
};
```

### 3.3 教学学习系统（Students模块）

**模块概览**：为学生提供学习平台、课程管理、学习进度追踪和AI答疑功能。

**核心功能页面**：
1. 学生学习仪表板 - 个人学习进度、推荐课程
2. 课程列表 - 已注册课程和可选课程
3. 课程学习 - 课程内容展示、视频播放、作业提交
4. AI答疑 - 智能问答系统
5. 学习分析 - 个人学习数据分析

**关键组件设计**：

```typescript
// 学习进度卡片
interface CourseProgress {
  courseId: string;
  courseName: string;
  progress: number;  // 0-100
  completedModules: number;
  totalModules: number;
  lastAccessTime: Date;
  recommendedNextContent: string;
}

export const LearningProgressCard: React.FC<CourseProgress> = (props) => {
  return (
    <Card className="progress-card">
      <Progress 
        type="circle" 
        percent={props.progress}
        format={percent => `${percent}% 完成`}
      />
      <div className="course-info">
        <h3>{props.courseName}</h3>
        <p>已完成 {props.completedModules}/{props.totalModules} 个模块</p>
        <p>推荐: {props.recommendedNextContent}</p>
      </div>
      <Button type="primary">继续学习</Button>
    </Card>
  );
};
```

**AI答疑界面**：
```typescript
interface Message {
  id: string;
  type: 'question' | 'answer';
  content: string;
  timestamp: Date;
  sources?: string[];  // 引用的知识来源
}

export const AIQAInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendQuestion = async () => {
    setIsLoading(true);
    const response = await aiService.askQuestion(inputValue);
    
    setMessages([
      ...messages,
      { id: Date.now().toString(), type: 'question', content: inputValue, timestamp: new Date() },
      { 
        id: (Date.now() + 1).toString(), 
        type: 'answer', 
        content: response.answer,
        sources: response.sources,
        timestamp: new Date() 
      }
    ]);
    
    setInputValue('');
    setIsLoading(false);
  };

  return (
    <div className="qa-interface">
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.type}`}>
            <div className="content">{msg.content}</div>
            {msg.sources && (
              <div className="sources">
                来源: {msg.sources.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
      <Input.TextArea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="输入您的问题..."
        loading={isLoading}
      />
      <Button onClick={handleSendQuestion} loading={isLoading}>
        提问
      </Button>
    </div>
  );
};
```

### 3.4 内容运营系统（Content模块）

**模块概览**：支持AIGC内容生成、内容审核、直播管理和资产库管理。

**核心功能页面**：
1. 内容生成工厂 - AIGC文案/脚本生成
2. 内容审核 - 多层审核流程
3. 直播管理 - 直播间创建、管理、数据分析
4. 资产库 - 素材库管理、模板库

**关键组件设计**：

```typescript
// 内容生成表单
interface ContentGenerationRequest {
  contentType: 'marketing_copy' | 'video_script' | 'course_description';
  businessContext: string;
  tone: 'professional' | 'casual' | 'warm';
  targetAudience: string;
  keyPoints: string[];
}

export const ContentGenerationForm: React.FC = () => {
  const [formData, setFormData] = useState<ContentGenerationRequest>({
    contentType: 'marketing_copy',
    businessContext: '',
    tone: 'professional',
    targetAudience: '',
    keyPoints: []
  });

  const [generatedContent, setGeneratedContent] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    const result = await contentService.generateContent(formData);
    setGeneratedContent(result.variants);
    setIsGenerating(false);
  };

  return (
    <Form layout="vertical">
      <Form.Item label="内容类型">
        <Select value={formData.contentType} onChange={(val) => 
          setFormData({...formData, contentType: val})
        }>
          <Option value="marketing_copy">营销文案</Option>
          <Option value="video_script">视频脚本</Option>
          <Option value="course_description">课程描述</Option>
        </Select>
      </Form.Item>
      
      {/* 其他表单项 */}
      
      <Button type="primary" onClick={handleGenerate} loading={isGenerating}>
        生成内容
      </Button>

      {generatedContent.length > 0 && (
        <div className="generated-variants">
          {generatedContent.map((content, idx) => (
            <Card key={idx} title={`方案 ${idx + 1}`}>
              <p>{content}</p>
              <Button.Group>
                <Button>采用</Button>
                <Button>编辑</Button>
                <Button>预览</Button>
              </Button.Group>
            </Card>
          ))}
        </div>
      )}
    </Form>
  );
};
```

### 3.5 招生管理系统（Recruitment模块）

**模块概览**：管理招生漏斗、销售线索、转介绍和效果分析。

**核心功能页面**：
1. 招生漏斗 - 浏览→咨询→成交的转化漏斗
2. 销售线索管理 - 潜在客户管理和跟进
3. 转介绍追踪 - 转介绍链路追踪
4. 效果分析 - 渠道ROI分析

**关键组件设计**：

```typescript
// 销售线索卡片
interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  leadScore: number;  // 0-100 AI预测的转化意向
  status: 'new' | 'contacted' | 'interested' | 'qualified' | 'converted';
  assignedTo: string;
  lastContactDate: Date;
  nextFollowUpDate: Date;
}

export const LeadCard: React.FC<Lead> = (lead) => {
  const scoreColor = lead.leadScore > 70 ? 'green' : lead.leadScore > 50 ? 'orange' : 'red';

  return (
    <Card className="lead-card" hoverable>
      <div className="lead-header">
        <h4>{lead.name}</h4>
        <Tag color={scoreColor}>评分: {lead.leadScore}</Tag>
      </div>
      
      <div className="lead-info">
        <p>📱 {lead.phone}</p>
        <p>📍 来源: {lead.source}</p>
        <p>👤 分配给: {lead.assignedTo}</p>
      </div>

      <div className="lead-timeline">
        <p>最后联系: {formatDate(lead.lastContactDate)}</p>
        <p>下次跟进: {formatDate(lead.nextFollowUpDate)}</p>
      </div>

      <Button.Group>
        <Button>跟进</Button>
        <Button>编辑</Button>
        <Button>转化</Button>
      </Button.Group>
    </Card>
  );
};
```

---

## 四、前端与后端接口规范

### 4.1 API调用模式

所有API调用通过服务层完成，服务层负责：
- 请求构造与参数校验
- 错误处理与重试
- 响应数据转换
- 缓存管理

**服务层示例**：

```typescript
// services/studentService.ts
import { api } from './api';
import { Student, StudentFilter } from '../types';

export const studentService = {
  // 获取学生列表
  async listStudents(filter: StudentFilter, pagination: Pagination) {
    const response = await api.get('/api/v1/students', {
      params: { ...filter, ...pagination }
    });
    return response.data;
  },

  // 获取学生详情
  async getStudent(id: string) {
    const response = await api.get(`/api/v1/students/${id}`);
    return response.data;
  },

  // 更新学生档案
  async updateStudent(id: string, data: Partial<Student>) {
    const response = await api.put(`/api/v1/students/${id}`, data);
    return response.data;
  },

  // 获取AI推荐课程
  async getRecommendations(studentId: string) {
    const response = await api.get(
      `/api/v1/ai-recommendations?student_id=${studentId}`
    );
    return response.data;
  }
};
```

### 4.2 错误处理与重试机制

```typescript
// services/api.ts
import axios, { AxiosInstance, AxiosError } from 'axios';

const api: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 30000
});

// 请求拦截器 - 添加认证令牌
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 错误处理与重试
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config;
    
    // 处理401未授权
    if (error.response?.status === 401) {
      // 尝试刷新令牌
      const newToken = await refreshToken();
      if (newToken && config) {
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      }
      // 重定向到登录
      window.location.href = '/login';
    }

    // 处理网络错误 - 自动重试
    if (!error.response && config) {
      const retryCount = (config as any).retryCount || 0;
      if (retryCount < 3) {
        (config as any).retryCount = retryCount + 1;
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

export { api };
```

### 4.3 WebSocket实时通信

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export const useWebSocket = (events: string[]) => {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Map<string, Function[]>>(new Map());

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    
    socketRef.current = io(process.env.REACT_APP_WS_URL || '', {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    events.forEach(event => {
      socketRef.current?.on(event, (data) => {
        const handlers = handlersRef.current.get(event) || [];
        handlers.forEach(handler => handler(data));
      });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const subscribe = useCallback((event: string, handler: Function) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, []);
    }
    handlersRef.current.get(event)?.push(handler);
  }, []);

  const unsubscribe = useCallback((event: string, handler: Function) => {
    const handlers = handlersRef.current.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }, []);

  return { subscribe, unsubscribe };
};
```

---

## 五、性能优化与最佳实践

### 5.1 代码分割与懒加载

```typescript
// 路由级代码分割
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const StudentList = lazy(() => import('./pages/students/StudentList'));

export const routes = [
  {
    path: '/dashboard',
    component: (
      <Suspense fallback={<LoadingSpinner />}>
        <Dashboard />
      </Suspense>
    )
  },
  {
    path: '/students',
    component: (
      <Suspense fallback={<LoadingSpinner />}>
        <StudentList />
      </Suspense>
    )
  }
];
```

### 5.2 虚拟滚动与大列表优化

```typescript
// 大列表虚拟滚动
import { FixedSizeList as List } from 'react-window';

export const VirtualStudentList: React.FC<StudentListProps> = ({ students }) => {
  const Row = ({ index, style }) => (
    <div style={style} className="student-row">
      <StudentTableRow student={students[index]} />
    </div>
  );

  return (
    <List
      height={600}
      itemCount={students.length}
      itemSize={60}
      width="100%"
    >
      {Row}
    </List>
  );
};
```

### 5.3 状态管理优化

```typescript
// 使用选择器避免不必要的重新渲染
import { useSelector, shallowEqual } from 'react-redux';

export const StudentStats: React.FC = () => {
  // 只选择需要的数据，避免整个slice变化时重新渲染
  const { activeCount, totalCount } = useSelector(
    state => ({
      activeCount: state.student.activeCount,
      totalCount: state.student.totalCount
    }),
    shallowEqual  // 浅比较
  );

  return (
    <div>活跃学员: {activeCount} / {totalCount}</div>
  );
};
```

### 5.4 记忆化与回调优化

```typescript
import { useMemo, useCallback } from 'react';

export const ComplexChart: React.FC<ChartProps> = ({ data, config }) => {
  // 只在data改变时重新计算
  const processedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      computed: expensiveCalculation(item)
    }));
  }, [data]);

  // 使用稳定的回调引用
  const handleChartClick = useCallback((event) => {
    console.log('Chart clicked:', event);
  }, []);

  return <ECharts data={processedData} onClick={handleChartClick} />;
};
```

---

## 六、测试规范

### 6.1 单元测试

```typescript
// tests/unit/components/StudentList.test.tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentList } from '../../../components/tables/StudentList';

describe('StudentList', () => {
  it('应该正确渲染学生列表', () => {
    const students = [
      { id: '1', name: '张三', email: 'zs@example.com' },
      { id: '2', name: '李四', email: 'ls@example.com' }
    ];

    render(<StudentList students={students} />);

    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('李四')).toBeInTheDocument();
  });

  it('应该在点击行时触发选中事件', async () => {
    const onSelect = vi.fn();
    const students = [{ id: '1', name: '张三', email: 'zs@example.com' }];

    render(<StudentList students={students} onSelect={onSelect} />);

    await userEvent.click(screen.getByText('张三'));
    expect(onSelect).toHaveBeenCalledWith(students[0]);
  });
});
```

### 6.2 集成测试

```typescript
// tests/integration/dashboard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Dashboard } from '../../../pages/dashboard/Dashboard';
import { store } from '../../../store';

describe('Dashboard Integration', () => {
  it('应该加载并显示财务数据', async () => {
    render(
      <Provider store={store}>
        <Dashboard />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/财务仪表板/)).toBeInTheDocument();
      expect(screen.getByText(/总收入/)).toBeInTheDocument();
    });
  });
});
```

---

## 七、前端开发工作流与交付流程

### 7.1 开发流程

```
需求 → 设计 → 开发 → 自测 → Code Review → 测试 → 部署

1. 需求分析：理解设计稿和功能需求
2. 组件设计：规划组件结构、状态管理
3. 开发实现：编写代码、单元测试
4. 自测：功能测试、浏览器兼容性
5. Code Review：提交PR，等待技术审查
6. 测试阶段：QA测试，修复bugs
7. 部署发布：合并到main分支，自动部署
```

### 7.2 Git工作流规范

```
分支命名规范：
  feature/xxx - 新功能分支
  fix/xxx - bug修复分支
  refactor/xxx - 重构分支
  docs/xxx - 文档分支

提交消息规范（Conventional Commits）：
  feat(student): 添加学生列表功能
  fix(auth): 修复登录token过期问题
  docs: 更新前端开发文档
  style: 格式化代码
  test: 添加单元测试
  chore: 更新依赖包
```

### 7.3 代码审查清单

```
□ 代码是否遵循项目编码规范
□ 是否有足够的类型声明（TypeScript）
□ 是否添加了单元测试
□ 是否优化了性能（避免不必要的重新渲染）
□ 是否处理了错误情况
□ 是否更新了相关文档
□ 是否有注释解释复杂逻辑
□ 是否考虑了浏览器兼容性
```

---

## 八、常见问题与解决方案

**Q1: 如何处理大量数据列表的性能问题？**

A: 使用虚拟滚动（react-window）、分页加载或无限滚动。对于表格，使用服务端分页和排序。

**Q2: 如何管理复杂的跨组件状态？**

A: 使用Redux Toolkit管理全局状态，Context API管理局部状态。遵循单一职责原则，保持状态树扁平。

**Q3: 如何优化首屏加载时间？**

A: 实施路由级代码分割、图片懒加载、资源预加载、启用gzip压缩。使用Lighthouse进行性能审计。

---

参考资源与相关技术文档见主技术文档。

**文档版本**：1.0  
**最后更新**：2026年3月5日  
