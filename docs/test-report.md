# Agent-First ERP · 产品测试报告

**测试日期**: 2026-04-21  
**环境**: 阿里云 Supabase 生产实例 (ra-supabase-v36yaxpmwwluvn, cn-shanghai)  
**测试范围**: 前端 PRD v1.0 中定义的全部 6 张表单 + 11 个 RPC 接口 + 5 个错误场景 + 4 个读接口  
**执行方式**: 直接调用 RPC 函数（模拟前端提交），逐项校验返回值与 DB 副作用  
**测试账号**: `adc42d32-0a70-445f-9130-de0dd68372fb` (role=admin, 教学部)

---

## 一、测试结论

| 指标 | 结果 |
|---|---|
| **正向用例** | 17/18 PASS（1 个 RPC 缺失） |
| **错误用例** | 3/5 PASS（2 个 Bug） |
| **读接口** | 4/4 PASS |
| **财务一致性** | ✅ 完全匹配 |
| **审计完整性** | ✅ 19 条操作日志（覆盖 18 个写操作 + 1 个触发器） |
| **MVP 上线建议** | ⚠️ **修完 2 个 P0 Bug 后可上线** |

---

## 二、正向表单测试明细

| # | 测试项 | 对应 PRD 表单 | RPC | 结果 | 说明 |
|:-:|---|---|---|:-:|---|
| T01 | 新建学员（完整字段 + 家长信息） | 6.1 | `rpc_create_student` | ✅ | 自动初始化账户 + 家长记录 |
| T02 | 新建学员（最简字段：仅 name+source） | 6.1 | `rpc_create_student` | ✅ | 可选字段全部 null |
| T03 | 新建学员（用于后续错误测试） | 6.1 | `rpc_create_student` | ✅ | — |
| **T04** | **更新学员信息** | — | `rpc_update_student` | ❌ | **函数不存在** |
| T05 | 充值 5000（微信，带支付流水号） | 6.2 | `rpc_recharge` | ✅ | balance: 0 → 5000 |
| T06 | 充值 3000（现金 + 赠送 500） | 6.2 | `rpc_recharge` | ✅ | balance: 0 → 3500 |
| T07 | 充值 100（支付宝） | 6.2 | `rpc_recharge` | ✅ | — |
| T08 | 建课程 A（数学，含排课 JSON + 部门） | 6.6 | `rpc_create_course` | ✅ | schedule_info 正确存储 |
| T09 | 建课程 B（英语，简化版） | 6.6 | `rpc_create_course` | ✅ | — |
| T10 | 学员 1 报名课程 A | 6.3 | `rpc_enroll_student` | ✅ | unit_price 自动取 course.fee |
| T11 | 学员 2 报名课程 B | 6.3 | `rpc_enroll_student` | ✅ | — |
| T12 | 考勤 present + 自动消课 | 6.4 | `rpc_mark_attendance` | ✅ | 一次调用写 attendance+consumption_log+transaction |
| T13 | 考勤 absent（不消课） | 6.4 | `rpc_mark_attendance` | ✅ | trigger_consume=false 生效 |
| T14 | 手动消课（2 节 × 150） | 自定义 | `rpc_consume_lesson` | ✅ | balance: 3500 → 3200 |
| T15 | 创建跟进（含 next_date） | 6.5 | `rpc_create_followup` | ✅ | ISO 8601 时区正确解析 |
| T16 | 创建促销活动 | 自定义 | `rpc_create_campaign` | ✅ | applicable_course_ids=[] 正常 |
| T17 | 退费 500 | 自定义 | `rpc_refund` | ✅ | balance: 4800 → 4300 |
| T18 | 转移顾问 | 自定义 | `rpc_transfer_counselor` | ✅ | 写入 audit_log |

---

## 三、错误场景测试

| # | 错误场景 | 期望错误码 | 实际返回 | 结果 |
|:-:|---|---|---|:-:|
| E01 | 余额不足退费 | `INSUFFICIENT_BALANCE` | `INSUFFICIENT_BALANCE: 退费金额 1000.00 超过账户余额 100.00` | ✅ |
| E02 | 充值负数金额 | `INVALID_AMOUNT` | `INVALID_AMOUNT: 充值金额必须大于零` | ✅ |
| E03 | 重复报名同一课程 | `DUPLICATE_ENROLLMENT` | `DUPLICATE_ENROLLMENT: 该学员已报名此课程` | ✅ |
| **E04** | **给不存在的学员充值** | `STUDENT_NOT_FOUND` | `23503: insert or update on table "fin_accounts" violates foreign key constraint` | ❌ |
| **E05** | **非法 payment_method='btc'** | 抛错（非枚举值） | **调用成功，脏数据入库** | ❌ |

---

## 四、读接口测试

| # | 接口 | PRD 章节 | 结果 | 验证点 |
|:-:|---|---|:-:|---|
| R01 | `search_students_by_name('王')` | 3.2 | ✅ | 模糊匹配 `TEST-王小明`，similarity=0.1 |
| R02 | `v_student_overview` | 3.1 | ✅ | 3 条记录，余额/累计充值/消费 全部匹配 |
| R03 | `rpc_get_dashboard_summary()` | 3.8 | ✅ | 返回 period/students/finance/courses/followups/monthly_revenue 六段 |
| R04 | `rpc_get_student_lifecycle()` | 3.3 | ✅ | 完整返回 student/account/parents/enrollments/transactions/followups/tags |

**R02 样本**：

| 学员 | balance | 累计充值 | 累计消费 | 报名数 | 部门 |
|---|---|---|---|---|---|
| TEST-王小明 | 4300.00 | 5000.00 | 200.00 | 1 | 教学部 |
| TEST-李二   | 3200.00 | 3500.00 | 300.00 | 1 | — |
| TEST-张三   |  100.00 |  100.00 |   0.00 | 0 | — |

**财务一致性校验**：
- 王小明：`5000 - 200(T12 消课) - 500(T17 退费) = 4300` ✅
- 李二：`3000 + 500(赠送) - 300(T14 消2节×150) = 3200` ✅
- 张三：`100` ✅

---

## 五、Bug 清单与修复建议

### 🔴 P0-1 · `rpc_update_student` 函数缺失

**严重性**：高（PRD 4.2 章节已承诺该接口，前端无法编辑学员信息）  
**影响**：学员资料修改功能完全不可用  
**复现**：调用 `rpc_update_student` 抛 `42883: function ... does not exist`  

**修复方案**（建议追加到 `migrations/016_hardening.sql`）：

```sql
CREATE OR REPLACE FUNCTION public.rpc_update_student(
    p_student_id UUID,
    p_name VARCHAR DEFAULT NULL, p_phone VARCHAR DEFAULT NULL,
    p_gender VARCHAR DEFAULT NULL, p_birth_date DATE DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL, p_school VARCHAR DEFAULT NULL,
    p_grade VARCHAR DEFAULT NULL, p_status VARCHAR DEFAULT NULL,
    p_source VARCHAR DEFAULT NULL, p_notes TEXT DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL, p_department_id UUID DEFAULT NULL,
    p_operator_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_old RECORD; v_op UUID := COALESCE(p_operator_id, auth.uid());
BEGIN
    SELECT * INTO v_old FROM stu_students WHERE id=p_student_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在'; END IF;

    UPDATE stu_students SET
      name = COALESCE(p_name, name), phone = COALESCE(p_phone, phone),
      gender = COALESCE(p_gender, gender), birth_date = COALESCE(p_birth_date, birth_date),
      email = COALESCE(p_email, email), school = COALESCE(p_school, school),
      grade = COALESCE(p_grade, grade), status = COALESCE(p_status, status),
      source = COALESCE(p_source, source), notes = COALESCE(p_notes, notes),
      assigned_to = COALESCE(p_assigned_to, assigned_to),
      department_id = COALESCE(p_department_id, department_id),
      updated_at = now()
    WHERE id = p_student_id;

    INSERT INTO aud_operation_logs(user_id,action,resource_type,resource_id,changes)
    VALUES (v_op,'update_student','student',p_student_id,to_jsonb(v_old));

    RETURN jsonb_build_object('message','学员更新成功','student_id',p_student_id);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
```

### 🔴 P0-2 · 枚举字段无校验（payment_method 可传任意值）

**严重性**：高（财务数据污染风险）  
**影响**：前端只要传错枚举值（如 `btc`/`crypto`/空字符串），脏数据会直接入库  
**复现**：`rpc_recharge(payment_method:='btc', ...)` 成功写入  

**修复方案**：在 RPC 内加 CHECK 前置校验，或在表上加 CHECK constraint：

```sql
-- 方案 A: 表级约束（推荐，彻底防污染）
ALTER TABLE fin_recharges ADD CONSTRAINT chk_payment_method 
  CHECK (payment_method IN ('cash','wechat','alipay','bank_transfer','other'));

ALTER TABLE fin_transactions ADD CONSTRAINT chk_txn_type
  CHECK (type IN ('recharge','consume','refund','transfer_out','transfer_in','gift','adjustment'));

ALTER TABLE crs_attendance ADD CONSTRAINT chk_att_status
  CHECK (status IN ('present','absent','late','leave'));

ALTER TABLE flup_records ADD CONSTRAINT chk_followup_type
  CHECK (type IN ('phone','wechat','visit','other'));

ALTER TABLE stu_students ADD CONSTRAINT chk_student_status
  CHECK (status IN ('active','inactive','graduated'));
```

### 🟡 P1-1 · `rpc_recharge` 对不存在的学员抛 FK 异常而非业务错误码

**严重性**：中（前端无法按错误码做 UX，用户看到技术错误信息）  
**复现**：E04  
**现象**：
```
错误: 23503: insert or update on table "fin_accounts" violates foreign key constraint "fin_accounts_student_id_fkey"
```
应该返回：`STUDENT_NOT_FOUND: 学员不存在`

**修复**：在 `rpc_recharge`、`rpc_refund`、`rpc_enroll_student` 开头统一加：
```sql
IF NOT EXISTS (SELECT 1 FROM stu_students WHERE id=p_student_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: 学员不存在';
END IF;
```

### 🟡 P1-2 · `acct_profiles.display_name` 默认空串导致视图中 counselor_name 为空

**严重性**：中（UI 显示不友好）  
**现象**：`v_student_overview.counselor_name=""`（空串，不是 NULL），前端会显示空白  
**根因**：`handle_new_user()` trigger 创建 profile 时 `display_name=''`  

**修复**：trigger 中用 email 前缀或 user_metadata.full_name 兜底：
```sql
INSERT INTO acct_profiles(id, display_name)
VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
```

### 🟢 P2-1 · PRD 提及的 `fin_refunds` 表不存在

**严重性**：低（文档不一致）  
**现象**：PRD 初版提到 `fin_refunds` 表，但实际退费只写 `fin_transactions(type='refund')`  
**修复**：更新 PRD 3.5 节说明"退费查询走 `fin_transactions WHERE type='refund'`"，无需独立表

---

## 六、非功能测试

| 维度 | 观察值 | 评价 |
|---|---|---|
| **原子性** | 18 次写操作全部通过 SECURITY DEFINER RPC + SELECT FOR UPDATE | ✅ 优 |
| **审计覆盖率** | 18 个写操作 → 19 条 aud_operation_logs（100%+触发器加持） | ✅ 优 |
| **财务一致性** | 3 个账户余额与流水表对账 100% 匹配 | ✅ 优 |
| **时区处理** | `next_date='2026-04-28T10:00:00+08:00'` 存储为 `timestamptz`，读取正确 | ✅ 合格 |
| **中文模糊搜索** | `search_students_by_name('王')` pg_trgm 工作正常 | ✅ 合格 |
| **JSON 字段** | `schedule_info`, `applicable_course_ids` 存取正常 | ✅ 合格 |
| **软删除过滤** | `deleted_at IS NULL` 在 lifecycle RPC 中生效 | ✅ 合格 |
| **错误码标准化** | 3/5 错误场景返回 `ERROR_CODE: 中文描述` 格式 | ⚠️ 需修 P1-1 |

---

## 七、MVP 上线 Go/No-Go 建议

| 判定 | 结论 |
|---|---|
| **数据层 (migrations 010-015)** | ✅ GO |
| **原子事务 + 审计 + 财务一致性** | ✅ GO |
| **核心写操作 RPC (recharge/enroll/consume/refund/attendance/followup)** | ✅ GO |
| **学员编辑功能** | ❌ NO-GO（P0-1 阻塞） |
| **前端表单防脏数据** | ⚠️ 前端必须做枚举白名单校验（P0-2 未修前） |
| **整体** | 🟡 **条件 GO**：修完 P0-1、P0-2 后立即上线；P1 可随下个版本滚动修复 |

---

## 八、推荐的 `migrations/016_hardening.sql` 整合补丁

建议将上述修复整合成一个迁移一次性部署：

1. 添加 `rpc_update_student` 函数（P0-1）
2. 添加所有枚举字段的 CHECK 约束（P0-2）
3. 修复 `rpc_recharge`/`rpc_refund`/`rpc_enroll_student` 的前置校验（P1-1）
4. 重建 `handle_new_user()` trigger 使用 email 前缀兜底 display_name（P1-2）
5. 补加唯一约束 `fin_accounts(student_id)` UNIQUE（从 PRD 前次分析）

**预计工时**：30 分钟编写 + 15 分钟部署验证

---

## 九、测试数据快照

```
学员 3 条：TEST-王小明 / TEST-李二 / TEST-张三
课程 2 条：TEST-数学培训班 / TEST-英语口语班
报名 2 条、考勤 2 条、消课 2 条、充值 3 条、退费 1 条
交易流水 7 条、跟进 1 条、促销活动 1 条
审计日志 19 条（含 1 条转移顾问）
```

清理脚本（测试完成后可执行）：参考 `docs/cleanup-test-data.sql`（已在测试前执行过，命名前缀为 `TEST-`）。

---

**测试工程师**: Claude (Agent-First ERP QA)  
**复核**: 建议由架构师人工复核 P0-1 / P0-2 的修复代码再上线
