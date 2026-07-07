//! MCP mapper。
//!
//! 对应 `commands/mcp.rs` 的 DB 操作（mcp_servers 表 CRUD + 测试结果写入）。
//! SQL 模板见 `sql/mcp.html`。
//! MCP 业务逻辑（rmcp 连接测试、工具列表、工具调用）不在此层，仍保留在命令层。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::{IntColumnRow, McpRuntimeConfigRow, McpServerNameTypeRow, McpServerRow};

// ===================== 查询 =====================

/// 列出全部 MCP 服务器（按 created_at 倒序）。
#[html_sql("sql/mcp.html")]
pub async fn list_mcp_servers(rb: &dyn Executor) -> Vec<McpServerRow> {
    impled!()
}

/// 读取运行时配置（7 列子集，供测试/工具列表/工具调用使用）。
#[html_sql("sql/mcp.html")]
pub async fn load_runtime_server_config(rb: &dyn Executor, id: &str) -> Vec<McpRuntimeConfigRow> {
    impled!()
}

/// 读取服务器 (server_type, name)（删除/更新时定位旧配置文件用）。
#[html_sql("sql/mcp.html")]
pub async fn get_mcp_server_type_name(
    rb: &dyn Executor,
    id: &str,
) -> Vec<McpServerNameTypeRow> {
    impled!()
}

/// 名称重复计数（exclude_id 传 None 表示不排除任何 id）。
#[html_sql("sql/mcp.html")]
pub async fn count_mcp_by_name(
    rb: &dyn Executor,
    name: &str,
    exclude_id: Option<&str>,
) -> Vec<IntColumnRow> {
    impled!()
}

// ===================== 写入 =====================

/// 插入 MCP 服务器。
pub async fn insert_mcp_server(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    server_type: &str,
    command: &str,
    args: Option<rbs::Value>,
    env: Option<rbs::Value>,
    url: Option<&str>,
    headers: Option<rbs::Value>,
    enabled: i64,
    created_at: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into mcp_servers (id, name, server_type, command, args, env, url, headers, enabled, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(name.to_string()),
            rbs::Value::String(server_type.to_string()),
            rbs::Value::String(command.to_string()),
            args.unwrap_or(rbs::Value::Null),
            env.unwrap_or(rbs::Value::Null),
            url.map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            headers.unwrap_or(rbs::Value::Null),
            rbs::Value::I64(enabled),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 更新 MCP 服务器（全字段）。
pub async fn update_mcp_server_full(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    server_type: &str,
    command: &str,
    args: Option<rbs::Value>,
    env: Option<rbs::Value>,
    url: Option<&str>,
    headers: Option<rbs::Value>,
    enabled: i64,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update mcp_servers set name = ?, server_type = ?, command = ?, args = ?, env = ?, url = ?, headers = ?, enabled = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(name.to_string()),
            rbs::Value::String(server_type.to_string()),
            rbs::Value::String(command.to_string()),
            args.unwrap_or(rbs::Value::Null),
            env.unwrap_or(rbs::Value::Null),
            url.map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            headers.unwrap_or(rbs::Value::Null),
            rbs::Value::I64(enabled),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 删除 MCP 服务器。
pub async fn delete_mcp_server_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from mcp_servers where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 切换启用状态。
pub async fn toggle_mcp_server_enabled(
    rb: &dyn Executor,
    id: &str,
    enabled: i64,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update mcp_servers set enabled = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::I64(enabled),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 写入测试结果。
pub async fn save_mcp_test_result(
    rb: &dyn Executor,
    id: &str,
    test_status: &str,
    test_message: &str,
    tool_count: Option<i64>,
    tested_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update mcp_servers set test_status = ?, test_message = ?, tool_count = ?, tested_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(test_status.to_string()),
            rbs::Value::String(test_message.to_string()),
            tool_count.map(rbs::Value::I64).unwrap_or(rbs::Value::Null),
            rbs::Value::String(tested_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}
