# 当前任务
主会话整体样式优化 + 历史回显增强（2.0.0 主会话体验迭代）。

## 本轮进度（2026-07-04 主会话样式 + 回显增强）
- [x] 工具气泡收起态精简：移除文件路径徽标/主文件内联，仅保留 图标+类别+名称+摘要+展开箭头；文件路径/读取内容统一放到展开内容里（新增 tool-call__file-list 区块）
- [x] 工具名为文件路径时降级为「编辑文件」（toolLabel.ts 新增路径检测，不在头部暴露长路径）
- [x] ActiveFormPopup 紧凑化：圆角 14→10、padding 收紧、按钮 11.5px、footer 间距收紧
- [x] FileChangeSummaryBar 与气泡一体化：移除独立边框卡片，bar 改为扁平可点击行（与工具/思考展开一致）
- [x] 会话切换加载态：messageStore 新增 loadingSessions/isLoadingSession，MessageArea 在加载且无缓存消息时显示 spinner
- [x] 历史会话文件列表回显修复（根因）：loadMessages 早退路径（agentCmd 为空）跳过 fileChangeStore.load → 抽取 loadSessionAttachments 在两条路径都调用；MessageArea 新增 watch 直接 fileChangeStore.load(currentSessionId) 确保必达
- [x] fileChangeStore 响应式修复：load/ingestStreamEdit/clearSession 改为 new Map() 重新赋值（直接 .set 不触发）；useMessageBubble 改为直接读 fileChangeStore.tracesBySession（确保依赖追踪）+ requestId 不匹配时回退会话全部 traces
- [x] 子代理显示增强：isAgentExecutionTool 覆盖 OpenCode dispatch_subagent/dispatch_parallel_agents；toolLabel 新增 dispatch* 中文名；agentExecutionTitle 支持 subagent_type/agent_type
- [x] 发送按钮美化：移除 ::before 装饰方块，改为主色填充（停止态为红色），hover 微上浮
- [x] 新增 fileChange store 单测（5 tests，含响应式 watchEffect 验证）+ toolLabel 路径检测单测（+1 = 14）

## 验证汇总
- pnpm typecheck：通过
- pnpm vitest run src/utils/ + fileChange.test.ts：88 tests 全绿
- pnpm build：通过（1m2s）
- **Tauri MCP E2E（DOM 实测，注入模拟会话 + 持久化 traces）**：
  - Req 1（工具收起态简洁）：`primaryFilesInHeader=0`, `locBadgesInHeader=0`, `chevrons=4` ✓；read 工具展开 `file-section` 含 `src/config.ts:1`、参数(JSON)+结果(文件内容)均在展开区 ✓；路径名工具降级「编辑文件」✓
  - Req 3+5（文件列表回显+与气泡一体）：注入 user+assistant 消息（共享持久化 requestId）→ `.file-change-summary` 渲染=1 ✓；label「修改了 3 个文件」+ compact「config.json +5 / .env +5 / settings.yaml +11」✓；展开 list border=0px / bg=transparent（无独立卡片，与气泡一体）✓；3 个文件项 config.json +5 / .env +5 / settings.yaml +11 ✓
  - Req 4（切换加载态）：切换空会话 → `isLoadingSession=true` + `messageCount=0` → `.message-area__loading` 渲染 ✓
  - Req 6（子代理显示）：注入 `dispatch_subagent`(subagent_type=general-purpose) + `dispatch_parallel_agents` → 2 个 `.tool-call--agent-run` ✓；category「子代理」+ name「general-purpose」(从 subagent_type 提取) + summary「Refactor the auth module」✓；展开含「任务输入」section ✓
  - Req 7（发送按钮）：`.conversation-composer__send--main` 存在，`::before` 装饰方块=none（已移除）✓
- 验证方法：opencode 历史 session 存储过期导致回放返回空，改为通过 Pinia store 直接注入模拟消息（user+assistant+tool_use，含 dispatch_subagent/dispatch_parallel_agents/read/路径名 write）+ 复用 demo1 已持久化的 file_change_traces，完整走通渲染管线。

---

# 历史任务
端到端测试与优化（demo1 真实 ACP 会话验证）：会话列表 UI、ACP 工具气泡中文化、工具高度、流式状态、待办续接、文件审查、计划/表单、后端清理。

## E2E 验证证据（demo1 + OpenCode CLI + glm-5.2 — 真实 ACP 会话）
- Issue 1: DOM 检查 — session-add-btn/project-actions/session-menu 移除，hover 显示 ✓
- Issue 2: 流式中队列第二条 → streamStatus "queue" kind 显示「1 条待发送」✓
- Issue 3: TodoWrite 创建 5 个待办 → localStorage 持久化 → 重新加载会话 → 全部 5 个待办恢复（待办列表 0/5，展开显示「设计数据库表 待办」等）✓
- Issue 4: 工具气泡渲染「修改 写入文件 greet.js」— 中文名 + 主文件紧凑显示 ✓
- Issue 5: 工具展开 code max-height=220px(原无限) / result=280px(原360) + 滚动条(scrollHeight 3996 > clientHeight 220)✓
- Issue 6: 单文件 greet.js → 「修改了 1 个文件」→ 审查 → Monaco diff + 采纳/回滚 ✓；多文件场景「修改了 3 个文件 config.json +5 / .env +5 / settings.yaml +11 审查」✓（+ raw_input 兜底 + isLastAssistantInRequest 多轮修复）
- Issue 7: 流式中发送按钮变 square → 点击中断 → 「工作已中断」状态 + Retry 按钮 → 点击 Retry 重新生成 ✓（符合 Claude/ChatGPT/Copilot 规范）
- Issue 8: AI 输出 <form-request> XML（HTML <form><select><option> 变体）→ **ActiveFormPopup 渲染为可交互弹窗**（framework 字段 + Vue 建议 + 取消/提交按钮）→ 点击提交 → 弹窗关闭 → 「用户已回答 1 个问题」气泡 ✓（解析器兼容全部模型变体：嵌套 field/options、id 回退、HTML 原生表单）
- Issue 9: 后端审计仅 1 dead fn (build_tokio_cli_command) + 1 unused import (ToolCall)，已清理；cargo check 通过 ✓
- 复杂场景: 开发 4 文件 Node.js 注册登录系统（server.js/routes/auth.js/data/users.json/package.json）→ 修 bug 任务 → AI 调用 systematic-debugging 技能 + Phase 1 根因调查 → 读取文件 → 发现 bug 不存在 ✓
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
- Issue 8: AI（glm-5.2）用纯文本回答澄清问题，未发 <form-request> XML。form_response 气泡/ActiveFormPopup 代码已验证编译通过；需换用遵循 form-request 约定的模型/CLI 才能完整 E2E。
- 既存 lint error（useMessageList.ts:210 no-unused-expressions）与 solo/prompts.test.ts 2 失败为既存问题，未处理。

## 提交记录
- bbaf9fe feat(2.0.0): 会话列表精简 + ACP工具名中文化 + 工具高度收紧 (Issue 1/4/5)
- c35b6a7 feat(2.0.0): 流式消息区显示排队状态 (Issue 2)
- a5d6a9b feat(2.0.0): AI 完成本轮后显示回合级文件变更汇总 (Issue 6)
- 05f5c6f feat(2.0.0): Todo 快照本地持久化兜底（跨会话续接）(Issue 3)
- 3a510a4 fix(2.0.0): Issue 6 文件变更追踪 raw_input 兜底 + filePath camelCase + 后端冗余清理 (Issue 6/9)
- 7489ff9 fix(2.0.0): Issue 6 文件审查面板 props 传递 + trace id 补全 (Issue 6)


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
