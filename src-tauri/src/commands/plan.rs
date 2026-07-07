//! Plan（计划）命令 —— 已从 rusqlite 同步迁移到 rbatis async。
//!
//! DB 访问全部走 `mappers::plan` + `sql/plan.html`。
//! 事务：`create_plan`（insert plan + 替换记忆库关联 + touch project）、
//! `delete_plan`（级联清理 + 删计划本体）使用 `rb.acquire_begin()`。

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::support::now_rfc3339;

use crate::db;
use crate::mappers::plan as plan_mapper;
use crate::mappers::plan::PlanUpdate;
use crate::models::{value_to_json_string_opt, PlanRow};

/// 计划数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub memory_library_ids: Vec<String>,
    pub execution_overview: Option<String>,
    pub execution_overview_updated_at: Option<String>,
    pub split_mode: String,
    pub split_expert_id: Option<String>,
    pub split_agent_id: Option<String>,
    pub split_model_id: Option<String>,
    pub status: String,
    pub agent_team: Option<Vec<String>>,
    pub granularity: i32,
    pub max_retry_count: i32,
    pub execution_status: Option<String>,
    pub current_task_id: Option<String>,
    pub scheduled_at: Option<String>,
    pub schedule_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Rust 后端返回的结构（snake_case）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustPlan {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub memory_library_ids: Vec<String>,
    pub execution_overview: Option<String>,
    pub execution_overview_updated_at: Option<String>,
    pub split_mode: String,
    pub split_expert_id: Option<String>,
    pub split_agent_id: Option<String>,
    pub split_model_id: Option<String>,
    pub status: String,
    pub agent_team: Option<String>,
    pub granularity: i32,
    pub max_retry_count: i32,
    pub execution_status: Option<String>,
    pub current_task_id: Option<String>,
    pub scheduled_at: Option<String>,
    pub schedule_status: Option<String>,
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

/// 创建计划输入
#[derive(Debug, Deserialize)]
pub struct CreatePlanInput {
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub memory_library_ids: Vec<String>,
    pub split_mode: Option<String>,
    pub split_expert_id: Option<String>,
    pub split_agent_id: Option<String>,
    pub split_model_id: Option<String>,
    pub agent_team: Option<Vec<String>>,
    pub granularity: Option<i32>,
    pub max_retry_count: Option<i32>,
    pub scheduled_at: Option<String>,
}

/// 更新计划输入
#[derive(Debug, Deserialize)]
pub struct UpdatePlanInput {
    #[serde(default)]
    pub name: UpdateField<String>,
    #[serde(default)]
    pub description: UpdateField<String>,
    #[serde(default)]
    pub memory_library_ids: UpdateField<Vec<String>>,
    #[serde(default)]
    pub execution_overview: UpdateField<String>,
    #[serde(default)]
    pub execution_overview_updated_at: UpdateField<String>,
    #[serde(default)]
    pub split_mode: UpdateField<String>,
    #[serde(default)]
    pub split_expert_id: UpdateField<String>,
    #[serde(default)]
    pub split_agent_id: UpdateField<String>,
    #[serde(default)]
    pub split_model_id: UpdateField<String>,
    #[serde(default)]
    pub status: UpdateField<String>,
    #[serde(default)]
    pub agent_team: UpdateField<Vec<String>>,
    #[serde(default)]
    pub granularity: UpdateField<i32>,
    #[serde(default)]
    pub max_retry_count: UpdateField<i32>,
    #[serde(default)]
    pub execution_status: UpdateField<String>,
    #[serde(default)]
    pub current_task_id: UpdateField<String>,
    #[serde(default)]
    pub scheduled_at: UpdateField<String>,
    #[serde(default)]
    pub schedule_status: UpdateField<String>,
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

/// 把三态 `UpdateField<String>` 拆成 (是否纳入更新, 写入值)。
/// `Null` → (true, None)（写 SQL NULL）；`Value(v)` → (true, Some(v))；`Missing` → (false, None)。
fn split_str_field(field: &UpdateField<String>) -> (bool, Option<String>) {
    match field {
        UpdateField::Value(v) => (true, Some(v.clone())),
        UpdateField::Null => (true, None),
        UpdateField::Missing => (false, None),
    }
}

/// 把三态 `UpdateField<i32>` 拆成 (是否纳入更新, 写入值)。
fn split_int_field(field: &UpdateField<i32>) -> (bool, Option<i64>) {
    match field {
        UpdateField::Value(v) => (true, Some(*v as i64)),
        UpdateField::Null => (true, None),
        UpdateField::Missing => (false, None),
    }
}

async fn list_plan_memory_library_ids(plan_id: &str) -> Result<Vec<String>, String> {
    let rows = plan_mapper::list_plan_memory_library_ids(db::rb(), plan_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.library_id)
        .collect())
}

/// 在事务内替换计划的记忆库关联（先删后插）。
async fn replace_plan_memory_libraries(
    tx: &rbatis::executor::RBatisTxExecutor,
    plan_id: &str,
    library_ids: &[String],
    now: &str,
) -> Result<(), String> {
    plan_mapper::delete_plan_memory_libraries(tx, plan_id)
        .await
        .map_err(|e| e.to_string())?;

    for library_id in normalize_memory_library_ids(library_ids) {
        plan_mapper::insert_plan_memory_library(tx, plan_id, &library_id, now)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn transform_plan(rust_plan: RustPlan) -> Plan {
    let agent_team = rust_plan
        .agent_team
        .and_then(|s| serde_json::from_str(&s).ok());

    Plan {
        id: rust_plan.id,
        project_id: rust_plan.project_id,
        name: rust_plan.name,
        description: rust_plan.description,
        memory_library_ids: rust_plan.memory_library_ids,
        execution_overview: rust_plan.execution_overview,
        execution_overview_updated_at: rust_plan.execution_overview_updated_at,
        split_mode: rust_plan.split_mode,
        split_expert_id: rust_plan.split_expert_id,
        split_agent_id: rust_plan.split_agent_id,
        split_model_id: rust_plan.split_model_id,
        status: rust_plan.status,
        agent_team,
        granularity: rust_plan.granularity,
        max_retry_count: rust_plan.max_retry_count,
        execution_status: rust_plan.execution_status,
        current_task_id: rust_plan.current_task_id,
        scheduled_at: rust_plan.scheduled_at,
        schedule_status: rust_plan.schedule_status,
        created_at: rust_plan.created_at,
        updated_at: rust_plan.updated_at,
    }
}

/// 把 rbatis 行映射 `PlanRow` 转成内部 `RustPlan`（含 memory_library_ids 二次查询、类型还原）。
async fn row_to_rust_plan(row: PlanRow) -> Result<RustPlan, String> {
    let plan_id = row.id.clone().unwrap_or_default();
    let memory_library_ids = list_plan_memory_library_ids(&plan_id).await?;

    Ok(RustPlan {
        id: plan_id,
        project_id: row.project_id.unwrap_or_default(),
        name: row.name.unwrap_or_default(),
        description: row.description,
        memory_library_ids,
        execution_overview: value_to_json_string_opt(row.execution_overview),
        execution_overview_updated_at: row.execution_overview_updated_at,
        split_mode: row.split_mode.unwrap_or_else(|| "ai".to_string()),
        status: row.status.unwrap_or_else(|| "draft".to_string()),
        agent_team: value_to_json_string_opt(row.agent_team),
        split_expert_id: row.split_expert_id,
        split_agent_id: row.split_agent_id,
        split_model_id: row.split_model_id,
        granularity: row.granularity.map(|v| v as i32).unwrap_or(20),
        max_retry_count: row.max_retry_count.map(|v| v as i32).unwrap_or(3),
        execution_status: row.execution_status,
        current_task_id: row.current_task_id,
        scheduled_at: row.scheduled_at,
        schedule_status: row.schedule_status,
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    })
}

async fn collect_plan_task_ids(plan_id: &str) -> Result<Vec<String>, String> {
    let rows = plan_mapper::list_plan_task_ids(db::rb(), plan_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().filter_map(|row| row.id).collect())
}

/// 获取指定项目的所有计划
#[tauri::command]
pub async fn list_plans(project_id: String) -> Result<Vec<Plan>, String> {
    let rows = plan_mapper::list_plans(db::rb(), &project_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut plans = Vec::with_capacity(rows.len());
    for row in rows {
        plans.push(transform_plan(row_to_rust_plan(row).await?));
    }
    Ok(plans)
}

/// 获取单个计划
#[tauri::command]
pub async fn get_plan(id: String) -> Result<Plan, String> {
    let row = plan_mapper::get_plan_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("计划不存在: {}", id))?;
    Ok(transform_plan(row_to_rust_plan(row).await?))
}

/// 创建新计划
#[tauri::command]
pub async fn create_plan(input: CreatePlanInput) -> Result<Plan, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let status = "draft".to_string();
    let execution_status = "idle".to_string();
    let split_mode = input.split_mode.unwrap_or_else(|| "ai".to_string());
    let memory_library_ids = normalize_memory_library_ids(&input.memory_library_ids);
    let agent_team_json = input
        .agent_team
        .as_ref()
        .map(|t| serde_json::to_string(t).unwrap_or_else(|_| "[]".to_string()));
    let granularity = input.granularity.unwrap_or(20);
    let max_retry_count = input.max_retry_count.unwrap_or(3);
    let schedule_status = if input.scheduled_at.is_some() {
        Some("scheduled".to_string())
    } else {
        Some("none".to_string())
    };

    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    plan_mapper::insert_plan(
        &tx,
        &id,
        &input.project_id,
        &input.name,
        input.description.as_deref(),
        &split_mode,
        input.split_expert_id.as_deref(),
        input.split_agent_id.as_deref(),
        input.split_model_id.as_deref(),
        &status,
        agent_team_json.as_deref(),
        granularity as i64,
        max_retry_count as i64,
        &execution_status,
        None,
        None,
        None,
        input.scheduled_at.as_deref(),
        schedule_status.as_deref(),
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    replace_plan_memory_libraries(&tx, &id, &memory_library_ids, &now).await?;

    plan_mapper::touch_project_updated_at(&tx, &input.project_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(Plan {
        id,
        project_id: input.project_id,
        name: input.name,
        description: input.description,
        memory_library_ids,
        execution_overview: None,
        execution_overview_updated_at: None,
        split_mode,
        split_expert_id: input.split_expert_id,
        split_agent_id: input.split_agent_id,
        split_model_id: input.split_model_id,
        status,
        agent_team: input.agent_team,
        granularity,
        max_retry_count,
        execution_status: Some(execution_status),
        current_task_id: None,
        scheduled_at: input.scheduled_at,
        schedule_status,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新计划
#[tauri::command]
pub async fn update_plan(id: String, input: UpdatePlanInput) -> Result<Plan, String> {
    let now = now_rfc3339();

    // 解析三态字段 → (present, value)
    let (name_present, name) = split_str_field(&input.name);
    let (description_present, description) = split_str_field(&input.description);
    let (execution_overview_present, execution_overview) =
        split_str_field(&input.execution_overview);
    let (execution_overview_updated_at_present, execution_overview_updated_at) =
        split_str_field(&input.execution_overview_updated_at);
    let (split_mode_present, split_mode) = split_str_field(&input.split_mode);
    let (split_expert_id_present, split_expert_id) = split_str_field(&input.split_expert_id);
    let (split_agent_id_present, split_agent_id) = split_str_field(&input.split_agent_id);
    let (split_model_id_present, split_model_id) = split_str_field(&input.split_model_id);
    let (status_present, status) = split_str_field(&input.status);
    let (agent_team_present, agent_team) = match &input.agent_team {
        UpdateField::Value(value) => (
            true,
            Some(serde_json::to_string(value).unwrap_or_else(|_| "[]".to_string())),
        ),
        UpdateField::Null => (true, None),
        UpdateField::Missing => (false, None),
    };
    let (granularity_present, granularity) = split_int_field(&input.granularity);
    let (max_retry_count_present, max_retry_count) = split_int_field(&input.max_retry_count);
    let (execution_status_present, execution_status) = split_str_field(&input.execution_status);
    let (current_task_id_present, current_task_id) = split_str_field(&input.current_task_id);
    let (scheduled_at_present, scheduled_at) = split_str_field(&input.scheduled_at);
    let (schedule_status_present, schedule_status) = split_str_field(&input.schedule_status);

    let update = PlanUpdate {
        id: id.clone(),
        updated_at: now,
        name,
        name_present,
        description,
        description_present,
        execution_overview,
        execution_overview_present,
        execution_overview_updated_at,
        execution_overview_updated_at_present,
        split_mode,
        split_mode_present,
        split_expert_id,
        split_expert_id_present,
        split_agent_id,
        split_agent_id_present,
        split_model_id,
        split_model_id_present,
        status,
        status_present,
        agent_team,
        agent_team_present,
        granularity,
        granularity_present,
        max_retry_count,
        max_retry_count_present,
        execution_status,
        execution_status_present,
        current_task_id,
        current_task_id_present,
        scheduled_at,
        scheduled_at_present,
        schedule_status,
        schedule_status_present,
    };

    plan_mapper::update_plan(db::rb(), &update)
        .await
        .map_err(|e| e.to_string())?;

    if !matches!(input.memory_library_ids, UpdateField::Missing) {
        let library_ids = match &input.memory_library_ids {
            UpdateField::Value(value) => value.clone(),
            UpdateField::Null => Vec::new(),
            UpdateField::Missing => Vec::new(),
        };
        // 记忆库替换无需事务保护（先删后插，幂等），用全局 RBatis 即可。
        let rb = db::rb();
        plan_mapper::delete_plan_memory_libraries(rb, &id)
            .await
            .map_err(|e| e.to_string())?;
        let now2 = now_rfc3339();
        for library_id in normalize_memory_library_ids(&library_ids) {
            plan_mapper::insert_plan_memory_library(rb, &id, &library_id, &now2)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    get_plan(id).await
}

/// 删除计划
#[tauri::command]
pub async fn delete_plan(id: String) -> Result<(), String> {
    let task_ids = collect_plan_task_ids(&id).await?;

    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    plan_mapper::delete_plan_split_logs(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;
    plan_mapper::delete_task_split_sessions(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;
    plan_mapper::delete_task_execution_results(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;

    if !task_ids.is_empty() {
        plan_mapper::delete_task_execution_logs_by_ids(&tx, &task_ids)
            .await
            .map_err(|e| e.to_string())?;
        plan_mapper::delete_agent_cli_usage_records_by_ids(&tx, &task_ids)
            .await
            .map_err(|e| e.to_string())?;
    }

    plan_mapper::delete_plan_by_id(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取所有待执行的定时计划
#[tauri::command]
pub async fn list_scheduled_plans() -> Result<Vec<Plan>, String> {
    let rows = plan_mapper::list_scheduled_plans(db::rb())
        .await
        .map_err(|e| e.to_string())?;

    let mut plans = Vec::with_capacity(rows.len());
    for row in rows {
        plans.push(transform_plan(row_to_rust_plan(row).await?));
    }
    Ok(plans)
}

/// 取消计划定时
#[tauri::command]
pub async fn cancel_plan_schedule(id: String) -> Result<Plan, String> {
    let now = now_rfc3339();
    plan_mapper::cancel_plan_schedule(db::rb(), &id, &now)
        .await
        .map_err(|e| e.to_string())?;

    get_plan(id).await
}
