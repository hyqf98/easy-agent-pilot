//! CLI 路径配置（cli_paths）mapper。
//!
//! 对应 `commands/cli.rs` 的 DB 操作。SQL 模板见 `sql/cli.html`。
//! 所有函数首参均为 `&dyn Executor`，命令层可传入 `db::rb()`。
//!
//! 注意：写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;

use crate::models::{CliPathRow, IntColumnRow, SingleColumnRow};

/// 列出全部 CLI 路径配置（按 created_at 倒序）。
#[html_sql("sql/cli.html")]
pub async fn list_cli_paths(rb: &dyn Executor) -> Vec<CliPathRow> {
    impled!()
}

/// 插入 CLI 路径配置。
pub async fn insert_cli_path(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    path: &str,
    version: Option<&str>,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into cli_paths (id, name, path, version, created_at, updated_at) values (?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(name.to_string()),
            rbs::Value::String(path.to_string()),
            version
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 更新 CLI 路径配置。
pub async fn update_cli_path(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    path: &str,
    version: Option<&str>,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update cli_paths set name = ?, path = ?, version = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(name.to_string()),
            rbs::Value::String(path.to_string()),
            version
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 删除 CLI 路径配置。
pub async fn delete_cli_path(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from cli_paths where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 读取 app_settings 中的迁移标记值（单列 value）。
#[html_sql("sql/cli.html")]
pub async fn get_migration_flag(rb: &dyn Executor, key: &str) -> Vec<SingleColumnRow> {
    impled!()
}

/// 统计 cli_paths 行数（单列别名 value）。
#[html_sql("sql/cli.html")]
pub async fn count_cli_paths(rb: &dyn Executor) -> Vec<IntColumnRow> {
    impled!()
}

/// 查询全部 CLI 路径配置（迁移用，全量）。
#[html_sql("sql/cli.html")]
pub async fn list_all_cli_paths(rb: &dyn Executor) -> Vec<CliPathRow> {
    impled!()
}

/// 按 cli_path 查询已存在的智能体 id（单列别名 value）。
#[html_sql("sql/cli.html")]
pub async fn find_agent_id_by_cli_path(
    rb: &dyn Executor,
    cli_path: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 插入迁移生成的智能体。
pub async fn insert_agent_for_migration(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    provider: Option<&str>,
    cli_path: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into agents (id, name, type, provider, cli_path, status, created_at, updated_at) values (?, ?, 'cli', ?, ?, 'offline', ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(name.to_string()),
            provider
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(cli_path.to_string()),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 写入迁移完成标记（upsert）。
pub async fn upsert_migration_flag(
    rb: &dyn Executor,
    key: &str,
    value: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert or replace into app_settings (key, value, updated_at) values (?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(key.to_string()),
            rbs::Value::String(value.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}
