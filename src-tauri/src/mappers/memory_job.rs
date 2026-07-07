//! 记忆库定时任务（Memory Job）mapper。
//!
//! 对应 `commands/memory_job.rs` 的 DB 操作。SQL 模板见 `sql/memory_job.html`。
//! 所有函数首参均为 `&dyn Executor`，命令层可传入 `db::rb()` 或事务执行器。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{MemoryJobRow, MemoryJobRunRow};

/// 插入任务的参数结构（字段名与 `sql/memory_job.html` 模板中的 `#{xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct MemoryJobInsert {
    pub id: String,
    pub repo_id: String,
    pub name: String,
    pub instruction: String,
    pub cron: Option<String>,
    pub next_run_at: Option<String>,
    pub schedule_status: String,
    pub last_run_at: Option<String>,
    pub last_run_status: Option<String>,
    pub last_run_summary: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 更新任务的参数结构（字段名与 `sql/memory_job.html` 模板中的 `#{xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct MemoryJobUpdate {
    pub id: String,
    pub name: String,
    pub instruction: String,
    pub cron: Option<String>,
    pub next_run_at: Option<String>,
    pub schedule_status: String,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub updated_at: String,
}

/// 列出仓库下的全部定时任务。
#[html_sql("sql/memory_job.html")]
pub async fn list_memory_jobs(rb: &dyn Executor, repo_id: &str) -> Vec<MemoryJobRow> {
    impled!()
}

/// 按 id 查询单个任务。
#[html_sql("sql/memory_job.html")]
pub async fn get_memory_job_by_id(rb: &dyn Executor, id: &str) -> Vec<MemoryJobRow> {
    impled!()
}

/// 插入新任务。
pub async fn insert_memory_job(
    rb: &dyn Executor,
    row: &MemoryJobInsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into memory_jobs (id, repo_id, name, instruction, cron, next_run_at, schedule_status, last_run_at, last_run_status, last_run_summary, agent_id, model_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.repo_id.clone()),
            rbs::Value::String(row.name.clone()),
            rbs::Value::String(row.instruction.clone()),
            row.cron.clone().map(rbs::Value::String).unwrap_or(rbs::Value::Null),
            row.next_run_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.schedule_status.clone()),
            row.last_run_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.last_run_status
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.last_run_summary
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
        ],
    )
    .await
}

/// 更新任务。
pub async fn update_memory_job(
    rb: &dyn Executor,
    update: &MemoryJobUpdate,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update memory_jobs set name = ?, instruction = ?, cron = ?, next_run_at = ?, schedule_status = ?, agent_id = ?, model_id = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(update.name.clone()),
            rbs::Value::String(update.instruction.clone()),
            update.cron.clone().map(rbs::Value::String).unwrap_or(rbs::Value::Null),
            update
                .next_run_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(update.schedule_status.clone()),
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
            rbs::Value::String(update.updated_at.clone()),
            rbs::Value::String(update.id.clone()),
        ],
    )
    .await
}

/// 删除任务。
pub async fn delete_memory_job(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from memory_jobs where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 置 triggered 状态（立即触发）。
pub async fn trigger_memory_job(
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

/// 列出任务的运行历史。
#[html_sql("sql/memory_job.html")]
pub async fn list_memory_job_runs(rb: &dyn Executor, job_id: &str) -> Vec<MemoryJobRunRow> {
    impled!()
}

/// 插入运行记录（事务内）。
pub async fn insert_memory_job_run(
    rb: &dyn Executor,
    id: &str,
    job_id: &str,
    repo_id: &str,
    status: &str,
    summary: Option<&str>,
    files_changed: Option<rbs::Value>,
    started_at: &str,
    finished_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into memory_job_runs (id, job_id, repo_id, status, summary, files_changed, started_at, finished_at) values (?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(job_id.to_string()),
            rbs::Value::String(repo_id.to_string()),
            rbs::Value::String(status.to_string()),
            summary
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            files_changed.unwrap_or(rbs::Value::Null),
            rbs::Value::String(started_at.to_string()),
            rbs::Value::String(finished_at.to_string()),
        ],
    )
    .await
}

/// 回写运行结果并重算 next_run_at（事务内）。
pub async fn apply_job_run_result(
    rb: &dyn Executor,
    job_id: &str,
    last_run_at: &str,
    last_run_status: &str,
    last_run_summary: Option<&str>,
    next_run_at: Option<&str>,
    schedule_status: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update memory_jobs set last_run_at = ?, last_run_status = ?, last_run_summary = ?, next_run_at = ?, schedule_status = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(last_run_at.to_string()),
            rbs::Value::String(last_run_status.to_string()),
            last_run_summary
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            next_run_at
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(schedule_status.to_string()),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(job_id.to_string()),
        ],
    )
    .await
}

/// 按 id 查询运行记录。
#[html_sql("sql/memory_job.html")]
pub async fn get_memory_job_run_by_id(rb: &dyn Executor, id: &str) -> Vec<MemoryJobRunRow> {
    impled!()
}
