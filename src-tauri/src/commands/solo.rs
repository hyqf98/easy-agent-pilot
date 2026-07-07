use serde::{Deserialize, Serialize};

use super::support::now_rfc3339;
use crate::db;
use crate::mappers::solo as solo_mapper;
use crate::mappers::solo::{SoloRunInsert, SoloRunUpdate, SoloStepInsert, SoloStepUpdate};
use crate::models::{
    value_to_json_string_opt, SoloLogRow, SoloRunRow, SoloRuntimeBindingRow, SoloStepRow,
};

/// SOLO 运行主记录。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoloRun {
    pub id: String,
    pub project_id: String,
    pub execution_path: String,
    pub name: String,
    pub requirement: String,
    pub goal: String,
    pub memory_library_ids_json: Option<String>,
    pub participant_expert_ids_json: Option<String>,
    pub coordinator_expert_id: Option<String>,
    pub coordinator_agent_id: Option<String>,
    pub coordinator_model_id: Option<String>,
    pub max_dispatch_depth: i32,
    pub current_depth: i32,
    pub current_step_id: Option<String>,
    pub status: String,
    pub execution_status: String,
    pub last_error: Option<String>,
    pub input_request_json: Option<String>,
    pub input_response_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub stopped_at: Option<String>,
}

/// SOLO 步骤记录。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoloStep {
    pub id: String,
    pub run_id: String,
    pub step_ref: String,
    pub parent_step_ref: Option<String>,
    pub depth: i32,
    pub title: String,
    pub description: Option<String>,
    pub execution_prompt: Option<String>,
    pub selected_expert_id: Option<String>,
    pub status: String,
    pub summary: Option<String>,
    pub result_summary: Option<String>,
    pub result_files_json: Option<String>,
    pub fail_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

/// SOLO 运行日志。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoloLog {
    pub id: String,
    pub run_id: String,
    pub step_id: Option<String>,
    pub scope: String,
    #[serde(rename = "type")]
    pub log_type: String,
    pub content: String,
    pub metadata: Option<String>,
    pub created_at: String,
}

/// SOLO 运行时绑定。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoloRuntimeBinding {
    pub run_id: String,
    pub runtime_key: String,
    pub external_session_id: String,
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

/// 创建 SOLO 运行输入。
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSoloRunInput {
    pub project_id: String,
    pub execution_path: String,
    pub name: String,
    pub requirement: String,
    pub goal: String,
    pub memory_library_ids_json: Option<String>,
    pub participant_expert_ids_json: Option<String>,
    pub coordinator_expert_id: Option<String>,
    pub coordinator_agent_id: Option<String>,
    pub coordinator_model_id: Option<String>,
    pub max_dispatch_depth: i32,
}

/// 更新 SOLO 运行输入。
#[derive(Debug, Clone, Deserialize, Default)]
pub struct UpdateSoloRunInput {
    #[serde(default)]
    pub execution_path: UpdateField<String>,
    #[serde(default)]
    pub name: UpdateField<String>,
    #[serde(default)]
    pub requirement: UpdateField<String>,
    #[serde(default)]
    pub goal: UpdateField<String>,
    #[serde(default)]
    pub memory_library_ids_json: UpdateField<String>,
    #[serde(default)]
    pub participant_expert_ids_json: UpdateField<String>,
    #[serde(default)]
    pub coordinator_expert_id: UpdateField<String>,
    #[serde(default)]
    pub coordinator_agent_id: UpdateField<String>,
    #[serde(default)]
    pub coordinator_model_id: UpdateField<String>,
    #[serde(default)]
    pub max_dispatch_depth: UpdateField<i32>,
    #[serde(default)]
    pub current_depth: UpdateField<i32>,
    #[serde(default)]
    pub current_step_id: UpdateField<String>,
    #[serde(default)]
    pub status: UpdateField<String>,
    #[serde(default)]
    pub execution_status: UpdateField<String>,
    #[serde(default)]
    pub last_error: UpdateField<String>,
    #[serde(default)]
    pub input_request_json: UpdateField<String>,
    #[serde(default)]
    pub input_response_json: UpdateField<String>,
    #[serde(default)]
    pub started_at: UpdateField<String>,
    #[serde(default)]
    pub completed_at: UpdateField<String>,
    #[serde(default)]
    pub stopped_at: UpdateField<String>,
}

/// 创建 SOLO 步骤输入。
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSoloStepInput {
    pub run_id: String,
    pub step_ref: String,
    pub parent_step_ref: Option<String>,
    pub depth: i32,
    pub title: String,
    pub description: Option<String>,
    pub execution_prompt: Option<String>,
    pub selected_expert_id: Option<String>,
    pub status: Option<String>,
    pub summary: Option<String>,
    pub started_at: Option<String>,
}

/// 更新 SOLO 步骤输入。
#[derive(Debug, Clone, Deserialize, Default)]
pub struct UpdateSoloStepInput {
    #[serde(default)]
    pub parent_step_ref: UpdateField<String>,
    #[serde(default)]
    pub depth: UpdateField<i32>,
    #[serde(default)]
    pub title: UpdateField<String>,
    #[serde(default)]
    pub description: UpdateField<String>,
    #[serde(default)]
    pub execution_prompt: UpdateField<String>,
    #[serde(default)]
    pub selected_expert_id: UpdateField<String>,
    #[serde(default)]
    pub status: UpdateField<String>,
    #[serde(default)]
    pub summary: UpdateField<String>,
    #[serde(default)]
    pub result_summary: UpdateField<String>,
    #[serde(default)]
    pub result_files_json: UpdateField<String>,
    #[serde(default)]
    pub fail_reason: UpdateField<String>,
    #[serde(default)]
    pub started_at: UpdateField<String>,
    #[serde(default)]
    pub completed_at: UpdateField<String>,
}

/// 创建 SOLO 日志输入。
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSoloLogInput {
    pub run_id: String,
    pub step_id: Option<String>,
    pub scope: String,
    pub log_type: String,
    pub content: String,
    pub metadata: Option<String>,
}

/// 写入 SOLO 运行时绑定输入。
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertSoloRuntimeBindingInput {
    pub run_id: String,
    pub runtime_key: String,
    pub external_session_id: String,
}

// ============================================================================
// 辅助函数：JSON 解析、Row→DTO 转换、UpdateField 映射。
// ============================================================================

fn parse_memory_library_ids_json(raw: Option<&String>) -> Vec<String> {
    raw.and_then(|value| serde_json::from_str::<Vec<String>>(value).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|library_id| library_id.trim().to_string())
        .filter(|library_id| !library_id.is_empty())
        .fold(Vec::new(), |mut acc, library_id| {
            if !acc.iter().any(|existing| existing == &library_id) {
                acc.push(library_id);
            }
            acc
        })
}

fn normalize_memory_library_ids_json(raw: Option<&String>) -> String {
    serde_json::to_string(&parse_memory_library_ids_json(raw)).unwrap_or_else(|_| "[]".to_string())
}

/// 把 UpdateField<String> 映射为 (has, Option<String>)：
/// Value→(true, Some(s))，Null→(true, None)，Missing→(false, None)。
fn field_to_str(field: &UpdateField<String>) -> (bool, Option<String>) {
    match field {
        UpdateField::Value(v) => (true, Some(v.clone())),
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

/// 判断 UpdateField 是否非 Missing（是否参与更新）。
fn has_update<T>(field: &UpdateField<T>) -> bool {
    !matches!(field, UpdateField::Missing)
}

/// 把 SoloRunRow 转换为对外 SoloRun DTO。
fn run_row_to_run(row: SoloRunRow) -> Result<SoloRun, String> {
    Ok(SoloRun {
        id: row.id.ok_or("solo_runs.id 缺失")?,
        project_id: row.project_id.ok_or("solo_runs.project_id 缺失")?,
        execution_path: row.execution_path.unwrap_or_default(),
        name: row.name.ok_or("solo_runs.name 缺失")?,
        requirement: row.requirement.unwrap_or_default(),
        goal: row.goal.unwrap_or_default(),
        memory_library_ids_json: value_to_json_string_opt(row.memory_library_ids_json),
        participant_expert_ids_json: value_to_json_string_opt(row.participant_expert_ids_json),
        coordinator_expert_id: row.coordinator_expert_id,
        coordinator_agent_id: row.coordinator_agent_id,
        coordinator_model_id: row.coordinator_model_id,
        max_dispatch_depth: row.max_dispatch_depth.unwrap_or(3) as i32,
        current_depth: row.current_depth.unwrap_or(0) as i32,
        current_step_id: row.current_step_id,
        status: row.status.unwrap_or_else(|| "draft".to_string()),
        execution_status: row.execution_status.unwrap_or_else(|| "idle".to_string()),
        last_error: row.last_error,
        input_request_json: value_to_json_string_opt(row.input_request_json),
        input_response_json: value_to_json_string_opt(row.input_response_json),
        created_at: row.created_at.ok_or("solo_runs.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("solo_runs.updated_at 缺失")?,
        started_at: row.started_at,
        completed_at: row.completed_at,
        stopped_at: row.stopped_at,
    })
}

/// 把 SoloStepRow 转换为对外 SoloStep DTO。
fn step_row_to_step(row: SoloStepRow) -> Result<SoloStep, String> {
    Ok(SoloStep {
        id: row.id.ok_or("solo_steps.id 缺失")?,
        run_id: row.run_id.ok_or("solo_steps.run_id 缺失")?,
        step_ref: row.step_ref.ok_or("solo_steps.step_ref 缺失")?,
        parent_step_ref: row.parent_step_ref,
        depth: row.depth.unwrap_or(0) as i32,
        title: row.title.ok_or("solo_steps.title 缺失")?,
        description: row.description,
        execution_prompt: row.execution_prompt,
        selected_expert_id: row.selected_expert_id,
        status: row.status.unwrap_or_else(|| "pending".to_string()),
        summary: row.summary,
        result_summary: row.result_summary,
        result_files_json: value_to_json_string_opt(row.result_files_json),
        fail_reason: row.fail_reason,
        created_at: row.created_at.ok_or("solo_steps.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("solo_steps.updated_at 缺失")?,
        started_at: row.started_at,
        completed_at: row.completed_at,
    })
}

/// 把 SoloLogRow 转换为对外 SoloLog DTO。
fn log_row_to_log(row: SoloLogRow) -> Result<SoloLog, String> {
    Ok(SoloLog {
        id: row.id.ok_or("solo_logs.id 缺失")?,
        run_id: row.run_id.ok_or("solo_logs.run_id 缺失")?,
        step_id: row.step_id,
        scope: row.scope.ok_or("solo_logs.scope 缺失")?,
        log_type: row.log_type.ok_or("solo_logs.log_type 缺失")?,
        content: row.content.ok_or("solo_logs.content 缺失")?,
        metadata: value_to_json_string_opt(row.metadata),
        created_at: row.created_at.ok_or("solo_logs.created_at 缺失")?,
    })
}

/// 把 SoloRuntimeBindingRow 转换为对外 SoloRuntimeBinding DTO。
fn binding_row_to_binding(row: SoloRuntimeBindingRow) -> Result<SoloRuntimeBinding, String> {
    Ok(SoloRuntimeBinding {
        run_id: row.run_id.ok_or("solo_runtime_bindings.run_id 缺失")?,
        runtime_key: row.runtime_key.ok_or("solo_runtime_bindings.runtime_key 缺失")?,
        external_session_id: row
            .external_session_id
            .ok_or("solo_runtime_bindings.external_session_id 缺失")?,
        created_at: row.created_at.ok_or("solo_runtime_bindings.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("solo_runtime_bindings.updated_at 缺失")?,
    })
}

/// 按 id 读取 SOLO 运行（内部复用）。
async fn fetch_solo_run_by_id(id: &str) -> Result<SoloRun, String> {
    let row = solo_mapper::get_solo_run_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "SOLO 运行不存在".to_string())?;
    run_row_to_run(row)
}

/// 按 id 读取 SOLO 步骤（内部复用）。
async fn fetch_solo_step_by_id(id: &str) -> Result<SoloStep, String> {
    let row = solo_mapper::get_solo_step_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "SOLO 步骤不存在".to_string())?;
    step_row_to_step(row)
}

/// 用新的 memory library 列表替换运行的关联（删除旧关联 + 逐条插入）。
async fn replace_solo_run_memory_libraries(
    run_id: &str,
    library_ids: &[String],
    now: &str,
) -> Result<(), String> {
    solo_mapper::delete_solo_run_memory_libraries(db::rb(), run_id)
        .await
        .map_err(|e| e.to_string())?;

    for library_id in parse_memory_library_ids_json(Some(
        &serde_json::to_string(library_ids).unwrap_or_else(|_| "[]".to_string()),
    )) {
        solo_mapper::insert_solo_run_memory_library(db::rb(), run_id, &library_id, now)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ============================================================================
// Tauri 命令。
// ============================================================================

/// 列出项目下的 SOLO 运行。
#[tauri::command]
pub async fn list_solo_runs(project_id: String) -> Result<Vec<SoloRun>, String> {
    let rows = solo_mapper::list_solo_runs(db::rb(), &project_id)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(run_row_to_run).collect()
}

/// 获取单个 SOLO 运行。
#[tauri::command]
pub async fn get_solo_run(id: String) -> Result<SoloRun, String> {
    fetch_solo_run_by_id(&id).await
}

/// 创建 SOLO 运行。
#[tauri::command]
pub async fn create_solo_run(input: CreateSoloRunInput) -> Result<SoloRun, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let normalized_memory_library_ids_json =
        normalize_memory_library_ids_json(input.memory_library_ids_json.as_ref());

    let row = SoloRunInsert {
        id: id.clone(),
        project_id: input.project_id,
        execution_path: input.execution_path,
        name: input.name,
        requirement: input.requirement,
        goal: input.goal,
        memory_library_ids_json: rbs::Value::String(normalized_memory_library_ids_json.clone()),
        participant_expert_ids_json: input
            .participant_expert_ids_json
            .map(rbs::Value::String),
        coordinator_expert_id: input.coordinator_expert_id,
        coordinator_agent_id: input.coordinator_agent_id,
        coordinator_model_id: input.coordinator_model_id,
        max_dispatch_depth: input.max_dispatch_depth as i64,
        created_at: now.clone(),
        updated_at: now,
    };
    solo_mapper::insert_solo_run(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    replace_solo_run_memory_libraries(
        &id,
        &parse_memory_library_ids_json(Some(&normalized_memory_library_ids_json)),
        &now_rfc3339(),
    )
    .await?;

    fetch_solo_run_by_id(&id).await
}

/// 更新 SOLO 运行状态与配置。
#[tauri::command]
pub async fn update_solo_run(id: String, input: UpdateSoloRunInput) -> Result<SoloRun, String> {
    let now = now_rfc3339();

    // 文本/整数字段的 (has, value) 映射
    let (has_execution_path, execution_path) = field_to_str(&input.execution_path);
    let (has_name, name) = field_to_str(&input.name);
    let (has_requirement, requirement) = field_to_str(&input.requirement);
    let (has_goal, goal) = field_to_str(&input.goal);
    // memory_library_ids_json：Value 时需规范化为去重数组
    let (has_memory_library_ids_json, memory_library_ids_json) = match &input.memory_library_ids_json
    {
        UpdateField::Value(value) => (
            true,
            Some(normalize_memory_library_ids_json(Some(value))),
        ),
        UpdateField::Null => (true, None),
        UpdateField::Missing => (false, None),
    };
    let (has_participant_expert_ids_json, participant_expert_ids_json) =
        field_to_str(&input.participant_expert_ids_json);
    let (has_coordinator_expert_id, coordinator_expert_id) = field_to_str(&input.coordinator_expert_id);
    let (has_coordinator_agent_id, coordinator_agent_id) = field_to_str(&input.coordinator_agent_id);
    let (has_coordinator_model_id, coordinator_model_id) = field_to_str(&input.coordinator_model_id);
    let (has_max_dispatch_depth, max_dispatch_depth) = field_to_i64(&input.max_dispatch_depth);
    let (has_current_depth, current_depth) = field_to_i64(&input.current_depth);
    let (has_current_step_id, current_step_id) = field_to_str(&input.current_step_id);
    let (has_status, status) = field_to_str(&input.status);
    let (has_execution_status, execution_status) = field_to_str(&input.execution_status);
    let (has_last_error, last_error) = field_to_str(&input.last_error);
    let (has_input_request_json, input_request_json) = field_to_str(&input.input_request_json);
    let (has_input_response_json, input_response_json) = field_to_str(&input.input_response_json);
    let (has_started_at, started_at) = field_to_str(&input.started_at);
    let (has_completed_at, completed_at) = field_to_str(&input.completed_at);
    let (has_stopped_at, stopped_at) = field_to_str(&input.stopped_at);

    let update = SoloRunUpdate {
        id: id.clone(),
        updated_at: now,
        has_execution_path,
        has_name,
        has_requirement,
        has_goal,
        has_memory_library_ids_json,
        has_participant_expert_ids_json,
        has_coordinator_expert_id,
        has_coordinator_agent_id,
        has_coordinator_model_id,
        has_max_dispatch_depth,
        has_current_depth,
        has_current_step_id,
        has_status,
        has_execution_status,
        has_last_error,
        has_input_request_json,
        has_input_response_json,
        has_started_at,
        has_completed_at,
        has_stopped_at,
        execution_path,
        name,
        requirement,
        goal,
        memory_library_ids_json: memory_library_ids_json.map(rbs::Value::String),
        participant_expert_ids_json: participant_expert_ids_json.map(rbs::Value::String),
        coordinator_expert_id,
        coordinator_agent_id,
        coordinator_model_id,
        max_dispatch_depth,
        current_depth,
        current_step_id,
        status,
        execution_status,
        last_error,
        input_request_json: input_request_json.map(rbs::Value::String),
        input_response_json: input_response_json.map(rbs::Value::String),
        started_at,
        completed_at,
        stopped_at,
    };

    solo_mapper::update_solo_run(db::rb(), &update)
        .await
        .map_err(|e| e.to_string())?;

    // memory_library_ids_json 非 Missing 时同步关联表
    if has_update(&input.memory_library_ids_json) {
        let library_ids = match &input.memory_library_ids_json {
            UpdateField::Value(raw) => parse_memory_library_ids_json(Some(raw)),
            UpdateField::Null => Vec::new(),
            UpdateField::Missing => Vec::new(),
        };
        replace_solo_run_memory_libraries(&id, &library_ids, &now_rfc3339()).await?;
    }

    fetch_solo_run_by_id(&id).await
}

/// 删除 SOLO 运行及其关联步骤、日志与运行时绑定。
#[tauri::command]
pub async fn delete_solo_run(id: String) -> Result<(), String> {
    solo_mapper::delete_solo_run_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 列出 SOLO 运行下的全部步骤。
#[tauri::command]
pub async fn list_solo_steps(run_id: String) -> Result<Vec<SoloStep>, String> {
    let rows = solo_mapper::list_solo_steps(db::rb(), &run_id)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(step_row_to_step).collect()
}

/// 创建 SOLO 步骤。
#[tauri::command]
pub async fn create_solo_step(input: CreateSoloStepInput) -> Result<SoloStep, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let status = input.status.unwrap_or_else(|| "pending".to_string());

    let row = SoloStepInsert {
        id: id.clone(),
        run_id: input.run_id.clone(),
        step_ref: input.step_ref,
        parent_step_ref: input.parent_step_ref,
        depth: input.depth as i64,
        title: input.title,
        description: input.description,
        execution_prompt: input.execution_prompt,
        selected_expert_id: input.selected_expert_id,
        status: status.clone(),
        summary: input.summary,
        created_at: now.clone(),
        updated_at: now.clone(),
        started_at: input.started_at,
    };
    solo_mapper::insert_solo_step(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    // 刷新运行 current_step_id/current_depth（MAX 语义）
    solo_mapper::touch_solo_run_on_step(
        db::rb(),
        &input.run_id,
        &id,
        input.depth as i64,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    fetch_solo_step_by_id(&id).await
}

/// 更新 SOLO 步骤。
#[tauri::command]
pub async fn update_solo_step(id: String, input: UpdateSoloStepInput) -> Result<SoloStep, String> {
    let now = now_rfc3339();

    let (has_parent_step_ref, parent_step_ref) = field_to_str(&input.parent_step_ref);
    let (has_depth, depth) = field_to_i64(&input.depth);
    let (has_title, title) = field_to_str(&input.title);
    let (has_description, description) = field_to_str(&input.description);
    let (has_execution_prompt, execution_prompt) = field_to_str(&input.execution_prompt);
    let (has_selected_expert_id, selected_expert_id) = field_to_str(&input.selected_expert_id);
    let (has_status, status) = field_to_str(&input.status);
    let (has_summary, summary) = field_to_str(&input.summary);
    let (has_result_summary, result_summary) = field_to_str(&input.result_summary);
    let (has_result_files_json, result_files_json) = field_to_str(&input.result_files_json);
    let (has_fail_reason, fail_reason) = field_to_str(&input.fail_reason);
    let (has_started_at, started_at) = field_to_str(&input.started_at);
    let (has_completed_at, completed_at) = field_to_str(&input.completed_at);

    let update = SoloStepUpdate {
        id: id.clone(),
        updated_at: now.clone(),
        has_parent_step_ref,
        has_depth,
        has_title,
        has_description,
        has_execution_prompt,
        has_selected_expert_id,
        has_status,
        has_summary,
        has_result_summary,
        has_result_files_json,
        has_fail_reason,
        has_started_at,
        has_completed_at,
        parent_step_ref,
        depth,
        title,
        description,
        execution_prompt,
        selected_expert_id,
        status,
        summary,
        result_summary,
        result_files_json: result_files_json.map(rbs::Value::String),
        fail_reason,
        started_at,
        completed_at,
    };

    solo_mapper::update_solo_step(db::rb(), &update)
        .await
        .map_err(|e| e.to_string())?;

    let step = fetch_solo_step_by_id(&id).await?;

    // 刷新运行 current_step_id/current_depth（MAX 语义）
    solo_mapper::touch_solo_run_on_step(
        db::rb(),
        &step.run_id,
        &step.id,
        step.depth as i64,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(step)
}

/// 记录 SOLO 日志。
#[tauri::command]
pub async fn create_solo_log(input: CreateSoloLogInput) -> Result<SoloLog, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    solo_mapper::insert_solo_log(
        db::rb(),
        &id,
        &input.run_id,
        input.step_id.as_deref(),
        &input.scope,
        &input.log_type,
        &input.content,
        input.metadata.clone().map(rbs::Value::String),
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    // 刷新运行 updated_at
    solo_mapper::touch_solo_run_on_log(db::rb(), &input.run_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SoloLog {
        id,
        run_id: input.run_id,
        step_id: input.step_id,
        scope: input.scope,
        log_type: input.log_type,
        content: input.content,
        metadata: input.metadata,
        created_at: now,
    })
}

/// 更新 SOLO 运行日志内容。
#[tauri::command]
pub async fn update_solo_log(
    id: String,
    content: String,
    metadata: Option<String>,
) -> Result<(), String> {
    solo_mapper::update_solo_log(
        db::rb(),
        &id,
        &content,
        metadata.map(rbs::Value::String),
    )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 列出 SOLO 运行日志。
#[tauri::command]
pub async fn list_solo_logs(run_id: String, step_id: Option<String>) -> Result<Vec<SoloLog>, String> {
    let rows = solo_mapper::list_solo_logs(db::rb(), &run_id, step_id.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(log_row_to_log).collect()
}

/// 清理 SOLO 运行下的全部步骤与日志，并重置运行状态。
#[tauri::command]
pub async fn clear_solo_run_progress(run_id: String) -> Result<(), String> {
    let rb = db::rb();
    let now = now_rfc3339();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    solo_mapper::clear_solo_logs(&tx, &run_id)
        .await
        .map_err(|e| e.to_string())?;
    solo_mapper::clear_solo_steps(&tx, &run_id)
        .await
        .map_err(|e| e.to_string())?;
    solo_mapper::clear_solo_runtime_bindings(&tx, &run_id)
        .await
        .map_err(|e| e.to_string())?;
    solo_mapper::reset_solo_run_progress(&tx, &run_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取 SOLO 运行时绑定。
#[tauri::command]
pub async fn get_solo_runtime_binding(
    run_id: String,
    runtime_key: String,
) -> Result<Option<SoloRuntimeBinding>, String> {
    let row = solo_mapper::get_solo_runtime_binding(db::rb(), &run_id, &runtime_key)
        .await
        .map_err(|e| e.to_string())?;
    row.into_iter().next().map(binding_row_to_binding).transpose()
}

/// 写入或更新 SOLO 运行时绑定。
#[tauri::command]
pub async fn upsert_solo_runtime_binding(input: UpsertSoloRuntimeBindingInput) -> Result<(), String> {
    let now = now_rfc3339();
    solo_mapper::upsert_solo_runtime_binding(
        db::rb(),
        &input.run_id,
        &input.runtime_key,
        &input.external_session_id,
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除 SOLO 运行时绑定。
#[tauri::command]
pub async fn delete_solo_runtime_binding(run_id: String, runtime_key: String) -> Result<(), String> {
    solo_mapper::delete_solo_runtime_binding(db::rb(), &run_id, &runtime_key)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
