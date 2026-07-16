# Edge Function: ai-followup-suggest

**状态**: 占位 (源码未实现)。前端通过 `/api/ai/recommend-followup` 路由请求 AI 推荐跟进话术；该路由当前返回 501 + 合约文档。

## 何时实现

当：
1. 已选择 LLM 提供商（Claude / GPT / 本地模型）
2. 已配置密钥到 Supabase Function 环境变量
3. 已确认 token 使用预算与缓存策略

## 设计

输入：`{ student_id: UUID }` →
1. Edge Function 内部调 `rpc_get_student_signals(student_id)` 拿到学员画像 JSON
2. 拼 prompt（system + signals + 历史跟进 timeline 截短）
3. 调 LLM API
4. 解析输出为 `{ suggested_type, suggested_content, suggested_next_plan, suggested_next_date, reasoning, confidence, model }`
5. （可选）把结果回写到 `flup_records.metadata` 当作 AI 草稿，待顾问审核后调 `rpc_create_followup` 落地

输出格式与 `admin/app/api/ai/recommend-followup/route.ts` 中 `CONTRACT.response.schema` 严格一致。

## 部署

```bash
supabase functions deploy ai-followup-suggest --project-ref ra-supabase-v36yaxpmwwluvn \
  --no-verify-jwt   # 当前 MVP, 后期开启
```

前端 `/api/ai/recommend-followup` 改为 `await sb.functions.invoke('ai-followup-suggest', { body: { student_id } })`。
