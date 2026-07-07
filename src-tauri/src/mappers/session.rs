//! 会话 mapper。
//!
//! 对应 `commands/session.rs` 的 DB 操作。SQL 模板见 `sql/session.html`。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。含 `<set>/<if>` 的动态
//! update 暂保留宏（标注 TODO）。

use rbatis::executor::Executor;
use serde::Serialize;

use crate::models::{IntColumnRow, SessionRow, SessionRuntimeBindingRow};

/// 插入会话的参数结构（字段名与 `sql/session.html` 模板中的 `#{xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct SessionInsert {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_type: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 动态更新会话的参数结构（字段名与 `sql/session.html` 模板中的 `#{xxx}` 对应）。
///
/// 布尔列（pinned/plan_mode）在 SQLite 中存为 INTEGER，这里用 `Option<i64>` 传递。
#[derive(Clone, Debug, Serialize)]
pub struct SessionUpdate {
    pub id: String,
    pub updated_at: String,
    pub name: Option<String>,
    pub status: Option<String>,
    pub pinned: Option<i64>,
    pub last_message: Option<String>,
    pub error_message: Option<String>,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_type: Option<String>,
    pub cli_session_id: Option<String>,
    pub cli_session_provider: Option<String>,
    pub plan_mode: Option<i64>,
}

/// 列出指定项目的全部会话。
#[html_sql("sql/session.html")]
pub async fn list_sessions(rb: &dyn Executor, project_id: &str) -> Vec<SessionRow> {
    impled!()
}

/// 按 id 查询单个会话。
#[html_sql("sql/session.html")]
pub async fn get_session_by_id(rb: &dyn Executor, id: &str) -> Vec<SessionRow> {
    impled!()
}

/// 插入新会话。
pub async fn insert_session(
    rb: &dyn Executor,
    row: &SessionInsert,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into sessions (id, project_id, name, expert_id, agent_id, agent_type, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.project_id.clone()),
            rbs::Value::String(row.name.clone()),
            row.expert_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.agent_type.clone()),
            rbs::Value::String(row.status.clone()),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
        ],
    )
    .await
}

/// 刷新项目 updated_at。
pub async fn touch_project_updated_at(
    rb: &dyn Executor,
    project_id: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update projects set updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(project_id.to_string()),
        ],
    )
    .await
}

/// 动态更新会话：手动构建 SET + rb.exec，仅更新 Some 字段（updated_at 始终更新）。
pub async fn update_session(
    rb: &dyn Executor,
    update: &SessionUpdate,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let mut sets: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params: Vec<rbs::Value> = vec![rbs::Value::String(update.updated_at.clone())];

    macro_rules! push_str {
        ($col:expr, $val:expr) => {
            if let Some(v) = &$val {
                sets.push(format!("{} = ?", $col));
                params.push(rbs::Value::String(v.clone()));
            }
        };
    }
    macro_rules! push_i64 {
        ($col:expr, $val:expr) => {
            if let Some(v) = &$val {
                sets.push(format!("{} = ?", $col));
                params.push(rbs::Value::I64(*v));
            }
        };
    }

    push_str!("name", update.name);
    push_str!("status", update.status);
    push_i64!("pinned", update.pinned);
    push_str!("last_message", update.last_message);
    push_str!("error_message", update.error_message);
    push_str!("expert_id", update.expert_id);
    push_str!("agent_id", update.agent_id);
    push_str!("agent_type", update.agent_type);
    push_str!("cli_session_id", update.cli_session_id);
    push_str!("cli_session_provider", update.cli_session_provider);
    push_i64!("plan_mode", update.plan_mode);

    let sql = format!("update sessions set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(update.id.clone()));
    rb.exec(&sql, params).await
}

/// 读取会话当前 pinned 值（0/1）。
#[html_sql("sql/session.html")]
pub async fn get_session_pinned(rb: &dyn Executor, id: &str) -> Vec<IntColumnRow> {
    impled!()
}

/// 写入会话 pinned 值。
pub async fn set_session_pinned(
    rb: &dyn Executor,
    id: &str,
    pinned: i64,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update sessions set pinned = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::I64(pinned),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 读取会话运行时绑定。
#[html_sql("sql/session.html")]
pub async fn get_session_runtime_binding(
    rb: &dyn Executor,
    session_id: &str,
    runtime_key: &str,
) -> Vec<SessionRuntimeBindingRow> {
    impled!()
}

/// upsert 会话运行时绑定。
pub async fn upsert_session_runtime_binding(
    rb: &dyn Executor,
    session_id: &str,
    runtime_key: &str,
    external_session_id: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into session_runtime_bindings (session_id, runtime_key, external_session_id, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(session_id, runtime_key) do update set external_session_id = excluded.external_session_id, updated_at = excluded.updated_at";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(session_id.to_string()),
            rbs::Value::String(runtime_key.to_string()),
            rbs::Value::String(external_session_id.to_string()),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 删除会话运行时绑定。
pub async fn delete_session_runtime_binding(
    rb: &dyn Executor,
    session_id: &str,
    runtime_key: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from session_runtime_bindings where session_id = ? and runtime_key = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(session_id.to_string()),
            rbs::Value::String(runtime_key.to_string()),
        ],
    )
    .await
}

/// 删除会话（事务内）。
pub async fn delete_session_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from sessions where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 删除会话关联的窗口锁（事务内）。
pub async fn delete_window_session_locks(
    rb: &dyn Executor,
    session_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from window_session_locks where session_id = ?";
    rb.exec(sql, vec![rbs::Value::String(session_id.to_string())])
        .await
}

/// 解绑会话关联的任务（事务内）。
pub async fn nullify_tasks_session(
    rb: &dyn Executor,
    session_id: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update tasks set session_id = null, updated_at = ? where session_id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(session_id.to_string()),
        ],
    )
    .await
}

/// 删除会话关联的 CLI 用量记录（事务内）。
pub async fn delete_agent_cli_usage_records(
    rb: &dyn Executor,
    session_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from agent_cli_usage_records where session_id = ?";
    rb.exec(sql, vec![rbs::Value::String(session_id.to_string())])
        .await
}
