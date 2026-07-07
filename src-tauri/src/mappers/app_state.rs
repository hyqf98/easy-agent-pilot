//! 应用状态（app_state）mapper。
//!
//! 对应 `commands/app_state.rs` 的 DB 操作。SQL 模板见 `sql/app_state.html`。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::AppStateRow;

/// 获取单个应用状态值。
#[html_sql("sql/app_state.html")]
pub async fn get_app_state(rb: &dyn Executor, key: &str) -> Option<String> {
    impled!()
}

/// 设置应用状态值（upsert）。
pub async fn set_app_state(
    rb: &dyn Executor,
    key: &str,
    value: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert or replace into app_state (key, value, updated_at) values (?, ?, strftime('%s', 'now'))";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(key.to_string()),
            rbs::Value::String(value.to_string()),
        ],
    )
    .await
}

/// 批量获取应用状态。
#[html_sql("sql/app_state.html")]
pub async fn get_app_states(rb: &dyn Executor, keys: &Vec<String>) -> Vec<AppStateRow> {
    impled!()
}
