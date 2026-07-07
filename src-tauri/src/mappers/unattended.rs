//! 无人值守（Unattended）模块 mapper。
//!
//! 对应 `unattended/repository.rs` 的 DB 操作。SQL 模板见 `sql/unattended.html`。
//! 所有函数首参均为 `&dyn Executor`，命令层可传入 `db::rb()` 或事务执行器。
//!
//! 布尔列（enabled / allow_all_senders）在 SQLite 中存为 INTEGER，
//! 命令层用 `Option<i64>` 读写并 `!= 0` 还原为 bool。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{
    SingleColumnRow, UnattendedAccountRow, UnattendedChannelRow, UnattendedEventRow,
    UnattendedThreadRow,
};

// ==================== 渠道参数结构 ====================

/// 插入/更新渠道的参数结构（字段名与 `sql/unattended.html` 模板中的 `#{xxx}` 对应）。
///
/// 布尔列（enabled / allow_all_senders）以 `Option<i64>` 传递（0/1）。
#[derive(Clone, Debug, Serialize)]
pub struct ChannelWriteRow {
    pub id: String,
    pub channel_type: String,
    pub name: String,
    pub enabled: Option<i64>,
    pub default_project_id: Option<String>,
    pub default_agent_id: Option<String>,
    pub default_model_id: Option<String>,
    pub reply_style: String,
    pub allow_all_senders: Option<i64>,
    pub future_auth_mode: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// ==================== 账号 upsert 参数 ====================

/// upsert 微信账号的参数结构（字段名与 `sql/unattended.html` 模板中的 `#{xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct WeixinAccountUpsert {
    pub id: String,
    pub channel_id: String,
    pub account_id: String,
    pub user_id: Option<String>,
    pub base_url: String,
    pub bot_token: String,
    pub login_status: String,
    pub runtime_status: String,
    pub last_connected_at: String,
    pub created_at: String,
    pub updated_at: String,
}

// ==================== 线程 upsert/touch 参数 ====================

/// upsert 线程时 touch 已有线程的参数结构。
#[derive(Clone, Debug, Serialize)]
pub struct ThreadTouchRow {
    pub id: String,
    pub peer_name_snapshot: Option<String>,
    pub last_context_token: Option<String>,
    pub last_message_at: String,
    pub updated_at: String,
}

/// 插入新线程的参数结构。
#[derive(Clone, Debug, Serialize)]
pub struct ThreadInsertRow {
    pub id: String,
    pub channel_account_id: String,
    pub peer_id: String,
    pub peer_name_snapshot: Option<String>,
    pub last_context_token: Option<String>,
    pub last_message_at: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 更新线程上下文的参数结构（COALESCE 语义：None 表示保留原值）。
#[derive(Clone, Debug, Serialize)]
pub struct ThreadContextUpdateRow {
    pub id: String,
    pub session_id: Option<String>,
    pub active_project_id: Option<String>,
    pub active_agent_id: Option<String>,
    pub active_model_id: Option<String>,
    pub last_context_token: Option<String>,
    pub last_plan_id: Option<String>,
    pub last_task_id: Option<String>,
    pub updated_at: String,
}

// ==================== 事件参数 ====================

/// 插入审计事件的参数结构。
#[derive(Clone, Debug, Serialize)]
pub struct EventInsertRow {
    pub id: String,
    pub channel_account_id: Option<String>,
    pub thread_id: Option<String>,
    pub direction: String,
    pub event_type: String,
    pub status: String,
    pub summary: Option<String>,
    pub payload_json: Option<String>,
    pub correlation_id: Option<String>,
    pub created_at: String,
}

/// 列出审计事件的过滤参数（limit 必填，其余为可选过滤项）。
#[derive(Clone, Debug, Serialize)]
pub struct EventListRow {
    pub channel_account_id: Option<String>,
    pub thread_id: Option<String>,
    pub event_type: Option<String>,
    pub limit: i64,
}

// ============================================================================
// Mapper 函数
// ============================================================================

// -------------------- 渠道 --------------------

/// 列出全部渠道。
#[html_sql("sql/unattended.html")]
pub async fn list_channels(rb: &dyn Executor) -> Vec<UnattendedChannelRow> {
    impled!()
}

/// 按 id 查询单个渠道。
#[html_sql("sql/unattended.html")]
pub async fn get_channel_by_id(rb: &dyn Executor, id: &str) -> Vec<UnattendedChannelRow> {
    impled!()
}

/// 插入渠道。
pub async fn insert_channel(
    rb: &dyn Executor,
    row: &ChannelWriteRow,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into unattended_channels (id, channel_type, name, enabled, default_project_id, default_agent_id, default_model_id, reply_style, allow_all_senders, future_auth_mode, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.channel_type.clone()),
            rbs::Value::String(row.name.clone()),
            row.enabled.map(rbs::Value::I64).unwrap_or(rbs::Value::Null),
            row.default_project_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.default_agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.default_model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.reply_style.clone()),
            row.allow_all_senders
                .map(rbs::Value::I64)
                .unwrap_or(rbs::Value::Null),
            row.future_auth_mode
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.created_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.updated_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
        ],
    )
    .await
}

/// 更新渠道。
pub async fn update_channel(
    rb: &dyn Executor,
    row: &ChannelWriteRow,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update unattended_channels set name = ?, enabled = ?, default_project_id = ?, default_agent_id = ?, default_model_id = ?, reply_style = ?, allow_all_senders = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.name.clone()),
            row.enabled.map(rbs::Value::I64).unwrap_or(rbs::Value::Null),
            row.default_project_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.default_agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.default_model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.reply_style.clone()),
            row.allow_all_senders
                .map(rbs::Value::I64)
                .unwrap_or(rbs::Value::Null),
            row.updated_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.id.clone()),
        ],
    )
    .await
}

/// 删除渠道。
pub async fn delete_channel(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from unattended_channels where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

// -------------------- 账号 --------------------

/// 列出账号（channel_id 为空则全部）。
#[html_sql("sql/unattended.html")]
pub async fn list_accounts(
    rb: &dyn Executor,
    channel_id: Option<&str>,
) -> Vec<UnattendedAccountRow> {
    impled!()
}

/// 按 id 查询单个账号。
#[html_sql("sql/unattended.html")]
pub async fn get_account_by_id(rb: &dyn Executor, id: &str) -> Vec<UnattendedAccountRow> {
    impled!()
}

/// 按 channel_id + account_id 查询已存在账号 id（单列 value）。
#[html_sql("sql/unattended.html")]
pub async fn get_account_id_by_channel_and_account(
    rb: &dyn Executor,
    channel_id: &str,
    account_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// upsert 微信账号（事务内调用）。
pub async fn upsert_weixin_account(
    rb: &dyn Executor,
    row: &WeixinAccountUpsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into unattended_channel_accounts (id, channel_id, account_id, user_id, base_url, bot_token, sync_cursor, login_status, runtime_status, last_connected_at, last_error, created_at, updated_at) values (?, ?, ?, ?, ?, ?, coalesce((select sync_cursor from unattended_channel_accounts where id = ?), null), ?, coalesce((select runtime_status from unattended_channel_accounts where id = ?), ?), ?, null, coalesce((select created_at from unattended_channel_accounts where id = ?), ?), ?) on conflict(id) do update set user_id = excluded.user_id, base_url = excluded.base_url, bot_token = excluded.bot_token, login_status = excluded.login_status, last_connected_at = excluded.last_connected_at, last_error = null, updated_at = excluded.updated_at";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.channel_id.clone()),
            rbs::Value::String(row.account_id.clone()),
            row.user_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.base_url.clone()),
            rbs::Value::String(row.bot_token.clone()),
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.login_status.clone()),
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.runtime_status.clone()),
            rbs::Value::String(row.last_connected_at.clone()),
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
        ],
    )
    .await
}

/// 删除账号。
pub async fn delete_account(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from unattended_channel_accounts where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 更新账号运行状态。
pub async fn update_account_runtime_status(
    rb: &dyn Executor,
    id: &str,
    runtime_status: &str,
    last_error: Option<&str>,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update unattended_channel_accounts set runtime_status = ?, last_error = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(runtime_status.to_string()),
            last_error
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 更新账号同步游标。
pub async fn update_account_sync_cursor(
    rb: &dyn Executor,
    id: &str,
    sync_cursor: Option<&str>,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update unattended_channel_accounts set sync_cursor = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            sync_cursor
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

// -------------------- 线程 --------------------

/// 查询现有线程（channel_account_id + peer_id）。
#[html_sql("sql/unattended.html")]
pub async fn get_thread_by_channel_and_peer(
    rb: &dyn Executor,
    channel_account_id: &str,
    peer_id: &str,
) -> Vec<UnattendedThreadRow> {
    impled!()
}

/// upsert 时 touch 已有线程的快照字段。
pub async fn touch_thread_on_upsert(
    rb: &dyn Executor,
    row: &ThreadTouchRow,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update unattended_threads set peer_name_snapshot = coalesce(?, peer_name_snapshot), last_context_token = coalesce(?, last_context_token), last_message_at = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            row.peer_name_snapshot
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.last_context_token
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.last_message_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
            rbs::Value::String(row.id.clone()),
        ],
    )
    .await
}

/// 插入新线程。
pub async fn insert_thread(
    rb: &dyn Executor,
    row: &ThreadInsertRow,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into unattended_threads (id, channel_account_id, peer_id, peer_name_snapshot, session_id, active_project_id, active_agent_id, active_model_id, last_context_token, last_plan_id, last_task_id, last_message_at, created_at, updated_at) values (?, ?, ?, ?, null, null, null, null, ?, null, null, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.channel_account_id.clone()),
            rbs::Value::String(row.peer_id.clone()),
            row.peer_name_snapshot
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.last_context_token
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.last_message_at.clone()),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
        ],
    )
    .await
}

/// 列出线程（channel_id 非空时 JOIN 账号表过滤）。
#[html_sql("sql/unattended.html")]
pub async fn list_threads(
    rb: &dyn Executor,
    channel_id: Option<&str>,
) -> Vec<UnattendedThreadRow> {
    impled!()
}

/// 按 id 查询单个线程。
#[html_sql("sql/unattended.html")]
pub async fn get_thread_by_id(rb: &dyn Executor, id: &str) -> Vec<UnattendedThreadRow> {
    impled!()
}

/// 更新线程上下文（COALESCE 保留原值）。
pub async fn update_thread_context(
    rb: &dyn Executor,
    row: &ThreadContextUpdateRow,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update unattended_threads set session_id = coalesce(?, session_id), active_project_id = coalesce(?, active_project_id), active_agent_id = coalesce(?, active_agent_id), active_model_id = coalesce(?, active_model_id), last_context_token = coalesce(?, last_context_token), last_plan_id = coalesce(?, last_plan_id), last_task_id = coalesce(?, last_task_id), updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            row.session_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.active_project_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.active_agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.active_model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.last_context_token
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.last_plan_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.last_task_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.updated_at.clone()),
            rbs::Value::String(row.id.clone()),
        ],
    )
    .await
}

// -------------------- 事件 --------------------

/// 插入审计事件。
pub async fn insert_event(
    rb: &dyn Executor,
    row: &EventInsertRow,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into unattended_events (id, channel_account_id, thread_id, direction, event_type, status, summary, payload_json, correlation_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            row.channel_account_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.thread_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.direction.clone()),
            rbs::Value::String(row.event_type.clone()),
            rbs::Value::String(row.status.clone()),
            row.summary
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.payload_json
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.correlation_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.created_at.clone()),
        ],
    )
    .await
}

/// 列出审计事件（动态过滤 + LIMIT）。
#[html_sql("sql/unattended.html")]
pub async fn list_events(rb: &dyn Executor, row: &EventListRow) -> Vec<UnattendedEventRow> {
    impled!()
}
