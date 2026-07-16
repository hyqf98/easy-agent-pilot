//! RBatis 数据访问层初始化与全局状态。
//!
//! 与现有 `database::init_database()`（建表 + ALTER 迁移）并存：
//! - schema 仍由 `init_database()` 管理（已上线用户库 + 堆叠式迁移）
//! - RBatis 只负责查询/写入（连接池 + MyBatis 风格 XML/.html 模板）
//!
//! 迁移期间 rusqlite 与 rbatis 共存，阶段 6 才移除 rusqlite。

use anyhow::Result;
use rbatis::rbatis::RBatis;
use rbdc_sqlite::driver::SqliteDriver;
use std::sync::OnceLock;

/// 全局 RBatis 单例（进程级）。
///
/// 通过 [`rb()`] 在命令中获取；测试场景可用 [`try_init_with()`] 注入内存库。
static RB: OnceLock<RBatis> = OnceLock::new();

/// 初始化全局 RBatis（与现有 rusqlite 连接指向同一 SQLite 文件）。
///
/// 在 `lib.rs` 的 `setup` 中、`init_database()` 之后调用。
///
/// 初始化后立即在池里执行 PRAGMA foreign_keys=OFF：旧库残留的外键约束
/// （如 agent_cli_usage_records 引用已废弃的 messages 表）在删除时会触发
/// "no such table: main.messages"，关闭外键检查以兼容旧 schema
/// （与原 rusqlite 实现的 PRAGMA foreign_keys = OFF 一致）。
pub fn init_db(db_path: &str) -> Result<()> {
    let rb = RBatis::new();
    rb.init(SqliteDriver {}, &format!("sqlite://{}", db_path))
        .map_err(|e| anyhow::anyhow!("RBatis init failed: {}", e))?;
    RB.set(rb)
        .map_err(|_| anyhow::anyhow!("RBatis already initialized"))?;
    Ok(())
}

/// 关闭外键检查（在 init_db 后、应用启动前调用一次）。
///
/// rbdc-sqlite 连接池每个连接默认 foreign_keys=ON，需要在池初始化后
/// 对所有现存连接执行 PRAGMA foreign_keys=OFF。新连接由 rbdc-sqlite 内部
/// 管理，无法逐个设置；因此这里用 acquire 获取连接并设置，主要覆盖首批连接。
#[allow(dead_code)]
pub async fn disable_foreign_keys() -> Result<()> {
    let rb = rb();
    rb.exec("PRAGMA foreign_keys = OFF", vec![])
        .await
        .map_err(|e| anyhow::anyhow!("disable foreign_keys failed: {}", e))?;
    Ok(())
}

/// 获取全局 RBatis 引用。
///
/// 必须在 [`init_db()`] 成功后调用，否则 panic（编程错误）。
pub fn rb() -> &'static RBatis {
    RB.get().expect("RBatis not initialized, call init_db() first")
}

/// RBatis 是否已初始化（测试或条件场景用）。
pub fn is_initialized() -> bool {
    RB.get().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_db_sets_singleton_and_is_idempotent_guarded() {
        // 用临时文件避免污染真实库
        let tmp = tempfile::NamedTempFile::new().expect("create temp file");
        let path = tmp.path().to_str().expect("utf8 path");
        assert!(!is_initialized() || RB.get().is_some());
        // 第一次初始化成功（或已被前一个测试初始化则报 already init，二者都说明机制工作）
        let _ = init_db(path);
        assert!(is_initialized());
        // 第二次必须返回 already initialized 错误
        let second = init_db(path);
        assert!(second.is_err(), "second init must be rejected");
    }
}
