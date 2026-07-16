use serde::{Deserialize, Serialize};

use super::support::now_rfc3339;
use crate::db;
use crate::mappers::task as task_mapper;
use crate::mappers::task_execution as exec_mapper;
use crate::models::{
    value_to_json_string_opt, PlanExecutionOverviewRow, PlanExecutionTaskRow,
    TaskExecutionLogRow, TaskExecutionResultRow, TaskOverviewRow,
};
use rbatis::executor::Executor;

/// 执行日志数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLog {
    pub id: String,
    pub task_id: String,
    #[serde(rename = "type")]
    pub log_type: String,
    pub content: String,
    pub metadata: Option<String>,
    pub created_at: String,
}

/// 任务执行结果（结构化）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskExecutionResultRecord {
    pub id: String,
    pub task_id: String,
    pub plan_id: String,
    pub task_title_snapshot: String,
    pub task_description_snapshot: Option<String>,
    pub result_status: String, // success | failed
    pub result_summary: Option<String>,
    pub result_files: Vec<String>,
    pub fail_reason: Option<String>,
    pub created_at: String,
}

/// 保存任务执行结果输入
#[derive(Debug, Deserialize)]
pub struct SaveTaskExecutionResultInput {
    pub task_id: String,
    pub result_status: String, // success | failed
    pub result_summary: Option<String>,
    pub result_files: Option<Vec<String>>,
    pub fail_reason: Option<String>,
}

/// 计划维度任务进度项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanExecutionTaskProgress {
    pub task_id: String,
    pub title: String,
    pub status: String,
    pub task_order: i32,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub last_result_status: Option<String>,
    pub last_result_summary: Option<String>,
    pub last_result_files: Vec<String>,
    pub last_fail_reason: Option<String>,
    pub last_result_at: Option<String>,
    pub updated_at: String,
}

/// 计划执行进度总览
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanExecutionProgress {
    pub plan_id: String,
    pub execution_overview: Option<String>,
    pub execution_overview_updated_at: Option<String>,
    pub total_tasks: i32,
    pub pending_count: i32,
    pub in_progress_count: i32,
    pub completed_count: i32,
    pub blocked_count: i32,
    pub cancelled_count: i32,
    pub success_count: i32,
    pub failed_count: i32,
    pub tasks: Vec<PlanExecutionTaskProgress>,
}

/// 执行日志统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLogStats {
    pub task_id: String,
    pub log_count: i32,
    pub last_log_at: Option<String>,
}

fn parse_json_string_array(value: Option<String>) -> Vec<String> {
    match value {
        Some(raw) => serde_json::from_str::<Vec<String>>(&raw).unwrap_or_else(|error| {
            eprintln!(
                "[task_execution] Failed to parse JSON string array: {} | raw={}",
                error, raw
            );
            Vec::new()
        }),
        None => Vec::new(),
    }
}

fn normalize_overview_text(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_overview_text(raw: &str, max_chars: usize) -> String {
    let normalized = normalize_overview_text(raw);
    let total_chars = normalized.chars().count();
    if total_chars <= max_chars {
        return normalized;
    }

    let truncated = normalized.chars().take(max_chars).collect::<String>();
    format!("{}...", truncated)
}

#[derive(Debug, Clone)]
struct OverviewFileEntry {
    path: String,
    locations: Vec<String>,
}

fn format_task_overview_item(title: &str, summary: &str) -> String {
    let compact_summary = truncate_overview_text(summary, 56);
    if compact_summary.is_empty() {
        title.to_string()
    } else {
        format!("{}（{}）", title, compact_summary)
    }
}

fn split_file_reference(raw: &str) -> (String, Option<String>) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return (String::new(), None);
    }

    if let Some(index) = trimmed.rfind("#L") {
        let path = trimmed[..index].trim().to_string();
        let location = trimmed[index + 1..].trim().to_string();
        if !path.is_empty() && !location.is_empty() {
            return (path, Some(location));
        }
    }

    if let Some(last_colon) = trimmed.rfind(':') {
        let suffix = trimmed[last_colon + 1..].trim();
        if !suffix.is_empty() && suffix.chars().all(|ch| ch.is_ascii_digit()) {
            let before = &trimmed[..last_colon];
            if let Some(second_colon) = before.rfind(':') {
                let column = before[second_colon + 1..].trim();
                let path = before[..second_colon].trim();
                if !column.is_empty()
                    && column.chars().all(|ch| ch.is_ascii_digit())
                    && (path.contains('/') || path.contains('\\'))
                {
                    return (path.to_string(), Some(format!("{}:{}", column, suffix)));
                }
            }

            if before.contains('/') || before.contains('\\') {
                return (before.trim().to_string(), Some(suffix.to_string()));
            }
        }
    }

    (trimmed.to_string(), None)
}

fn format_location_label(raw: &str) -> String {
    let trimmed = raw.trim().trim_start_matches('#');
    if trimmed.is_empty() {
        return String::new();
    }

    format!("行 {}", trimmed)
}

fn push_unique_file_entry(target: &mut Vec<OverviewFileEntry>, value: &str) {
    let (path, location) = split_file_reference(value);
    if path.is_empty() {
        return;
    }

    if let Some(existing) = target.iter_mut().find(|entry| entry.path == path) {
        if let Some(location) = location {
            if !location.is_empty() && !existing.locations.iter().any(|item| item == &location) {
                existing.locations.push(location);
            }
        }
        return;
    }

    target.push(OverviewFileEntry {
        path,
        locations: location.into_iter().collect(),
    });
}

fn summarize_location_list(items: &[String], limit: usize) -> String {
    if items.is_empty() {
        return String::new();
    }

    let visible = items
        .iter()
        .take(limit)
        .map(|item| format_location_label(item))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();

    if visible.is_empty() {
        return String::new();
    }

    if items.len() > limit {
        format!("{} 等 {} 处", visible.join("、"), items.len())
    } else {
        visible.join("、")
    }
}

fn format_file_entry(item: &OverviewFileEntry) -> String {
    if item.locations.is_empty() {
        return item.path.clone();
    }

    format!(
        "{}（{}）",
        item.path,
        summarize_location_list(&item.locations, 3)
    )
}

fn summarize_file_entries(items: &[OverviewFileEntry], limit: usize) -> String {
    if items.is_empty() {
        return String::new();
    }

    let visible = items
        .iter()
        .take(limit)
        .map(format_file_entry)
        .collect::<Vec<_>>();

    if items.len() > limit {
        format!("{} 等 {} 项", visible.join("、"), items.len())
    } else {
        visible.join("、")
    }
}

fn summarize_overview_list(items: &[String], limit: usize) -> String {
    if items.is_empty() {
        return String::new();
    }

    let visible = items.iter().take(limit).cloned().collect::<Vec<_>>();
    if items.len() > limit {
        format!("{} 等 {} 项", visible.join("、"), items.len())
    } else {
        visible.join("、")
    }
}

fn summarize_task_file_changes(
    added_files: &[OverviewFileEntry],
    modified_files: &[OverviewFileEntry],
    changed_files: &[OverviewFileEntry],
    deleted_files: &[OverviewFileEntry],
) -> String {
    let mut segments: Vec<String> = Vec::new();

    if !added_files.is_empty() {
        segments.push(format!("新增 {}", summarize_file_entries(added_files, 2)));
    }
    if !modified_files.is_empty() {
        segments.push(format!(
            "修改 {}",
            summarize_file_entries(modified_files, 2)
        ));
    }
    if !changed_files.is_empty() {
        segments.push(format!("变更 {}", summarize_file_entries(changed_files, 2)));
    }
    if !deleted_files.is_empty() {
        segments.push(format!("删除 {}", summarize_file_entries(deleted_files, 2)));
    }

    segments.join("；")
}

/// 构建计划执行概览文本（基于 tasks 表 last_result_* 列实时聚合）。
async fn build_plan_execution_overview(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<String, String> {
    let records: Vec<TaskOverviewRow> = exec_mapper::list_plan_result_overview(rb, plan_id)
        .await
        .map_err(|e| e.to_string())?;

    if records.is_empty() {
        return Ok(String::new());
    }

    let mut success_items: Vec<String> = Vec::new();
    let mut failed_items: Vec<String> = Vec::new();

    for row in records.iter() {
        let title = row.title.clone().unwrap_or_default();
        let status = row.last_result_status.clone();
        let summary_text = row.last_result_summary.as_deref().unwrap_or_default();
        let files = parse_json_string_array(value_to_json_string_opt(row.last_result_files.clone()));
        let fail_reason = row.last_fail_reason.clone();

        let mut added_files: Vec<OverviewFileEntry> = Vec::new();
        let mut modified_files: Vec<OverviewFileEntry> = Vec::new();
        let mut changed_files: Vec<OverviewFileEntry> = Vec::new();
        let mut deleted_files: Vec<OverviewFileEntry> = Vec::new();

        for raw_file in &files {
            if let Some(path) = raw_file.strip_prefix("added:") {
                push_unique_file_entry(&mut added_files, path.trim());
                continue;
            }
            if let Some(path) = raw_file.strip_prefix("modified:") {
                push_unique_file_entry(&mut modified_files, path.trim());
                continue;
            }
            if let Some(path) = raw_file.strip_prefix("changed:") {
                push_unique_file_entry(&mut changed_files, path.trim());
                continue;
            }
            if let Some(path) = raw_file.strip_prefix("deleted:") {
                push_unique_file_entry(&mut deleted_files, path.trim());
                continue;
            }
            push_unique_file_entry(&mut changed_files, raw_file.trim());
        }

        match status.as_deref() {
            Some("success") => {
                let file_changes = summarize_task_file_changes(
                    &added_files,
                    &modified_files,
                    &changed_files,
                    &deleted_files,
                );
                if !file_changes.is_empty() {
                    success_items.push(format!("{}（{}）", title, file_changes));
                } else {
                    success_items.push(format_task_overview_item(&title, summary_text));
                }
            }
            Some("failed") => {
                let reason =
                    truncate_overview_text(fail_reason.as_deref().unwrap_or(summary_text), 48);
                if reason.is_empty() {
                    failed_items.push(title.clone());
                } else {
                    failed_items.push(format!("{}（{}）", title, reason));
                }
            }
            _ => {}
        }
    }

    let executed_count = success_items.len() + failed_items.len();
    let mut segments = vec![format!(
        "成功 {} 个，失败 {} 个",
        success_items.len(),
        failed_items.len()
    )];

    if !success_items.is_empty() {
        segments.push(format!(
            "成功任务：{}",
            summarize_overview_list(&success_items, 4)
        ));
    }

    if !failed_items.is_empty() {
        segments.push(format!(
            "失败任务：{}",
            summarize_overview_list(&failed_items, 3)
        ));
    }

    if executed_count == 0 {
        return Ok(String::new());
    }

    Ok(format!("{}。", segments.join("；")))
}

/// 创建任务执行日志
#[tauri::command]
pub async fn create_task_execution_log(
    task_id: String,
    log_type: String,
    content: String,
    metadata: Option<String>,
) -> Result<ExecutionLog, String> {
    let rb = db::rb();
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    exec_mapper::insert_task_execution_log(
        rb,
        &id,
        &task_id,
        &log_type,
        &content,
        metadata.as_deref(),
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ExecutionLog {
        id,
        task_id,
        log_type,
        content,
        metadata,
        created_at: now,
    })
}

/// 更新任务执行日志内容。
#[tauri::command]
pub async fn update_task_execution_log(
    id: String,
    content: String,
    metadata: Option<String>,
) -> Result<(), String> {
    let rb = db::rb();
    exec_mapper::update_task_execution_log(rb, &id, &content, metadata.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取任务的执行日志列表
#[tauri::command]
pub async fn list_task_execution_logs(task_id: String) -> Result<Vec<ExecutionLog>, String> {
    let rb = db::rb();
    let rows = exec_mapper::list_task_execution_logs(rb, &task_id)
        .await
        .map_err(|e| e.to_string())?;

    let logs = rows
        .into_iter()
        .map(|row: TaskExecutionLogRow| ExecutionLog {
            id: row.id.unwrap_or_default(),
            task_id: row.task_id.unwrap_or_default(),
            log_type: row.log_type.unwrap_or_default(),
            content: row.content.unwrap_or_default(),
            metadata: value_to_json_string_opt(row.metadata),
            created_at: row.created_at.unwrap_or_default(),
        })
        .collect();

    Ok(logs)
}

/// 清除任务的执行日志
#[tauri::command]
pub async fn clear_task_execution_logs(task_id: String) -> Result<(), String> {
    let rb = db::rb();
    exec_mapper::clear_task_execution_logs(rb, &task_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 保存任务执行结果（完成/失败）
#[tauri::command]
pub async fn save_task_execution_result(
    input: SaveTaskExecutionResultInput,
) -> Result<TaskExecutionResultRecord, String> {
    let rb = db::rb();
    let now = now_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    // 读取任务快照（plan_id / title / description）—— 复用 task mapper
    let task_row = task_mapper::get_task_by_id(rb, &input.task_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("Task not found: {}", input.task_id))?;
    let plan_id = task_row
        .plan_id
        .clone()
        .ok_or_else(|| format!("Task {} has no plan_id", input.task_id))?;
    let task_title_snapshot = task_row.title.clone().unwrap_or_default();
    let task_description_snapshot = task_row.description.clone();

    let result_files = input.result_files.unwrap_or_default();
    let result_files_json = if result_files.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&result_files).map_err(|e| e.to_string())?)
    };

    // 多步写入放入事务，保证原子性（原实现为单连接多 execute，这里显式事务更安全）
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    exec_mapper::insert_task_execution_result(
        &tx,
        &id,
        &input.task_id,
        &plan_id,
        &task_title_snapshot,
        task_description_snapshot.as_deref(),
        &input.result_status,
        input.result_summary.as_deref(),
        result_files_json.as_deref(),
        input.fail_reason.as_deref(),
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    exec_mapper::apply_result_to_task(
        &tx,
        &input.task_id,
        &input.result_status,
        input.result_summary.as_deref(),
        result_files_json.as_deref(),
        input.fail_reason.as_deref(),
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    task_mapper::touch_plan_updated_at(&tx, &plan_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    let execution_overview = build_plan_execution_overview(&tx, &plan_id).await?;
    let overview_value = if execution_overview.trim().is_empty() {
        None
    } else {
        Some(execution_overview.as_str())
    };
    exec_mapper::update_plan_execution_overview(&tx, &plan_id, overview_value, &now)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(TaskExecutionResultRecord {
        id,
        task_id: input.task_id,
        plan_id,
        task_title_snapshot,
        task_description_snapshot,
        result_status: input.result_status,
        result_summary: input.result_summary,
        result_files,
        fail_reason: input.fail_reason,
        created_at: now,
    })
}

/// 获取计划下最近 N 条任务执行结果（用于下一个任务上下文）
#[tauri::command]
pub async fn list_recent_plan_results(
    plan_id: String,
    limit: Option<i32>,
) -> Result<Vec<TaskExecutionResultRecord>, String> {
    let rb = db::rb();
    let safe_limit = limit.unwrap_or(50).clamp(1, 500) as i64;

    let rows = exec_mapper::list_recent_plan_results(rb, &plan_id, safe_limit)
        .await
        .map_err(|e| e.to_string())?;

    let records = rows
        .into_iter()
        .map(|row: TaskExecutionResultRow| TaskExecutionResultRecord {
            id: row.id.unwrap_or_default(),
            task_id: row.task_id.unwrap_or_default(),
            plan_id: row.plan_id.unwrap_or_default(),
            task_title_snapshot: row.task_title_snapshot.unwrap_or_default(),
            task_description_snapshot: row.task_description_snapshot,
            result_status: row.result_status.unwrap_or_default(),
            result_summary: row.result_summary,
            result_files: parse_json_string_array(value_to_json_string_opt(row.result_files)),
            fail_reason: row.fail_reason,
            created_at: row.created_at.unwrap_or_default(),
        })
        .collect();

    Ok(records)
}

/// 获取计划执行进度详情（右侧面板使用）
#[tauri::command]
pub async fn list_plan_execution_progress(plan_id: String) -> Result<PlanExecutionProgress, String> {
    let rb = db::rb();

    let task_rows = exec_mapper::list_plan_execution_tasks(rb, &plan_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut tasks: Vec<PlanExecutionTaskProgress> = task_rows
        .into_iter()
        .map(|row: PlanExecutionTaskRow| PlanExecutionTaskProgress {
            task_id: row.id.unwrap_or_default(),
            title: row.title.unwrap_or_default(),
            status: row.status.unwrap_or_default(),
            task_order: row.task_order.unwrap_or(0) as i32,
            expert_id: row.expert_id,
            agent_id: row.agent_id,
            model_id: row.model_id,
            last_result_status: row.last_result_status,
            last_result_summary: row.last_result_summary,
            last_result_files: parse_json_string_array(value_to_json_string_opt(row.last_result_files)),
            last_fail_reason: row.last_fail_reason,
            last_result_at: row.last_result_at,
            updated_at: row.updated_at.unwrap_or_default(),
        })
        .collect();

    let computed_execution_overview = build_plan_execution_overview(rb, &plan_id).await?;
    let computed_execution_overview = if computed_execution_overview.trim().is_empty() {
        None
    } else {
        Some(computed_execution_overview)
    };
    let computed_execution_overview_updated_at = tasks
        .iter()
        .filter_map(|task| task.last_result_at.clone())
        .max();

    let stored: PlanExecutionOverviewRow =
        exec_mapper::get_plan_stored_overview(rb, &plan_id)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .next()
            .unwrap_or(PlanExecutionOverviewRow {
                execution_overview: None,
                execution_overview_updated_at: None,
            });

    let stored_execution_overview = value_to_json_string_opt(stored.execution_overview);
    if stored_execution_overview != computed_execution_overview
        || stored.execution_overview_updated_at != computed_execution_overview_updated_at
    {
        exec_mapper::sync_plan_execution_overview(
            rb,
            &plan_id,
            computed_execution_overview.as_deref(),
            computed_execution_overview_updated_at.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    let mut progress = PlanExecutionProgress {
        plan_id,
        execution_overview: computed_execution_overview,
        execution_overview_updated_at: computed_execution_overview_updated_at,
        total_tasks: tasks.len() as i32,
        pending_count: 0,
        in_progress_count: 0,
        completed_count: 0,
        blocked_count: 0,
        cancelled_count: 0,
        success_count: 0,
        failed_count: 0,
        tasks: Vec::new(),
    };

    for task in &tasks {
        match task.status.as_str() {
            "pending" => progress.pending_count += 1,
            "in_progress" => progress.in_progress_count += 1,
            "completed" => progress.completed_count += 1,
            "blocked" => progress.blocked_count += 1,
            "cancelled" => progress.cancelled_count += 1,
            _ => {}
        }

        match task.last_result_status.as_deref() {
            Some("success") => progress.success_count += 1,
            Some("failed") => progress.failed_count += 1,
            _ => {}
        }
    }

    progress.tasks = std::mem::take(&mut tasks);

    Ok(progress)
}

/// 获取任务执行日志统计
#[tauri::command]
pub async fn get_task_execution_log_stats(task_id: String) -> Result<ExecutionLogStats, String> {
    let rb = db::rb();

    let count = exec_mapper::count_task_execution_logs(rb, &task_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .unwrap_or(0);

    let last_log_at = exec_mapper::get_last_log_created_at(rb, &task_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .and_then(|row| crate::models::value_to_json_string_opt(row.value));

    Ok(ExecutionLogStats {
        task_id,
        log_count: count as i32,
        last_log_at,
    })
}

/// 清除计划的执行结果（同时清除关联任务的日志）
#[tauri::command]
pub async fn clear_plan_execution_results(plan_id: String) -> Result<i32, String> {
    let rb = db::rb();
    let now = now_rfc3339();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    // 获取计划下所有任务 ID
    let id_rows = exec_mapper::list_task_ids_of_plan(&tx, &plan_id)
        .await
        .map_err(|e| e.to_string())?;
    let task_ids: Vec<String> = id_rows
        .into_iter()
        .filter_map(|row| crate::models::value_to_json_string_opt(row.value))
        .collect();

    // 清除任务执行日志（foreach IN）
    let logs_deleted = if task_ids.is_empty() {
        0u64
    } else {
        exec_mapper::delete_logs_for_tasks(&tx, &task_ids)
            .await
            .map_err(|e| e.to_string())?
            .rows_affected
    };

    let results_deleted = exec_mapper::delete_results_of_plan(&tx, &plan_id)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected;

    exec_mapper::clear_task_result_fields(&tx, &plan_id)
        .await
        .map_err(|e| e.to_string())?;

    exec_mapper::clear_plan_execution_overview(&tx, &plan_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(logs_deleted as i32 + results_deleted as i32)
}
