//! 窗口会话锁定（window_session_locks）mapper。
//!
//! 对应 `commands/window.rs` 的 DB 操作。SQL 模板见 `sql/window.html`。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::WindowSessionLockRow;

/// 锁定会话到窗口（upsert）。
pub async fn lock_session(
    rb: &dyn Executor,
    session_id: &str,
    window_label: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert or replace into window_session_locks (session_id, window_label, locked_at) values (?, ?, strftime('%s', 'now'))";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(session_id.to_string()),
            rbs::Value::String(window_label.to_string()),
        ],
    )
    .await
}

/// 释放会话锁定（按 session_id）。
pub async fn release_session(
    rb: &dyn Executor,
    session_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from window_session_locks where session_id = ?";
    rb.exec(sql, vec![rbs::Value::String(session_id.to_string())])
        .await
}

/// 检查会话是否被锁定，返回锁定窗口标签。
#[html_sql("sql/window.html")]
pub async fn is_session_locked(rb: &dyn Executor, session_id: &str) -> Vec<WindowSessionLockRow> {
    impled!()
}

/// 释放窗口的所有会话锁定。
pub async fn release_window_sessions(
    rb: &dyn Executor,
    window_label: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from window_session_locks where window_label = ?";
    rb.exec(sql, vec![rbs::Value::String(window_label.to_string())])
        .await
}
