//! 文件变更追踪 mapper。
//!
//! 对应 `commands/file_change.rs` 的 DB 操作。SQL 模板见 `sql/file_change.html`。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{FileChangeTraceRow, SingleColumnRow};

/// 列表查询的参数结构（request_id 为 None 时返回整段会话的全部变更）。
#[derive(Clone, Debug, Serialize)]
pub struct FileChangeTraceQuery {
    pub session_id: String,
    pub request_id: Option<String>,
}

/// 查询文件变更列表。
#[html_sql("sql/file_change.html")]
pub async fn list_file_change_traces(
    rb: &dyn Executor,
    query: &FileChangeTraceQuery,
) -> Vec<FileChangeTraceRow> {
    impled!()
}

/// 更新变更状态（accepted）。
pub async fn update_file_change_status(
    rb: &dyn Executor,
    id: &str,
    status: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update file_change_traces set status = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(status.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 按 id 查询单条变更。
#[html_sql("sql/file_change.html")]
pub async fn get_file_change_trace_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Vec<FileChangeTraceRow> {
    impled!()
}

/// 将变更状态置为 rolled_back。
pub async fn mark_file_change_rolled_back(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update file_change_traces set status = 'rolled_back' where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 读取会话所属项目的路径。
#[html_sql("sql/file_change.html")]
pub async fn get_session_project_path(
    rb: &dyn Executor,
    session_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 会话执行期 UPSERT 文件变更记录的参数结构。
///
/// 被 `commands/conversation/strategies/acp.rs`（及未来 CLI 策略）调用：
/// 流式期间一个工具可能多次更新同一文件，以 (session_id, tool_call_id, file_path)
/// 为唯一键做 UPSERT，保留最早一次的 status。
#[derive(Clone, Debug, Serialize)]
pub struct FileChangeTraceUpsert {
    pub id: String,
    pub session_id: String,
    pub request_id: String,
    pub tool_call_id: String,
    pub file_path: String,
    pub relative_path: String,
    pub change_type: String,
    pub before_content: Option<String>,
    pub after_content: String,
    pub created_at: String,
    pub seq: i64,
}

/// 会话执行期 UPSERT 文件变更记录（ACP/CLI 策略写路径）。
pub async fn upsert_file_change_trace(
    rb: &dyn Executor,
    row: &FileChangeTraceUpsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into file_change_traces (id, session_id, request_id, tool_call_id, file_path, relative_path, change_type, before_content, after_content, status, created_at, seq) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) on conflict(session_id, tool_call_id, file_path) do update set relative_path = excluded.relative_path, change_type = excluded.change_type, before_content = coalesce(excluded.before_content, file_change_traces.before_content), after_content = excluded.after_content";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.session_id.clone()),
            rbs::Value::String(row.request_id.clone()),
            rbs::Value::String(row.tool_call_id.clone()),
            rbs::Value::String(row.file_path.clone()),
            rbs::Value::String(row.relative_path.clone()),
            rbs::Value::String(row.change_type.clone()),
            row.before_content
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.after_content.clone()),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::I64(row.seq),
        ],
    )
    .await
}
