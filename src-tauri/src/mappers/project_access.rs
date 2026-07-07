//! 项目访问记录 mapper。
//!
//! 对应 `commands/project_access.rs` 的 DB 操作。SQL 模板见 `sql/project_access.html`。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。
//!
//! 废弃说明：record_project_access 已由 commands/project_access.rs 用 rb.exec 裸 SQL
//! 覆盖，mapper 函数不再被调用，已删除。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::ProjectAccessRow;

/// 获取最近访问的项目 ID 列表（按访问时间倒序）。
#[html_sql("sql/project_access.html")]
pub async fn get_recent_projects(rb: &dyn Executor, limit: i64) -> Vec<ProjectAccessRow> {
    impled!()
}

/// 删除项目访问记录。
pub async fn delete_project_access_log(
    rb: &dyn Executor,
    project_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from project_access_log where project_id = ?";
    rb.exec(sql, vec![rbs::Value::String(project_id.to_string())])
        .await
}
