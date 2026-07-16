use serde::{Deserialize, Serialize};

use super::message::remove_session_uploads;
use super::support::{now_rfc3339, repair_memory_search_indexes};
use crate::db;
use crate::mappers::session as session_mapper;
use crate::mappers::session::{SessionInsert, SessionUpdate};
use crate::models::{SessionRow, SessionRuntimeBindingRow};

/// 会话数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_type: String,
    pub cli_session_id: Option<String>,
    pub cli_session_provider: Option<String>,
    pub status: String,
    pub pinned: bool,
    pub last_message: Option<String>,
    pub error_message: Option<String>,
    pub message_count: i32,
    pub plan_mode: bool,
    pub source: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 会话运行时绑定。
/// 用于按 runtime_key 持久化不同 CLI/SDK 的外部恢复游标，避免不同运行时之间互相污染。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRuntimeBinding {
    pub session_id: String,
    pub runtime_key: String,
    pub external_session_id: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建会话输入
#[derive(Debug, Deserialize)]
pub struct CreateSessionInput {
    pub project_id: String,
    pub name: Option<String>,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_type: String,
    pub status: Option<String>,
}

/// 更新会话输入
#[derive(Debug, Deserialize)]
pub struct UpdateSessionInput {
    pub name: Option<String>,
    pub status: Option<String>,
    pub pinned: Option<bool>,
    pub last_message: Option<String>,
    pub error_message: Option<String>,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_type: Option<String>,
    pub cli_session_id: Option<String>,
    pub cli_session_provider: Option<String>,
    pub plan_mode: Option<bool>,
}

/// 生成默认会话名称（带时间戳）
fn generate_default_session_name() -> String {
    let now = chrono::Local::now();
    format!("新会话 {}", now.format("%m-%d %H:%M"))
}

/// 把 rbatis 行映射转换为对外的 Session DTO。
fn session_row_to_session(row: SessionRow) -> Result<Session, String> {
    Ok(Session {
        id: row.id.ok_or("sessions.id 缺失")?,
        project_id: row.project_id.ok_or("sessions.project_id 缺失")?,
        name: row.name.ok_or("sessions.name 缺失")?,
        expert_id: row.expert_id,
        agent_id: row.agent_id,
        agent_type: row.agent_type.ok_or("sessions.agent_type 缺失")?,
        cli_session_id: row.cli_session_id,
        cli_session_provider: row.cli_session_provider,
        status: row.status.unwrap_or_else(|| "idle".to_string()),
        pinned: row.pinned.unwrap_or(0) != 0,
        last_message: row.last_message,
        error_message: row.error_message,
        message_count: row.message_count.unwrap_or(0) as i32,
        plan_mode: row.plan_mode.unwrap_or(0) != 0,
        source: row.source.unwrap_or_else(|| "chat".to_string()),
        created_at: row.created_at.ok_or("sessions.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("sessions.updated_at 缺失")?,
    })
}

/// 把行映射转换为 SessionRuntimeBinding DTO。
fn binding_row_to_binding(row: SessionRuntimeBindingRow) -> Result<SessionRuntimeBinding, String> {
    Ok(SessionRuntimeBinding {
        session_id: row.session_id.ok_or("session_runtime_bindings.session_id 缺失")?,
        runtime_key: row.runtime_key.ok_or("session_runtime_bindings.runtime_key 缺失")?,
        external_session_id: row
            .external_session_id
            .ok_or("session_runtime_bindings.external_session_id 缺失")?,
        created_at: row.created_at.ok_or("session_runtime_bindings.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("session_runtime_bindings.updated_at 缺失")?,
    })
}

/// 按 id 读取会话（内部复用）。
async fn fetch_session_by_id(id: &str) -> Result<Session, String> {
    let row = session_mapper::get_session_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "会话不存在".to_string())?;
    session_row_to_session(row)
}

/// 获取指定项目的所有会话
#[tauri::command]
pub async fn list_sessions(project_id: String) -> Result<Vec<Session>, String> {
    let rows = session_mapper::list_sessions(db::rb(), &project_id)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(session_row_to_session).collect()
}

/// 创建新会话
#[tauri::command]
pub async fn create_session(input: CreateSessionInput) -> Result<Session, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let name = input.name.unwrap_or_else(generate_default_session_name);
    let status = input.status.unwrap_or_else(|| "idle".to_string());

    let row = SessionInsert {
        id: id.clone(),
        project_id: input.project_id.clone(),
        name: name.clone(),
        expert_id: input.expert_id.clone(),
        agent_id: input.agent_id.clone(),
        agent_type: input.agent_type.clone(),
        status: status.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    session_mapper::insert_session(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    // 更新项目的 updated_at 时间
    session_mapper::touch_project_updated_at(db::rb(), &input.project_id, &now)
        .await
        .map_err(|e| e.to_string())?;

    Ok(Session {
        id,
        project_id: input.project_id,
        name,
        expert_id: input.expert_id,
        agent_id: input.agent_id,
        agent_type: input.agent_type,
        cli_session_id: None,
        cli_session_provider: None,
        status,
        pinned: false,
        last_message: None,
        error_message: None,
        message_count: 0,
        plan_mode: false,
        source: "chat".to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新会话
#[tauri::command]
pub async fn update_session(id: String, input: UpdateSessionInput) -> Result<Session, String> {
    let now = now_rfc3339();

    // 动态更新语句的参数（布尔列在 SQLite 中存为 INTEGER）
    let update = SessionUpdate {
        id: id.clone(),
        updated_at: now,
        name: input.name,
        status: input.status,
        pinned: input.pinned.map(|flag| if flag { 1 } else { 0 }),
        last_message: input.last_message,
        error_message: input.error_message,
        expert_id: input.expert_id,
        agent_id: input.agent_id,
        agent_type: input.agent_type,
        cli_session_id: input.cli_session_id,
        cli_session_provider: input.cli_session_provider,
        plan_mode: input.plan_mode.map(|flag| if flag { 1 } else { 0 }),
    };

    session_mapper::update_session(db::rb(), &update)
        .await
        .map_err(|e| e.to_string())?;

    // 获取更新后的会话
    fetch_session_by_id(&id).await
}

/// 删除会话
#[tauri::command]
pub async fn delete_session(id: String) -> Result<(), String> {
    // 修复记忆搜索索引（FTS 维护）：rbatis 迁移后直接用全局连接池。
    repair_memory_search_indexes()
        .await
        .map_err(|e| format!("修复记忆搜索索引失败: {}", e))?;

    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    session_mapper::delete_window_session_locks(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;
    session_mapper::nullify_tasks_session(&tx, &id, &now_rfc3339())
        .await
        .map_err(|e| e.to_string())?;
    session_mapper::delete_agent_cli_usage_records(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;
    session_mapper::delete_session_by_id(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    remove_session_uploads(&id)?;

    Ok(())
}

/// 切换会话固定状态
#[tauri::command]
pub async fn toggle_session_pin(id: String) -> Result<Session, String> {
    let now = now_rfc3339();

    // 先获取当前固定状态
    let current = session_mapper::get_session_pinned(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "会话不存在".to_string())?;
    let current_pinned = current.value.unwrap_or(0) != 0;

    // 切换状态
    session_mapper::set_session_pinned(db::rb(), &id, if current_pinned { 0 } else { 1 }, &now)
        .await
        .map_err(|e| e.to_string())?;

    fetch_session_by_id(&id).await
}

/// 获取指定会话在某个运行时下的恢复绑定。
#[tauri::command]
pub async fn get_session_runtime_binding(
    session_id: String,
    runtime_key: String,
) -> Result<Option<SessionRuntimeBinding>, String> {
    let row = session_mapper::get_session_runtime_binding(db::rb(), &session_id, &runtime_key)
        .await
        .map_err(|e| e.to_string())?;
    row.into_iter().next().map(binding_row_to_binding).transpose()
}

/// 创建或更新会话的运行时恢复绑定。
#[tauri::command]
pub async fn upsert_session_runtime_binding(
    session_id: String,
    runtime_key: String,
    external_session_id: String,
) -> Result<SessionRuntimeBinding, String> {
    let now = now_rfc3339();

    session_mapper::upsert_session_runtime_binding(
        db::rb(),
        &session_id,
        &runtime_key,
        &external_session_id,
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    let row = session_mapper::get_session_runtime_binding(db::rb(), &session_id, &runtime_key)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "会话运行时绑定写入后读取失败".to_string())?;
    binding_row_to_binding(row)
}

/// 删除会话在某个运行时下的恢复绑定。
#[tauri::command]
pub async fn delete_session_runtime_binding(
    session_id: String,
    runtime_key: String,
) -> Result<(), String> {
    session_mapper::delete_session_runtime_binding(db::rb(), &session_id, &runtime_key)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
