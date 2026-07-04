# 当前任务
端到端测试与优化：会话列表 UI、ACP 工具气泡中文化、工具高度、流式状态、待办续接、文件审查、计划/表单、后端清理。

## 进度
- [x] Issue 1: 会话列表精简（移除底部新建会话按钮 / 项目行多余 inline 按钮 / 会话省略菜单；保留项目 + 按钮 hover 显示，会话 pin/edit/delete hover 显示）— 已 E2E 验证（DOM 检查 + typecheck + 66 tests）
- [x] Issue 4: 文件编辑气泡紧凑显示（主文件 basename 紧跟工具名）+ ACP 工具名中文化（Read→读取文件 等，集中到 src/utils/toolLabel.ts）— 13 单测全绿
- [x] Issue 5: 工具展开内容 max-height 收紧（参数/结果/技能均加滚动条上限）— typecheck 通过
- [ ] Issue 2: 排队/完成状态显示在流式消息里（语义待确认：当前排队气泡在 composer，流式状态在 message-list 底部）
- [ ] Issue 6: AI 完成后回合级文件变更汇总（展开 + 审批 + git diff 侧栏 + 撤回）— 组件已存在（FileChangeReviewWorkspace / MonacoDiffEditor），需补 request 级汇总渲染
- [ ] Issue 8: Agent 计划 + ACP 表单问题渲染（form_response 气泡已存在，需确认纯文本回答也渲染 Q&A 气泡）
- [ ] Issue 3: Todo 跨会话续接（需新增 todo_snapshots 表 + acp.rs 写入 + loadMessages 注入）
- [ ] Issue 7: 停止/重试任务测试与修复（abort/retry 已接线，需 E2E 验证）
- [ ] Issue 9: 后端冗余代码清理

## 阻塞点
- Issue 2 原文 "主会话删除排队完成的显示在流式消息里面" 语义不明确，需用户确认期望行为。
- Issue 3/6/7/8 需要真实 ACP CLI 会话做 E2E（demo1 项目 + 复杂任务），当前环境无在线 agent。
- 既存 lint error（useMessageList.ts:210 no-unused-expressions）非本次改动，未处理。

## 上下文锚点
- 关键文件（本次已改）:
  - src/components/layout/UnifiedPanelProjectEntry/{UnifiedPanelProjectEntry.vue, useUnifiedPanelProjectEntry.ts, styles.css}
  - src/components/layout/UnifiedPanelSessionList/{UnifiedPanelSessionList.vue, useUnifiedPanelSessionList.ts, styles.css}
  - src/components/message/ToolCallDisplay/{ToolCallDisplay.vue, useToolCallDisplay.ts, styles.css}
  - src/utils/toolLabel.ts (+ toolLabel.test.ts) [新增]
- 关键文件（后续待改）:
  - src/components/message/messageList/{MessageList.vue, useMessageList.ts}（Issue 2 流式状态）
  - src/components/message/fileChangeSummary/（Issue 6 request 级汇总）
  - src-tauri/src/database/mod.rs + src-tauri/src/commands/conversation/strategies/acp.rs（Issue 3 todo 持久化）
- 关键决策:
  - 会话行操作改为 hover 显示（pin/edit/delete），移除冗余省略菜单（与 hover 按钮重复）。
  - 项目行只保留 + 按钮（hover），批量选择/文件管理移入省略菜单。
  - ACP 工具名中文化集中在 src/utils/toolLabel.ts，ToolCallDisplay 通过 displayName/primaryFile 渲染。
