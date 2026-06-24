# ACP 消息记录与按时间流分段渲染 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让后端 ACP 成为消息 DB 的唯一写入方，按事件类型（思考/工具/文本/用量/压缩/系统/错误）分别落库；主会话按时间流把每类事件渲染为独立气泡。

**Architecture:** 每条 ACP 事件 = `messages` 表一行（带 `message_type` + `request_id` + `seq`）。新增 `MessageRecorder` 服务对象在后端事件循环里落库；前端只渲染不写 assistant 消息 DB。废弃旧的"一行一回合折叠"结构与历史数据，引入 `rusqlite_migration` 全面标准化 DB。

**Tech Stack:** Rust（rusqlite + rusqlite_migration + agent_client_protocol）、Vue 3 + TypeScript + Pinia、Tauri 2。

**Spec:** `docs/superpowers/specs/2026-06-24-acp-message-recording-design.md`

---

## 文件结构总览

### 后端（新增/修改）
| 文件 | 责任 | 动作 |
|---|---|---|
| `src-tauri/Cargo.toml` | 依赖 | 新增 `rusqlite_migration = "1"` |
| `src-tauri/src/database/mod.rs` | DB 初始化 + INIT_SQL | 修改：messages 新结构、接入迁移框架、删重复 DDL |
| `src-tauri/src/database/migrations.rs` | 迁移序列 | 新增 |
| `src-tauri/src/commands/conversation/types.rs` | 请求/事件类型 | 修改：`ExecutionRequest`+`StreamEvent` 加 `request_id` |
| `src-tauri/src/commands/conversation/message_recorder.rs` | 落库服务对象 | 新增 |
| `src-tauri/src/commands/conversation/strategies/acp.rs` | ACP 策略 | 修改：事件循环接入 recorder |
| `src-tauri/src/commands/message.rs` | message 命令 | 修改：`create_message`/`list_messages`/`Message`/`CreateMessageInput` 适配新表 |
| `src-tauri/src/commands/conversation/mod.rs` | 模块声明 | 修改：声明 `message_recorder` |

### 前端（新增/修改）
| 文件 | 责任 | 动作 |
|---|---|---|
| `src/services/conversation/strategies/types.ts` | TS 类型 | 修改：`ExecutionRequest`/`BackendStreamEvent` 加 `requestId` |
| `src/stores/message.ts` | message store | 修改：`Message` 重构、加载/排序、实时渲染不写 DB |
| `src/services/conversation/ConversationService.ts` | 会话编排 | 修改：生成 requestId、user 消息带 requestId、流处理不写 DB |
| `src/components/message/messageBubble/MessageBubble.vue` | 气泡壳 | 修改：按 messageType 分发 |
| `src/components/message/messageBubble/bubbles/*.vue` | 各类气泡 | 新增 |
| `src/components/message/messageList/useMessageList.ts` | 列表逻辑 | 修改：排序、tool 配对 |

---

## Phase 0：工作区准备

### Task 0.1：清理工作区未提交改动

**背景：** 当前 `feature/2.0.0` 工作区有大量未提交改动（`message.ts`、`acp.rs` 等本次重构要触及的文件已被改）。在干净基础上开工，避免冲突。

**决策（执行时与用户确认）：** 这些改动是 2.0.0 的其他功能，不属于本次消息记录重构。建议先提交或 stash。

- [ ] **Step 1：确认改动归属**

```bash
git status -s
git diff --stat
```
检查 `src/stores/message.ts`、`src-tauri/src/commands/conversation/strategies/acp.rs` 等是否含未完成工作。

- [ ] **Step 2：提交或 stash 现有改动**

```bash
git add -A && git commit -m "wip: 2.0.0 进行中改动存档"
```
（或 `git stash -u`）

- [ ] **Step 3：确认工作区干净**

```bash
git status -s
```
Expected：无输出（干净）

---

## Phase 1：DB — messages 新结构 + 迁移框架

### Task 1.1：引入 rusqlite_migration 依赖

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1：添加依赖**

在 `[dependencies]` 段 `rusqlite` 行附近添加：
```toml
rusqlite_migration = "1"
```

- [ ] **Step 2：验证可编译**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS（依赖下载后编译通过）

- [ ] **Step 3：Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: 引入 rusqlite_migration 迁移框架"
```

---

### Task 1.2：定义 messages 新结构的 INIT_SQL

**Files:**
- Modify: `src-tauri/src/database/mod.rs`（`INIT_SQL` 常量内 messages 段，约 51-62 行）

- [ ] **Step 1：替换 INIT_SQL 中的 messages 表定义**

把旧的：
```sql
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    tokens INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
```

替换为：
```sql
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    role TEXT NOT NULL,
    message_type TEXT NOT NULL,
    content TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    tool_call_id TEXT,
    tool_name TEXT,
    tool_input TEXT,
    tool_result TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_creation_tokens INTEGER,
    model TEXT,
    cost_usd REAL,
    attachments TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_type ON messages(session_id, message_type);
```

- [ ] **Step 2：移除 messages 相关的 ALTER 迁移**

在 `init_database()` 中删除约 940-957 行给 messages 添加 `attachments`/`error_message`/`tool_calls`/`thinking`/`edit_traces`/`runtime_notices`/`compression_metadata` 列的 ALTER 语句（这些列已不存在）。

- [ ] **Step 3：Commit（暂不编译验证——message.rs 还引用旧列，下个任务修）**

```bash
git add src-tauri/src/database/mod.rs
git commit -m "refactor(db): messages 表改为一行一事件结构"
```

---

### Task 1.3：新增迁移模块，接入迁移框架

**Files:**
- Create: `src-tauri/src/database/migrations.rs`
- Modify: `src-tauri/src/database/mod.rs`（`init_database()`）

- [ ] **Step 1：创建 migrations.rs**

```rust
use rusqlite_migration::{Migrations, M};

/// 返回全量迁移序列。
///
/// 注意：messages/sessions 等消息相关表已 DROP+重建（见 INIT_SQL），
/// 历史消息数据不保留。这里的迁移处理其余需要标准化的表。
pub fn build_migrations() -> Result<Migrations, rusqlite_migration::Error> {
    let migrations = Migrations::new(vec![
        // M001: 统一时间戳类型（app_state/project_access_log/window_session_locks 的 INTEGER→TEXT）
        // SQLite 改列类型需建新表拷贝转换
        M::up(r#"
            -- app_state.updated_at INTEGER -> TEXT
            CREATE TABLE IF NOT EXISTS app_state_new (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT
            );
            INSERT INTO app_state_new (key, value, updated_at)
                SELECT key, value, datetime(updated_at, 'unixepoch')
                FROM app_state;
            DROP TABLE app_state;
            ALTER TABLE app_state_new RENAME TO app_state;

            -- project_access_log.last_accessed_at INTEGER -> TEXT
            CREATE TABLE IF NOT EXISTS project_access_log_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                last_accessed_at TEXT
            );
            INSERT INTO project_access_log_new (id, project_id, last_accessed_at)
                SELECT id, project_id, datetime(last_accessed_at, 'unixepoch')
                FROM project_access_log;
            DROP TABLE project_access_log;
            ALTER TABLE project_access_log_new RENAME TO project_access_log;

            -- window_session_locks.locked_at INTEGER -> TEXT
            CREATE TABLE IF NOT EXISTS window_session_locks_new (
                session_id TEXT PRIMARY KEY,
                locked_at TEXT
            );
            INSERT INTO window_session_locks_new (session_id, locked_at)
                SELECT session_id, datetime(locked_at, 'unixepoch')
                FROM window_session_locks;
            DROP TABLE window_session_locks;
            ALTER TABLE window_session_locks_new RENAME TO window_session_locks;
        "#),
        // M002: agent_cli_usage_records 主键 execution_id -> id（建新表拷贝）
        M::up(r#"
            CREATE TABLE IF NOT EXISTS agent_cli_usage_records_new (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                plan_id TEXT,
                task_id TEXT,
                solo_run_id TEXT,
                agent_name TEXT,
                cli_path TEXT,
                provider TEXT,
                model TEXT,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cache_read_tokens INTEGER,
                cache_creation_tokens INTEGER,
                cost_usd REAL,
                occurred_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            INSERT INTO agent_cli_usage_records_new
                SELECT execution_id, session_id, plan_id, task_id, solo_run_id,
                       agent_name, cli_path, provider, model, input_tokens, output_tokens,
                       cache_read_tokens, cache_creation_tokens, cost_usd, occurred_at, created_at
                FROM agent_cli_usage_records;
            DROP TABLE agent_cli_usage_records;
            ALTER TABLE agent_cli_usage_records_new RENAME TO agent_cli_usage_records;
        "#),
    ]);
    Ok(migrations)
}
```

> 注意：M002 的 INSERT 列表必须与 `agent_cli_usage_records` 实际列对齐。执行时先 `PRAGMA table_info(agent_cli_usage_records)` 确认列名，按实际调整。

- [ ] **Step 2：在 mod.rs 声明模块并接入**

在 `mod.rs` 顶部加：
```rust
mod migrations;
```

在 `init_database()` 的 `conn.execute_batch(INIT_SQL)?;` 之后、旧 ALTER 迁移之前插入：
```rust
// 执行正式迁移框架（建 schema_migrations 版本表，自动跳过已执行）
migrations::build_migrations()
    .map_err(|e| anyhow::anyhow!("build migrations failed: {}", e))?
    .to_latest(&mut conn)
    .map_err(|e| anyhow::anyhow!("migration failed: {}", e))?;
```

- [ ] **Step 3：删除已被迁移框架取代的旧 ALTER 数组中相关语句**

删除 `init_database()` 中现在由 INIT_SQL 或迁移处理的重复 ALTER（messages 相关已在 Task 1.2 删；保留其他尚未迁移的表 ALTER 不动）。

- [ ] **Step 4：Commit**

```bash
git add src-tauri/src/database/migrations.rs src-tauri/src/database/mod.rs
git commit -m "feat(db): 接入 rusqlite_migration 迁移框架与标准化迁移"
```

---

## Phase 2：后端 — message 命令适配新表

### Task 2.1：重构 Message / CreateMessageInput 结构

**Files:**
- Modify: `src-tauri/src/commands/message.rs`（约 38-88 行）

- [ ] **Step 1：替换 Message 结构体**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub request_id: String,
    pub role: String,
    pub message_type: String,
    pub content: Option<String>,
    pub status: String,
    pub tool_call_id: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_result: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cache_read_tokens: Option<i32>,
    pub cache_creation_tokens: Option<i32>,
    pub model: Option<String>,
    pub cost_usd: Option<f64>,
    pub attachments: Option<Vec<MessageAttachment>>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub seq: i64,
}
```

- [ ] **Step 2：替换 CreateMessageInput 结构体**

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageInput {
    pub session_id: String,
    pub request_id: String,
    pub role: String,
    pub message_type: String,
    pub content: Option<String>,
    pub status: Option<String>,
    pub tool_call_id: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_result: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cache_read_tokens: Option<i32>,
    pub cache_creation_tokens: Option<i32>,
    pub model: Option<String>,
    pub cost_usd: Option<f64>,
    pub attachments: Option<String>,
    pub error_message: Option<String>,
    pub seq: Option<i64>,
}
```

- [ ] **Step 3：删除 UpdateMessageInput 与 build_message_updates（assistant 事件不再 update）**

删除 `UpdateMessageInput` 结构体（约 76-88 行）和 `build_message_updates` 函数（约 90+ 行）。`update_message` / `update_message_fields` 命令也一并删除或改为仅支持 user 消息编辑（content/status/attachments）。

> 注意：`update_message_fields` 在前端多处调用。本任务后这些调用要清除（Phase 3 处理）。先保留一个最小版本（仅 content/status/attachments）避免编译大面积失败，Phase 3 清理调用方后再删。

- [ ] **Step 4：Commit**

```bash
git add src-tauri/src/commands/message.rs
git commit -m "refactor(message): Message/CreateMessageInput 适配一行一事件结构"
```

---

### Task 2.2：重写 create_message 命令

**Files:**
- Modify: `src-tauri/src/commands/message.rs`（`create_message`，约 459-514 行）

- [ ] **Step 1：重写 create_message**

```rust
#[tauri::command]
pub fn create_message(input: CreateMessageInput) -> Result<Message, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let status = input.status.unwrap_or_else(|| "completed".to_string());
    let seq = input.seq.unwrap_or(0);
    let attachments = parse_attachments(input.attachments.clone());

    conn.execute(
        "INSERT INTO messages (id, session_id, request_id, role, message_type, content, status, \
         tool_call_id, tool_name, tool_input, tool_result, input_tokens, output_tokens, \
         cache_read_tokens, cache_creation_tokens, model, cost_usd, attachments, error_message, \
         created_at, updated_at, seq) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
        rusqlite::params![
            &id, &input.session_id, &input.request_id, &input.role, &input.message_type,
            &input.content, &status, &input.tool_call_id, &input.tool_name, &input.tool_input,
            &input.tool_result, &input.input_tokens, &input.output_tokens,
            &input.cache_read_tokens, &input.cache_creation_tokens, &input.model,
            &input.cost_usd, &input.attachments, &input.error_message, &now, &now, seq,
        ],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &input.session_id],
    ).map_err(|e| e.to_string())?;

    Ok(Message {
        id, session_id: input.session_id, request_id: input.request_id,
        role: input.role, message_type: input.message_type, content: input.content,
        status, tool_call_id: input.tool_call_id, tool_name: input.tool_name,
        tool_input: input.tool_input, tool_result: input.tool_result,
        input_tokens: input.input_tokens, output_tokens: input.output_tokens,
        cache_read_tokens: input.cache_read_tokens,
        cache_creation_tokens: input.cache_creation_tokens,
        model: input.model, cost_usd: input.cost_usd, attachments,
        error_message: input.error_message, created_at: now.clone(), updated_at: now, seq,
    })
}
```

- [ ] **Step 2：Commit**

```bash
git add src-tauri/src/commands/message.rs
git commit -m "refactor(message): create_message 写入新表结构"
```

---

### Task 2.3：重写 list_messages 与 map_message_row

**Files:**
- Modify: `src-tauri/src/commands/message.rs`（`list_messages` 约 385 行、`map_message_row`）

- [ ] **Step 1：重写 map_message_row 适配新列**

```rust
fn map_message_row(row: &rusqlite::Row) -> rusqlite::Result<Message> {
    let attachments_str: Option<String> = row.get("attachments")?;
    let attachments = attachments_str
        .as_deref()
        .and_then(|s| serde_json::from_str::<Vec<MessageAttachment>>(s).ok());
    Ok(Message {
        id: row.get("id")?,
        session_id: row.get("session_id")?,
        request_id: row.get("request_id")?,
        role: row.get("role")?,
        message_type: row.get("message_type")?,
        content: row.get("content")?,
        status: row.get("status")?,
        tool_call_id: row.get("tool_call_id")?,
        tool_name: row.get("tool_name")?,
        tool_input: row.get("tool_input")?,
        tool_result: row.get("tool_result")?,
        input_tokens: row.get("input_tokens")?,
        output_tokens: row.get("output_tokens")?,
        cache_read_tokens: row.get("cache_read_tokens")?,
        cache_creation_tokens: row.get("cache_creation_tokens")?,
        model: row.get("model")?,
        cost_usd: row.get("cost_usd")?,
        attachments,
        error_message: row.get("error_message")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        seq: row.get("seq")?,
    })
}
```

- [ ] **Step 2：重写 list_messages 的 SELECT 列**

把两处 SELECT 的列列表替换为：
```sql
SELECT id, session_id, request_id, role, message_type, content, status,
       tool_call_id, tool_name, tool_input, tool_result, input_tokens,
       output_tokens, cache_read_tokens, cache_creation_tokens, model,
       cost_usd, attachments, error_message, created_at, updated_at, seq
FROM messages
```
排序保持 `ORDER BY created_at DESC` + 末尾 `reverse()`（时间正序）。`map_message_row` 改用 `row.get("列名")`（上面已用列名取值，需确保 SELECT 用列名而非位置——rusqlite 的 `row.get("name")` 支持按列名）。

- [ ] **Step 3：编译验证**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 可能仍有 acp.rs/cli_common.rs 旧字段引用报错——这些在 Phase 2 后续任务修。先确认 message.rs 自身一致。

- [ ] **Step 4：Commit**

```bash
git add src-tauri/src/commands/message.rs
git commit -m "refactor(message): list_messages/map_message_row 适配新列"
```

---

## Phase 3：后端 — MessageRecorder 落库

### Task 3.1：ExecutionRequest / StreamEvent 增加 request_id

**Files:**
- Modify: `src-tauri/src/commands/conversation/types.rs`

- [ ] **Step 1：ExecutionRequest 加 request_id 字段**

在 `ExecutionRequest` 结构体（约 18-30 行）加：
```rust
pub request_id: String,
```

- [ ] **Step 2：StreamEvent 加 request_id 字段**

在 `StreamEvent` 结构体（约 42-75 行）`session_id` 后加：
```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub request_id: Option<String>,
```
（用 Option，因为旧式事件构造暂不带；recorder 路径会填）

- [ ] **Step 3：更新 cli_common.rs 所有 build_*_event 添 request_id: None**

`build_content_event`/`build_error_event`/`build_system_event` 的结构体字面量补 `request_id: None,`。

- [ ] **Step 4：Commit**

```bash
git add src-tauri/src/commands/conversation/types.rs src-tauri/src/commands/conversation/strategies/cli_common.rs
git commit -m "feat(acp): ExecutionRequest/StreamEvent 增加 request_id"
```

---

### Task 3.2：新增 MessageRecorder 服务

**Files:**
- Create: `src-tauri/src/commands/conversation/message_recorder.rs`
- Modify: `src-tauri/src/commands/conversation/mod.rs`

- [ ] **Step 1：声明模块**

在 `conversation/mod.rs` 加：
```rust
pub mod message_recorder;
```

- [ ] **Step 2：编写 message_recorder.rs（含单元测试）**

```rust
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use anyhow::Result;
use rusqlite::params;

use crate::commands::support::{now_rfc3339, open_db_connection};

/// 可记录的事件类型（从 ACP SessionUpdate 归一化）
#[derive(Debug, Clone)]
pub enum RecordableEvent {
    TextChunk(String),
    ThinkingChunk(String),
    ToolUse { tool_call_id: String, name: String, input: String },
    ToolResult { tool_call_id: String, result: Option<String> },
    Usage { input: Option<u32>, output: Option<u32>, cache_read: Option<u32>, cache_creation: Option<u32>, model: Option<String>, cost: Option<f64> },
    ContextWindow { used: Option<u32>, size: Option<u32> },
    Compression(String),
    System(String),
    Error(String),
}

/// 一个回合的事件落库服务对象。
///
/// 连续的 text/thinking chunk 累积到同一行；遇到非同类事件收尾当前累积行。
pub struct MessageRecorder {
    session_id: String,
    request_id: String,
    seq: AtomicI64,
    current_text_id: Mutex<Option<String>>,
    current_thinking_id: Mutex<Option<String>>,
}

impl MessageRecorder {
    pub fn new(session_id: impl Into<String>, request_id: impl Into<String>) -> Self {
        Self {
            session_id: session_id.into(),
            request_id: request_id.into(),
            seq: AtomicI64::new(0),
            current_text_id: Mutex::new(None),
            current_thinking_id: Mutex::new(None),
        }
    }

    fn next_seq(&self) -> i64 {
        self.seq.fetch_add(1, Ordering::SeqCst)
    }

    fn now() -> String {
        now_rfc3339()
    }

    /// 关闭当前累积中的 text/thinking 行
    fn finalize_open_segments(&self) -> Result<()> {
        let mut text = self.current_text_id.lock().unwrap();
        if let Some(id) = text.take() {
            self.mark_completed(&id)?;
        }
        let mut thinking = self.current_thinking_id.lock().unwrap();
        if let Some(id) = thinking.take() {
            self.mark_completed(&id)?;
        }
        Ok(())
    }

    fn mark_completed(&self, id: &str) -> Result<()> {
        let conn = open_db_connection()?;
        conn.execute(
            "UPDATE messages SET status = 'completed', updated_at = ?1 WHERE id = ?2",
            params![Self::now(), id],
        )?;
        Ok(())
    }

    fn insert_row(&self, message_type: &str, fields: &[(&str, &dyn rusqlite::ToSql)]) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Self::now();
        let seq = self.next_seq();
        let conn = open_db_connection()?;

        let mut cols = vec![
            "id", "session_id", "request_id", "message_type", "status",
            "created_at", "updated_at", "seq",
        ];
        let mut vals: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(id.clone()), Box::new(self.session_id.clone()),
            Box::new(self.request_id.clone()), Box::new(message_type.to_string()),
            Box::new("completed".to_string()), Box::new(now.clone()),
            Box::new(now), Box::new(seq),
        ];
        for (col, val) in fields {
            cols.push(col);
            vals.push(to_boxed(val));
        }
        let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "INSERT INTO messages ({}) VALUES ({})",
            cols.join(", "), placeholders.join(", ")
        );
        let refs: Vec<&dyn rusqlite::ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        conn.execute(&sql, refs.as_slice())?;
        Ok(id)
    }

    pub fn record(&self, event: &RecordableEvent) -> Result<()> {
        match event {
            RecordableEvent::TextChunk(chunk) => {
                let mut guard = self.current_text_id.lock().unwrap();
                if let Some(id) = guard.as_ref() {
                    self.append_content(id, chunk)?;
                } else {
                    // 先收尾 thinking
                    drop(guard);
                    self.finalize_thinking()?;
                    let id = self.insert_row("text", &[("role", &"assistant"), ("content", chunk)])?;
                    self.set_status_streaming(&id)?;
                    *self.current_text_id.lock().unwrap() = Some(id);
                }
                Ok(())
            }
            RecordableEvent::ThinkingChunk(chunk) => {
                let mut guard = self.current_thinking_id.lock().unwrap();
                if let Some(id) = guard.as_ref() {
                    self.append_content(id, chunk)?;
                } else {
                    drop(guard);
                    self.finalize_text()?;
                    let id = self.insert_row("thinking", &[("role", &"assistant"), ("content", chunk)])?;
                    self.set_status_streaming(&id)?;
                    *self.current_thinking_id.lock().unwrap() = Some(id);
                }
                Ok(())
            }
            RecordableEvent::ToolUse { tool_call_id, name, input } => {
                self.finalize_open_segments()?;
                self.insert_row("tool_use", &[
                    ("role", &"assistant"), ("tool_call_id", tool_call_id),
                    ("tool_name", name), ("tool_input", input),
                ])?;
                Ok(())
            }
            RecordableEvent::ToolResult { tool_call_id, result } => {
                self.finalize_open_segments()?;
                let res = result.as_deref().unwrap_or("");
                self.insert_row("tool_result", &[
                    ("role", &"assistant"), ("tool_call_id", tool_call_id), ("tool_result", &res),
                ])?;
                Ok(())
            }
            RecordableEvent::Usage { input, output, cache_read, cache_creation, model, cost } => {
                self.finalize_open_segments()?;
                self.insert_row("usage", &[
                    ("role", &"assistant"),
                    ("input_tokens", opt_u32(input)),
                    ("output_tokens", opt_u32(output)),
                    ("cache_read_tokens", opt_u32(cache_read)),
                    ("cache_creation_tokens", opt_u32(cache_creation)),
                    ("model", opt_str(model)),
                    ("cost_usd", opt_f64(cost)),
                ])?;
                Ok(())
            }
            RecordableEvent::ContextWindow { used, size } => {
                self.insert_row("context_window", &[
                    ("role", &"assistant"),
                    ("input_tokens", opt_u32(used)),
                    ("output_tokens", opt_u32(size)),
                ])?;
                Ok(())
            }
            RecordableEvent::Compression(summary) => {
                self.finalize_open_segments()?;
                self.insert_row("compression", &[("role", &"assistant"), ("content", summary)])?;
                Ok(())
            }
            RecordableEvent::System(text) => {
                self.insert_row("system", &[("role", &"system"), ("content", text)])?;
                Ok(())
            }
            RecordableEvent::Error(msg) => {
                self.finalize_open_segments()?;
                self.insert_row("error", &[("role", &"assistant"), ("error_message", msg)])?;
                Ok(())
            }
        }
    }

    fn finalize_text(&self) -> Result<()> {
        let mut guard = self.current_text_id.lock().unwrap();
        if let Some(id) = guard.take() {
            self.mark_completed(&id)?;
        }
        Ok(())
    }
    fn finalize_thinking(&self) -> Result<()> {
        let mut guard = self.current_thinking_id.lock().unwrap();
        if let Some(id) = guard.take() {
            self.mark_completed(&id)?;
        }
        Ok(())
    }

    fn append_content(&self, id: &str, chunk: &str) -> Result<()> {
        let conn = open_db_connection()?;
        conn.execute(
            "UPDATE messages SET content = COALESCE(content, '') || ?1, updated_at = ?2 WHERE id = ?3",
            params![chunk, Self::now(), id],
        )?;
        Ok(())
    }

    fn set_status_streaming(&self, id: &str) -> Result<()> {
        let conn = open_db_connection()?;
        conn.execute("UPDATE messages SET status = 'streaming' WHERE id = ?1", params![id])?;
        Ok(())
    }
}

// —— 辅助：把 Option<T> 装箱为 ToSql ——
fn to_boxed(val: &dyn rusqlite::ToSql) -> Box<dyn rusqlite::ToSql> {
    // rusqlite ToSql 无法直接装箱 trait object 的引用值，
    // 这里通过 JSON 中转。实际实现改用按列单独 bind 的方式（见下方注记）。
    unimplemented!("见实现注记")
}

fn opt_u32(v: &Option<u32>) -> &dyn rusqlite::ToSql { v.as_ref() }
fn opt_str(v: &Option<String>) -> &dyn rusqlite::ToSql { v.as_ref() }
fn opt_f64(v: &Option<f64>) -> &dyn rusqlite::ToSql { v.as_ref() }
```

> **实现注记（重要）：** `insert_row` 的动态列装箱（`to_boxed`）在 Rust 类型系统下不可行。实际实现应改为**每个 record_* 方法手写 INSERT**（固定列 + `params![]`），而非通用 `insert_row`。上面 `insert_row` 仅表达意图；落地时替换为各类型专用 insert（参考 Task 2.2 的 `create_message` 写法）。`opt_u32` 等返回 `&dyn ToSql` 在 `params!` 宏外也不能直接用——统一用 `params![...]` 宏绑定。

- [ ] **Step 3：实现各类型专用 insert（替换通用 insert_row）**

把 `insert_row` 删除，为每个 `record_*` 分支写专用 INSERT。以 text 为例：
```rust
fn insert_text(&self, content: &str) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let seq = self.next_seq();
    let conn = open_db_connection()?;
    conn.execute(
        "INSERT INTO messages (id, session_id, request_id, role, message_type, content, status, created_at, updated_at, seq) \
         VALUES (?1,?2,?3,'assistant','text',?4,'streaming',?5,?6,?7)",
        params![&id, &self.session_id, &self.request_id, content, &now, &now, seq],
    )?;
    Ok(id)
}
```
同理 `insert_thinking`/`insert_tool_use`/`insert_tool_result`/`insert_usage`/`insert_context_window`/`insert_compression`/`insert_system`/`insert_error`。

- [ ] **Step 4：单元测试**

在 `message_recorder.rs` 内：
```rust
#[cfg(test)]
mod tests {
    use super::*;
    // 测试用内存 DB；需测试 helper 初始化 messages 表。
    // 验证：
    // - 连续 text chunk 累积到同一行（content 拼接）
    // - text 被 thinking 中断时 status→completed
    // - seq 单调递增
    // - tool_use/tool_result 各自独立行
    // - usage token 字段正确
}
```
（测试需建内存 DB 并建表。参考现有 `tests/common/mod.rs` 的 DB 初始化模式。）

- [ ] **Step 5：编译**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 6：Commit**

```bash
git add src-tauri/src/commands/conversation/message_recorder.rs src-tauri/src/commands/conversation/mod.rs
git commit -m "feat(acp): 新增 MessageRecorder 按事件类型落库服务"
```

---

### Task 3.3：acp.rs 事件循环接入 MessageRecorder

**Files:**
- Modify: `src-tauri/src/commands/conversation/strategies/acp.rs`（`execute`，约 434 行起）

- [ ] **Step 1：在 execute 开头创建 recorder**

在 `let session_id = request.session_id.clone();` 后加：
```rust
let request_id = request.request_id.clone();
let recorder = crate::commands::conversation::message_recorder::MessageRecorder::new(
    session_id.clone(),
    request_id.clone(),
);
```

- [ ] **Step 2：每个事件分支先 recorder.record 再 emit**

在 `AgentMessageChunk` 分支（约 625 行），emit 前加：
```rust
if let Err(e) = recorder.record(&crate::commands::conversation::message_recorder::RecordableEvent::TextChunk(text.clone())) {
    crate::logging::write_log("ERROR", "acp", &format!("record text failed: {}", e));
}
```
同理改 `AgentThoughtChunk`（ThinkingChunk）、`ToolCall`（ToolUse）、`ToolCallUpdate`（ToolResult）、`UsageUpdate`（ContextWindow）、usage snapshot（Usage）、`done`（finalize_open_segments）。error 分支（Error）。

- [ ] **Step 3：done 事件处 finalize**

在 `let _ = app.emit(&event_name, &build_done_event(&session_id));` 前加：
```rust
let _ = recorder.record_done(); // 内部调用 finalize_open_segments
```
（在 MessageRecorder 加 `pub fn record_done(&self) { let _ = self.finalize_open_segments(); }`）

- [ ] **Step 4：编译 + 既有测试**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Run: `cargo test --manifest-path src-tauri/Cargo.toml acp`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src-tauri/src/commands/conversation/strategies/acp.rs
git commit -m "feat(acp): 事件循环接入 MessageRecorder 落库"
```

---

## Phase 4：前端 — 类型重构 + 实时渲染不写 DB

### Task 4.1：TS 类型加 requestId

**Files:**
- Modify: `src/services/conversation/strategies/types.ts`

- [ ] **Step 1：ExecutionRequest 加 requestId**

在 TS `ExecutionRequest` 类型加 `requestId: string`。

- [ ] **Step 2：BackendStreamEvent 加 requestId（可选）**

加 `requestId?: string`。

- [ ] **Step 3：Commit**

```bash
git add src/services/conversation/strategies/types.ts
git commit -m "feat(types): 前端 ExecutionRequest/StreamEvent 增加 requestId"
```

---

### Task 4.2：Message 类型重构

**Files:**
- Modify: `src/stores/message.ts`（约 62-81 行）

- [ ] **Step 1：替换 Message 接口**

```ts
export type MessageType =
  | 'text' | 'thinking' | 'tool_use' | 'tool_result'
  | 'usage' | 'context_window' | 'compression' | 'system' | 'error'

export interface Message {
  id: string
  sessionId: string
  requestId: string
  role: 'user' | 'assistant' | 'system'
  messageType: MessageType
  content?: string
  status: MessageStatus
  toolCallId?: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  model?: string
  costUsd?: number
  attachments?: MessageAttachment[]
  errorMessage?: string
  seq: number
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2：删除废弃类型字段引用**

删除 `thinking`/`thinkingActive`/`toolCalls`/`editTraces`/`runtimeNotices`/`compressionMetadata`/`tokens`。更新 `RustMessage` 适配新后端结构（`messageType`/`requestId`/`seq` 等）。

- [ ] **Step 3：Commit**

```bash
git add src/stores/message.ts
git commit -m "refactor(store): Message 类型改为一行一事件"
```

---

### Task 4.3：transformMessage 适配新结构

**Files:**
- Modify: `src/stores/message.ts`（`transformMessage`，约 361 行）

- [ ] **Step 1：重写 transformMessage**

把 Rust 行映射为新的扁平 Message（messageType、requestId、seq 等），去掉旧的 thinking/toolCalls/runtimeNotices 聚合。

- [ ] **Step 2：更新 addMessage 参数**

`addMessage` 接收新字段（requestId、messageType、seq），调 `create_message` 传新结构。

- [ ] **Step 3：更新排序 compareMessageCreatedAt → compareMessageOrder**

```ts
function compareMessageOrder(a: Message, b: Message): number {
  const t = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  return t !== 0 ? t : a.seq - b.seq
}
```
所有 `.sort(compareMessageCreatedAt)` 改为 `.sort(compareMessageOrder)`。

- [ ] **Step 4：lint + build**

Run: `pnpm lint && pnpm build`
Expected: 可能有下游组件引用废弃字段报错（Phase 5 修），先记录报错点。

- [ ] **Step 5：Commit**

```bash
git add src/stores/message.ts
git commit -m "refactor(store): transformMessage/排序适配一行一事件"
```

---

### Task 4.4：ConversationService 生成 requestId + 实时渲染不写 DB

**Files:**
- Modify: `src/services/conversation/ConversationService.ts`

- [ ] **Step 1：sendMessage 生成 requestId 并带入 user 消息**

在 `sendMessage`（约 319 行）开头：
```ts
const requestId = crypto.randomUUID()
```
user 消息 `addMessage` 带 `requestId`；`ExecutionRequest` 传 `requestId`。

- [ ] **Step 2：executeConversation 改为只更新内存不写 DB**

删除预创建单个 assistant 消息的逻辑；改为：流事件 → 在 messageStore 内存数组 push 新行（非 chunk）/ update 累积行（chunk）。删除所有 `bufferMessageUpdate`/`updateMessageBuffered`/`flushBufferedMessageUpdate` 对 assistant 事件的调用。

> 这是改动最大的文件。核心：把 `onContent`/`onThinking`（累积到内存行）、`onToolUse`/`onToolResult`/`onUsage`（push 新内存行）改为操作内存数组，不调 IPC 写库。

- [ ] **Step 3：删除 currentStreamingMessageId 单消息假设**

支持同回合多行。

- [ ] **Step 4：Commit**

```bash
git add src/services/conversation/ConversationService.ts
git commit -m "refactor(conversation): 生成 requestId、流处理只渲染不写库"
```

---

## Phase 5：前端 — 气泡组件族 + 按类型分发

### Task 5.1：MessageBubble 按 messageType 分发

**Files:**
- Modify: `src/components/message/messageBubble/MessageBubble.vue`
- Create: `src/components/message/messageBubble/bubbles/TextBubble.vue` 等

- [ ] **Step 1：建立 type→component 映射表**

```ts
const BUBBLE_COMPONENTS: Record<MessageType, Component> = {
  text: TextBubble,
  thinking: ThinkingBubble,
  tool_use: ToolUseBubble,
  tool_result: ToolResultBubble,
  usage: UsageBubble,
  context_window: ContextWindowBubble,
  compression: CompressionBubble,
  system: SystemBubble,
  error: ErrorBubble,
}
```

- [ ] **Step 2：MessageBubble.vue 改为薄壳分发**

用 `<component :is="BUBBLE_COMPONENTS[message.messageType]" :message="message" />`。

- [ ] **Step 3：实现各气泡子组件**

每个子组件负责自身渲染。删除旧 MessageBubble 内部的 thinking 块/toolCalls 块/runtimeNotices 块等分区逻辑。

- [ ] **Step 4：lint + build**

Run: `pnpm lint && pnpm build`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/components/message/messageBubble/
git commit -m "feat(ui): 气泡按 messageType 分发到独立子组件"
```

---

### Task 5.2：useMessageList tool_use+tool_result 配对

**Files:**
- Modify: `src/components/message/messageList/useMessageList.ts`

- [ ] **Step 1：渲染时对连续 tool_use+tool_result（同 toolCallId）配对为 ToolCallCard**

在 `currentMessages` getter 里，把连续的 `tool_use` + `tool_result` 合并为一个渲染项（标记 `paired: true`），其余消息独立。

- [ ] **Step 2：request_id 视觉归组**

首个气泡显示头部（专家名/时间），同 requestId 后续气泡左侧色条。

- [ ] **Step 3：Commit**

```bash
git add src/components/message/messageList/
git commit -m "feat(ui): tool_use/tool_result 配对卡片与 requestId 视觉归组"
```

---

## Phase 6：DB — B 类表全面标准化（可后置，不阻塞主链路）

### Task 6.1：清理重复 DDL + 死表定义

**Files:**
- Modify: `src-tauri/src/database/mod.rs`

- [ ] **Step 1：删除 INIT_SQL 中 11 张表的重复定义**（已在 init() 里再建的）

- [ ] **Step 2：删除死表定义**（memory_categories/user_memories/memory_compressions）

- [ ] **Step 3：Commit**

```bash
git commit -am "refactor(db): 清理重复 DDL 与死表定义"
```

---

### Task 6.2：补充 backend-style.md DB 约定

**Files:**
- Modify/Create: `docs/backend-style.md`

- [ ] **Step 1：写 DB 约定章节**（主键/时间戳/布尔/排序/迁移，见 spec）

- [ ] **Step 2：Commit**

```bash
git add docs/backend-style.md
git commit -m "docs: 补充数据库规范化约定"
```

---

## Phase 7：Tauri MCP 全流程验证

### Task 7.1：主会话链路验证

- [ ] **Step 1：启动 dev 环境**

确保前端 1430 + Tauri 宿主 + MCP Bridge 9423 运行。

- [ ] **Step 2：Tauri MCP 进入主会话，发送消息**

验证：thinking / tool / 文本 / usage 各自独立气泡、按时间流排列；tool_use+tool_result 配对卡片；usage 徽章在回合末尾。

- [ ] **Step 3：刷新/切会话重建一致性**

验证从 DB 重建后顺序与实时一致。

- [ ] **Step 4：中断执行**

验证已落库行保留、中断 text 行 status 正确。

### Task 7.2：双 runtime 验证

- [ ] Claude ACP 跑一条链路
- [ ] Codex ACP 跑一条链路

### Task 7.3：一致性三检查

- [ ] UI 展示 = `list_messages` DB 行 = token 用量

---

## 自检备注

**spec 覆盖：** 需求1（按类型记录）→ Phase 2-3；需求2（DB 规范化）→ Phase 1+6；需求3（放弃原生 transcript，软件自记录）→ Phase 3（MessageRecorder）；需求4（按时间流分段）→ Phase 4-5。全覆盖。

**类型一致性：** `requestId`（TS camel）/ `request_id`（Rust snake，serde rename camelCase）；`messageType`/`message_type` 同理。`seq` 两端同名。

**已知风险点（执行时注意）：**
1. `MessageRecorder` 的动态列装箱不可行，必须每类型专用 INSERT（Task 3.2 Step 3）。
2. `ConversationService.ts` 是改动最大的文件，实时渲染逻辑需仔细（Task 4.4）。
3. `agent_cli_usage_records` 迁移的 INSERT 列表须与实际列对齐（Task 1.3）。
4. 工作区有未提交改动（Phase 0 必须先处理）。
