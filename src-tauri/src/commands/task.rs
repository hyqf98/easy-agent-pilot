use serde::{Deserialize, Serialize};

use super::support::now_rfc3339;
use crate::db;
use crate::mappers::task as task_mapper;
use crate::mappers::task::{TaskInsert, TaskUpdate};
use crate::models::{
    value_to_json_string_opt, SplitSessionRow, TaskRow, TaskRuntimeBindingRow,
};
use rbatis::executor::Executor;

/// 任务数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub project_id: Option<String>,
    pub plan_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub expert_id: Option<String>,
    /// 执行智能体 ID */
    pub agent_id: Option<String>,
    /// 执行模型 ID */
    pub model_id: Option<String>,
    pub session_id: Option<String>,
    pub cli_session_provider: Option<String>,
    pub progress_file: Option<String>,
    pub dependencies: Option<Vec<String>>,
    pub order: i32,
    pub retry_count: i32,
    pub max_retries: i32,
    pub error_message: Option<String>,
    pub implementation_steps: Option<Vec<String>>,
    pub test_steps: Option<Vec<String>>,
    pub acceptance_criteria: Option<Vec<String>>,
    pub memory_library_ids: Option<Vec<String>>,
    pub block_reason: Option<String>,
    pub input_request: Option<serde_json::Value>,
    pub input_response: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

/// 任务运行时绑定。
/// 任务在不同 CLI 运行时下会产生各自独立的外部恢复游标，必须按 runtime_key 隔离存储。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRuntimeBinding {
    pub task_id: String,
    pub runtime_key: String,
    pub external_session_id: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Rust 后端返回的结构（snake_case）
///
/// 保留 pub 以维持模块对外 API（unattended 等模块历史引用）；迁移到 rbatis 后
/// 由 [`transform_task`] 直接消费 `TaskRow`，此结构仅作兼容占位。
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustTask {
    pub id: String,
    pub project_id: Option<String>,
    pub plan_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub session_id: Option<String>,
    pub cli_session_provider: Option<String>,
    pub progress_file: Option<String>,
    pub dependencies: Option<String>,
    pub task_order: i32,
    pub retry_count: i32,
    pub max_retries: i32,
    pub error_message: Option<String>,
    pub implementation_steps: Option<String>,
    pub test_steps: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub memory_library_ids: Option<String>,
    pub block_reason: Option<String>,
    pub input_request: Option<String>,
    pub input_response: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(untagged)]
pub enum UpdateField<T> {
    Value(T),
    Null,
    #[default]
    Missing,
}

/// 创建任务输入
#[derive(Debug, Deserialize)]
pub struct CreateTaskInput {
    pub plan_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub assignee: Option<String>,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub dependencies: Option<Vec<String>>,
    pub order: Option<i32>,
    pub max_retries: Option<i32>,
    pub implementation_steps: Option<Vec<String>>,
    pub test_steps: Option<Vec<String>>,
    pub acceptance_criteria: Option<Vec<String>>,
    pub memory_library_ids: Option<Vec<String>>,
}

/// 更新任务输入
#[derive(Debug, Deserialize)]
pub struct UpdateTaskInput {
    #[serde(default)]
    pub title: UpdateField<String>,
    #[serde(default)]
    pub description: UpdateField<String>,
    #[serde(default)]
    pub status: UpdateField<String>,
    #[serde(default)]
    pub priority: UpdateField<String>,
    #[serde(default)]
    pub assignee: UpdateField<String>,
    #[serde(default)]
    pub expert_id: UpdateField<String>,
    #[serde(default)]
    pub agent_id: UpdateField<String>,
    #[serde(default)]
    pub model_id: UpdateField<String>,
    #[serde(default)]
    pub session_id: UpdateField<String>,
    #[serde(default)]
    pub cli_session_provider: UpdateField<String>,
    #[serde(default)]
    pub progress_file: UpdateField<String>,
    #[serde(default)]
    pub dependencies: UpdateField<Vec<String>>,
    #[serde(default)]
    pub order: UpdateField<i32>,
    #[serde(default)]
    pub retry_count: UpdateField<i32>,
    #[serde(default)]
    pub max_retries: UpdateField<i32>,
    #[serde(default)]
    pub error_message: UpdateField<String>,
    #[serde(default)]
    pub implementation_steps: UpdateField<Vec<String>>,
    #[serde(default)]
    pub test_steps: UpdateField<Vec<String>>,
    #[serde(default)]
    pub acceptance_criteria: UpdateField<Vec<String>>,
    #[serde(default)]
    pub memory_library_ids: UpdateField<Vec<String>>,
    #[serde(default)]
    pub block_reason: UpdateField<String>,
    #[serde(default)]
    pub input_request: UpdateField<serde_json::Value>,
    #[serde(default)]
    pub input_response: UpdateField<serde_json::Value>,
}

/// 批量更新任务顺序输入
#[derive(Debug, Deserialize)]
pub struct ReorderTasksInput {
    pub task_orders: Vec<TaskOrderItem>,
}

#[derive(Debug, Deserialize)]
pub struct TaskOrderItem {
    pub id: String,
    pub order: i32,
}

fn has_update<T>(field: &UpdateField<T>) -> bool {
    !matches!(field, UpdateField::Missing)
}

fn normalize_memory_library_ids(library_ids: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();

    for library_id in library_ids {
        let trimmed = library_id.trim();
        if trimmed.is_empty() || normalized.iter().any(|existing| existing == trimmed) {
            continue;
        }
        normalized.push(trimmed.to_string());
    }

    normalized
}

fn serialize_json_option<T: Serialize>(value: Option<&T>, fallback: &str) -> Option<String> {
    value.map(|value| serde_json::to_string(value).unwrap_or_else(|_| fallback.to_string()))
}

/// 读取任务关联的 memory library id 列表。
async fn fetch_task_memory_library_ids(
    rb: &dyn Executor,
    task_id: &str,
) -> Result<Vec<String>, String> {
    let rows = task_mapper::list_task_memory_library_ids(rb, task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| crate::models::value_to_json_string_opt(row.value))
        .collect::<Vec<_>>())
}

/// 用新的 memory library 列表替换任务的关联（删除旧关联 + 逐条插入）。
async fn replace_task_memory_libraries(
    rb: &dyn Executor,
    task_id: &str,
    library_ids: &[String],
    now: &str,
) -> Result<(), String> {
    task_mapper::delete_task_memory_libraries(rb, task_id)
        .await
        .map_err(|e| e.to_string())?;

    for library_id in normalize_memory_library_ids(library_ids) {
        task_mapper::insert_task_memory_library(rb, task_id, &library_id, now)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 解析 JSON 字符串列为 Vec<String>（失败返回空）。
fn parse_json_string_array(value: Option<String>) -> Vec<String> {
    match value {
        Some(raw) => serde_json::from_str::<Vec<String>>(&raw).unwrap_or_else(|error| {
            eprintln!(
                "[task] Failed to parse JSON string array: {} | raw={}",
                error, raw
            );
            Vec::new()
        }),
        None => Vec::new(),
    }
}

/// 将 TaskRow 转换为对外 Task DTO。
///
/// memory_library_ids 优先用关联表的真实数据（N+1 查询，保留原行为）；
/// 行内的 memory_library_ids 列作为兜底（批量创建等未写关联表的场景）。
async fn transform_task_row(rb: &dyn Executor, row: TaskRow) -> Result<Task, String> {
    let task_id = row.id.clone().unwrap_or_default();
    let linked_library_ids = if task_id.is_empty() {
        Vec::new()
    } else {
        fetch_task_memory_library_ids(rb, &task_id).await?
    };

    let memory_library_ids = if linked_library_ids.is_empty() {
        let column_value = row
            .memory_library_ids
            .as_ref()
            .map(|s| parse_json_string_array(value_to_json_string_opt(Some(s.clone()))));
        match column_value {
            Some(parsed) if !parsed.is_empty() => Some(parsed),
            _ => Some(linked_library_ids),
        }
    } else {
        Some(linked_library_ids)
    };

    Ok(Task {
        id: row.id.unwrap_or_default(),
        project_id: row.project_id,
        plan_id: row.plan_id.unwrap_or_default(),
        parent_id: row.parent_id,
        title: row.title.unwrap_or_default(),
        description: row.description,
        status: row.status.unwrap_or_else(|| "pending".to_string()),
        priority: row.priority.unwrap_or_else(|| "medium".to_string()),
        assignee: row.assignee,
        expert_id: row.expert_id,
        agent_id: row.agent_id,
        model_id: row.model_id,
        session_id: row.session_id,
        cli_session_provider: row.cli_session_provider,
        progress_file: row.progress_file,
        dependencies: value_to_json_string_opt(row.dependencies)
            .and_then(|s| serde_json::from_str(&s).ok()),
        order: row.task_order.unwrap_or(0) as i32,
        retry_count: row.retry_count.unwrap_or(0) as i32,
        max_retries: row.max_retries.unwrap_or(0) as i32,
        error_message: row.error_message,
        implementation_steps: value_to_json_string_opt(row.implementation_steps)
            .and_then(|s| serde_json::from_str(&s).ok()),
        test_steps: value_to_json_string_opt(row.test_steps)
            .and_then(|s| serde_json::from_str(&s).ok()),
        acceptance_criteria: value_to_json_string_opt(row.acceptance_criteria)
            .and_then(|s| serde_json::from_str(&s).ok()),
        memory_library_ids,
        block_reason: row.block_reason,
        input_request: value_to_json_string_opt(row.input_request)
            .and_then(|s| serde_json::from_str(&s).ok()),
        input_response: value_to_json_string_opt(row.input_response)
            .and_then(|s| serde_json::from_str(&s).ok()),
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    })
}

/// 批量转换行 → Task 列表。
async fn transform_task_rows(rb: &dyn Executor, rows: Vec<TaskRow>) -> Result<Vec<Task>, String> {
    let mut tasks = Vec::with_capacity(rows.len());
    for row in rows {
        tasks.push(transform_task_row(rb, row).await?);
    }
    Ok(tasks)
}

/// 递归收集任务子树 id（含自身）。
async fn collect_task_subtree_ids(rb: &dyn Executor, task_id: &str) -> Result<Vec<String>, String> {
    let rows = task_mapper::collect_task_subtree_ids(rb, task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| crate::models::value_to_json_string_opt(row.value))
        .collect())
}

/// 解析 plan_id（单任务）。
async fn resolve_plan_id_of_task(rb: &dyn Executor, id: &str) -> Result<String, String> {
    task_mapper::get_plan_id_of_task(rb, id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .and_then(|row| crate::models::value_to_json_string_opt(row.value))
        .ok_or_else(|| format!("Task not found: {}", id))
}

/// 解析 plan 对应 project_id。
async fn resolve_task_project_id(rb: &dyn Executor, plan_id: &str) -> Result<String, String> {
    task_mapper::get_project_id_of_plan(rb, plan_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .and_then(|row| crate::models::value_to_json_string_opt(row.value))
        .ok_or_else(|| format!("Plan not found for task: {}", plan_id))
}

/// 清理已删任务的级联引用（事务内）：
/// - 删除 agent_cli_usage_records
/// - 置空 plans.current_task_id
/// - 过滤其它任务 dependencies 中对已删任务的引用
async fn cleanup_deleted_task_references(
    tx: &dyn Executor,
    plan_id: &str,
    deleted_task_ids: &[String],
    now: &str,
) -> Result<(), String> {
    use std::collections::HashSet;

    if deleted_task_ids.is_empty() {
        return Ok(());
    }

    let deleted_set: HashSet<String> = deleted_task_ids.iter().cloned().collect();

    task_mapper::delete_agent_cli_usage_for_tasks(tx, deleted_task_ids)
        .await
        .map_err(|e| e.to_string())?;
    task_mapper::nullify_plan_current_task_for_tasks(tx, deleted_task_ids, now)
        .await
        .map_err(|e| e.to_string())?;

    let dependency_rows = task_mapper::list_plan_dependencies(tx, plan_id)
        .await
        .map_err(|e| e.to_string())?;

    for dep_row in dependency_rows {
        let Some(task_id) = dep_row.id else {
            continue;
        };
        if deleted_set.contains(&task_id) {
            continue;
        }
        let Some(dependencies_json) = value_to_json_string_opt(dep_row.dependencies) else {
            continue;
        };
        let dependencies: Vec<String> =
            serde_json::from_str(&dependencies_json).unwrap_or_default();
        if dependencies.is_empty() {
            continue;
        }

        let filtered: Vec<String> = dependencies
            .into_iter()
            .filter(|id| !deleted_set.contains(id))
            .collect();
        let filtered_json =
            serde_json::to_string(&filtered).map_err(|e| e.to_string())?;

        if filtered_json == dependencies_json {
            continue;
        }

        task_mapper::update_task_dependencies(tx, &task_id, rbs::Value::String(filtered_json), now)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 将 RuntimeBindingRow 转换为对外 DTO。
fn transform_runtime_binding(row: TaskRuntimeBindingRow) -> Result<TaskRuntimeBinding, String> {
    Ok(TaskRuntimeBinding {
        task_id: row.task_id.unwrap_or_default(),
        runtime_key: row.runtime_key.unwrap_or_default(),
        external_session_id: row.external_session_id.unwrap_or_default(),
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    })
}

/// 获取指定计划的所有任务
#[tauri::command]
pub async fn list_tasks(plan_id: String) -> Result<Vec<Task>, String> {
    let rb = db::rb();
    let rows = task_mapper::list_tasks_by_plan(rb, &plan_id)
        .await
        .map_err(|e| e.to_string())?;
    transform_task_rows(rb, rows).await
}

/// 获取项目下未挂载到有效计划的任务。
/// 用途：支持计划页在“未选择计划”时展示项目级直接待办任务或历史脏数据任务。
#[tauri::command]
pub async fn list_project_unplanned_tasks(project_id: String) -> Result<Vec<Task>, String> {
    let rb = db::rb();
    let rows = task_mapper::list_project_unplanned_tasks(rb, &project_id)
        .await
        .map_err(|e| e.to_string())?;
    transform_task_rows(rb, rows).await
}

/// 获取单个任务
#[tauri::command]
pub async fn get_task(id: String) -> Result<Task, String> {
    let rb = db::rb();
    let row = task_mapper::get_task_by_id(rb, &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("Task not found: {}", id))?;
    transform_task_row(rb, row).await
}

/// 创建新任务
#[tauri::command]
pub async fn create_task(input: CreateTaskInput) -> Result<Task, String> {
    let rb = db::rb();
    let project_id = resolve_task_project_id(rb, &input.plan_id).await?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let status = "pending".to_string();
    let priority = input.priority.unwrap_or_else(|| "medium".to_string());
    let dependencies_json = serialize_json_option(input.dependencies.as_ref(), "[]");
    let max_retries = input.max_retries.unwrap_or(3);
    let implementation_steps_json =
        serialize_json_option(input.implementation_steps.as_ref(), "[]");
    let test_steps_json = serialize_json_option(input.test_steps.as_ref(), "[]");
    let acceptance_criteria_json = serialize_json_option(input.acceptance_criteria.as_ref(), "[]");
    let memory_library_ids_json = serialize_json_option(input.memory_library_ids.as_ref(), "[]");

    // 如果没有指定顺序，获取当前最大顺序 + 1
    let task_order: i64 = match input.order {
        Some(order) => order as i64,
        None => {
            let max = task_mapper::get_max_task_order_of_plan(rb, &input.plan_id)
                .await
                .map_err(|e| e.to_string())?
                .into_iter()
                .next()
                .and_then(|row| row.value)
                .unwrap_or(-1);
            max + 1
        }
    };

    let row = TaskInsert {
        id: &id,
        project_id: &project_id,
        plan_id: &input.plan_id,
        parent_id: input.parent_id.as_deref(),
        title: &input.title,
        description: input.description.as_deref(),
        status: &status,
        priority: &priority,
        assignee: input.assignee.as_deref(),
        expert_id: input.expert_id.as_deref(),
        agent_id: input.agent_id.as_deref(),
        model_id: input.model_id.as_deref(),
        session_id: None,
        cli_session_provider: None,
        progress_file: None,
        dependencies: dependencies_json.map(rbs::Value::String),
        task_order,
        retry_count: 0,
        max_retries: max_retries as i64,
        error_message: None,
        implementation_steps: implementation_steps_json.map(rbs::Value::String),
        test_steps: test_steps_json.map(rbs::Value::String),
        acceptance_criteria: acceptance_criteria_json.map(rbs::Value::String),
        memory_library_ids: memory_library_ids_json.map(rbs::Value::String),
        created_at: &now,
        updated_at: &now,
    };

    task_mapper::insert_task(rb, &row)
        .await
        .map_err(|e| e.to_string())?;

    replace_task_memory_libraries(
        rb,
        &id,
        input.memory_library_ids.as_deref().unwrap_or(&[]),
        &now,
    )
    .await?;

    // 更新计划的 updated_at 时间
    task_mapper::touch_plan_updated_at(rb, &input.plan_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    Ok(Task {
        id,
        project_id: Some(project_id),
        plan_id: input.plan_id,
        parent_id: input.parent_id,
        title: input.title,
        description: input.description,
        status,
        priority,
        assignee: input.assignee,
        expert_id: input.expert_id,
        agent_id: input.agent_id,
        model_id: input.model_id,
        session_id: None,
        cli_session_provider: None,
        progress_file: None,
        dependencies: input.dependencies,
        order: task_order as i32,
        retry_count: 0,
        max_retries,
        error_message: None,
        implementation_steps: input.implementation_steps,
        test_steps: input.test_steps,
        acceptance_criteria: input.acceptance_criteria,
        memory_library_ids: Some(normalize_memory_library_ids(
            input.memory_library_ids.as_deref().unwrap_or(&[]),
        )),
        block_reason: None,
        input_request: None,
        input_response: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 把 UpdateField<T> 映射为 (has, Option<String>)：Value→(true, Some(s))，
/// Null→(true, None)，Missing→(false, None)。
fn field_to_str(field: &UpdateField<String>) -> (bool, Option<String>) {
    match field {
        UpdateField::Value(v) => (true, Some(v.clone())),
        UpdateField::Null => (true, None),
        UpdateField::Missing => (false, None),
    }
}

/// 把 UpdateField<Vec<String>> 映射为 (has, Option<String JSON>)。
fn field_to_json_vec(field: &UpdateField<Vec<String>>) -> (bool, Option<String>) {
    match field {
        UpdateField::Value(v) => (true, Some(serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))),
        UpdateField::Null => (true, None),
        UpdateField::Missing => (false, None),
    }
}

/// 把 UpdateField<serde_json::Value> 映射为 (has, Option<String JSON>)。
fn field_to_json_value(field: &UpdateField<serde_json::Value>, fallback: &str) -> (bool, Option<String>) {
    match field {
        UpdateField::Value(v) => (true, Some(serde_json::to_string(v).unwrap_or_else(|_| fallback.to_string()))),
        UpdateField::Null => (true, None),
        UpdateField::Missing => (false, None),
    }
}

/// 把 UpdateField<i32> 映射为 (has, Option<i64>)。
fn field_to_i64(field: &UpdateField<i32>) -> (bool, Option<i64>) {
    match field {
        UpdateField::Value(v) => (true, Some(*v as i64)),
        UpdateField::Null => (true, None),
        UpdateField::Missing => (false, None),
    }
}

/// 更新任务
#[tauri::command]
pub async fn update_task(id: String, input: UpdateTaskInput) -> Result<Task, String> {
    let rb = db::rb();
    let now = now_rfc3339();

    let (has_title, title) = field_to_str(&input.title);
    let (has_description, description) = field_to_str(&input.description);
    let (has_status, status) = field_to_str(&input.status);
    let (has_priority, priority) = field_to_str(&input.priority);
    let (has_assignee, assignee) = field_to_str(&input.assignee);
    let (has_expert_id, expert_id) = field_to_str(&input.expert_id);
    let (has_agent_id, agent_id) = field_to_str(&input.agent_id);
    let (has_model_id, model_id) = field_to_str(&input.model_id);
    let (has_session_id, session_id) = field_to_str(&input.session_id);
    let (has_cli_session_provider, cli_session_provider) = field_to_str(&input.cli_session_provider);
    let (has_progress_file, progress_file) = field_to_str(&input.progress_file);
    let (has_dependencies, dependencies) = field_to_json_vec(&input.dependencies);
    let (has_order, order_value) = field_to_i64(&input.order);
    let (has_retry_count, retry_count) = field_to_i64(&input.retry_count);
    let (has_max_retries, max_retries) = field_to_i64(&input.max_retries);
    let (has_error_message, error_message) = field_to_str(&input.error_message);
    let (has_implementation_steps, implementation_steps) = field_to_json_vec(&input.implementation_steps);
    let (has_test_steps, test_steps) = field_to_json_vec(&input.test_steps);
    let (has_acceptance_criteria, acceptance_criteria) = field_to_json_vec(&input.acceptance_criteria);
    let (has_memory_library_ids, memory_library_ids) = field_to_json_vec(&input.memory_library_ids);
    let (has_block_reason, block_reason) = field_to_str(&input.block_reason);
    let (has_input_request, input_request) = field_to_json_value(&input.input_request, "{}");
    let (has_input_response, input_response) = field_to_json_value(&input.input_response, "{}");

    let update = TaskUpdate {
        id: id.clone(),
        updated_at: now.clone(),
        has_title,
        has_description,
        has_status,
        has_priority,
        has_assignee,
        has_expert_id,
        has_agent_id,
        has_model_id,
        has_session_id,
        has_cli_session_provider,
        has_progress_file,
        has_dependencies,
        has_order,
        has_retry_count,
        has_max_retries,
        has_error_message,
        has_implementation_steps,
        has_test_steps,
        has_acceptance_criteria,
        has_memory_library_ids,
        has_block_reason,
        has_input_request,
        has_input_response,
        title,
        description,
        status,
        priority,
        assignee,
        expert_id,
        agent_id,
        model_id,
        session_id,
        cli_session_provider,
        progress_file,
        dependencies: dependencies.map(rbs::Value::String),
        order_value,
        retry_count,
        max_retries,
        error_message,
        implementation_steps: implementation_steps.map(rbs::Value::String),
        test_steps: test_steps.map(rbs::Value::String),
        acceptance_criteria: acceptance_criteria.map(rbs::Value::String),
        memory_library_ids: memory_library_ids.map(rbs::Value::String),
        block_reason,
        input_request: input_request.map(rbs::Value::String),
        input_response: input_response.map(rbs::Value::String),
    };

    task_mapper::update_task(rb, &update)
        .await
        .map_err(|e| e.to_string())?;

    if has_update(&input.memory_library_ids) {
        let library_ids = match &input.memory_library_ids {
            UpdateField::Value(value) => value.clone(),
            _ => Vec::new(),
        };
        replace_task_memory_libraries(rb, &id, &library_ids, &now).await?;
    }

    // 更新计划的 updated_at 时间
    let plan_id = resolve_plan_id_of_task(rb, &id).await?;
    task_mapper::touch_plan_updated_at(rb, &plan_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    // 获取更新后的任务
    let row = task_mapper::get_task_by_id(rb, &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("Task not found after update: {}", id))?;
    transform_task_row(rb, row).await
}

/// 批量更新任务顺序
#[tauri::command]
pub async fn reorder_tasks(input: ReorderTasksInput) -> Result<(), String> {
    let rb = db::rb();
    let now = now_rfc3339();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    for item in input.task_orders {
        task_mapper::reorder_one_task(&tx, &item.id, item.order as i64, &now)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

/// 删除任务
#[tauri::command]
pub async fn delete_task(id: String) -> Result<(), String> {
    let rb = db::rb();
    let now = now_rfc3339();

    // 先收集子树 id（含自身），用于级联引用清理
    let deleted_task_ids = collect_task_subtree_ids(rb, &id).await?;
    if deleted_task_ids.is_empty() {
        return Ok(());
    }

    let plan_id = resolve_plan_id_of_task(rb, &id).await?;

    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;
    cleanup_deleted_task_references(&tx, &plan_id, &deleted_task_ids, &now).await?;

    // 与原实现一致：仅删除根任务本身（子树 id 仅用于引用清理）
    task_mapper::delete_task_by_id(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取任务的子任务
#[tauri::command]
pub async fn list_subtasks(parent_id: String) -> Result<Vec<Task>, String> {
    let rb = db::rb();
    let rows = task_mapper::list_subtasks_by_parent(rb, &parent_id)
        .await
        .map_err(|e| e.to_string())?;
    transform_task_rows(rb, rows).await
}

/// 重试任务 - 重置重试计数并恢复pending状态
#[tauri::command]
pub async fn retry_task(id: String) -> Result<Task, String> {
    let rb = db::rb();
    let now = now_rfc3339();

    task_mapper::retry_task(rb, &id, &now)
        .await
        .map_err(|e| e.to_string())?;

    let row = task_mapper::get_task_by_id(rb, &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("Task not found after retry: {}", id))?;
    transform_task_row(rb, row).await
}

/// 批量更新任务状态
#[tauri::command]
pub async fn batch_update_status(plan_id: String, status: String) -> Result<Vec<Task>, String> {
    let rb = db::rb();
    let now = now_rfc3339();

    // 只更新 pending 状态的任务
    task_mapper::batch_update_status(rb, &plan_id, &status, &now)
        .await
        .map_err(|e| e.to_string())?;

    // 获取更新后的任务列表
    let rows = task_mapper::list_tasks_by_plan(rb, &plan_id)
        .await
        .map_err(|e| e.to_string())?;
    transform_task_rows(rb, rows).await
}

/// 停止任务执行
#[tauri::command]
pub async fn stop_task(id: String) -> Result<Task, String> {
    let rb = db::rb();
    let now = now_rfc3339();

    // 将任务状态改为 pending，保留当前重试计数
    task_mapper::stop_task(rb, &id, &now)
        .await
        .map_err(|e| e.to_string())?;

    let row = task_mapper::get_task_by_id(rb, &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("Task not found after stop: {}", id))?;
    transform_task_row(rb, row).await
}

/// 根据会话 ID 查找关联的任务和计划
#[tauri::command]
pub async fn get_task_by_session_id(session_id: String) -> Result<Option<Task>, String> {
    let rb = db::rb();
    match task_mapper::get_task_by_session_id(rb, &session_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
    {
        Some(row) => Ok(Some(transform_task_row(rb, row).await?)),
        None => Ok(None),
    }
}

/// 获取指定任务在某个运行时下的恢复绑定。
#[tauri::command]
pub async fn get_task_runtime_binding(
    task_id: String,
    runtime_key: String,
) -> Result<Option<TaskRuntimeBinding>, String> {
    let rb = db::rb();
    match task_mapper::get_task_runtime_binding(rb, &task_id, &runtime_key)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
    {
        Some(row) => Ok(Some(transform_runtime_binding(row)?)),
        None => Ok(None),
    }
}

/// 创建或更新任务的运行时恢复绑定。
#[tauri::command]
pub async fn upsert_task_runtime_binding(
    task_id: String,
    runtime_key: String,
    external_session_id: String,
) -> Result<TaskRuntimeBinding, String> {
    let rb = db::rb();
    let now = now_rfc3339();

    task_mapper::upsert_task_runtime_binding(
        rb,
        &task_id,
        &runtime_key,
        &external_session_id,
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    let row = task_mapper::get_task_runtime_binding(rb, &task_id, &runtime_key)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "任务运行时绑定写入后读取失败".to_string())?;
    transform_runtime_binding(row)
}

/// 删除任务在某个运行时下的恢复绑定。
#[tauri::command]
pub async fn delete_task_runtime_binding(task_id: String, runtime_key: String) -> Result<(), String> {
    let rb = db::rb();
    task_mapper::delete_task_runtime_binding(rb, &task_id, &runtime_key)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 批量创建任务（从拆分结果）
#[tauri::command]
pub async fn batch_create_tasks(
    plan_id: String,
    tasks: Vec<CreateTaskInput>,
) -> Result<Vec<Task>, String> {
    let rb = db::rb();
    let project_id = resolve_task_project_id(rb, &plan_id).await?;

    let now = now_rfc3339();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    // 获取当前最大顺序
    let mut max_order: i64 = task_mapper::get_max_task_order_of_plan(&tx, &plan_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .unwrap_or(-1);

    let mut created_tasks = Vec::new();

    for task_input in tasks {
        let id = uuid::Uuid::new_v4().to_string();
        let status = "pending".to_string();
        let priority = task_input
            .priority
            .clone()
            .unwrap_or_else(|| "medium".to_string());
        let dependencies_json = serialize_json_option(task_input.dependencies.as_ref(), "[]");
        let max_retries = task_input.max_retries.unwrap_or(3);
        let implementation_steps_json =
            serialize_json_option(task_input.implementation_steps.as_ref(), "[]");
        let test_steps_json = serialize_json_option(task_input.test_steps.as_ref(), "[]");
        let acceptance_criteria_json =
            serialize_json_option(task_input.acceptance_criteria.as_ref(), "[]");
        let memory_library_ids_json =
            serialize_json_option(task_input.memory_library_ids.as_ref(), "[]");

        max_order += 1;
        let task_order = task_input.order.unwrap_or(max_order as i32);

        let row = TaskInsert {
            id: &id,
            project_id: &project_id,
            plan_id: &plan_id,
            parent_id: task_input.parent_id.as_deref(),
            title: &task_input.title,
            description: task_input.description.as_deref(),
            status: &status,
            priority: &priority,
            assignee: task_input.assignee.as_deref(),
            expert_id: task_input.expert_id.as_deref(),
            agent_id: task_input.agent_id.as_deref(),
            model_id: task_input.model_id.as_deref(),
            session_id: None,
            cli_session_provider: None,
            progress_file: None,
            dependencies: dependencies_json.map(rbs::Value::String),
            task_order: task_order as i64,
            retry_count: 0,
            max_retries: max_retries as i64,
            error_message: None,
            implementation_steps: implementation_steps_json.map(rbs::Value::String),
            test_steps: test_steps_json.map(rbs::Value::String),
            acceptance_criteria: acceptance_criteria_json.map(rbs::Value::String),
            memory_library_ids: memory_library_ids_json.map(rbs::Value::String),
            created_at: &now,
            updated_at: &now,
        };

        task_mapper::insert_task(&tx, &row)
            .await
            .map_err(|e| e.to_string())?;

        replace_task_memory_libraries(
            &tx,
            &id,
            task_input.memory_library_ids.as_deref().unwrap_or(&[]),
            &now,
        )
        .await?;

        created_tasks.push(Task {
            id,
            project_id: Some(project_id.clone()),
            plan_id: plan_id.clone(),
            parent_id: task_input.parent_id,
            title: task_input.title,
            description: task_input.description,
            status,
            priority,
            assignee: task_input.assignee,
            expert_id: task_input.expert_id,
            agent_id: task_input.agent_id,
            model_id: task_input.model_id,
            session_id: None,
            cli_session_provider: None,
            progress_file: None,
            dependencies: task_input.dependencies,
            order: task_order,
            retry_count: 0,
            max_retries,
            error_message: None,
            implementation_steps: task_input.implementation_steps,
            test_steps: task_input.test_steps,
            acceptance_criteria: task_input.acceptance_criteria,
            memory_library_ids: Some(normalize_memory_library_ids(
                task_input.memory_library_ids.as_deref().unwrap_or(&[]),
            )),
            block_reason: None,
            input_request: None,
            input_response: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        });
    }

    // 更新计划的 updated_at 时间
    task_mapper::touch_plan_updated_at(&tx, &plan_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(created_tasks)
}

/// 任务拆分会话结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSplitSession {
    pub id: String,
    pub plan_id: String,
    pub status: String,
    pub raw_content: Option<String>,
    pub parsed_output: Option<String>,
    pub parse_error: Option<String>,
    pub granularity: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// 保存拆分会话输入
#[derive(Debug, Deserialize)]
pub struct SaveSplitSessionInput {
    pub plan_id: String,
    pub status: Option<String>,
    pub raw_content: Option<String>,
    pub parsed_output: Option<String>,
    pub parse_error: Option<String>,
    pub granularity: Option<i32>,
}

/// SplitSessionRow → TaskSplitSession DTO。
fn transform_split_session(row: SplitSessionRow) -> Result<TaskSplitSession, String> {
    Ok(TaskSplitSession {
        id: row.id.unwrap_or_default(),
        plan_id: row.plan_id.unwrap_or_default(),
        status: row.status.unwrap_or_else(|| "processing".to_string()),
        raw_content: row.raw_content,
        parsed_output: value_to_json_string_opt(row.parsed_output),
        parse_error: row.parse_error,
        granularity: row.granularity.unwrap_or(0) as i32,
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    })
}

/// 保存或更新拆分会话
#[tauri::command]
pub async fn save_split_session(input: SaveSplitSessionInput) -> Result<TaskSplitSession, String> {
    let rb = db::rb();
    let now = now_rfc3339();
    let status = input.status.unwrap_or_else(|| "processing".to_string());
    let granularity = input.granularity.unwrap_or(20);

    // 检查是否已存在该 plan_id 的记录
    let existing = task_mapper::get_split_session_id_by_plan(rb, &input.plan_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .and_then(|row| crate::models::value_to_json_string_opt(row.value));

    let session_id = if let Some(id) = existing {
        // 更新现有记录
        task_mapper::update_split_session(
            rb,
            &id,
            &status,
            input.raw_content.as_deref(),
            input
                .parsed_output
                .as_ref()
                .map(|v| rbs::Value::String(v.clone())),
            input.parse_error.as_deref(),
            granularity as i64,
            &now,
        )
        .await
        .map_err(|e| e.to_string())?;
        id
    } else {
        // 创建新记录
        let id = uuid::Uuid::new_v4().to_string();
        task_mapper::insert_split_session(
            rb,
            &id,
            &input.plan_id,
            &status,
            input.raw_content.as_deref(),
            input
                .parsed_output
                .as_ref()
                .map(|v| rbs::Value::String(v.clone())),
            input.parse_error.as_deref(),
            granularity as i64,
            &now,
            &now,
        )
        .await
        .map_err(|e| e.to_string())?;
        id
    };

    Ok(TaskSplitSession {
        id: session_id,
        plan_id: input.plan_id,
        status,
        raw_content: input.raw_content,
        parsed_output: input.parsed_output,
        parse_error: input.parse_error,
        granularity,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 获取拆分会话
#[tauri::command]
pub async fn get_split_session(plan_id: String) -> Result<Option<TaskSplitSession>, String> {
    let rb = db::rb();
    match task_mapper::get_split_session_by_plan(rb, &plan_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
    {
        Some(row) => Ok(Some(transform_split_session(row)?)),
        None => Ok(None),
    }
}

/// 删除拆分会话
#[tauri::command]
pub async fn delete_split_session(plan_id: String) -> Result<(), String> {
    let rb = db::rb();
    task_mapper::delete_split_session(rb, &plan_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
