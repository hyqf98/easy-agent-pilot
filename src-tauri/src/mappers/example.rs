//! 示例 mapper：验证 `#[html_sql]` 宏 + `.html` 模板加载链路（阶段 0）。
//!
//! 不接入任何业务命令；阶段 1 起被 `project_access` 等业务 mapper 替代。

use rbatis::executor::Executor;

/// 简单查询：返回 SQLite 版本字符串。
///
/// 用于阶段 0 验证 rbatis → rbdc-sqlite → .html 模板 全链路可用。
#[html_sql("sql/example.html")]
pub async fn query_sqlite_version(rb: &dyn Executor) -> Option<String> {
    impled!()
}
