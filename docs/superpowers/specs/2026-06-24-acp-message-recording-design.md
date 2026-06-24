# ACP 消息记录与按时间流分段渲染 — 设计文档

- 日期：2026-06-24
- 分支：feature/2.0.0
- 状态：待评审

## 背景与问题

当前会话记录存在四个核心问题：

1. **后端 ACP 零落库**：`acp.rs` 只通过 `app.emit()` 发送 `StreamEvent`（thinking / tool_use / tool_result / usage / context_window / compression / system / error 等），所有数据库写入都由 Vue 前端 `message` store 调用 `create_message` / `update_message_fields` 完成。后端不是消息的真相来源。
2. **每回合折叠成一行**：每个 assistant 回合对应 `messages` 表的一行，thinking、tool_calls（JSON 数组）、content、runtimeNotices、editTraces 全部叠进同一行。无法按事件类型查询、无法按时间流分段显示，工具顺序还会被 `sortedToolCalls` 重排丢失时序。
3. **缺少标准 ID**：唯一关联键是 `session_id`（Rust 生成 uuid v4）；没有 `request_id` / 回合概念；`external_session_id` 是 agent 自己的会话 id。
4. **数据库不规范**：54 张表中，`project_access_log.id` 用 `INTEGER AUTOINCREMENT`，`agent_cli_usage_records` 主键叫 `execution_id`（不是 `id`），3 张表（`app_state` / `project_access_log` / `window_session_locks`）用 `INTEGER` Unix 时间戳而其余约 45 张用 `TEXT` RFC3339；`messages` 表无 `updated_at`；11 张表在 `INIT_SQL` 与 `init_database()` 中重复定义；缺少正式迁移框架（当前靠 `ALTER TABLE` + 吞掉 "duplicate column" 错误）。

关于"ACP 是否可关闭 CLI 改用原生 transcript 文件"的调研结论：ACP 协议本身不定义任何 transcript / 记录，只是消息传递协议；三个 CLI 各自会写原生 JSONL（Claude → `~/.claude/projects/<slug>/<sid>.jsonl`；Codex → `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`；opencode → `~/.local/share/opencode/project/<slug>/storage/`），但官方 Zed 的 ACP adapter（`@zed-industries/claude-code-acp` / `codex-acp`）是 SDK 实现，并不可靠地写出这些原生 transcript 文件，且三种格式各不相同、slug / 日期目录 / 环境变量覆盖差异大、也不保证实时 flush。因此放弃依赖原生 transcript 文件。

## 决策摘要

| 决策点 | 选择 |
|---|---|
| 消息记录来源 | **仅由软件自记录到 DB**，忽略三个 agent 的原生 transcript 文件 |
| 数据粒度 | **每条事件一行**，带 `message_type` + 共享 `request_id`（回合）+ `session_id` |
| 历史数据 | **直接抛弃旧结构**，不做历史迁移，删除旧 messages 表结构与历史数据 |
| DB 标准化范围 | **全面标准化**：统一时间戳类型、主键名，引入正式迁移框架覆盖全部表 |

## 目标

1. 后端 `acp.rs` 成为消息 DB 的唯一写入方，按 ACP 事件类型（思考 / 工具 / 正常消息 / 用量 / 上下文窗口 / 压缩 / 系统 / 错误）分别落库。
2. 数据库字段命名与通用字段（主键 `id`、`created_at` / `updated_at`、时间戳类型）全面规范化、一致化，引入迁移框架替代"ALTER + 吞错误"。
3. 主会话按时间流分段显示：thinking、工具、文本、用量、压缩等各自独立气泡，按事件原始顺序排列；标准化生成 conversation_id / request_id。
4. 放弃依赖原生 transcript 文件，三个 agent 的记录行为完全由软件统一保证。

## 总体架构

把消息持久化从"前端 store 写 DB"改为"后端 ACP 策略直接按事件类型落库"。后端成为唯一真相来源。

```
┌─ acp.rs（后端，唯一真相来源）──────────────────────────────┐
│  接收前端传入的 request_id（每回合一个）                     │
│  每个 ACP SessionUpdate → MessageRecorder 落一行到 messages │
│  (thinking / tool_use / tool_result / text / usage /         │
│   context_window / compression / system / error)             │
│  每行带 message_type + request_id + session_id + seq         │
│  同时 emit 事件给前端做实时渲染                              │
└──────────────────────────────────────────────────────────────┘
                          │（事件，仅用于实时 UI）
                          ▼
┌─ 前端（仅渲染，不再写 message DB）──────────────────────────┐
│  list_messages 按 session_id 拉取所有行                      │
│  按 (created_at, seq) 排序 → 每行渲染一个独立气泡            │
│  同 request_id 的气泡视觉归组（左侧色条）                    │
│  tool_use + tool_result（同 toolCallId）配对成一张工具卡片   │
└──────────────────────────────────────────────────────────────┘
```

关键原则：

- 后端 `acp.rs` 成为消息 DB 的唯一写入方。前端 `create_message` / `update_message_fields` 对 assistant 事件不再使用；user 消息仍由前端创建（需支持附件 / 本地编辑），并带上前端生成的 `request_id`。
- 实时渲染仍走 Tauri 事件以保持流式体验，但前端收到事件后只更新内存视图，**不写 DB**；DB 由后端保证一致。页面重载 / 切会话时从 `list_messages` 重建。

## ID 生成规范（全项目统一）

| ID | 生成位置 | 格式 | 生命周期 |
|---|---|---|---|
| `conversation_id` = `session_id` | Rust `create_session`（已有） | uuid v4 | 整个会话 |
| `request_id`（新增） | **前端发起回合时** `crypto.randomUUID()` | uuid v4 | 一个用户回合（user 发言 → assistant 全部响应） |
| `message_id` | Rust 落库时 `uuid::Uuid::new_v4()` | uuid v4 | 单条事件行 |

说明：

- `session_id` 已是 Rust 生成的 uuid v4，复用为 `conversation_id`，不另造概念。
- `request_id` 由前端生成并传入后端，因为 user 消息由前端创建，而 user 消息与其触发的 assistant 事件必须共享同一个 `request_id`。前端通过 `ExecutionRequest` 新字段把 `request_id` 传给后端 `acp.rs`。仍是 uuid v4 标准格式。

## messages 表新结构

旧的"一行一回合 + 大量 ALTER 列"结构废弃（DROP 重建）。新结构：一行一事件，用 `message_type` 区分，通用列 + 类型专属载荷。

```sql
CREATE TABLE messages (
  -- 通用标识
  id              TEXT PRIMARY KEY,            -- uuid v4
  session_id      TEXT NOT NULL,               -- = conversation_id
  request_id      TEXT NOT NULL,               -- 回合 id（user 消息与其触发的所有 assistant 事件共享）
  role            TEXT NOT NULL,               -- 'user' | 'assistant' | 'system'
  message_type    TEXT NOT NULL,               -- 'text' | 'thinking' | 'tool_use' | 'tool_result'
                                               -- | 'usage' | 'context_window' | 'compression'
                                               -- | 'system' | 'error'
  -- 主内容（各类型通用）
  content         TEXT,                        -- 文本/思考/系统/错误正文
  status          TEXT NOT NULL DEFAULT 'completed',  -- 'streaming'|'completed'|'error'|'interrupted'
  -- 工具相关（仅 tool_use / tool_result 有值，其余 NULL）
  tool_call_id    TEXT,
  tool_name       TEXT,
  tool_input      TEXT,                        -- 工具入参 JSON
  tool_result     TEXT,                        -- 工具结果文本
  -- token / 用量（仅 usage / context_window 有值）
  input_tokens             INTEGER,
  output_tokens            INTEGER,
  cache_read_tokens        INTEGER,
  cache_creation_tokens    INTEGER,
  model                    TEXT,
  cost_usd                 REAL,
  -- 附件（仅 user 消息）
  attachments     TEXT,                        -- JSON 数组
  -- 错误（仅 error / status=error）
  error_message   TEXT,
  -- 通用时间戳（全表统一 RFC3339 TEXT）
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  -- 排序：同 request_id 内按 seq 排序，保证事件原始顺序
  seq             INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_type ON messages(session_id, message_type);
```

设计要点：

- `message_type` + 通用列，避免为每种事件建单独的表（usage 表、thinking 表…）。查询某类型 = `WHERE message_type='usage'`，有索引。
- `request_id` + `seq`：`request_id` 把一个回合的所有行归组；`seq` 保证同回合内的原始事件顺序（thinking→tool→text→usage…）。前端按 `(request_id, seq)` 或 `created_at` 排序都能得到时间流。
- 废弃旧 ALTER 列：`thinking` / `tool_calls`（JSON 数组）/ `edit_traces` / `runtime_notices` / `compression_metadata` / `tokens` 列全部去掉。thinking 现在是独立行；工具调用是独立的 `tool_use` + `tool_result` 行；usage 是独立行；压缩是独立 `compression` 行；`tokens` 拆成 `input_tokens` / `output_tokens` 等独立列。

### 类型到列的映射

| message_type | 必填列 | content 存什么 |
|---|---|---|
| `text` | role, content | 文本正文 |
| `thinking` | content | 思考正文 |
| `tool_use` | tool_call_id, tool_name, tool_input | 可空 |
| `tool_result` | tool_call_id, tool_result | 可空 |
| `usage` | input/output/cache tokens, model, cost | 可空 |
| `context_window` | input/output_tokens | 可空 |
| `compression` | content | 压缩摘要/元数据 |
| `system` | content | 系统提示正文 |
| `error` | error_message | 错误描述 |

## 后端 ACP 落库实现

符合后端风格（命令 / 策略层只编排，DB 访问下沉到可复用服务对象）。

### 模块结构

```
commands/conversation/
  strategies/acp.rs           ← 策略层：事件循环里调用 recorder（不直接写 SQL）
  message_recorder.rs（新增） ← 落库服务对象：封装 insert/update，按类型分发
  types.rs                    ← ExecutionRequest 增加 request_id 字段；StreamEvent 增加 request_id 字段
commands/message.rs           ← create_message / list_messages 适配新表结构
```

### MessageRecorder 服务（`message_recorder.rs`）

封装"一个回合的事件落库"。状态：`request_id`、`session_id`、`seq` 计数器、当前未完成的 text 行 / thinking 行 id。

```rust
pub struct MessageRecorder {
    session_id: String,
    request_id: String,
    seq: AtomicU32,                          // 单调递增，保事件顺序
    current_text_id: Mutex<Option<String>>,  // 当前累积中的 text 行（连续 content chunk 合并）
    current_thinking_id: Mutex<Option<String>>,
}

impl MessageRecorder {
    pub fn new(session_id, request_id) -> Self { ... }

    // 按 SessionUpdate 类型分发，调用对应 record_* 方法
    pub fn record(&self, update: &RecordableEvent) -> Result<()> { ... }

    fn record_text_chunk(&self, chunk: &str) -> Result<()>;       // 累积到 current_text_id
    fn record_thinking_chunk(&self, chunk: &str) -> Result<()>;   // 累积到 current_thinking_id
    fn record_tool_use(&self, id, name, input) -> Result<()>;     // 新行
    fn record_tool_result(&self, id, result) -> Result<()>;       // 新行
    fn record_usage(&self, tokens, model, cost) -> Result<()>;    // 新行
    fn record_context_window(&self, used, size) -> Result<()>;    // 新行
    fn record_compression(&self, summary) -> Result<()>;          // 新行
    fn record_system(&self, text) -> Result<()>;                  // 新行
    fn record_error(&self, msg) -> Result<()>;                    // 新行

    // 类型切换时收尾：遇到非 text 事件，关闭 current_text_id（status→completed）
    fn finalize_open_segments(&self) -> Result<()>;
}
```

类型分发用 enum + match（非散落 if/else，符合后端风格）。`RecordableEvent` 是从 ACP `SessionUpdate` + usage 提取的归一化 enum。

### chunk 累积策略

ACP 流的是 `AgentMessageChunk`（文本增量）。若每个 chunk 一行会碎成几十行，渲染难看。

策略：同一 `request_id` 内，连续的 text chunk 累积到同一行（`UPDATE ... SET content = content || ?`），遇到任何非 text 事件就收尾当前 text 行（`status`→`completed`）。thinking 同理。

这样一次回答通常产出：1 行 thinking + N 行 tool_use/result + 1 行 text + 1 行 usage，而非几十行碎片。

`seq` 在每次 record 时 `+1`，保证即便累积行也有正确顺序（累积行的 seq = 第一次 chunk 的 seq）。

### acp.rs 事件循环改动

在 `execute` 开始处 `let recorder = MessageRecorder::new(&session_id, &request_id);`，然后在 `MatchDispatch` 的每个分支：

- `AgentMessageChunk` → `recorder.record_text_chunk(...)`（保留现有 emit 给前端实时渲染）
- `AgentThoughtChunk` → `recorder.record_thinking_chunk(...)`
- `ToolCall` → `recorder.record_tool_use(...)`
- `ToolCallUpdate` → `recorder.record_tool_result(...)`
- `UsageUpdate` → `recorder.record_context_window(...)`
- `Plan` / 其他 → 暂不落 message（或按需）
- usage snapshot（oneshot）→ `recorder.record_usage(...)`
- `done` → `recorder.finalize_open_segments()`

每个分支：先 `recorder.record()`（落库，唯一真相），再 `app.emit()`（实时 UI）。落库失败只 `log_error` 不阻断流（避免 DB 抖动中断会话）。

容错取舍说明："后端是唯一真相来源"指数据模型以 DB 为准（前端不写 DB、刷新后从 DB 重建）；"落库失败不阻断"指单条事件落库失败时该事件在 DB 中丢失（仅 `log_error`），但前端实时 UI 仍可从 emit 看到该事件——刷新后该行会缺失。这是为避免 DB 偶发抖动中断整个会话而做的有取舍的容错，不追求"每条事件 100% 落库"。

### user 消息的 request_id

前端 `ConversationService.sendMessage` 发起回合时：

```ts
const requestId = crypto.randomUUID()
messageStore.addMessage({ sessionId, role: 'user', requestId, content, attachments })
// ExecutionRequest 传入 requestId
```

`create_message`（后端）新表结构下接收 `request_id` 字段写入。

## 前端按时间流分段渲染

### Message 类型重构（`stores/message.ts`）

```ts
export interface Message {
  id: string
  sessionId: string
  requestId: string           // 回合归组键
  role: 'user' | 'assistant' | 'system'
  messageType: MessageType    // 'text'|'thinking'|'tool_use'|'tool_result'|'usage'|'context_window'|'compression'|'system'|'error'
  content?: string
  status: MessageStatus
  // 工具
  toolCallId?: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  // 用量
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  model?: string
  costUsd?: number
  // 用户消息
  attachments?: MessageAttachment[]
  // 错误
  errorMessage?: string
  // 顺序与时间
  seq: number
  createdAt: string
  updatedAt: string
}
```

废弃：`thinking` / `thinkingActive` / `toolCalls[]` / `editTraces` / `runtimeNotices` / `compressionMetadata` / `tokens` 字段——它们现在是独立的消息行。

### 列表排序（`messageList/useMessageList.ts`）

按 `(createdAt, seq)` 升序排序，一行一气泡。无需特殊分组代码。

### 气泡类型分发（新增 `MessageBubbleType` 组件族）

按 `messageType` 分发到独立子组件，每个子组件是一个气泡。用 `type→component` 映射表分发（符合前端风格"同类分支超 3 个用映射 / 分发而非 if/else"）。

```
messageBubble/
  MessageBubble.vue            ← 薄壳：按 messageType 分发 + 公共布局（request_id 色条/时间）
  bubbles/
    TextBubble.vue             ← assistant/user 文本
    ThinkingBubble.vue         ← 思考（可折叠）
    ToolUseBubble.vue          ← tool_use
    ToolResultBubble.vue       ← tool_result
    UsageBubble.vue            ← token 用量（紧凑徽章样式）
    ContextWindowBubble.vue    ← 上下文窗口进度
    CompressionBubble.vue      ← 压缩提示
    SystemBubble.vue           ← 系统消息
    ErrorBubble.vue            ← 错误
```

### tool_use 与 tool_result 配对

它们是独立两行（不同 seq），但 UI 上通常合并展示为"一个工具调用卡片"。`useMessageList` 渲染时，对连续的 `tool_use` + `tool_result`（同 `toolCallId`）渲染为一个 `ToolCallCard`（配对），其余按独立气泡。这样既保留时序又符合习惯。

### request_id 视觉归组

同一 `requestId` 的多个气泡视觉关联：左侧统一色条 + 首个气泡显示"专家名 / 时间"头部，后续气泡沿用同色条但隐藏重复头部。用户视觉上能看出"这一串是一个回合"。

### usage / context_window 显示位置

不再塞进某个气泡的 notices。`UsageBubble` 紧跟在该回合的最后一个文本 / 工具气泡后显示（一行紧凑徽章：`↑1.2k ↓580 cache:300 $0.012`）。

### 实时渲染不写 DB

`ConversationService.executeConversation` 收到事件后只更新内存 message 数组（push 新行 / update 累积行），不再 `updateMessageBuffered`→DB。DB 由后端 `MessageRecorder` 保证。切会话 / 刷新从 `list_messages` 重建内存。

## DB 全面标准化 + 迁移框架

### 前提：抛弃旧数据

选择"删除历史表和数据、不做迁移"。因此标准化不需要写"旧→新"的渐进迁移，而是一次性 DROP 受影响表 → 用全新标准化的 INIT_SQL 重建。

54 张表中只有少数跟消息记录直接相关，其余（projects / agents / plans / mcp…）是应用配置 / 业务数据，全部 DROP 会清空用户所有配置。因此标准化分两类执行：

### A 类：消息相关表 — DROP + 全新重建（彻底标准化）

| 表 | 动作 |
|---|---|
| `messages` | DROP，按新结构重建（一行一事件 + request_id + seq + updated_at） |
| `sessions` | DROP，重建（补齐字段，保留现有列 + 统一时间戳） |
| `session_runtime_bindings` | DROP 重建（已规范，仅确认） |
| `agent_cli_usage_records` | DROP 重建（主键 `execution_id`→`id`，时间戳统一 TEXT） |

用户会话历史清空（已同意抛弃旧数据）。

### B 类：其余表 — 标准化 + 迁移框架，不 DROP（保留用户配置）

这些表存用户的项目、provider、MCP、专家、计划等配置，不能清空。标准化通过新增迁移框架渐进修正。

### 引入 `rusqlite_migration` 框架

```toml
# Cargo.toml
rusqlite_migration = "1.3"
```

新增 `src-tauri/src/database/migrations.rs`，定义按时间戳命名的 `Migration` 序列（如 `2026062401_standardize_timestamps`、`2026062402_messages_granular`、`2026062403_usage_pk_rename`、`2026062404_cleanup_duplicate_ddl`）。

`init_database()` 改为：`INIT_SQL`（仅建表骨架）+ `rusqlite_migration::Migrations::new(...).to_latest(&conn)?`，自动建 `schema_migrations` 版本表、跳过已执行、失败可回滚。替换现有"吞掉 duplicate column 错误"的脆弱做法。

### 标准化清单（B 类，渐进修正）

| 问题 | 涉及表 | 修正 |
|---|---|---|
| 时间戳类型 INTEGER→TEXT | `app_state`, `project_access_log`, `window_session_locks` | 建新表拷贝转换后替换 |
| 主键名 `execution_id`→`id` | `agent_cli_usage_records` | 同上 |
| 重复 DDL | 11 张表在 INIT_SQL 和 init() 里重复定义 | 只保留 INIT_SQL 一处 |
| sort_order vs order_index | departments 等 | 统一为 `sort_order` |
| 死表 | `memory_categories` / `user_memories` / `memory_compressions` | 已运行时 DROP，从 INIT_SQL 删除定义 |

### 全项目统一约定（写进 `docs/backend-style.md`）

- 主键：`id TEXT PRIMARY KEY`（uuid v4），KV / 关联表例外用业务键
- 时间戳：统一 `TEXT` RFC3339（`created_at` / `updated_at` 必备，append-only 表可仅 `created_at`）
- 布尔：`INTEGER` 0/1，正极性命名（`enabled`，避免 `disabled` / `is_compressed` 反极性）
- 排序：`sort_order INTEGER`
- 状态：`status TEXT` + 枚举常量
- 迁移：经 `rusqlite_migration`，禁止 `ALTER` + 吞错误

## 测试与验证

遵循 AGENTS.md 的测试要求（编译 / lint / MCP 全流程验证）。

### 后端测试

1. **`MessageRecorder` 单元测试**（`message_recorder.rs` 内 `#[cfg(test)]`）：连续 text chunk 累积到同一行（content 拼接正确）；text chunk 被 thinking / tool 事件中断时收尾（status→completed，新事件开新行）；seq 单调递增且正确反映事件顺序；各 `record_*` 方法写入正确的 `message_type` 和对应列；usage / context_window 的 token 字段映射正确；tool_use 与 tool_result 各自独立行、`tool_call_id` 行为正确。
2. **ACP 策略集成测试**（`tests/acp_opencode.rs` 风格，复用 `tests/common/mod.rs`）：mock ACP 事件序列（thinking→tool_use→tool_result→text→usage）落库后，`list_messages` 返回 N 行、`message_type` 与顺序正确；request_id 在该回合所有行一致。
3. **迁移测试**：全新 DB（无历史）走 `migrations().to_latest()` 成功；旧 DB（带历史数据）执行后，messages 表被 DROP 重建为空，其余表配置保留。

### 前端测试

4. `pnpm lint`（改了 store / component / composable）
5. `pnpm build`（编译通过）

### Tauri MCP 全流程验证

6. **主会话链路**：进入项目 → 切换会话 → 发送消息 → 观察 thinking / tool / 文本 / usage 各自独立气泡、按时间流排列；tool_use + tool_result 配对成一张卡片；usage 气泡出现在回合末尾；压缩触发时出现独立 compression 气泡；刷新 / 切走再切回气泡从 DB 重建、顺序与实时一致（验证后端为唯一真相）；中断执行后已落库的行保留、中断的 text 行 status 正确。
7. **一致性三检查**：UI 展示 = 实际落库行（DB `list_messages`）= token 用量，三者一致。
8. **多 runtime 覆盖**：至少验证 Claude 与 Codex 两个 ACP runtime 各跑一条链路。

### 完成标准

- `cargo check` 通过
- `pnpm lint` + `pnpm build` 通过
- 上述 MCP 流程全部走通且三一致
- 新建 / 更新 `docs/backend-style.md` 补充 DB 约定章节

## 涉及文件（预估）

### 后端
- `src-tauri/src/commands/conversation/strategies/acp.rs` — 事件循环接入 `MessageRecorder`
- `src-tauri/src/commands/conversation/message_recorder.rs`（新增）— 落库服务对象
- `src-tauri/src/commands/conversation/types.rs` — `ExecutionRequest` + `StreamEvent` 增加 `request_id`
- `src-tauri/src/commands/message.rs` — `create_message` / `list_messages` 适配新表结构
- `src-tauri/src/database/mod.rs` — `INIT_SQL` messages 新结构；`init_database()` 接入迁移框架
- `src-tauri/src/database/migrations.rs`（新增）— 迁移序列
- `src-tauri/Cargo.toml` — 增加 `rusqlite_migration`
- `src-tauri/tests/acp_opencode.rs`、`src-tauri/tests/common/mod.rs` — 集成测试

### 前端
- `src/stores/message.ts` — `Message` 类型重构、加载 / 排序逻辑
- `src/services/conversation/ConversationService.ts` — 生成 request_id、实时渲染不写 DB
- `src/services/conversation/strategies/types.ts` — `ExecutionRequest` / `StreamEvent` 增加 `request_id`
- `src/services/conversation/strategies/BaseAgentStrategy.ts` — 事件透传 request_id
- `src/components/message/messageBubble/` — 按 messageType 分发的子组件族
- `src/components/message/messageList/` — 排序与 tool 配对
- `src/locales/` — 新气泡文案

### 文档
- `docs/backend-style.md` — DB 约定章节
