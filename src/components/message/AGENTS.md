# message/ — 消息渲染组件

> 会话消息流的各类内容渲染组件：Markdown、思考过程、工具调用、结构化内容、运行时通知、Todo 面板、执行时间线、压缩气泡、文件变更汇总条。

## 职责

把后端推送 / 本地存储的消息数据渲染为可交互的 UI：
- `MarkdownRenderer`：Markdown → HTML（含 highlight.js 代码高亮、代码块复制、本地文件链接打开）。
- `ThinkingDisplay`：AI 思考过程（打字机动画）。
- `ToolCallDisplay`：工具调用卡片（参数/结果展开、状态图标、打字机）。
- `StructuredContentRenderer` / `StructuredResultCard`：结构化内容（表单、生成/修改/删除文件清单）。
- `RuntimeNoticeList`：运行时通知（用量、环境、上下文摘要）。
- `ConversationTodoPanel`：会话 Todo 列表（从消息流抽取 Todo 快照）。
- `ExecutionTimeline`：完整执行时间线（思考+工具+内容分组渲染，支持表单）。
- `CompressionMessageBubble`：上下文压缩气泡。
- `MessageBubble` / `MessageList`：消息气泡与列表（核心容器，按 messageType 分发渲染）。
- `fileChangeSummary/FileChangeSummaryBar`：单回合文件变更汇总条（点击进入审查）。

## 目录结构

每个组件独占文件夹，严格三段式（见项目根 `AGENTS.md` §4.1）：

```
message/
├── index.ts                        # barrel
├── MarkdownRenderer/  ToolCallDisplay/  ThinkingDisplay/ ...
├── messageBubble/                  # 消息气泡（核心，已拆分）
├── messageList/                    # 消息列表（已拆分）
└── fileChangeSummary/              # 文件变更汇总条（Case A 原地拆分）
```

## 消费方式

走 barrel：`import { MessageBubble, MarkdownRenderer } from '@/components/message'`。

## 依赖

- Store：`useMessageStore`、`useFileChangeStore`（FileChangeSummaryBar）、`useThemeStore`（ExecutionTimeline 暗色判定）。
- Composable：`useTypewriterText`（打字机动画）、`inject(ACTIVE_FORM_ID)`（StructuredContentRenderer）。
- 通用组件：`EaIcon`。
- 子系统：`@/components/plan/dynamicForm`（DynamicForm，用于表单渲染）、`@/modules/fileEditor`（MarkdownRenderer 打开本地文件）。

## 模块约定

- `messageBubble/MessageBubble.vue` 是消息渲染的总入口，按 `messageType` 分发到上述各子渲染组件。
- `MarkdownRenderer` 含**两个 style 块**：非 scoped 的 `@import 'highlight.js/...'`（v-html 内容需全局样式）+ scoped 的 `styles.css`。
- `ExecutionTimeline` / `StructuredContentRenderer` 的表单事件经 `emit` 上抛（`form-submit`/`form-cancel`），由上层（MessageBubble/PaneWrapper）处理。
- `FileChangeSummaryBar` 保留在 `fileChangeSummary/` 子目录（Case A，原地拆分）。
