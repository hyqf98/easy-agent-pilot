# 当前任务
ACP 流式渲染管线重构：前端实时层按 MessageRecorder 段落模型渲染 text/thinking/tool，并修复 todo、停止按钮、计划模式分流。

## 进度
- [x] 检查实时消息、todo、发送按钮、计划模式相关代码
- [x] 移除可见空 assistant 正文预占位，改用本地执行锚点
- [x] 恢复 assistant 侧等待首字样式：发送开始创建本地 awaiting text 段，首个 content 复用，thinking/tool 到来时移除空段
- [x] 实现 text/thinking/tool 可见段按事件顺序创建、同类合并、异类收口
- [x] 工具 use/result 合并到同一实时工具气泡，保留 kind/locations
- [x] Todo 面板从 toolInput/toolResult/JSON result 三条路径提取
- [x] 修复刷新后历史消息顺序：删除同 request 多条 assistant text 的旧去重折叠，保留后端段落顺序
- [x] 修复历史工具结果合并：tool_use 关联最新非空 tool_result，避免显示空结果
- [x] 修复 TodoWrite 历史渲染：支持 tool_result 为顶层 JSON 数组，并按 toolCallId 合并 tool_use 元数据
- [x] 发送按钮在空草稿响应中显示停止并调用 abort；有草稿仍发送/排队
- [x] 计划确认只基于真实 ACP plan 事件，不把普通 content 当计划文档
- [x] Vitest 排除 src-tauri 缓存目录，避免插件临时测试污染前端全量测试
- [x] 新增 live segment 与 todo 提取单测
- [x] 验证：pnpm typecheck 通过
- [x] 验证：目标 Vitest 通过（36 tests）
- [x] 验证：Tauri MCP E2E 刷新历史后 todowrite 工具结果与 Todo 面板正常显示
- [ ] 全量 Vitest 仍有既存 solo/prompts.test.ts 两个失败，非本次改动

## 阻塞点
无当前阻塞。全量 Vitest 的 `src/services/solo/prompts.test.ts` 两个失败为既存问题，需要单独修复。

## 上下文锚点
- 关键文件:
  - src/services/conversation/ConversationService.ts
  - src/stores/message.ts
  - src/utils/todoToolCall.ts
  - src/utils/liveStreamSegments.ts
  - src/components/layout/conversationComposer/ConversationComposer.vue
  - src/composables/useConversationComposer.ts
  - vite.config.ts
- 关键决策:
  - 后端 MessageRecorder 仍是最终持久化来源；前端实时 text/thinking/tool 段均为 persist:false 本地行。
  - `local_anchor_<requestId>` 只作为发送/中断/重试兼容锚点，不参与消息列表渲染，也不落库。
  - plan 模式右侧面板只由 ACP `plan` 事件驱动确认，不消费普通 `content`。
