use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// 计划状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanStatus {
    Draft,
    Planning,
    Executing,
    Completed,
    Paused,
}

impl From<String> for PlanStatus {
    fn from(s: String) -> Self {
        match s.as_str() {
            "draft" => PlanStatus::Draft,
            "planning" => PlanStatus::Planning,
            "executing" => PlanStatus::Executing,
            "completed" => PlanStatus::Completed,
            "paused" => PlanStatus::Paused,
            _ => PlanStatus::Draft,
        }
    }
}

impl From<PlanStatus> for String {
    fn from(status: PlanStatus) -> Self {
        match status {
            PlanStatus::Draft => "draft".to_string(),
            PlanStatus::Planning => "planning".to_string(),
            PlanStatus::Executing => "executing".to_string(),
            PlanStatus::Completed => "completed".to_string(),
            PlanStatus::Paused => "paused".to_string(),
        }
    }
}

/// 智能体角色
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentRole {
    Planner,
    Executor,
    Reviewer,
    Researcher,
}

/// 计划数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub split_agent_id: Option<String>,
    pub split_model_id: Option<String>,
    pub status: String,
    pub agent_team: Option<Vec<String>>,
    pub granularity: i32,
    pub max_retry_count: i32,
    pub execution_status: Option<String>,
    pub current_task_id: Option<String>,
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
    pub split_agent_id: Option<String>,
    pub split_model_id: Option<String>,
    pub status: String,
    pub agent_team: Option<String>, // JSON 字符串
    pub granularity: i32,
    pub max_retry_count: i32,
    pub execution_status: Option<String>,
    pub current_task_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建计划输入
#[derive(Debug, Deserialize)]
pub struct CreatePlanInput {
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub split_agent_id: Option<String>,
    pub split_model_id: Option<String>,
    pub agent_team: Option<Vec<String>>,
    pub granularity: Option<i32>,
    pub max_retry_count: Option<i32>,
}

/// 更新计划输入
#[derive(Debug, Deserialize)]
pub struct UpdatePlanInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub split_agent_id: Option<String>,
    pub split_model_id: Option<String>,
    pub status: Option<String>,
    pub agent_team: Option<Vec<String>>,
    pub granularity: Option<i32>,
    pub max_retry_count: Option<i32>,
    pub execution_status: Option<String>,
    pub current_task_id: Option<String>,
}

/// 获取数据库路径
fn get_db_path() -> Result<std::path::PathBuf> {
    let persistence_dir = super::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}

/// 将 RustPlan 转换为 Plan
fn transform_plan(rust_plan: RustPlan) -> Plan {
    let agent_team = rust_plan
        .agent_team
        .and_then(|s| serde_json::from_str(&s).ok());

    Plan {
        id: rust_plan.id,
        project_id: rust_plan.project_id,
        name: rust_plan.name,
        description: rust_plan.description,
        split_agent_id: rust_plan.split_agent_id,
        split_model_id: rust_plan.split_model_id,
        status: rust_plan.status,
        agent_team,
        granularity: rust_plan.granularity,
        max_retry_count: rust_plan.max_retry_count,
        execution_status: rust_plan.execution_status,
        current_task_id: rust_plan.current_task_id,
        created_at: rust_plan.created_at,
        updated_at: rust_plan.updated_at,
    }
}

/// 获取指定项目的所有计划
#[tauri::command]
pub fn list_plans(project_id: String) -> Result<Vec<Plan>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, project_id, name, description, status, agent_team,
                   split_agent_id, split_model_id,
                   granularity, max_retry_count, execution_status, current_task_id,
                   created_at, updated_at
            FROM plans
            WHERE project_id = ?1
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let plans = stmt
        .query_map([&project_id], |row| {
            Ok(RustPlan {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                status: row.get(4)?,
                agent_team: row.get(5)?,
                split_agent_id: row.get(6)?,
                split_model_id: row.get(7)?,
                granularity: row.get(8)?,
                max_retry_count: row.get(9)?,
                execution_status: row.get(10)?,
                current_task_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(transform_plan)
        .collect();

    Ok(plans)
}

/// 获取单个计划
#[tauri::command]
pub fn get_plan(id: String) -> Result<Plan, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let rust_plan = conn
        .query_row(
            r#"
            SELECT id, project_id, name, description, status, agent_team,
                   split_agent_id, split_model_id,
                   granularity, max_retry_count, execution_status, current_task_id,
                   created_at, updated_at
            FROM plans
            WHERE id = ?1
            "#,
            [&id],
            |row| {
                Ok(RustPlan {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    status: row.get(4)?,
                    agent_team: row.get(5)?,
                    split_agent_id: row.get(6)?,
                    split_model_id: row.get(7)?,
                    granularity: row.get(8)?,
                    max_retry_count: row.get(9)?,
                    execution_status: row.get(10)?,
                    current_task_id: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(transform_plan(rust_plan))
}

/// 创建新计划
#[tauri::command]
pub fn create_plan(input: CreatePlanInput) -> Result<Plan, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = "draft".to_string();
    let execution_status = "idle".to_string();
    let agent_team_json = input
        .agent_team
        .as_ref()
        .map(|t| serde_json::to_string(t).unwrap_or_else(|_| "[]".to_string()));
    let granularity = input.granularity.unwrap_or(20);
    let max_retry_count = input.max_retry_count.unwrap_or(3);

    conn.execute(
        "INSERT INTO plans (id, project_id, name, description, split_agent_id, split_model_id, status, agent_team,
         granularity, max_retry_count, execution_status, current_task_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            &id,
            &input.project_id,
            &input.name,
            &input.description,
            &input.split_agent_id,
            &input.split_model_id,
            &status,
            &agent_team_json,
            &granularity,
            &max_retry_count,
            &execution_status,
            &None::<String>, // current_task_id
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    // 更新项目的 updated_at 时间
    conn.execute(
        "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &input.project_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(Plan {
        id,
        project_id: input.project_id,
        name: input.name,
        description: input.description,
        split_agent_id: input.split_agent_id,
        split_model_id: input.split_model_id,
        status,
        agent_team: input.agent_team,
        granularity,
        max_retry_count,
        execution_status: Some(execution_status),
        current_task_id: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新计划
#[tauri::command]
pub fn update_plan(id: String, input: UpdatePlanInput) -> Result<Plan, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // 构建动态更新语句
    let mut updates: Vec<String> = vec!["updated_at = ?1".to_string()];
    let mut param_index = 2;

    if input.name.is_some() {
        updates.push(format!("name = ?{}", param_index));
        param_index += 1;
    }
    if input.description.is_some() {
        updates.push(format!("description = ?{}", param_index));
        param_index += 1;
    }
    if input.split_agent_id.is_some() {
        updates.push(format!("split_agent_id = ?{}", param_index));
        param_index += 1;
    }
    if input.split_model_id.is_some() {
        updates.push(format!("split_model_id = ?{}", param_index));
        param_index += 1;
    }
    if input.status.is_some() {
        updates.push(format!("status = ?{}", param_index));
        param_index += 1;
    }
    if input.agent_team.is_some() {
        updates.push(format!("agent_team = ?{}", param_index));
        param_index += 1;
    }
    if input.granularity.is_some() {
        updates.push(format!("granularity = ?{}", param_index));
        param_index += 1;
    }
    if input.max_retry_count.is_some() {
        updates.push(format!("max_retry_count = ?{}", param_index));
        param_index += 1;
    }
    if input.execution_status.is_some() {
        updates.push(format!("execution_status = ?{}", param_index));
        param_index += 1;
    }
    if input.current_task_id.is_some() {
        updates.push(format!("current_task_id = ?{}", param_index));
        param_index += 1;
    }

    let sql = format!(
        "UPDATE plans SET {} WHERE id = ?{}",
        updates.join(", "),
        param_index
    );

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    // 绑定参数
    let mut param_count = 1;
    stmt.raw_bind_parameter(param_count, &now)
        .map_err(|e| e.to_string())?;
    param_count += 1;

    if let Some(ref name) = input.name {
        stmt.raw_bind_parameter(param_count, name)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref description) = input.description {
        stmt.raw_bind_parameter(param_count, description)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref split_agent_id) = input.split_agent_id {
        stmt.raw_bind_parameter(param_count, split_agent_id)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref split_model_id) = input.split_model_id {
        stmt.raw_bind_parameter(param_count, split_model_id)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref status) = input.status {
        stmt.raw_bind_parameter(param_count, status)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref agent_team) = input.agent_team {
        let json = serde_json::to_string(agent_team).unwrap_or_else(|_| "[]".to_string());
        stmt.raw_bind_parameter(param_count, json)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(granularity) = input.granularity {
        stmt.raw_bind_parameter(param_count, granularity)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(max_retry_count) = input.max_retry_count {
        stmt.raw_bind_parameter(param_count, max_retry_count)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref execution_status) = input.execution_status {
        stmt.raw_bind_parameter(param_count, execution_status)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref current_task_id) = input.current_task_id {
        stmt.raw_bind_parameter(param_count, current_task_id)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }

    stmt.raw_bind_parameter(param_count, &id)
        .map_err(|e| e.to_string())?;
    stmt.raw_execute().map_err(|e| e.to_string())?;

    // 获取更新后的计划
    let rust_plan = conn
        .query_row(
            r#"
            SELECT id, project_id, name, description, status, agent_team,
                   split_agent_id, split_model_id,
                   granularity, max_retry_count, execution_status, current_task_id,
                   created_at, updated_at
            FROM plans
            WHERE id = ?1
            "#,
            [&id],
            |row| {
                Ok(RustPlan {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    status: row.get(4)?,
                    agent_team: row.get(5)?,
                    split_agent_id: row.get(6)?,
                    split_model_id: row.get(7)?,
                    granularity: row.get(8)?,
                    max_retry_count: row.get(9)?,
                    execution_status: row.get(10)?,
                    current_task_id: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(transform_plan(rust_plan))
}

/// 删除计划
#[tauri::command]
pub fn delete_plan(id: String) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 启用外键约束以触发级联删除
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM plans WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
