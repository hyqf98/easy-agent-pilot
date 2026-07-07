//! 数据访问共享工具（rbatis 迁移后大幅瘦身）。
//!
//! 历史职责（已迁移）：
//! - `open_db_connection()` → 由 `db::rb()` 全局 RBatis 连接池取代
//! - `UpdateSqlBuilder` / `bind_value` / `bind_optional` → 由 `.html` 模板的 `<set>+<if>` 取代
//!
//! 保留职责：
//! - FTS5 虚表/触发器的 DDL 常量（被 `database/mod.rs` 引用）
//! - `repair_memory_search_indexes`（FTS 索引重建，改用 rbatis exec）
//! - `now_rfc3339` / `bool_from_int` 等纯工具函数

use anyhow::Result;
use std::path::PathBuf;

use crate::db;

pub const RAW_MEMORY_FTS_TABLE_SQL: &str = r#"
    CREATE VIRTUAL TABLE IF NOT EXISTS raw_memory_records_fts USING fts5(
        content,
        tokenize = 'trigram',
        content = 'raw_memory_records',
        content_rowid = 'rowid'
    );
"#;

pub const MEMORY_CHUNKS_FTS_TABLE_SQL: &str = r#"
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_library_chunks_fts USING fts5(
        chunk_text,
        tokenize = 'trigram',
        content = 'memory_library_chunks',
        content_rowid = 'rowid'
    );
"#;

pub const MEMORY_SEARCH_TRIGGERS_SQL: &[&str] = &[
    r#"
    CREATE TRIGGER IF NOT EXISTS raw_memory_records_ai
    AFTER INSERT ON raw_memory_records
    BEGIN
        INSERT INTO raw_memory_records_fts(rowid, content)
        VALUES (new.rowid, new.content);
    END;
    "#,
    r#"
    CREATE TRIGGER IF NOT EXISTS raw_memory_records_ad
    AFTER DELETE ON raw_memory_records
    BEGIN
        INSERT INTO raw_memory_records_fts(raw_memory_records_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
    END;
    "#,
    r#"
    CREATE TRIGGER IF NOT EXISTS raw_memory_records_au
    AFTER UPDATE ON raw_memory_records
    BEGIN
        INSERT INTO raw_memory_records_fts(raw_memory_records_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
        INSERT INTO raw_memory_records_fts(rowid, content)
        VALUES (new.rowid, new.content);
    END;
    "#,
    r#"
    CREATE TRIGGER IF NOT EXISTS memory_library_chunks_ai
    AFTER INSERT ON memory_library_chunks
    BEGIN
        INSERT INTO memory_library_chunks_fts(rowid, chunk_text)
        VALUES (new.rowid, new.chunk_text);
    END;
    "#,
    r#"
    CREATE TRIGGER IF NOT EXISTS memory_library_chunks_ad
    AFTER DELETE ON memory_library_chunks
    BEGIN
        INSERT INTO memory_library_chunks_fts(memory_library_chunks_fts, rowid, chunk_text)
        VALUES ('delete', old.rowid, old.chunk_text);
    END;
    "#,
    r#"
    CREATE TRIGGER IF NOT EXISTS memory_library_chunks_au
    AFTER UPDATE ON memory_library_chunks
    BEGIN
        INSERT INTO memory_library_chunks_fts(memory_library_chunks_fts, rowid, chunk_text)
        VALUES ('delete', old.rowid, old.chunk_text);
        INSERT INTO memory_library_chunks_fts(rowid, chunk_text)
        VALUES (new.rowid, new.chunk_text);
    END;
    "#,
];

/// 重建记忆模块的派生搜索结构。
///
/// `raw_memory_records_fts` 和 `memory_library_chunks_fts` 都是由源表派生出的 FTS 虚表，
/// 即便损坏也可以通过删除并重建恢复，不会丢失原始业务数据。
///
/// 使用全局 RBatis 连接池（`db::rb()`）执行 DDL。
pub async fn repair_memory_search_indexes() -> Result<()> {
    // 检查源表是否存在（通过 COUNT 查询，表不存在会报错 → 视为不存在）
    let raw_memory_exists = sqlite_object_exists("table", "raw_memory_records").await?;
    let memory_chunks_exists = sqlite_object_exists("table", "memory_library_chunks").await?;

    // 清理旧的 FTS 结构（IF EXISTS 幂等）
    db::rb()
        .exec(
            r#"
            DROP TRIGGER IF EXISTS raw_memory_records_ai;
            DROP TRIGGER IF EXISTS raw_memory_records_ad;
            DROP TRIGGER IF EXISTS raw_memory_records_au;
            DROP TABLE IF EXISTS raw_memory_records_fts;

            DROP TRIGGER IF EXISTS memory_library_chunks_ai;
            DROP TRIGGER IF EXISTS memory_library_chunks_ad;
            DROP TRIGGER IF EXISTS memory_library_chunks_au;
            DROP TABLE IF EXISTS memory_library_chunks_fts;
            "#,
            vec![],
        )
        .await
        .map_err(|e| anyhow::anyhow!("drop legacy fts objects failed: {}", e))?;

    if raw_memory_exists {
        let rebuild_sql = format!(
            "{}\n{}\n{}\n{}",
            RAW_MEMORY_FTS_TABLE_SQL,
            MEMORY_SEARCH_TRIGGERS_SQL[0],
            MEMORY_SEARCH_TRIGGERS_SQL[1],
            MEMORY_SEARCH_TRIGGERS_SQL[2],
        );
        db::rb()
            .exec(&rebuild_sql, vec![])
            .await
            .map_err(|e| anyhow::anyhow!("rebuild raw_memory fts failed: {}", e))?;
        db::rb()
            .exec("REINDEX raw_memory_records;", vec![])
            .await
            .map_err(|e| anyhow::anyhow!("reindex raw_memory failed: {}", e))?;
        db::rb()
            .exec(
                "INSERT INTO raw_memory_records_fts(raw_memory_records_fts) VALUES('rebuild')",
                vec![],
            )
            .await
            .map_err(|e| anyhow::anyhow!("rebuild raw_memory fts content failed: {}", e))?;
    }

    if memory_chunks_exists {
        let rebuild_sql = format!(
            "{}\n{}\n{}\n{}",
            MEMORY_CHUNKS_FTS_TABLE_SQL,
            MEMORY_SEARCH_TRIGGERS_SQL[3],
            MEMORY_SEARCH_TRIGGERS_SQL[4],
            MEMORY_SEARCH_TRIGGERS_SQL[5],
        );
        db::rb()
            .exec(&rebuild_sql, vec![])
            .await
            .map_err(|e| anyhow::anyhow!("rebuild memory_chunks fts failed: {}", e))?;
        db::rb()
            .exec("REINDEX memory_library_chunks;", vec![])
            .await
            .map_err(|e| anyhow::anyhow!("reindex memory_chunks failed: {}", e))?;
        db::rb()
            .exec(
                "INSERT INTO memory_library_chunks_fts(memory_library_chunks_fts) VALUES('rebuild')",
                vec![],
            )
            .await
            .map_err(|e| anyhow::anyhow!("rebuild memory_chunks fts content failed: {}", e))?;
    }

    Ok(())
}

/// 查询 sqlite_master 判断对象是否存在。
async fn sqlite_object_exists(object_type: &str, name: &str) -> Result<bool> {
    // 用 rbatis 查询 COUNT(*)，参数化绑定避免注入
    let sql = "SELECT COUNT(*) FROM sqlite_master WHERE type = ? AND name = ?";
    let value = db::rb()
        .query(sql, vec![rbs::Value::String(object_type.into()), rbs::Value::String(name.into())])
        .await
        .map_err(|e| anyhow::anyhow!("query sqlite_master failed: {}", e))?;
    // 查询结果形如 Value::Array(rows)；取第一行，其内部为单元素 Map，取其 value。
    if let rbs::Value::Array(rows) = &value {
        if let Some(first_row) = rows.first() {
            if let rbs::Value::Map(m) = first_row {
                if let Some((_, v)) = m.into_iter().next() {
                    return Ok(value_to_i64(v) > 0);
                }
            }
        }
    }
    Ok(false)
}

/// 把 rbs::Value（数值类型）解析为 i64。
pub fn value_to_i64(v: &rbs::Value) -> i64 {
    match v {
        rbs::Value::I32(x) => *x as i64,
        rbs::Value::I64(x) => *x,
        rbs::Value::U32(x) => *x as i64,
        rbs::Value::U64(x) => *x as i64,
        rbs::Value::Null => 0,
        _ => 0,
    }
}

pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn bool_from_int(value: Option<i32>) -> Option<bool> {
    value.map(|flag| flag != 0)
}

/// 获取数据库文件路径（persistence_dir/data/easy-agent.db）。
///
/// 与 `commands::get_persistence_dir_path()` 一致，供 mcp_server 等模块
/// 直接打开/校验 SQLite 文件时使用。
pub fn get_db_path() -> Result<PathBuf> {
    let persistence_dir = crate::commands::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}
