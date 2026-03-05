# 系统后端技术文档

## 执行摘要

后端团队负责构建系统的核心业务逻辑、数据管理、API网关、认证授权、消息队列和AI集成等关键模块。

后端采用**Java/Python微服务 + PostgreSQL + MongoDB + Redis + Kubernetes**的云原生架构。系统支持多租户隔离、高并发处理、实时数据同步和AI模型集成。

---

## 一、后端技术栈详细规范

### 1.1 主要编程语言与框架

**后端语言选择**：
- **Python 3.11+** - 用于财务分析、AI集成、数据处理模块
  - 框架：FastAPI 0.104+ 或 Django 5.0+
  - 异步支持：asyncio + uvicorn
  
- **Java 17+** - 用于核心业务逻辑、微服务编排
  - 框架：Spring Boot 3.2+ 
  - 依赖注入：Spring Framework 6.1+
  - 构建工具：Gradle 8.4+ 或 Maven 3.9+

**框架对比与选择**：

| 框架 | 语言 | 优势 | 适用场景 |
|------|------|------|---------|
| FastAPI | Python | 异步性能高、自动文档、现代语法 | 财务API、数据处理、AI集成 |
| Django | Python | 功能完整、ORM强大、生态成熟 | CRM系统、学员管理、内容库 |
| Spring Boot | Java | 企业级稳定、并发能力强、生态完整 | 核心业务、支付处理、分布式 |

**推荐架构**：
```
API网关层 (Kong)
    ↓
业务服务层（微服务）:
  - 用户认证服务 (Java Spring Boot)
  - 学员管理服务 (Python FastAPI)
  - 财务系统服务 (Python FastAPI)
  - CRM营销服务 (Java Spring Boot)
  - 内容运营服务 (Python FastAPI)
  - 招生系统服务 (Java Spring Boot)
  - AI集成服务 (Python FastAPI)
    ↓
中台层（数据与AI）:
  - 数据仓库 (PostgreSQL)
  - 缓存层 (Redis)
  - 向量数据库 (Milvus)
  - 消息队列 (RabbitMQ/Kafka)
```

### 1.2 关键依赖库

**Python依赖**（requirements.txt）：

```
# Web框架
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0  # 数据验证
pydantic-settings==2.1.0

# 数据库
sqlalchemy==2.0.23  # ORM
psycopg2-binary==2.9.9  # PostgreSQL驱动
pymongo==4.6.0  # MongoDB驱动
redis==5.0.1  # Redis客户端

# AI与数据处理
openai==1.3.3  # OpenAI API
langchain==0.1.0  # LLM框架
scikit-learn==1.3.2  # 机器学习
pandas==2.1.3  # 数据处理
numpy==1.26.2  # 数值计算

# 认证与安全
python-jose[cryptography]==3.3.0  # JWT
passlib[bcrypt]==1.7.4  # 密码哈希
pydantic-core==2.14.1

# 工具与监控
python-dotenv==1.0.0  # 环境变量
celery==5.3.4  # 异步任务
tenacity==8.2.3  # 重试机制
prometheus-client==0.19.0  # 指标
python-json-logger==2.0.7  # 日志

# 测试
pytest==7.4.3
pytest-asyncio==0.21.1
httpx==0.25.2  # 异步HTTP测试
```

**Java依赖**（build.gradle或pom.xml）：

```gradle
// Spring Boot核心
implementation 'org.springframework.boot:spring-boot-starter-web:3.2.0'
implementation 'org.springframework.boot:spring-boot-starter-data-jpa:3.2.0'
implementation 'org.springframework.boot:spring-boot-starter-data-redis:3.2.0'
implementation 'org.springframework.boot:spring-boot-starter-security:3.2.0'

// 数据库驱动
implementation 'org.postgresql:postgresql:42.7.1'
implementation 'org.mongodb:mongodb-driver-sync:4.11.1'

// API文档
implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.2.0'

// 工具库
implementation 'com.google.guava:guava:32.1.3-jre'
implementation 'org.apache.commons:commons-lang3:3.14.0'
implementation 'com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.16.0'

// 认证与安全
implementation 'io.jsonwebtoken:jjwt-api:0.12.3'
runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.12.3'
runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.12.3'

// 消息队列
implementation 'org.springframework.boot:spring-boot-starter-amqp:3.2.0'
implementation 'org.apache.kafka:kafka-clients:3.6.0'

// 监控与日志
implementation 'io.micrometer:micrometer-registry-prometheus:1.12.1'
implementation 'org.springframework.boot:spring-boot-starter-actuator:3.2.0'

// 测试
testImplementation 'org.springframework.boot:spring-boot-starter-test:3.2.0'
testImplementation 'org.testcontainers:testcontainers:1.19.5'
testImplementation 'org.testcontainers:postgresql:1.19.5'
```

### 1.3 基础设施与中间件

**数据库**：
- PostgreSQL 15+ - 主业务数据库，支持JSON、全文搜索、分区
- MongoDB 7+ - 非结构化数据、日志、行为数据
- Redis 7+ - 缓存、会话、实时数据、消息队列

**消息队列**：
- RabbitMQ 3.12+ - 异步任务、事件驱动
- Apache Kafka 3.6+ - 高吞吐日志流、数据同步

**容器与编排**：
- Docker 24+ - 容器化部署
- Kubernetes 1.28+ - 容器编排、自动扩展
- Helm 3.13+ - K8s包管理

**监控与日志**：
- Prometheus 2.48+ - 指标收集
- Grafana 10.2+ - 指标可视化
- ELK Stack (Elasticsearch 8.11+, Logstash 8.11+, Kibana 8.11+) - 日志管理

---

## 二、微服务架构与设计

### 2.1 微服务拆分原则

根据业务能力进行拆分，每个微服务独立部署、独立数据库。微服务之间通过API和消息队列通信。

**微服务清单**：

| 微服务 | 职责 | 技术栈 | 团队规模 |
|--------|------|--------|---------|
| Auth Service | 认证授权、用户管理 | Java Spring Boot | 1人 |
| Student Service | 学员档案、课程进度 | Python FastAPI | 1人 |
| Finance Service | 财务数据、收支管理、AI分析 | Python FastAPI | 1人 |
| CRM Service | 客户管理、转化漏斗、推荐 | Java Spring Boot | 1人 |
| Content Service | 内容库、审核、直播 | Python FastAPI | 1人|
| Recruitment Service | 招生管理、销售线索 | Java Spring Boot | 1人 |
| AI Service | LLM集成、RAG、推荐模型 | Python FastAPI | 1人+ AI工程师 |

### 2.2 微服务间通信

**同步通信（REST API）**：
```
用户服务 → HTTP Call → 学员服务
          GET /api/v1/students/123
```

**异步通信（消息队列）**：
```
CRM服务发送事件：学员转化事件
  ↓
消息队列（RabbitMQ/Kafka）
  ↓
Finance服务订阅：自动生成账单
Recruitment服务订阅：记录转化来源
```

**事件驱动架构**：
```python
# Python FastAPI服务 - 发布事件
from pydantic import BaseModel
import pika

class StudentEnrolledEvent(BaseModel):
    student_id: str
    course_id: str
    enrollment_date: datetime
    amount: float

async def enroll_course(enrollment: StudentEnrolledEvent):
    # 保存到数据库
    await save_enrollment(enrollment)
    
    # 发布事件到消息队列
    await publish_event('student.enrolled', enrollment.dict())
    
    return {"status": "enrolled"}

# 其他服务订阅该事件
def on_student_enrolled(event):
    # Finance服务：生成收入记录
    create_revenue_record(event)
    # Recruitment服务：更新来源追踪
    update_source_tracking(event)
```

### 2.3 数据一致性策略

**最终一致性**：
在分布式系统中，使用事件溯源和消息队列确保最终一致性。

```
Step 1: CRM服务更新客户状态为"已转化"
Step 2: 发布"客户已转化"事件到消息队列
Step 3: Finance服务订阅事件 → 生成账单
Step 4: Recruitment服务订阅事件 → 记录转化
Step 5: 如果中间步骤失败 → 自动重试机制
```

**Saga模式处理分布式事务**：
```
创建学生订单流程：
  1. CRM Service: 创建订单 (状态: pending)
  2. → 事件: order.created
  3. Finance Service: 生成账单
  4. → 事件: invoice.created
  5. Student Service: 更新课程进度
  6. → 事件: course.enrolled

如果任何步骤失败 → 触发补偿事务回滚
```

---

## 三、核心业务模块后端设计

### 3.1 认证授权系统（Auth Service）

**工作流程**：

```
用户登录请求
    ↓
验证用户名/密码
    ↓
生成JWT Token (访问令牌 + 刷新令牌)
    ↓
返回Token给客户端
    ↓
后续请求在Header中携带Token
    ↓
API网关验证Token有效性
    ↓
允许或拒绝请求
```

**Java实现示例**：

```java
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    
    @Autowired
    private JwtTokenProvider tokenProvider;
    
    @Autowired
    private UserService userService;
    
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        // 验证凭证
        User user = userService.authenticateUser(
            request.getEmail(), 
            request.getPassword()
        );
        
        if (user == null) {
            return ResponseEntity.status(401)
                .body(new ErrorResponse("Invalid credentials"));
        }
        
        // 生成Token
        String accessToken = tokenProvider.generateToken(user, 15 * 60); // 15分钟
        String refreshToken = tokenProvider.generateToken(user, 7 * 24 * 60 * 60); // 7天
        
        return ResponseEntity.ok(new LoginResponse(accessToken, refreshToken));
    }
    
    @PostMapping("/refresh-token")
    public ResponseEntity<?> refreshToken(@RequestHeader("Authorization") String token) {
        String newAccessToken = tokenProvider.refreshToken(token);
        return ResponseEntity.ok(new TokenResponse(newAccessToken));
    }
    
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestHeader("Authorization") String token) {
        tokenProvider.revokeToken(token);
        return ResponseEntity.ok(new SuccessResponse("Logged out"));
    }
}

// JWT Token提供者
@Component
public class JwtTokenProvider {
    
    @Value("${jwt.secret}")
    private String jwtSecret;
    
    public String generateToken(User user, long expirationSeconds) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("tenant_id", user.getTenantId());
        claims.put("role", user.getRole());
        claims.put("permissions", user.getPermissions());
        
        return Jwts.builder()
            .setClaims(claims)
            .setSubject(user.getId())
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + expirationSeconds * 1000))
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }
    
    public boolean validateToken(String token) {
        try {
            Jwts.parser().setSigningKey(jwtSecret).parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
```

**多租户隔离**：

```java
@Component
public class TenantInterceptor implements HandlerInterceptor {
    
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, 
                           Object handler) {
        // 从Token中提取租户ID
        String token = extractToken(request);
        String tenantId = tokenProvider.getTenantIdFromToken(token);
        
        // 设置到ThreadLocal供后续使用
        TenantContext.setCurrentTenant(tenantId);
        
        return true;
    }
    
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, 
                               Object handler, Exception ex) {
        // 清理ThreadLocal
        TenantContext.clear();
    }
}

// TenantContext - 线程本地存储
public class TenantContext {
    private static final ThreadLocal<String> tenantIdHolder = new ThreadLocal<>();
    
    public static void setCurrentTenant(String tenantId) {
        tenantIdHolder.set(tenantId);
    }
    
    public static String getCurrentTenant() {
        return tenantIdHolder.get();
    }
    
    public static void clear() {
        tenantIdHolder.remove();
    }
}
```

### 3.2 学员管理系统（Student Service）

**数据库表设计**（PostgreSQL）：

```sql
-- 学员基本信息表
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    age INTEGER,
    gender VARCHAR(10),
    enrollment_date DATE,
    status VARCHAR(50),  -- active/suspended/graduated
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    INDEX idx_tenant_status (tenant_id, status)
);

-- 学员学习档案表
CREATE TABLE student_learning_profiles (
    id UUID PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES students(id),
    total_learning_hours INTEGER DEFAULT 0,
    average_score DECIMAL(5,2),
    current_level VARCHAR(50),
    learning_style VARCHAR(50),  -- 学习风格
    preferred_study_time TIME,
    updated_at TIMESTAMP,
    UNIQUE(student_id)
);

-- 学员课程进度表
CREATE TABLE student_course_progress (
    id UUID PRIMARY KEY,
    student_id UUID NOT NULL,
    course_id UUID NOT NULL,
    completion_rate DECIMAL(3,2),
    total_learning_time INTEGER,  -- 秒
    best_quiz_score DECIMAL(5,2),
    status VARCHAR(50),  -- enrolled/in_progress/completed
    last_learning_time TIMESTAMP,
    INDEX idx_student_course (student_id, course_id)
);
```

**Python FastAPI实现示例**：

```python
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import asyncio

app = FastAPI()

# 获取学员详情
@app.get("/api/v1/students/{student_id}")
async def get_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取学员详情，包括学习档案和进度"""
    
    # 验证租户隔离
    student = db.query(Student).filter(
        Student.id == student_id,
        Student.tenant_id == current_user.tenant_id  # 多租户隔离
    ).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # 获取相关数据
    learning_profile = db.query(StudentLearningProfile).filter(
        StudentLearningProfile.student_id == student_id
    ).first()
    
    course_progress = db.query(StudentCourseProgress).filter(
        StudentCourseProgress.student_id == student_id
    ).all()
    
    return StudentResponse(
        id=student.id,
        name=student.name,
        email=student.email,
        learning_profile=learning_profile,
        courses=course_progress,
        updated_at=student.updated_at
    )

# 更新学员学习档案
@app.put("/api/v1/students/{student_id}/profile")
async def update_student_profile(
    student_id: str,
    profile_data: StudentProfileUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """更新学员学习档案"""
    
    profile = db.query(StudentLearningProfile).filter(
        StudentLearningProfile.student_id == student_id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=404)
    
    # 更新字段
    profile.total_learning_hours = profile_data.total_learning_hours
    profile.average_score = profile_data.average_score
    profile.current_level = profile_data.current_level
    profile.updated_at = datetime.utcnow()
    
    db.commit()
    
    # 发布事件
    await publish_event('student.profile.updated', {
        'student_id': student_id,
        'profile': profile_data.dict()
    })
    
    return profile
```

### 3.3 财务系统（Finance Service）

**收入数据处理**：

```python
from sqlalchemy import func
from datetime import datetime, timedelta

@app.get("/api/v1/finance/dashboard")
async def get_financial_dashboard(
    date_from: datetime = None,
    date_to: datetime = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取财务仪表板数据"""
    
    # 默认查询最近30天
    if not date_from:
        date_from = datetime.utcnow() - timedelta(days=30)
    if not date_to:
        date_to = datetime.utcnow()
    
    # 查询收入总额
    total_revenue = db.query(func.sum(RevenueRecord.amount)).filter(
        RevenueRecord.tenant_id == current_user.tenant_id,
        RevenueRecord.transaction_date.between(date_from, date_to),
        RevenueRecord.status == 'completed'
    ).scalar() or 0
    
    # 查询支出总额
    total_expenses = db.query(func.sum(ExpenseRecord.amount)).filter(
        ExpenseRecord.tenant_id == current_user.tenant_id,
        ExpenseRecord.expense_date.between(date_from, date_to)
    ).scalar() or 0
    
    # 计算净利润
    net_profit = total_revenue - total_expenses
    
    # 按来源分组的收入
    revenue_by_source = db.query(
        RevenueRecord.source,
        func.sum(RevenueRecord.amount).label('amount'),
        func.count(RevenueRecord.id).label('count')
    ).filter(
        RevenueRecord.tenant_id == current_user.tenant_id,
        RevenueRecord.transaction_date.between(date_from, date_to),
        RevenueRecord.status == 'completed'
    ).group_by(RevenueRecord.source).all()
    
    return FinancialDashboardResponse(
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        net_profit=net_profit,
        revenue_by_source=[
            {'source': r[0], 'amount': float(r[1]), 'count': r[2]}
            for r in revenue_by_source
        ],
        period={'from': date_from, 'to': date_to}
    )

# 财务报表生成
@app.post("/api/v1/finance/generate-report")
async def generate_financial_report(
    report_type: str,  # 'income_statement', 'balance_sheet', 'cash_flow'
    period: str,  # 'monthly', 'quarterly', 'annual'
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """生成财务报表"""
    
    # 调用后台任务异步生成报表
    task_id = await generate_report_async.delay(
        report_type=report_type,
        period=period,
        tenant_id=current_user.tenant_id
    )
    
    return TaskResponse(task_id=task_id, status='processing')

# Celery异步任务
from celery import shared_task

@shared_task
def generate_report_async(report_type: str, period: str, tenant_id: str):
    """异步生成报表，支持大数据处理"""
    
    db = SessionLocal()
    
    try:
        if report_type == 'income_statement':
            data = generate_income_statement(period, tenant_id, db)
        elif report_type == 'balance_sheet':
            data = generate_balance_sheet(period, tenant_id, db)
        else:
            data = generate_cash_flow(period, tenant_id, db)
        
        # 保存报表到文件系统
        file_path = save_report_as_pdf(data, report_type)
        
        # 更新数据库记录
        report = FinancialReport(
            tenant_id=tenant_id,
            report_type=report_type,
            period=period,
            file_path=file_path,
            created_at=datetime.utcnow()
        )
        db.add(report)
        db.commit()
        
        return {'status': 'success', 'file_path': file_path}
    
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        return {'status': 'failed', 'error': str(e)}
    
    finally:
        db.close()
```

### 3.4 CRM系统（CRM Service）

**客户分类模型**：

```java
@Service
public class CustomerClassificationService {
    
    @Autowired
    private CustomerRepository customerRepository;
    
    @Autowired
    private MLModelService mlModelService;
    
    /**
     * 使用机器学习模型进行客户分类
     * 基于学生属性和行为特征分为：高价值/中等/低价值
     */
    public void classifyCustomers(String tenantId) {
        List<Customer> customers = customerRepository.findByTenantId(tenantId);
        
        for (Customer customer : customers) {
            // 提取特征
            CustomerFeatures features = extractFeatures(customer);
            
            // 调用ML模型
            String classification = mlModelService.predict(features);
            
            // 更新客户分类
            customer.setValueLevel(classification);
            customer.setLastClassifiedAt(new Date());
            customerRepository.save(customer);
        }
    }
    
    private CustomerFeatures extractFeatures(Customer customer) {
        return CustomerFeatures.builder()
            .enrolledCoursesCount(customer.getEnrolledCourses().size())
            .totalSpending(calculateTotalSpending(customer))
            .averageSpending(calculateAverageSpending(customer))
            .lastPurchaseMonthsAgo(calculateMonthsSincePurchase(customer))
            .courseCompletionRate(calculateCompletionRate(customer))
            .aiScoreTrend(calculateScoreTrend(customer))
            .build();
    }
}
```

**转化漏斗追踪**：

```python
# 转化漏斗事件追踪
class FunnelTracker:
    async def track_event(self, event_type: str, customer_id: str, metadata: dict):
        """记录漏斗事件"""
        
        event = FunnelEvent(
            customer_id=customer_id,
            event_type=event_type,  # browse/consult/trial/converted
            metadata=metadata,
            timestamp=datetime.utcnow()
        )
        
        db.add(event)
        db.commit()
        
        # 更新客户状态
        await update_customer_status(customer_id, event_type)
        
        # 发布事件到消息队列用于BI分析
        await publish_funnel_event(event)

# 获取漏斗数据
@app.get("/api/v1/crm/funnel-analysis")
async def get_funnel_analysis(period: int = 30):
    """获取转化漏斗分析数据"""
    
    date_from = datetime.utcnow() - timedelta(days=period)
    
    # 统计每个环节的客户数
    browse_count = count_events('browse', date_from)
    consult_count = count_events('consult', date_from)
    trial_count = count_events('trial', date_from)
    converted_count = count_events('converted', date_from)
    
    return FunnelAnalysis(
        stages=[
            {'name': '浏览', 'value': browse_count, 'rate': 100},
            {'name': '咨询', 'value': consult_count, 'rate': consult_count/browse_count*100},
            {'name': '试学', 'value': trial_count, 'rate': trial_count/consult_count*100},
            {'name': '成交', 'value': converted_count, 'rate': converted_count/trial_count*100}
        ]
    )
```

### 3.5 AI集成服务（AI Service）

**LLM集成接口**：

```python
from openai import AsyncOpenAI
from langchain.chat_models import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.chains import LLMChain

class LLMService:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.models = {
            'gpt4': 'gpt-4-turbo-preview',
            'gpt35': 'gpt-3.5-turbo',
            'deepseek': 'deepseek-r1'
        }
    
    async def generate_content(
        self,
        prompt: str,
        model: str = 'gpt4',
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        """生成内容"""
        
        response = await self.client.chat.completions.create(
            model=self.models[model],
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        return response.choices[0].message.content
    
    async def generate_with_rag(
        self,
        query: str,
        knowledge_base_id: str
    ) -> str:
        """使用RAG（检索增强生成）生成内容"""
        
        # Step 1: 从向量数据库检索相关知识
        relevant_docs = await retrieve_documents(query, knowledge_base_id)
        
        # Step 2: 构造prompt并加入检索到的上下文
        context = "\n".join([doc.content for doc in relevant_docs])
        rag_prompt = f"""根据以下知识库内容，回答用户问题：

知识库：
{context}

用户问题：
{query}

请基于知识库给出准确的回答。"""
        
        # Step 3: 调用LLM生成回答
        response = await self.generate_content(rag_prompt)
        
        return response
```

**RAG（检索增强生成）集成**：

```python
from pymilvus import connections, Collection
import numpy as np

class RAGService:
    def __init__(self):
        # 连接Milvus向量数据库
        connections.connect("default", host="milvus", port=19530)
        self.collection = Collection("education_knowledge_base")
    
    async def insert_documents(self, documents: List[Document]):
        """将文档向量化后插入向量数据库"""
        
        embeddings = []
        metadatas = []
        
        for doc in documents:
            # 使用OpenAI Embedding API生成向量
            embedding = await self.generate_embedding(doc.content)
            embeddings.append(embedding)
            metadatas.append({
                'document_id': doc.id,
                'title': doc.title,
                'source': doc.source
            })
        
        # 插入Milvus
        self.collection.insert([
            embeddings,
            metadatas
        ])
    
    async def retrieve_documents(
        self,
        query: str,
        top_k: int = 5
    ) -> List[RetrievedDocument]:
        """从向量数据库检索相关文档"""
        
        # 对查询进行向量化
        query_embedding = await self.generate_embedding(query)
        
        # 在Milvus中进行相似度搜索
        results = self.collection.search(
            data=[query_embedding],
            anns_field="embedding",
            param={"metric_type": "L2", "params": {"nprobe": 10}},
            limit=top_k
        )
        
        return [
            RetrievedDocument(
                id=result.entity.get('document_id'),
                title=result.entity.get('title'),
                similarity_score=result.distance
            )
            for result in results[0]
        ]
    
    async def generate_embedding(self, text: str) -> List[float]:
        """使用OpenAI API生成文本嵌入"""
        response = await self.client.embeddings.create(
            input=text,
            model="text-embedding-3-small"
        )
        return response.data[0].embedding
```

---

## 四、数据库设计与优化

### 4.1 PostgreSQL多租户表设计

所有表都包含`tenant_id`字段用于租户隔离：

```sql
-- 基础模式：多租户隔离
CREATE TABLE base_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,  -- 租户隔离字段
    -- 业务字段
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    
    -- 多租户隔离索引
    INDEX idx_tenant (tenant_id),
    INDEX idx_tenant_created (tenant_id, created_at DESC)
);

-- 分区策略（针对大表）
CREATE TABLE large_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    event_type VARCHAR(50),
    event_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at) (
    PARTITION p_2024_01 VALUES FROM ('2024-01-01') TO ('2024-02-01'),
    PARTITION p_2024_02 VALUES FROM ('2024-02-01') TO ('2024-03-01'),
    -- ...定义其他分区
    PARTITION p_future VALUES FROM ('2025-01-01') TO (MAXVALUE)
);
```

### 4.2 查询优化与索引策略

```sql
-- 复合索引优化查询
CREATE INDEX idx_student_search ON students (
    tenant_id,
    status,
    created_at DESC
) WHERE status != 'deleted';

-- 部分索引（仅包含活跃记录）
CREATE INDEX idx_active_enrollments ON enrollments (
    student_id,
    course_id
) WHERE status = 'active';

-- JSON索引（用于JSONB字段查询）
CREATE INDEX idx_student_metadata ON students 
USING GIN (metadata jsonb_path_ops);

-- 全文搜索索引
CREATE INDEX idx_course_search ON courses 
USING GIN (to_tsvector('chinese', name || ' ' || description));
```

**查询示例**：

```sql
-- 查询特定租户的活跃学员
SELECT id, name, email, enrollment_date
FROM students
WHERE tenant_id = $1
  AND status = 'active'
  AND enrollment_date > NOW() - INTERVAL '30 days'
ORDER BY enrollment_date DESC
LIMIT 20;

-- 多表聚合查询
SELECT 
    s.id,
    s.name,
    COUNT(DISTINCT scp.course_id) as enrolled_courses,
    AVG(scp.completion_rate) as avg_progress,
    MAX(scp.last_learning_time) as last_active
FROM students s
LEFT JOIN student_course_progress scp ON s.id = scp.student_id
WHERE s.tenant_id = $1
GROUP BY s.id, s.name
HAVING COUNT(scp.course_id) > 0
ORDER BY last_active DESC;
```

---

## 五、API设计与规范

### 5.1 RESTful API端点设计

遵循RESTful设计原则，使用HTTP方法表示操作类型：

```
GET    /api/v1/students              # 获取学员列表（分页）
GET    /api/v1/students/{id}         # 获取学员详情
POST   /api/v1/students              # 创建新学员
PUT    /api/v1/students/{id}         # 完整更新学员
PATCH  /api/v1/students/{id}         # 部分更新学员
DELETE /api/v1/students/{id}         # 删除学员

GET    /api/v1/students/{id}/courses # 获取学员课程列表
GET    /api/v1/students/{id}/progress/{course_id} # 获取课程进度

POST   /api/v1/students/{id}/enroll/{course_id}  # 学员注册课程
POST   /api/v1/students/{id}/unenroll/{course_id} # 学员退课
```

### 5.2 标准请求/响应格式

**请求头规范**：
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-Tenant-ID: tenant-uuid-12345
X-Request-ID: req-uuid-67890
Content-Type: application/json
```

**分页查询**：
```http
GET /api/v1/students?page=1&page_size=20&sort_by=created_at&sort_order=desc
```

**响应格式**：

```json
{
  "code": 200,
  "message": "Success",
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 1250,
      "total_pages": 63
    }
  },
  "meta": {
    "request_id": "req-uuid-67890",
    "timestamp": "2024-03-05T10:30:00Z",
    "response_time_ms": 145
  }
}
```

---

## 六、监控、日志与性能优化

### 6.1 应用监控（Prometheus + Grafana）

```python
from prometheus_client import Counter, Histogram, Gauge
import time

# 定义指标
request_count = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

request_duration = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

active_connections = Gauge(
    'active_database_connections',
    'Number of active database connections'
)

# 中间件中记录指标
@app.middleware("http")
async def add_metrics(request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    duration = time.time() - start_time
    
    request_count.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    request_duration.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)
    
    return response
```

### 6.2 日志记录（ELK Stack）

```python
import logging
import json
from pythonjsonlogger import jsonlogger

# 配置JSON日志
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)

logger = logging.getLogger("education_api")
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

# 使用结构化日志
logger.info("Student enrolled", extra={
    "student_id": student_id,
    "course_id": course_id,
    "amount": amount,
    "user_id": current_user.id,
    "tenant_id": current_user.tenant_id,
    "timestamp": datetime.utcnow().isoformat()
})
```

### 6.3 性能优化建议

**1. 数据库查询优化**：
- 使用适当的索引
- 避免N+1查询问题（使用JOIN或批量查询）
- 使用连接池管理数据库连接
- 定期分析慢查询日志

**2. 缓存策略**：
- Redis缓存热数据（学员档案、课程列表）
- 设置合理的TTL，避免缓存穿透
- 实施缓存预热机制

**3. 异步处理**：
- 使用Celery处理耗时任务（报表生成、邮件发送）
- 不阻塞主业务流程

---

## 七、安全与合规

### 7.1 数据加密

```java
@Configuration
public class SecurityConfig {
    
    // 使用bcrypt加密密码
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}

// 敏感数据字段加密（应用层加密）
@Component
public class EncryptionService {
    
    public String encrypt(String plaintext) {
        // 使用AES加密
        return AES.encrypt(plaintext, encryptionKey);
    }
    
    public String decrypt(String ciphertext) {
        return AES.decrypt(ciphertext, encryptionKey);
    }
}
```

### 7.2 API安全

```python
# 速率限制
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.get("/api/v1/students")
@limiter.limit("100/minute")  # 每分钟限制100个请求
async def list_students(request: Request):
    pass

# 请求签名验证
def verify_request_signature(request):
    """验证请求签名防止篡改"""
    timestamp = request.headers.get('X-Timestamp')
    signature = request.headers.get('X-Signature')
    
    # 验证时间戳（防重放）
    if abs(int(time.time()) - int(timestamp)) > 300:
        raise HTTPException(status_code=401, detail="Request expired")
    
    # 验证签名
    body = request.body.decode()
    expected_signature = hmac.new(
        client_secret.encode(),
        f"{timestamp}{body}".encode(),
        hashlib.sha256
    ).hexdigest()
    
    if signature != expected_signature:
        raise HTTPException(status_code=401, detail="Invalid signature")
```

---

## 八、部署与运维

### 8.1 Docker容器化

```dockerfile
# Dockerfile - Python服务
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 8.2 Kubernetes部署

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: finance-service
  namespace: production

spec:
  replicas: 3
  
  selector:
    matchLabels:
      app: finance-service
  
  template:
    metadata:
      labels:
        app: finance-service
    
    spec:
      containers:
      - name: finance-service
        image: registry.edtech.com/finance-service:v1
        ports:
        - containerPort: 8000
        
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
```

---

**文档版本**：1.0  
**最后更新**：2026年3月5日  
**适用范围**：教育企业AI系统后端开发团队
