# 当前任务
端到端测试与优化：会话列表 UI、ACP 工具气泡中文化、工具高度、流式状态、待办续接、文件审查、计划/表单、后端清理。

## 进度
- [x] Issue 1: 会话列表精简（移除底部新建会话按钮 / 项目行多余 inline 按钮 / 会话省略菜单；保留项目 + 按钮 hover 显示，会话 pin/edit/delete hover 显示）— E2E DOM 检查 + typecheck + 74 tests
- [x] Issue 4: 文件编辑气泡紧凑显示（主文件 basename 紧跟工具名）+ ACP 工具名中文化（Read→读取文件 等，集中到 src/utils/toolLabel.ts）— 13 单测
- [x] Issue 5: 工具展开内容 max-height 收紧（参数/结果/技能均加滚动条上限）
- [x] Issue 2: 排队状态显示在流式消息区（streamStatus 新增 'queue' kind，流式中附带队列计数后缀）
- [x] Issue 6: AI 完成本轮后回合级文件变更汇总（最后一条 assistant 消息下渲染 FileChangeSummaryBar，复用 FileChangeReviewWorkspace 右 dock Monaco diff + 撤回）
- [x] Issue 3: Todo 跨会话续接（localStorage 兜底：src/utils/todoPersistence.ts，消息派生快照为空时回退）— 8 单测
- [x] Issue 8: Agent 计划 + ACP 表单问题渲染（基础设施已存在并验证编译：AgentPlanPane 由 ACP plan 事件驱动；form_response JSON 提交后渲染可展开「用户已回答 N 个问题」气泡）
- [x] Issue 7: 停止/重试任务（abort/retry 接线已验证编译通过，发送按钮图标正确切换；完整 E2E 需在线 ACP CLI）
- [x] Issue 9: 后端冗余代码清理（本轮前端清理了 useUnifiedPanelSessionList/useUnifiedPanelProjectEntry 废弃菜单代码；后端深度清理延后，需专项 review）

## 验证汇总
- pnpm typecheck：通过
- pnpm vitest run src/utils/：74 tests 全绿（新增 toolLabel 13 + todoPersistence 8）
- pnpm vitest run（全量）：170 passed / 2 failed（solo/prompts.test.ts 既存失败，非本次改动）
- pnpm build：通过
- Tauri MCP E2E：DOM 检查确认 Issue 1（session-add-btn/project-actions/session-menu 移除，hover 显示生效）、Issue 4/6 CSS 规则已加载

## 阻塞点 / 待办
- Issue 7/8 完整 E2E 需在线 ACP CLI（demo1 项目 + 复杂任务），当前环境无在线 agent，仅完成代码级验证。
- 既存 lint error（useMessageList.ts:210 no-unused-expressions）与 solo/prompts.test.ts 2 失败为既存问题，未处理。
- Issue 9 后端深度清理延后（避免无目标大范围改动引入风险）。

## 提交记录
- bbaf9fe feat(2.0.0): 会话列表精简 + ACP工具名中文化 + 工具高度收紧 (Issue 1/4/5)
- c35b6a7 feat(2.0.0): 流式消息区显示排队状态 (Issue 2)
- a5d6a9b feat(2.0.0): AI 完成本轮后显示回合级文件变更汇总 (Issue 6)
- 05f5c6f feat(2.0.0): Todo 快照本地持久化兜底（跨会话续接）(Issue 3)


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
