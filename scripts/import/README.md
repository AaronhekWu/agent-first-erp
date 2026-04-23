# ERP 数据导入工具

将本地 Excel 数据批量导入 Supabase 数据库的完整工具集。

---

## 目录结构

```
scripts/import/
├── generate_templates.py   # 生成填写模板
├── import_data.py          # 导入数据到数据库
├── templates/              # 生成的模板文件（运行 generate_templates.py 后出现）
│   ├── T1_学员信息.xlsx
│   ├── T2_课程信息.xlsx
│   ├── T3_报名记录.xlsx
│   ├── T4_充值记录.xlsx
│   ├── T5_跟进记录.xlsx
│   ├── T6_考勤记录.xlsx
│   └── ERP数据导入_全部模板合集.xlsx
└── README.md               # 本文件
```

---

## 快速开始

### 1. 安装依赖

```bash
pip install openpyxl supabase python-dotenv
```

### 2. 生成填写模板

```bash
python scripts/import/generate_templates.py
```

模板保存在 `scripts/import/templates/` 目录。  
可以将模板文件发给各部门人员填写。

### 3. 配置环境变量

在项目根目录创建 `.env.local`（或复制 `.env.local.example`）：

```env
NEXT_PUBLIC_SUPABASE_URL=http://47.102.28.236:80
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

> ⚠️ **重要**：导入使用 `service_role` 密钥，会绕过 RLS 直接写入数据库。
> 请勿将密钥提交到版本控制系统。

### 4. 导入数据

```bash
# 试运行（不实际写入数据库，仅检查格式）
python scripts/import/import_data.py --sheet T1 --dry-run

# 导入单张表
python scripts/import/import_data.py --sheet T1

# 导入所有表（按顺序）
python scripts/import/import_data.py --all

# 跳过错误继续（适用于数据有缺失的情况）
python scripts/import/import_data.py --all --skip-errors

# 指定自定义模板路径
python scripts/import/import_data.py --sheet T1 --file /path/to/my_students.xlsx
```

---

## 模板说明

### 填写规范

| 颜色 | 含义 |
|------|------|
| 🔴 红色表头 | **必填字段** |
| 🔵 蓝色表头 | 可选字段 |

- **第1行**：字段名称（不要修改）
- **第2行**：填写说明（不要修改）
- **第3行**：示例数据（可删除或覆盖）
- **第4行起**：填写实际数据

### 模板清单

| 模板 | 用途 | 必填字段 |
|------|------|---------|
| T1_学员信息 | 导入学员基本档案 | 姓名 |
| T2_课程信息 | 导入课程列表 | 课程名称、学科 |
| T3_报名记录 | 导入学员报名关系 | 学员姓名、课程名称 |
| T4_充值记录 | 导入历史充值/余额 | 学员姓名、充值金额、支付方式 |
| T5_跟进记录 | 导入CRM跟进历史 | 学员姓名、跟进方式、跟进内容 |
| T6_考勤记录 | 导入历史考勤 | 学员姓名、课程名称、上课日期、出勤状态 |

### 填写顺序（重要！）

有数据关联关系，建议按顺序填写：

```
T1 学员信息  →  T2 课程信息  →  T3 报名记录
     ↓                ↓               ↓
T4 充值记录      T5 跟进记录    T6 考勤记录（可选）
```

T3/T4/T5/T6 的学员姓名必须与 T1 中的姓名完全一致。  
T3/T6 的课程名称必须与 T2 中的课程名称完全一致。

---

## 枚举字段取值

### 性别（T1）
| 中文 | 系统值 |
|------|--------|
| 男 | male |
| 女 | female |

### 学员状态（T1）
| 中文 | 系统值 |
|------|--------|
| 在读 | active |
| 休学 | inactive |
| 已毕业 | graduated |

### 来源渠道（T1）
| 中文 | 系统值 |
|------|--------|
| 转介绍 | referral |
| 线上 | online |
| 线下 | offline |
| 其他 | other |

### 支付方式（T4）
| 中文 | 系统值 |
|------|--------|
| 现金 | cash |
| 微信 | wechat |
| 支付宝 | alipay |
| 银行转账 | bank_transfer |
| 其他 | other |

### 报名状态（T3）
| 中文 | 系统值 |
|------|--------|
| 在读 | enrolled |
| 已完成 | completed |
| 已取消 | cancelled |
| 已转课 | transferred |

### 跟进方式（T5）
| 中文 | 系统值 |
|------|--------|
| 电话 | phone |
| 微信 | wechat |
| 上门 | visit |
| 其他 | other |

### 出勤状态（T6）
| 中文 | 系统值 |
|------|--------|
| 出勤 | present |
| 缺勤 | absent |
| 迟到 | late |
| 请假 | leave |

---

## 注意事项

1. **手机号重复**：若同名学员有多个，导入时会用手机号区分。确保 T1 中填写了手机号。
2. **导入顺序**：不可先导入 T3（报名）再导入 T1（学员），会找不到学员 ID。
3. **试运行**：首次导入建议先用 `--dry-run` 检查格式，没有错误再正式导入。
4. **幂等性**：rpc_create_student 会检查重名，T3 会检查重复报名，多次运行不会产生重复数据。
5. **大批量导入**：导入 1000 条以上建议分批，每批 200-500 条。
6. **审计日志**：所有导入操作会记录在 `aud_operation_logs` 表，可追溯。

---

## 常见问题

**Q: 导入时提示 "学员不存在"**  
A: 请先导入 T1 学员信息，再导入 T3/T4/T5/T6。

**Q: 导入时提示 "课程不存在"**  
A: 请先导入 T2 课程信息，再导入 T3/T6。

**Q: 学员姓名重复**  
A: 在 T1 中填写手机号，导入脚本会用姓名+手机号组合匹配。

**Q: Excel 中的下拉选项不够用**  
A: 直接手动输入对应的中文值，导入脚本会自动转换为英文枚举值。

**Q: 如何查看导入结果**  
A: 导入脚本会打印每行处理结果。成功后可在 Supabase 管理后台或 admin 前端查看。
