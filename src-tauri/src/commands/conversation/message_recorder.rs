//! 会话事件落库服务（MessageRecorder）
//!
//! 把一个用户回合（request_id）内的 ACP 事件按类型分别写入 messages 表，
//! 每条事件一行（thinking / tool_use / tool_result / text / usage /
//! context_window / compression / system / error）。
//!
//! 连续的 text/thinking chunk 会累积到同一行，遇到非同类事件时收尾，
//! 避免碎片化。

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use anyhow::Result;
use rusqlite::params;

use crate::commands::support::{now_rfc3339, open_db_connection};

/// 可记录的事件类型（从 ACP SessionUpdate / usage snapshot 归一化而来）。
#[derive(Debug, Clone)]
pub enum RecordableEvent {
    /// 文本增量（累积到同一行）
    TextChunk(String),
    /// 思考增量（累积到同一行）
    ThinkingChunk(String),
    /// 工具调用发起
    ToolUse {
        tool_call_id: String,
        name: String,
        input: String,
    },
    /// 工具调用结果
    ToolResult {
        tool_call_id: String,
        result: Option<String>,
    },
    /// 一次 prompt 的 token 用量（输入/输出/缓存命中）
    Usage {
        input_tokens: Option<u32>,
        output_tokens: Option<u32>,
        cache_read_tokens: Option<u32>,
        cache_creation_tokens: Option<u32>,
        model: Option<String>,
        cost: Option<f64>,
    },
    /// 上下文窗口进度（已用 / 总量）
    ContextWindow {
        used: Option<u32>,
        size: Option<u32>,
    },
    /// 压缩提示
    Compression(String),
    /// 系统消息
    System(String),
    /// 错误
    Error(String),
}

/// 一个用户回合（request_id）的事件落库服务对象。
///
/// 生命周期：从 `send_prompt` 开始创建，到 `done` 时调用 `finalize` 收尾。
pub struct MessageRecorder {
    session_id: String,
    request_id: String,
    seq: AtomicI64,
    /// 当前累积中的 text 行 id（连续 chunk 合并到同一行）
    current_text_id: Mutex<Option<String>>,
    /// 当前累积中的 thinking 行 id
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

    /// 按事件类型分发落库。落库失败返回 Err，由调用方决定是否记日志。
    pub fn record(&self, event: &RecordableEvent) -> Result<()> {
        match event {
            RecordableEvent::TextChunk(chunk) => self.record_text_chunk(chunk),
            RecordableEvent::ThinkingChunk(chunk) => self.record_thinking_chunk(chunk),
            RecordableEvent::ToolUse {
                tool_call_id,
                name,
                input,
            } => {
                self.finalize_open_segments()?;
                self.insert_tool_use(tool_call_id, name, input)
            }
            RecordableEvent::ToolResult {
                tool_call_id,
                result,
            } => {
                self.finalize_open_segments()?;
                self.insert_tool_result(tool_call_id, result.clone().unwrap_or_default().as_str())
            }
            RecordableEvent::Usage {
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_creation_tokens,
                model,
                cost,
            } => {
                self.finalize_open_segments()?;
                self.insert_usage(
                    *input_tokens,
                    *output_tokens,
                    *cache_read_tokens,
                    *cache_creation_tokens,
                    model.as_deref(),
                    *cost,
                )
            }
            RecordableEvent::ContextWindow { used, size } => {
                self.finalize_open_segments()?;
                self.insert_context_window(*used, *size)
            }
            RecordableEvent::Compression(summary) => {
                self.finalize_open_segments()?;
                self.insert_compression(summary)
            }
            RecordableEvent::System(text) => {
                self.finalize_open_segments()?;
                self.insert_system(text)
            }
            RecordableEvent::Error(msg) => {
                self.finalize_open_segments()?;
                self.insert_error(msg)
            }
        }
    }

    /// 收尾所有累积中的行（done 事件时调用）。
    pub fn finalize(&self) -> Result<()> {
        self.finalize_open_segments()
    }

    // ---- 累积型事件 ----

    fn record_text_chunk(&self, chunk: &str) -> Result<()> {
        let mut guard = self.current_text_id.lock().unwrap();
        if let Some(id) = guard.as_ref() {
            self.append_content(id, chunk)?;
            return Ok(());
        }
        // 新开 text 行前，先收尾 thinking
        drop(guard);
        self.finalize_thinking()?;
        let id = self.insert_text(chunk)?;
        self.set_status(&id, "streaming")?;
        *self.current_text_id.lock().unwrap() = Some(id);
        Ok(())
    }

    fn record_thinking_chunk(&self, chunk: &str) -> Result<()> {
        let mut guard = self.current_thinking_id.lock().unwrap();
        if let Some(id) = guard.as_ref() {
            self.append_content(id, chunk)?;
            return Ok(());
        }
        drop(guard);
        self.finalize_text()?;
        let id = self.insert_thinking(chunk)?;
        self.set_status(&id, "streaming")?;
        *self.current_thinking_id.lock().unwrap() = Some(id);
        Ok(())
    }

    fn finalize_open_segments(&self) -> Result<()> {
        self.finalize_text()?;
        self.finalize_thinking()
    }

    fn finalize_text(&self) -> Result<()> {
        let mut guard = self.current_text_id.lock().unwrap();
        if let Some(id) = guard.take() {
            drop(guard);
            self.set_status(&id, "completed")?;
        }
        Ok(())
    }

    fn finalize_thinking(&self) -> Result<()> {
        let mut guard = self.current_thinking_id.lock().unwrap();
        if let Some(id) = guard.take() {
            drop(guard);
            self.set_status(&id, "completed")?;
        }
        Ok(())
    }

    fn append_content(&self, id: &str, chunk: &str) -> Result<()> {
        let conn = open_db_connection()?;
        conn.execute(
            "UPDATE messages SET content = COALESCE(content, '') || ?1, updated_at = ?2 WHERE id = ?3",
            params![chunk, now_rfc3339(), id],
        )?;
        Ok(())
    }

    fn set_status(&self, id: &str, status: &str) -> Result<()> {
        let conn = open_db_connection()?;
        conn.execute(
            "UPDATE messages SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now_rfc3339(), id],
        )?;
        Ok(())
    }

    // ---- 各类型专用 insert ----

    fn insert_text(&self, content: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, content, status, \
             created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'assistant', 'text', ?4, 'streaming', ?5, ?6, ?7)",
            params![&id, &self.session_id, &self.request_id, content, &now, &now, seq],
        )?;
        Ok(id)
    }

    fn insert_thinking(&self, content: &str) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, content, status, \
             created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'assistant', 'thinking', ?4, 'streaming', ?5, ?6, ?7)",
            params![&id, &self.session_id, &self.request_id, content, &now, &now, seq],
        )?;
        Ok(id)
    }

    fn insert_tool_use(&self, tool_call_id: &str, name: &str, input: &str) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, status, \
             tool_call_id, tool_name, tool_input, created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'assistant', 'tool_use', 'completed', ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &id,
                &self.session_id,
                &self.request_id,
                tool_call_id,
                name,
                input,
                &now,
                &now,
                seq,
            ],
        )?;
        Ok(())
    }

    fn insert_tool_result(&self, tool_call_id: &str, result: &str) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, status, \
             tool_call_id, tool_result, created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'assistant', 'tool_result', 'completed', ?4, ?5, ?6, ?7, ?8)",
            params![
                &id,
                &self.session_id,
                &self.request_id,
                tool_call_id,
                result,
                &now,
                &now,
                seq,
            ],
        )?;
        Ok(())
    }

    fn insert_usage(
        &self,
        input_tokens: Option<u32>,
        output_tokens: Option<u32>,
        cache_read_tokens: Option<u32>,
        cache_creation_tokens: Option<u32>,
        model: Option<&str>,
        cost: Option<f64>,
    ) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, status, \
             input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, model, cost_usd, \
             created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'assistant', 'usage', 'completed', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                &id,
                &self.session_id,
                &self.request_id,
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_creation_tokens,
                model,
                cost,
                &now,
                &now,
                seq,
            ],
        )?;
        Ok(())
    }

    fn insert_context_window(&self, used: Option<u32>, size: Option<u32>) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, status, \
             input_tokens, output_tokens, created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'assistant', 'context_window', 'completed', ?4, ?5, ?6, ?7, ?8)",
            params![
                &id,
                &self.session_id,
                &self.request_id,
                used,
                size,
                &now,
                &now,
                seq,
            ],
        )?;
        Ok(())
    }

    fn insert_compression(&self, summary: &str) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, content, status, \
             created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'assistant', 'compression', ?4, 'completed', ?5, ?6, ?7)",
            params![
                &id,
                &self.session_id,
                &self.request_id,
                summary,
                &now,
                &now,
                seq,
            ],
        )?;
        Ok(())
    }

    fn insert_system(&self, text: &str) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, content, status, \
             created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'system', 'system', ?4, 'completed', ?5, ?6, ?7)",
            params![
                &id,
                &self.session_id,
                &self.request_id,
                text,
                &now,
                &now,
                seq,
            ],
        )?;
        Ok(())
    }

    fn insert_error(&self, msg: &str) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let seq = self.next_seq();
        let conn = open_db_connection()?;
        conn.execute(
            "INSERT INTO messages (id, session_id, request_id, role, message_type, status, \
             error_message, created_at, updated_at, seq) \
             VALUES (?1, ?2, ?3, 'assistant', 'error', 'error', ?4, ?5, ?6, ?7)",
            params![
                &id,
                &self.session_id,
                &self.request_id,
                msg,
                &now,
                &now,
                seq,
            ],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// 建内存 DB 并初始化 messages 新结构（与 INIT_SQL 一致）。
    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        conn.execute_batch(
            r#"
            CREATE TABLE messages (
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
                seq INTEGER NOT NULL DEFAULT 0
            );
            "#,
        )
        .expect("create messages table");
        conn
    }

    // MessageRecorder 内部使用 open_db_connection（文件 DB），
    // 这里通过直接 SQL 断言表结构正确性，行为级测试在集成测试中覆盖。

    #[test]
    fn messages_test_schema_has_required_columns() {
        let conn = test_conn();
        let cols: Vec<String> = conn
            .prepare("PRAGMA table_info(messages)")
            .unwrap()
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .map(|c| c.unwrap())
            .collect();
        for required in [
            "id",
            "session_id",
            "request_id",
            "message_type",
            "seq",
            "tool_call_id",
            "tool_result",
            "input_tokens",
            "output_tokens",
            "cache_read_tokens",
            "cache_creation_tokens",
            "cost_usd",
            "error_message",
            "updated_at",
        ] {
            assert!(cols.iter().any(|c| c == required), "missing column: {}", required);
        }
        drop(conn);
    }
}
