//! 记忆模块 mapper。
//!
//! 对应 `commands/memory.rs` 的 DB 操作。SQL 模板见 `sql/memory.html`。
//! 所有函数首参均为 `&dyn Executor`，命令层可传入 `db::rb()` 或事务执行器。
//!
//! 注：原 rusqlite 实现的记忆搜索用 LOWER(...) LIKE（非 FTS5 MATCH），
//! 故 SQL 模板同样用 LIKE。FTS5 虚表/触发器维护（repair_memory_search_indexes）
//! 待 support.rs 迁移后由该处负责。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{
    IntColumnRow, MemoryLibraryChunkSearchRow, MemoryLibraryRow, MemoryMergeRunRow,
    RawMemoryRecordRow, RawMemorySearchRow, SingleColumnRow,
};

/// 插入记忆库的参数结构（字段名与 `sql/memory.html` 模板中的 `#{row.xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct MemoryLibraryInsert {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub content_md: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 全量更新记忆库的参数结构（字段名与 `sql/memory.html` 模板中的 `#{update.xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct MemoryLibraryUpdate {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub content_md: String,
    pub updated_at: String,
}

/// 插入 memory_library_chunks 单条记录的参数结构。
#[derive(Clone, Debug, Serialize)]
pub struct MemoryLibraryChunkInsert {
    pub id: String,
    pub library_id: String,
    pub chunk_text: String,
    pub chunk_order: i64,
    pub chunk_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 插入原始记忆的参数结构（字段名与 `sql/memory.html` 模板中的 `#{row.xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct RawMemoryRecordInsert {
    pub id: String,
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    pub message_id: Option<String>,
    pub content: String,
    pub source_role: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 原始记忆列表/批量删除的筛选参数（字段名与模板中的 `#{query.xxx}` 对应）。
///
/// `search` 传入时已包好 `%keyword%`；`session_id`/`project_id` 为已规整后的值。
#[derive(Clone, Debug, Serialize)]
pub struct RawMemoryQuery {
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    /// 已包好 `%...%` 的模糊匹配串；为 None 时不参与 where。
    pub search: Option<String>,
}

/// 插入合并记录的参数结构（字段名与 `sql/memory.html` 模板中的 `#{row.xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct MemoryMergeRunInsert {
    pub id: String,
    pub library_id: String,
    pub source_record_ids: rbs::Value,
    pub source_record_count: i64,
    pub previous_content_md: String,
    pub merged_content_md: String,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub created_at: String,
}

// =================== memory_libraries ===================

/// 列出全部记忆库。
#[html_sql("sql/memory.html")]
pub async fn list_memory_libraries(rb: &dyn Executor) -> Vec<MemoryLibraryRow> {
    impled!()
}

/// 按 id 查询记忆库。
#[html_sql("sql/memory.html")]
pub async fn get_memory_library_by_id(rb: &dyn Executor, id: &str) -> Vec<MemoryLibraryRow> {
    impled!()
}

/// 插入记忆库。
pub async fn insert_memory_library(
    rb: &dyn Executor,
    row: &MemoryLibraryInsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into memory_libraries (id, name, description, content_md, created_at, updated_at) values (?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.name.clone()),
            row.description
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.content_md.clone()),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
        ],
    )
    .await
}

/// 全量更新记忆库（事务内）。
pub async fn update_memory_library_full(
    rb: &dyn Executor,
    update: &MemoryLibraryUpdate,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update memory_libraries set name = ?, description = ?, content_md = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(update.name.clone()),
            update
                .description
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(update.content_md.clone()),
            rbs::Value::String(update.updated_at.clone()),
            rbs::Value::String(update.id.clone()),
        ],
    )
    .await
}

/// 仅刷新 content_md（merge 场景，事务内）。
pub async fn update_memory_library_content(
    rb: &dyn Executor,
    id: &str,
    content_md: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update memory_libraries set content_md = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(content_md.to_string()),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 删除某 library 的全部 chunks（事务内）。
pub async fn delete_memory_library_chunks(
    rb: &dyn Executor,
    library_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from memory_library_chunks where library_id = ?";
    rb.exec(sql, vec![rbs::Value::String(library_id.to_string())])
        .await
}

/// 删除记忆库（事务内）。
pub async fn delete_memory_library(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from memory_libraries where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

// =================== memory_library_chunks ===================

/// 清空 library 的 chunks（sync_library_chunks 事务内复用）。
pub async fn delete_chunks_by_library(
    rb: &dyn Executor,
    library_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from memory_library_chunks where library_id = ?";
    rb.exec(sql, vec![rbs::Value::String(library_id.to_string())])
        .await
}

/// 插入单条 chunk（事务内循环调用）。
pub async fn insert_memory_library_chunk(
    rb: &dyn Executor,
    chunk: &MemoryLibraryChunkInsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into memory_library_chunks (id, library_id, chunk_text, chunk_order, chunk_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(chunk.id.clone()),
            rbs::Value::String(chunk.library_id.clone()),
            rbs::Value::String(chunk.chunk_text.clone()),
            rbs::Value::I64(chunk.chunk_order),
            rbs::Value::String(chunk.chunk_hash.clone()),
            rbs::Value::String(chunk.created_at.clone()),
            rbs::Value::String(chunk.updated_at.clone()),
        ],
    )
    .await
}

/// 记忆库分块搜索建议。
///
/// `search_terms` 为已包好 `%...%` 的模糊匹配串；`excluded_library_ids` 为要排除的 library id 列表。
/// `has_excluded_ids` 控制 `not in` 子句是否参与 SQL（为 false 时 excluded_library_ids 不使用，
/// 避免空集合生成非法的 `not in ()`）。命令层确保二者一致。
#[html_sql("sql/memory.html")]
pub async fn search_library_suggestions(
    rb: &dyn Executor,
    session_id: &str,
    search_terms: &[String],
    has_excluded_ids: bool,
    excluded_library_ids: &[String],
) -> Vec<MemoryLibraryChunkSearchRow> {
    impled!()
}

// =================== raw_memory_records ===================

/// 列出原始记忆（带可选筛选）。
///
/// `start_at`/`end_at` 为已规整后的 RFC3339 时间戳；为 None 时不参与 where。
#[html_sql("sql/memory.html")]
pub async fn list_raw_memory_records(
    rb: &dyn Executor,
    query: &RawMemoryQuery,
    start_at: Option<&str>,
    end_at: Option<&str>,
) -> Vec<RawMemoryRecordRow> {
    impled!()
}

/// 按 id 查询原始记忆。
#[html_sql("sql/memory.html")]
pub async fn get_raw_memory_record_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Vec<RawMemoryRecordRow> {
    impled!()
}

/// 按 message_id 查询原始记忆（capture 幂等判断）。
#[html_sql("sql/memory.html")]
pub async fn get_raw_memory_record_by_message_id(
    rb: &dyn Executor,
    message_id: &str,
) -> Vec<RawMemoryRecordRow> {
    impled!()
}

/// 插入原始记忆。
pub async fn insert_raw_memory_record(
    rb: &dyn Executor,
    row: &RawMemoryRecordInsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into raw_memory_records (id, session_id, project_id, message_id, content, source_role, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            row.session_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.project_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.message_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.content.clone()),
            rbs::Value::String(row.source_role.clone()),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
        ],
    )
    .await
}

/// 更新原始记忆内容。
pub async fn update_raw_memory_record(
    rb: &dyn Executor,
    id: &str,
    content: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update raw_memory_records set content = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(content.to_string()),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 按 id 删除原始记忆。
pub async fn delete_raw_memory_record_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from raw_memory_records where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 批量删除：查出待删 id 列表。
///
/// `delete_order` 为内部生成的 "ASC"/"DESC"（${} 原文注入，非用户输入）。
#[html_sql("sql/memory.html")]
pub async fn list_raw_memory_record_ids(
    rb: &dyn Executor,
    query: &RawMemoryQuery,
    start_at: Option<&str>,
    end_at: Option<&str>,
    delete_order: &str,
    limit: Option<i64>,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 事务内：批量删除指定 id（手动构建 IN 列表）。
pub async fn delete_raw_memory_records_in(
    rb: &dyn Executor,
    ids: &[String],
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    if ids.is_empty() {
        return Ok(rbatis::rbdc::db::ExecResult::default());
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!("delete from raw_memory_records where id in ({})", placeholders);
    let params: Vec<rbs::Value> = ids.iter().map(|id| rbs::Value::String(id.clone())).collect();
    rb.exec(&sql, params).await
}

/// 原始记忆搜索建议。
#[html_sql("sql/memory.html")]
pub async fn search_raw_memory_suggestions(
    rb: &dyn Executor,
    session_id: &str,
    search_terms: &[String],
) -> Vec<RawMemorySearchRow> {
    impled!()
}

// =================== 关联查询 ===================

/// 按 session_id 查询所属 project_id（单列别名 value）。
#[html_sql("sql/memory.html")]
pub async fn get_project_id_by_session(
    rb: &dyn Executor,
    session_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 列出项目绑定的 memory library id。
#[html_sql("sql/memory.html")]
pub async fn list_project_memory_library_ids(
    rb: &dyn Executor,
    project_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 统计给定 ids 中实际存在的 raw_memory_records 数量（单列别名 value）。
#[html_sql("sql/memory.html")]
pub async fn count_existing_raw_records(
    rb: &dyn Executor,
    ids: &[String],
) -> Vec<IntColumnRow> {
    impled!()
}

// =================== session_memory_reference_history ===================

/// 记录会话已引用记忆（upsert，事务内循环调用）。
pub async fn upsert_session_memory_reference(
    rb: &dyn Executor,
    session_id: &str,
    source_type: &str,
    source_id: &str,
    message_id: &str,
    created_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into session_memory_reference_history (session_id, source_type, source_id, message_id, created_at) values (?, ?, ?, ?, ?) on conflict(session_id, source_type, source_id) do update set message_id = excluded.message_id, created_at = excluded.created_at";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(session_id.to_string()),
            rbs::Value::String(source_type.to_string()),
            rbs::Value::String(source_id.to_string()),
            rbs::Value::String(message_id.to_string()),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

// =================== memory_merge_runs ===================

/// 按 library_id 列出合并记录。
#[html_sql("sql/memory.html")]
pub async fn list_memory_merge_runs(
    rb: &dyn Executor,
    library_id: &str,
) -> Vec<MemoryMergeRunRow> {
    impled!()
}

/// 按 id 查询合并记录。
#[html_sql("sql/memory.html")]
pub async fn get_memory_merge_run_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Vec<MemoryMergeRunRow> {
    impled!()
}

/// 插入合并记录（事务内）。
pub async fn insert_memory_merge_run(
    rb: &dyn Executor,
    row: &MemoryMergeRunInsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into memory_merge_runs (id, library_id, source_record_ids, source_record_count, previous_content_md, merged_content_md, agent_id, model_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.library_id.clone()),
            row.source_record_ids.clone(),
            rbs::Value::I64(row.source_record_count),
            rbs::Value::String(row.previous_content_md.clone()),
            rbs::Value::String(row.merged_content_md.clone()),
            row.agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.created_at.clone()),
        ],
    )
    .await
}
