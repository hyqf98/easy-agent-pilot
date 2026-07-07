//! 调度器模块 mapper。
//!
//! 对应 `scheduler/{memory,plan}_scheduler.rs` 的 DB 操作。SQL 模板见
//! `sql/scheduler.html`。所有函数首参均为 `&dyn Executor`，调度器传入 `db::rb()`。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::SingleColumnRow;

// ==================== memory_jobs ====================

/// 查询到期的记忆库任务 id（schedule_status=scheduled 且 next_run_at<=now）。
#[html_sql("sql/scheduler.html")]
pub async fn list_due_memory_job_ids(rb: &dyn Executor, now: &str) -> Vec<SingleColumnRow> {
    impled!()
}

/// 置记忆库任务为 triggered（立即触发）。
pub async fn trigger_memory_job_status(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update memory_jobs set schedule_status = 'triggered', updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

// ==================== plans ====================

/// 查询到期的定时计划 id（schedule_status=scheduled 且 scheduled_at<=now）。
#[html_sql("sql/scheduler.html")]
pub async fn list_due_plan_ids(rb: &dyn Executor, now: &str) -> Vec<SingleColumnRow> {
    impled!()
}

/// 触发计划：置 schedule_status=triggered / status=executing / execution_status=running。
pub async fn trigger_plan_status(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update plans set schedule_status = 'triggered', status = 'executing', execution_status = 'running', updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}
