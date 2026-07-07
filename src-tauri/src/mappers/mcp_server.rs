//! MCP server 模块 mapper。
//!
//! 对应 `mcp_server/query.rs` 的 DB 操作。SQL 模板见 `sql/mcp_server.html`。
//! 仅暴露读取仓库数据源 config 的查询，作为 `query_conversation_history`
//! 工具的上界裁剪依据。

use rbatis::executor::Executor;

use crate::models::JsonColumnRow;

/// 按 repo_id 读取 conversation_history 数据源 config（单列 value，无则返回 None）。
///
/// 注意：`config` 是 JSON TEXT 列，会被 rbdc-sqlite 自动解析，故用
/// [`JsonColumnRow`]（`value: Option<rbs::Value>`）接收，调用方用
/// [`crate::models::value_to_json_string_opt`] 还原为 `Option<String>`。
#[html_sql("sql/mcp_server.html")]
pub async fn get_repo_source_config(rb: &dyn Executor, repo_id: &str) -> Vec<JsonColumnRow> {
    impled!()
}
