# AI Assistant Edge Function

统一承载需要 DeepSeek 密钥的 AI 分析能力，密钥仅从 Edge Function Secret `API_KEY` 读取。

## 业务动作

- `followup_suggest`：读取当前账号有权查看的学员知识图谱，生成跟进草稿。
- `recharge_suggest`：读取当前账号有权查看的学员知识图谱，生成充值沟通建议，不执行财务操作。
- `campus_analysis`：通过 `campus.manage` 权限保护的 KPI RPC 生成校区经营分析。
- `connection_test`：仅 Supabase service key 可调用的模型连通性检查，不读取业务数据。

网页端经 Next.js 同源路由转发当前登录会话。RDS Supabase 网关使用 anon key 通过网关校验，并把用户 JWT 放在 `x-user-jwt` 中；Edge Function 使用用户 JWT 调用 RPC，数据库继续负责数据范围和功能权限校验。

## 部署和检查

部署时上传 `index.ts`，函数名为 `ai-assistant`，入口为 `index.ts`。部署后依次验证：

1. `GET /functions/v1/ai-assistant` 返回 `configured: true`。
2. `OPTIONS /functions/v1/ai-assistant` 返回 204。
3. 未携带用户会话的业务分析返回 401。
4. 使用 service key 调用 `connection_test` 返回模型连通成功。

任何响应和日志都不得包含 `API_KEY`、anon key、service key 或用户 JWT。
