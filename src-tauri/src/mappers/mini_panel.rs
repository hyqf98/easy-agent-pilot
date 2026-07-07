//! Mini Panel 托管项目/会话 mapper。
//!
//! 对应 `commands/mini_panel.rs` 的 DB 操作。SQL 模板见 `sql/mini_panel.html`。
//!
//! 注：`app_settings` 表的读写复用 `mappers/settings`（`get_app_setting` /
//! `save_app_setting`），本 mapper 仅负责 projects / sessions 表的专属操作。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::IntColumnRow;

/// 检查项目是否存在。
#[html_sql("sql/mini_panel.html")]
pub async fn project_exists(rb: &dyn Executor, id: &str) -> Vec<IntColumnRow> {
    impled!()
}

/// 检查会话是否存在。
#[html_sql("sql/mini_panel.html")]
pub async fn session_exists(rb: &dyn Executor, id: &str) -> Vec<IntColumnRow> {
    impled!()
}

/// 插入 Mini Panel 托管项目。
pub async fn insert_mini_panel_project(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    path: &str,
    description: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into projects (id, name, path, description, created_at, updated_at) values (?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(name.to_string()),
            rbs::Value::String(path.to_string()),
            rbs::Value::String(description.to_string()),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 插入 Mini Panel 托管会话。
pub async fn insert_mini_panel_session(
    rb: &dyn Executor,
    id: &str,
    project_id: &str,
    name: &str,
    agent_type: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into sessions (id, project_id, name, agent_type, status, created_at, updated_at) values (?, ?, ?, ?, 'idle', ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(project_id.to_string()),
            rbs::Value::String(name.to_string()),
            rbs::Value::String(agent_type.to_string()),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}
