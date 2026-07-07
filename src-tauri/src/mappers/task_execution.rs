//! 任务执行 mapper。
//!
//! 对应 `commands/task_execution.rs` 的 DB 操作。SQL 模板见 `sql/task_execution.html`。
//! 批量 IN 操作用 `<foreach>`（clear_plan_execution_results 清理多任务日志）。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::{
    IntColumnRow, PlanExecutionOverviewRow, PlanExecutionTaskRow, SingleColumnRow,
    TaskExecutionLogRow, TaskExecutionResultRow, TaskOverviewRow,
};

// ===================== task_execution_logs =====================

pub async fn insert_task_execution_log(
    rb: &dyn Executor,
    id: &str,
    task_id: &str,
    log_type: &str,
    content: &str,
    metadata: Option<&str>,
    created_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into task_execution_logs (id, task_id, log_type, content, metadata, created_at) values (?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(task_id.to_string()),
            rbs::Value::String(log_type.to_string()),
            rbs::Value::String(content.to_string()),
            metadata
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

pub async fn update_task_execution_log(
    rb: &dyn Executor,
    id: &str,
    content: &str,
    metadata: Option<&str>,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update task_execution_logs set content = ?, metadata = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(content.to_string()),
            metadata
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

#[html_sql("sql/task_execution.html")]
pub async fn list_task_execution_logs(
    rb: &dyn Executor,
    task_id: &str,
) -> Vec<TaskExecutionLogRow> {
    impled!()
}

pub async fn clear_task_execution_logs(
    rb: &dyn Executor,
    task_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from task_execution_logs where task_id = ?";
    rb.exec(sql, vec![rbs::Value::String(task_id.to_string())])
        .await
}

#[html_sql("sql/task_execution.html")]
pub async fn count_task_execution_logs(
    rb: &dyn Executor,
    task_id: &str,
) -> Vec<IntColumnRow> {
    impled!()
}

#[html_sql("sql/task_execution.html")]
pub async fn get_last_log_created_at(
    rb: &dyn Executor,
    task_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 批量删除多任务执行日志（手动构建 IN 列表，clear_plan_execution_results 事务内）。
pub async fn delete_logs_for_tasks(
    rb: &dyn Executor,
    task_ids: &[String],
) -> Result<ExecResult, rbatis::Error> {
    if task_ids.is_empty() {
        return Ok(ExecResult::default());
    }
    let placeholders = vec!["?"; task_ids.len()].join(", ");
    let sql = format!(
        "delete from task_execution_logs where task_id in ({})",
        placeholders
    );
    let params: Vec<rbs::Value> = task_ids
        .iter()
        .map(|id| rbs::Value::String(id.clone()))
        .collect();
    rb.exec(&sql, params).await
}

#[html_sql("sql/task_execution.html")]
pub async fn list_task_ids_of_plan(rb: &dyn Executor, plan_id: &str) -> Vec<SingleColumnRow> {
    impled!()
}

// ===================== task_execution_results =====================

pub async fn insert_task_execution_result(
    rb: &dyn Executor,
    id: &str,
    task_id: &str,
    plan_id: &str,
    task_title_snapshot: &str,
    task_description_snapshot: Option<&str>,
    result_status: &str,
    result_summary: Option<&str>,
    result_files: Option<&str>,
    fail_reason: Option<&str>,
    created_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into task_execution_results (id, task_id, plan_id, task_title_snapshot, task_description_snapshot, result_status, result_summary, result_files, fail_reason, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(task_id.to_string()),
            rbs::Value::String(plan_id.to_string()),
            rbs::Value::String(task_title_snapshot.to_string()),
            task_description_snapshot
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(result_status.to_string()),
            result_summary
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            result_files
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            fail_reason
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

pub async fn apply_result_to_task(
    rb: &dyn Executor,
    task_id: &str,
    result_status: &str,
    result_summary: Option<&str>,
    result_files: Option<&str>,
    fail_reason: Option<&str>,
    last_result_at: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update tasks set last_result_status = ?, last_result_summary = ?, last_result_files = ?, last_fail_reason = ?, last_result_at = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(result_status.to_string()),
            result_summary
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            result_files
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            fail_reason
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(last_result_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(task_id.to_string()),
        ],
    )
    .await
}

pub async fn clear_task_result_fields(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update tasks set last_result_status = null, last_result_summary = null, last_result_files = null, last_fail_reason = null, last_result_at = null where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}

#[html_sql("sql/task_execution.html")]
pub async fn list_recent_plan_results(
    rb: &dyn Executor,
    plan_id: &str,
    limit: i64,
) -> Vec<TaskExecutionResultRow> {
    impled!()
}

pub async fn delete_results_of_plan(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from task_execution_results where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}

// ===================== plans 执行概览 =====================

#[html_sql("sql/task_execution.html")]
pub async fn list_plan_result_overview(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<TaskOverviewRow> {
    impled!()
}

pub async fn update_plan_execution_overview(
    rb: &dyn Executor,
    plan_id: &str,
    execution_overview: Option<&str>,
    execution_overview_updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update plans set execution_overview = ?, execution_overview_updated_at = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            execution_overview
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(execution_overview_updated_at.to_string()),
            rbs::Value::String(execution_overview_updated_at.to_string()),
            rbs::Value::String(plan_id.to_string()),
        ],
    )
    .await
}

#[html_sql("sql/task_execution.html")]
pub async fn get_plan_stored_overview(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<PlanExecutionOverviewRow> {
    impled!()
}

pub async fn sync_plan_execution_overview(
    rb: &dyn Executor,
    plan_id: &str,
    execution_overview: Option<&str>,
    execution_overview_updated_at: Option<&str>,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update plans set execution_overview = ?, execution_overview_updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            execution_overview
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            execution_overview_updated_at
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(plan_id.to_string()),
        ],
    )
    .await
}

pub async fn clear_plan_execution_overview(
    rb: &dyn Executor,
    plan_id: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update plans set execution_overview = null, execution_overview_updated_at = null, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(plan_id.to_string()),
        ],
    )
    .await
}

// ===================== tasks 进度查询 =====================

#[html_sql("sql/task_execution.html")]
pub async fn list_plan_execution_tasks(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<PlanExecutionTaskRow> {
    impled!()
}
