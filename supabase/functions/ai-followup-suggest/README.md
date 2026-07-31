# AI 跟进建议 Edge Function（已合并）

原独立函数方案已合并到统一的 `ai-assistant` Edge Function，避免多个函数重复管理 DeepSeek 密钥、鉴权和结构化输出逻辑。

现有调用入口：

- 网页同源接口：`POST /api/ai/recommend-followup?student_id=<uuid>`
- Edge Function 动作：`followup_suggest`
- Secret：`API_KEY`

具体鉴权、部署和测试说明见 `../ai-assistant/README.md`。
