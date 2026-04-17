# 模块与目录说明

> 本文档描述项目的完整目录结构和各业务模块职责。AGENTS.md 通过引用聚合。

---

## AgentTeams 与专家运行时

- 本项目已引入 `AgentTeams / Expert` 机制。主会话、计划拆分、任务执行都允许绑定"专家"而不是只绑定底层 CLI。
- 专家层负责提示词、默认模型、角色分工；运行时层负责 Claude CLI / Codex CLI 等具体执行器。修改链路时必须同时考虑"专家选择 + 运行时选择 + 模型选择"的组合。
- 主会话、计划拆分、任务执行中出现的上下文策略提示、运行时提示、token 统计都属于同一条执行链，前后端字段必须保持一致，不能只改展示层。
- 动态表单属于专家交互协议的一部分。`form_request`、`form_response`、继续拆分、继续执行、停止后恢复都必须视为一套完整状态机。

---

## 前端模块

`src/` 为前端主目录，按业务域拆分，而不是按纯技术层堆叠。

### 大文件拆分约定

超过约 1000 行的 Vue 组件优先拆为 `Component.vue + camelCase 目录 + useXxx.ts + styles.css`。
新增 sidecar 目录和文件统一使用 camelCase，避免再出现 `use-task-edit-modal` 这类横杆命名。

### 目录清单

- `src/views/`
  路由级页面入口。当前包含主页工作台、设置页、MCP 测试页、Mini Panel 页面。

- `src/components/layout/`
  主工作区骨架。负责顶部栏、侧边导航、项目区、会话区、消息区、统一面板、文件编辑器切换。
  关键文件：`MainLayout.vue`、`PanelContainer.vue`、`SessionPanel.vue`、`ConversationComposer.vue`、`MessageArea.vue`。

- `src/components/settings/`
  设置中心。当前菜单包括：通用设置、智能体设置、Agent 配置、无人值守、Marketplace、Provider Switch、会话管理、主题、LSP、数据管理、日志管理、软件更新、Token 统计。
  关键文件：`tabs/AgentCliUsageSettings.vue`、`tabs/agentCliUsageSettings/useAgentCliUsageSettings.ts`、`tabs/agentCliUsageSettings/chartUtils.ts`。

- `src/components/plan/`
  计划模式核心模块。负责计划列表、计划新建/编辑、任务拆分、拆分预览、任务看板、任务详情、计划进度、执行日志、继续拆分等流程。
  关键文件：`PlanList.vue`、`TaskBoard.vue`、`TaskSplitDialog.vue`、`TaskExecutionLog.vue`、`TaskEditModal.vue`。

- `src/components/memory/`
  记忆模式模块。负责记忆库、原始记忆池、AI 合并、批量删除、Markdown 记忆维护。
  关键文件：`MemoryModePanel.vue`、`memoryModePanel/useMemoryModePanel.ts`。

- `src/components/message/`
  会话消息渲染模块。负责消息气泡、Markdown 渲染、Thinking 展示、工具调用展示、执行时间线、结构化结果渲染。
  关键文件：`MessageBubble.vue`、`MessageList.vue`、`messageList/useMessageList.ts`、`MarkdownRenderer.vue`、`ToolCallRenderer.vue`、`ThinkingBlock.vue`。

- `src/components/unattended/`
  无人值守渠道模块。负责微信渠道创建、扫码登录、监听状态管理、默认项目 / Agent / 模型绑定、远程线程日志回看。
  关键文件：`UnattendedPanel.vue` 及其 `unattendedPanel/` sidecar 目录。

- `src/components/marketplace/`
  市场模块。负责 MCP、Skill、Plugin 的列表、详情、安装、启停、更新入口。

- `src/components/skill-config/`
  Agent 维度的 MCP / Skill / Plugin 配置中心，包含配置列表、编辑器、文件工作区、详情侧栏等。
  关键文件：`SkillConfigPage.vue`、`modals/CliConfigSyncModal.vue`、`common/ConfigFileWorkspace.vue`、`views/PluginDetailView.vue`。

- `src/components/fileTree/`
  项目文件树与文件操作模块，负责重命名、移动、删除、上下文菜单等。
  关键文件：`FileTree.vue`、`FileTreeContextMenu.vue`、`FileTreeCreateDialog.vue`、`FileTreeRenameDialog.vue`。

- `src/components/agent/`
  智能体配置与模型管理模块，负责 Agent 表单、模型编辑、Claude 配置扫描等。

- `src/components/project/`
  项目创建与项目入口相关组件。

- `src/components/common/`
  通用 UI 组件库，如按钮、输入框、弹窗、选择器、图标、骨架屏、进度条、提示组件。通用组件统一使用 `Ea` 前缀。

- `src/modules/file-editor/`
  文件编辑子系统。基于 Monaco，负责编辑器工作区、语言策略、文件编辑服务、LSP 接入。
  关键文件：`components/FileEditorWorkspace.vue`、`components/MonacoCodeEditor.vue`、`services/fileEditorService.ts`、`services/lspService.ts`。

- `src/stores/`
  Pinia 状态管理层。覆盖项目、会话、消息、计划、任务、任务执行、设置、主题、窗口状态、记忆、Marketplace、Agent 配置、Provider Profile、应用更新、无人值守渠道、CLI 用量统计等状态。

- `src/services/appUpdate/`
  应用更新服务层。负责版本读取、更新检查、下载进度、安装与重启策略适配。

- `src/services/conversation/`
  会话执行服务层。统一封装 Claude/Codex 的 CLI 与 SDK 执行策略、消息构建、执行器、文件追踪。

- `src/services/plan/`
  计划编排服务层。负责任务拆分编排、动态表单、执行进度管理、计划提示词。

- `src/services/memory/`
  记忆合并服务层，负责原始记忆压缩、项目记忆提示词、记忆库合成逻辑。

- `src/services/compression/`
  会话压缩能力，负责长上下文压缩与压缩结果组织。

- `src/services/unattended/`
  无人值守服务层。负责渠道 CRUD、微信登录、运行时状态查询、线程上下文更新、消息事件记录与远程发送。

- `src/services/usage/`
  CLI 用量服务层。负责从会话、任务拆分、任务执行流程中提取 token 使用数据并异步入库。

- `src/composables/`
  组合式逻辑封装，如消息编辑、会话视图、快捷键、异步操作、对话框、外部点击处理等。

- `src/router/`
  路由定义与页面标题更新逻辑。

- `src/locales/`
  中英文文案资源。

- `src/types/`
  统一类型定义，如计划、任务执行、记忆、时间线、文件追踪等。

- `src/utils/`
  工具层，负责日志、校验、MCP 配置、会话工具输入、计划执行文本、结构化内容转换等。

- `src/styles/`
  全局样式、变量与动画定义。

### Sidecar 目录索引

| 模块 | Sidecar 路径 |
|------|-------------|
| 主会话 | `src/components/layout/conversationComposer/`、`src/components/layout/messageArea/`、`src/components/layout/sessionPanel/` |
| 消息渲染 | `src/components/message/messageBubble/`、`src/components/message/messageList/` |
| 计划模块 | `src/components/plan/planList/`、`src/components/plan/taskBoard/`、`src/components/plan/taskEditModal/`、`src/components/plan/taskExecutionLog/`、`src/components/plan/taskSplitDialog/` |
| 文件树 | `src/components/fileTree/` |
| 记忆模块 | `src/components/memory/memoryModePanel/` |
| 设置模块 | `src/components/settings/tabs/agentCliUsageSettings/` |
| SOLO | `src/components/solo/soloModePanel/` |
| 无人值守 | `src/components/unattended/unattendedPanel/` |

---

## 后端模块

`src-tauri/src/` 为 Tauri 2 Rust 后端。

- `src-tauri/src/lib.rs`
  Tauri 应用入口。负责插件注册、命令注册、数据库初始化、日志初始化、计划调度恢复、MCP Bridge 启动。

- `src-tauri/src/database/`
  数据库初始化与表结构准备逻辑，当前持久化核心为本地 SQLite。

- `src-tauri/src/logging.rs`
  运行时日志初始化与日志写入。

- `src-tauri/src/scheduler/`
  计划调度模块，负责定时计划恢复、定时触发与后台调度。

### 命令模块清单

| 命令文件 | 职责 |
|---------|------|
| `commands/agent.rs` | 智能体管理命令 |
| `commands/agent_config.rs` | Agent 关联的 MCP、Skill、Plugin、Model 配置命令 |
| `commands/app_state.rs` | 应用状态读写命令 |
| `commands/cli.rs` | CLI 工具检测、路径管理、迁移等命令 |
| `commands/cli_config.rs` | CLI 配置文件读写与同步命令 |
| `commands/cli_installer.rs` | CLI 安装、升级、取消安装等命令 |
| `commands/conversation/` | 会话执行后端能力，负责 Claude/Codex CLI/SDK 执行、流式输出、中断、执行策略与统一执行器 |
| `commands/data.rs` | 数据导出、导入、清空、统计命令 |
| `commands/file_editor.rs` | 项目文件读取、写入、语言识别命令 |
| `commands/install.rs` | 安装会话记录、回滚、安装状态维护命令 |
| `commands/lsp.rs` | LSP 服务下载、移除、激活等命令 |
| `commands/marketplace.rs` | 市场源管理命令 |
| `commands/mcp.rs` | MCP Server 管理、测试、工具调用命令 |
| `commands/mcp_market.rs` | MCP 市场拉取、安装、启停、卸载、更新命令 |
| `commands/mcpmarket_source.rs` | MCP 市场源选项与来源处理命令 |
| `commands/memory.rs` | 记忆库、原始记忆、记忆合并命令 |
| `commands/message.rs` | 消息 CRUD、清空、图片上传命令 |
| `commands/mini_panel.rs` | Mini Panel 显示、隐藏、目录、快捷键等命令 |
| `commands/mini_panel_windows_shortcut.rs` | Mini Panel 在 Windows 下的快捷键注册与原生钩子处理命令 |
| `commands/plan.rs` | 计划 CRUD、计划状态、计划调度命令 |
| `commands/plan_split.rs` | 计划拆分会话、拆分日志、开始/继续/停止拆分、提交表单命令 |
| `commands/plugins_market.rs` | 插件市场拉取、安装、启停、卸载命令 |
| `commands/project.rs` | 项目 CRUD、目录校验、文件列举、文件移动删除重命名命令 |
| `commands/project_access.rs` | 最近项目访问记录命令 |
| `commands/provider_profile.rs` | Provider Profile 管理与切换命令 |
| `commands/runtime_log.rs` | 运行日志摘要、文件列表、内容读取、清理命令 |
| `commands/scan.rs` | CLI 配置、MCP、会话扫描命令 |
| `commands/scan_session_shared.rs` | 会话扫描复用查询与结构转换逻辑 |
| `commands/scan_shared.rs` | 扫描链路通用结构、路径与排序辅助逻辑 |
| `commands/session.rs` | 会话 CRUD、置顶命令 |
| `commands/settings.rs` | 应用设置读写命令 |
| `commands/skill_plugin.rs` | Skill / Plugin 文件读写与脚手架命令 |
| `commands/skills_market.rs` | Skill 市场拉取、安装、启停、卸载、更新命令 |
| `commands/task.rs` | 任务 CRUD、排序、重试、批量更新、拆分会话存储命令 |
| `commands/task_execution.rs` | 任务执行日志、执行结果、计划执行进度命令 |
| `commands/unattended.rs` | 无人值守渠道、账号、线程、事件、运行时管理与远程消息发送命令 |
| `commands/window.rs` | 多窗口与会话锁定相关命令 |

---

## 当前页面与业务入口说明

| 业务入口 | 核心组件 | 关键文件 |
|---------|---------|---------|
| 主会话 | `MainLayout`、`PanelContainer`、`SessionTabs`、`MessageArea` | `src/components/layout/SessionPanel.vue`、`src/components/layout/ConversationComposer.vue`、`src/components/layout/MessageArea.vue` |
| 菜单设置 | `SettingsView`、`SettingsNav`、`settingsTabs.ts` | `src/views/SettingsView.vue`、`src/components/settings/SettingsNav.vue`、`src/components/settings/settingsTabs.ts` |
| 计划拆分 | `TaskSplitDialog` | `src/components/plan/TaskSplitDialog.vue`、`src/components/plan/taskSplitDialog/useTaskSplitDialog.ts` |
| 计划执行 | `TaskBoard`、`KanbanColumn`、`TaskExecutionLog`、`PlanProgressDetail` | `src/components/plan/TaskBoard.vue`、`src/components/plan/TaskExecutionLog.vue`、`src/components/plan/TaskEditModal.vue` |
| 记忆管理 | `MemoryModePanel` | `src/components/memory/MemoryModePanel.vue`、`src/components/memory/memoryModePanel/useMemoryModePanel.ts` |
| 无人值守 | `UnattendedPanel` | `src/components/unattended/UnattendedPanel.vue`、`src/components/settings/tabs/UnattendedSettings.vue` |
| SOLO 单兵执行 | `SoloModePanel`、`SoloRunList`、`SoloExecutionLogPanel` | `src/components/solo/SoloModePanel.vue`、`src/components/solo/SoloRunCreateDialog.vue`、`src/components/solo/SoloExecutionLogPanel.vue` |
| 软件更新 | `AppUpdateSettings` | 设置中心入口 |
| Token 统计 | `AgentCliUsageSettings` | `src/components/settings/tabs/AgentCliUsageSettings.vue`、`src/components/settings/tabs/agentCliUsageSettings/useAgentCliUsageSettings.ts`、`src/components/settings/tabs/agentCliUsageSettings/chartUtils.ts` |
