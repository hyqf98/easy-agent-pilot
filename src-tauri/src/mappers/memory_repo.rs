//! 记忆库仓库（Memory Repo）mapper。
//!
//! 对应 `commands/memory_repo.rs` 的 DB 操作。SQL 模板见 `sql/memory_repo.html`。
//! 所有函数首参均为 `&dyn Executor`，命令层可传入 `db::rb()` 或事务执行器。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{
    IntColumnRow, LegacyMemoryLibraryRow, MemoryRepoRow, MemoryRepoSourceRow, SingleColumnRow,
};

/// 插入仓库的参数结构（字段名与 `sql/memory_repo.html` 模板中的 `#{xxx}` 对应）。
///
/// 布尔列（internal_tools_enabled / enabled）在 SQLite 中存为 INTEGER，这里用 i64 传递。
#[derive(Clone, Debug, Serialize)]
pub struct MemoryRepoInsert {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub repo_path: String,
    pub format: String,
    pub system_prompt: String,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub internal_tools_enabled: i64,
    pub enabled: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 更新仓库元数据的参数结构（字段名与 `sql/memory_repo.html` 模板中的 `#{xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct MemoryRepoUpdate {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: String,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub internal_tools_enabled: i64,
    pub enabled: i64,
    pub updated_at: String,
}

/// 列出全部记忆库仓库（按 updated_at 倒序）。
#[html_sql("sql/memory_repo.html")]
pub async fn list_memory_repos(rb: &dyn Executor) -> Vec<MemoryRepoRow> {
    impled!()
}

/// 按 id 查询单个仓库。
#[html_sql("sql/memory_repo.html")]
pub async fn get_memory_repo_by_id(rb: &dyn Executor, id: &str) -> Vec<MemoryRepoRow> {
    impled!()
}

/// 插入新仓库。
pub async fn insert_memory_repo(
    rb: &dyn Executor,
    row: &MemoryRepoInsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into memory_repos (id, name, slug, description, repo_path, format, system_prompt, agent_id, model_id, internal_tools_enabled, enabled, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.name.clone()),
            rbs::Value::String(row.slug.clone()),
            row.description
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.repo_path.clone()),
            rbs::Value::String(row.format.clone()),
            rbs::Value::String(row.system_prompt.clone()),
            row.agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(row.internal_tools_enabled),
            rbs::Value::I64(row.enabled),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
        ],
    )
    .await
}

/// 更新仓库元数据。
pub async fn update_memory_repo(
    rb: &dyn Executor,
    update: &MemoryRepoUpdate,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update memory_repos set name = ?, description = ?, system_prompt = ?, agent_id = ?, model_id = ?, internal_tools_enabled = ?, enabled = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(update.name.clone()),
            update
                .description
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(update.system_prompt.clone()),
            update
                .agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            update
                .model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(update.internal_tools_enabled),
            rbs::Value::I64(update.enabled),
            rbs::Value::String(update.updated_at.clone()),
            rbs::Value::String(update.id.clone()),
        ],
    )
    .await
}

/// 删除仓库。
pub async fn delete_memory_repo(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from memory_repos where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 查询全部仓库名称（迁移去重用，单列别名 value）。
#[html_sql("sql/memory_repo.html")]
pub async fn list_memory_repo_names(rb: &dyn Executor) -> Vec<SingleColumnRow> {
    impled!()
}

/// 列出仓库的数据源。
#[html_sql("sql/memory_repo.html")]
pub async fn list_memory_repo_sources(
    rb: &dyn Executor,
    repo_id: &str,
) -> Vec<MemoryRepoSourceRow> {
    impled!()
}

/// 按 repo_id + source_type 查询 id（判断是否已存在，单列别名 value）。
#[html_sql("sql/memory_repo.html")]
pub async fn get_memory_repo_source_id_by_unique(
    rb: &dyn Executor,
    repo_id: &str,
    source_type: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 插入数据源。
pub async fn insert_memory_repo_source(
    rb: &dyn Executor,
    id: &str,
    repo_id: &str,
    source_type: &str,
    config: rbs::Value,
    enabled: i64,
    created_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into memory_repo_sources (id, repo_id, source_type, config, enabled, created_at) values (?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(repo_id.to_string()),
            rbs::Value::String(source_type.to_string()),
            config,
            rbs::Value::I64(enabled),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

/// 更新数据源。
pub async fn update_memory_repo_source(
    rb: &dyn Executor,
    id: &str,
    config: rbs::Value,
    enabled: i64,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update memory_repo_sources set config = ?, enabled = ? where id = ?";
    rb.exec(
        sql,
        vec![
            config,
            rbs::Value::I64(enabled),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 按 id 查询数据源。
#[html_sql("sql/memory_repo.html")]
pub async fn get_memory_repo_source_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Vec<MemoryRepoSourceRow> {
    impled!()
}

/// 检查 memory_libraries 表是否存在（返回 count 单列别名 value）。
#[html_sql("sql/memory_repo.html")]
pub async fn count_memory_libraries_table(rb: &dyn Executor) -> Vec<IntColumnRow> {
    impled!()
}

/// 读取旧库全部记录（迁移用）。
#[html_sql("sql/memory_repo.html")]
pub async fn list_legacy_memory_libraries(rb: &dyn Executor) -> Vec<LegacyMemoryLibraryRow> {
    impled!()
}
