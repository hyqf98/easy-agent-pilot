//! 记忆库独立调度器：与 Plan 调度体系解耦。
//!
//! 每 60s 轮询 `memory_jobs`，对到期（`next_run_at <= now` 或 cron 命中）且状态为
//! `scheduled` 的任务置 `triggered` 并 emit `memory:job-trigger{jobId}`，由前端接管执行
//!（复用 MemoryRepoRunner）。执行结果由前端回写（record_memory_job_run）。
//!
//! 模式复制自 `scheduler/plan_scheduler.rs`，独立表/独立定时器。

use std::time::Duration;

use chrono::Utc;
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;

/// 启动后台调度器循环。
pub fn start_memory_scheduler(app_handle: AppHandle) {
    tokio::spawn(async move {
        loop {
            sleep(Duration::from_secs(60)).await;
            if let Err(e) = check_and_trigger_memory_jobs(&app_handle).await {
                eprintln!("Failed to check scheduled memory jobs: {}", e);
            }
        }
    });
}

/// 检查并触发到期的记忆库任务。
async fn check_and_trigger_memory_jobs(app_handle: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let due_ids = query_due_memory_jobs()?;
    for job_id in due_ids {
        println!("Triggering scheduled memory job: {}", job_id);
        if let Err(e) = trigger_memory_job(app_handle, &job_id) {
            eprintln!("Failed to trigger memory job {}: {}", job_id, e);
        }
    }
    Ok(())
}

/// 查询到期的任务（schedule_status=scheduled 且 next_run_at<=now）。
fn query_due_memory_jobs() -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let db_path = crate::commands::support::get_db_path()?;
    let conn = rusqlite::Connection::open(&db_path)?;

    let now_str = Utc::now().to_rfc3339();
    let due_ids: Vec<String> = conn
        .prepare(
            "SELECT id FROM memory_jobs
             WHERE schedule_status = 'scheduled'
               AND next_run_at IS NOT NULL
               AND next_run_at <= ?1",
        )?
        .query_map([&now_str], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(due_ids)
}

/// 触发单个任务：置 triggered + emit 事件。
fn trigger_memory_job(app_handle: &AppHandle, job_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = crate::commands::support::get_db_path()?;
    let conn = rusqlite::Connection::open(&db_path)?;

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE memory_jobs SET schedule_status = 'triggered', updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, job_id],
    )?;

    app_handle.emit("memory:job-trigger", job_id)?;
    Ok(())
}

/// 应用启动时恢复：把已过期但仍为 scheduled 的任务立即触发，未到期的保留等待定时器。
pub async fn restore_memory_jobs(app_handle: &AppHandle) {
    // 过期任务在下一轮 60s 定时检查中会被捕获并触发，这里仅打印数量便于观测。
    match query_due_memory_jobs() {
        Ok(due) => {
            if !due.is_empty() {
                println!("Found {} due memory jobs to trigger on next tick", due.len());
            }
        }
        Err(e) => {
            eprintln!("Failed to restore memory jobs: {}", e);
        }
    }
    let _ = app_handle;
}
