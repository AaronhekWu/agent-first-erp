# Edge Functions

阿里云 Supabase 现已支持 Edge Functions（`/functions/v1/*`）。本目录的写操作函数包装对应的 RPC，方便未来叠加业务校验、通知、审计、限流等横向逻辑。

## 部署

```bash
supabase functions deploy students-create --project-ref ra-supabase-v36yaxpmwwluvn
supabase functions deploy courses-create  --project-ref ra-supabase-v36yaxpmwwluvn
```

需要第三方模型密钥的 AI 功能统一部署为 `ai-assistant`。该函数从 Edge Function Secret `API_KEY` 读取 DeepSeek 密钥，应用容器和浏览器均不保存密钥。RDS Agent Runtime 环境通过函数管理接口上传 `supabase/functions/ai-assistant/index.ts`。

部署后，前端通过 `supabase.functions.invoke('students-create', { body })` 调用。

如果未部署，前端自动回退到直接调用 RPC（参见 `admin/lib/api/create.ts`）。

## 约定

- 函数名 = 资源 + 动作（kebab-case），如 `students-create`、`courses-update`、`recharges-confirm`
- 输入：JSON body，键名与底层 RPC 形参一致（`p_*` 前缀）
- 输出：`{ data }` 或 `{ error: 'ERROR_CODE: 描述' }`，与项目错误码规范保持一致
- 鉴权：透传调用方 `Authorization` header；RPC 内部仍走 SECURITY DEFINER + 行锁 + 审计
