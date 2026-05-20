# 部署到阿里云 SAE

> 目标：`admin/` Next.js 应用部署到 SAE（Serverless App Engine），常驻容器、无冷启动。
> Supabase 已在阿里云 `cn-shanghai`，前端同 region 走 VPC 内网，单次请求延迟 5-10ms。

## 0. 前置准备

| 资源 | 说明 |
|---|---|
| **阿里云账号** | 已开通 SAE、ACR（容器镜像服务）、SLB/ALB、SSL 证书服务 |
| **域名** | 已备案（管理后台用） |
| **VPC** | 与 Supabase 实例同 VPC（不同 VPC 需开 VPC Peering，否则只能走公网） |
| **本机** | Docker Desktop / OrbStack（或任意 Linux 装 docker），已 `npm install` |

Supabase 实例信息（已确认）：
```
instance_name : ra-supabase-v36yaxpmwwluvn
region        : cn-shanghai
public_url    : http://47.102.28.236:80
vpc_url       : http://172.23.91.48:80     ← 前端在同 VPC 时务必用这个
```

---

## 1. 本机构建 + 验证

```bash
cd admin
npm ci
npm run build          # 应产生 .next/standalone/ 目录, 体积 ~25MB

# 本机模拟生产模式跑一遍 (可选)
cp -r .next/static  .next/standalone/.next/static
cp -r public        .next/standalone/public
PORT=3100 \
NEXT_PUBLIC_SUPABASE_URL=http://47.102.28.236:80 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key> \
node .next/standalone/server.js
# 浏览器开 http://localhost:3100/api/health 应返回 {"status":"ok",...}
```

---

## 2. 构建并推送镜像到 ACR

### 2.1 一次性配置 ACR 命名空间
- 阿里云控制台 → 容器镜像服务 → 个人版（够用）→ 创建命名空间 `agent-erp`
- 创建仓库 `admin`，地域 `cn-shanghai`
- 配置访问凭证（首次会让你设独立密码，**不是阿里云账号密码**）

### 2.2 登录 + 构建 + 推送

```bash
# 登录
docker login --username=<阿里云子账号> registry.cn-shanghai.aliyuncs.com

# 构建 (在 admin/ 目录) —— 注意把 NEXT_PUBLIC_* 通过 build-arg 烤进 client bundle
cd admin
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://172.23.91.48:80 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key> \
  -t registry.cn-shanghai.aliyuncs.com/agent-erp/admin:v1 \
  .

# 推送
docker push registry.cn-shanghai.aliyuncs.com/agent-erp/admin:v1
```

> ⚠️ `NEXT_PUBLIC_*` 必须在 **build 时** 注入；运行时再设无效（已烤进 chunk）。
> 如果想区分多环境 (prod/staging) 用同镜像，把 NEXT_PUBLIC_SUPABASE_URL 改成相对路径
> + Nginx 反代到 Supabase；本期简化先按一次烤一个镜像处理。

---

## 3. SAE 创建应用

控制台 → SAE → 创建应用：

| 字段 | 值 |
|---|---|
| 应用名 | `agent-erp-admin` |
| 命名空间 | 同 Supabase VPC 对应的 SAE 命名空间 |
| 部署方式 | **镜像** |
| 镜像地址 | `registry.cn-shanghai.aliyuncs.com/agent-erp/admin:v1` |
| 端口 | `3000` |
| 规格 | `1c 2g` × `1` 副本起；CPU > 60% 弹到 3 |
| VPC | 选与 Supabase 同 VPC，子网选与 Supabase 同 zone |
| 安全组 | 入向放通 80/443（SLB 来的）；出向不限 |

**环境变量** (运行时):
```
NEXT_PUBLIC_SUPABASE_URL       = http://172.23.91.48:80
NEXT_PUBLIC_SUPABASE_ANON_KEY  = <anon_key>
NODE_ENV                       = production
# 后续如要 Edge Function 走服务端 key
# SUPABASE_SERVICE_ROLE_KEY    = <service_key>    # 注意不带 NEXT_PUBLIC_
```

> 这些值与 build-arg 设的相同。**运行时再贴一份是为了 server-side 读到** —— Next.js
> server 不读 build-arg, 只读 process.env。client bundle 已烤进 build-arg 的值。

**健康检查**:
- 类型：HTTP
- 路径：`/api/health`
- 端口：`3000`
- 启动等待：`20s`
- 检查间隔：`10s`
- 失败重试：`3`

**部署策略**:
- 滚动发布，单批最多 1 副本下线
- 灰度发布：先发 10% 流量到新版，观察 10 分钟 OK 再全量

---

## 4. 接入 ALB + HTTPS

### 4.1 创建 ALB（推荐）/ SLB
- 控制台 → 应用型负载均衡 ALB → 创建实例
- 同 VPC、性能容量「弹性」、按量付费
- 监听 `HTTPS:443`（自动回源 SAE `3000`）+ `HTTP:80` (强制 301 跳 HTTPS)

### 4.2 申请免费 SSL 证书
- SSL 证书服务 → 申请免费 DV 证书 → 选你的域名 → 验证 → 下载
- 上传到 ALB 监听里使用；后续续期可在「证书自动续期」勾选

### 4.3 域名解析
- 云解析 DNS → 添加记录 `admin.<your-domain>` CNAME → ALB 的域名
- 等 5 分钟生效

---

## 5. 静态资源走 CDN（可选但强烈推荐）

Next.js 把 `/_next/static/*` 输出为长期可缓存的 hash 文件（1 年缓存安全）。让 CDN 接管这部分能：
- 全国节点就近返回，加速首屏
- 减轻 SAE 实例压力

**步骤**：
1. DCDN / CDN → 添加加速域名 `cdn.<your-domain>`，类型「静态」
2. 回源到 ALB 公网域名，回源协议 HTTPS
3. 缓存规则：
   - `/_next/static/*` → 缓存 1 年，忽略所有 query
   - `/_next/image*` → 缓存 7 天
   - 其他路径 → **不缓存**（走源站 SSR）
4. （可选）`next.config.mjs` 加 `assetPrefix: "https://cdn.<your-domain>"`，rebuild 镜像

---

## 6. 监控 + 日志

| 用途 | 阿里云产品 | 接入 |
|---|---|---|
| 应用日志（stdout/stderr） | **SLS** | SAE 「日志管理」→ 一键投递到 Logstore |
| 前端真实用户监控 (RUM) | **ARMS Browser** | 控制台拿 SDK 代码贴到 `app/layout.tsx` |
| 后端 APM | **ARMS Node.js** | SAE 应用「应用监控」→ 一键开启探针 |
| 错误告警 | **云监控** + SLS 告警 | 5xx > 0 / health 失败 → 钉钉 webhook |

---

## 7. 上线后 Checklist

- [ ] `https://admin.<your-domain>/students` 返回 200，学员表显示真实数据
- [ ] 浏览器 DevTools 看 `_next/static` 走 CDN（response header `Server: Tengine` + 命中状态）
- [ ] `/api/health` 200，SAE 实例「健康检查通过」
- [ ] 上线后 10 分钟，无 5xx、无连续重启
- [ ] Supabase `aud_operation_logs` 出现新行（验证写链路通）
- [ ] 在 SAE 控制台手动 stop 一个实例，业务无感（如果配了多副本）

---

## 8. 后续迭代

| 阶段 | 内容 |
|---|---|
| 接登录 | `/login` 页 → `supabase.auth.signInWithPassword` → cookies via `@supabase/ssr` 已就绪 |
| 启用 Edge Function | `supabase functions deploy <name>` 部署后，client `supabase.functions.invoke()` 可用 |
| 多环境 | SAE 用「应用模板」+ 不同命名空间分 prod/staging |
| 蓝绿 | 同应用建两个分组，ALB 切流量 |
| 弹性测试 | 用 PTS（阿里云压测）模拟峰值 QPS，调 SAE 弹性策略 |

---

## 9. 成本估算（cn-shanghai，2026 价位参考）

| 资源 | 规格 | 月成本 |
|---|---|---|
| SAE | 1c 2g × 1 副本 24/7 | ¥80-100 |
| ALB | 基础（按量） | ¥50-80 |
| SSL 证书 | 免费 DV | ¥0 |
| ACR 个人版 | 仓库 | ¥0 |
| DCDN | 月流量 10GB | ¥3-10 |
| SLS | 日志 1GB/月 | ¥5-15 |
| **合计** | | **¥150-200 / 月** |

弹性扩到 2-3 副本时翻倍。
