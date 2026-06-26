use anyhow::Result;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use super::sub_agent::ensure_builtin_sub_agents;
use super::cli_support::normalize_cli_identifier;
use super::support::{
    bind_optional, bind_optional_mapped, bind_value, bool_from_int, now_rfc3339,
    open_db_connection, UpdateSqlBuilder,
};

/// 智能体配置数据结构
/// 统一使用 ACP (Agent Client Protocol) 运行时
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub agent_type: String,
    pub acp_command: Option<String>,
    pub cli_path: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model_id: Option<String>,
    pub custom_model_enabled: Option<bool>,
    pub provider: Option<String>,
    pub mode: Option<String>,
    pub model: Option<String>,
    pub status: Option<String>,
    pub test_message: Option<String>,
    pub tested_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 测试连接结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub success: bool,
    pub message: String,
}

/// 创建智能体输入
#[derive(Debug, Deserialize)]
pub struct CreateAgentInput {
    pub name: String,
    #[serde(rename = "type")]
    pub agent_type: Option<String>,
    pub acp_command: Option<String>,
    pub cli_path: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model_id: Option<String>,
    pub custom_model_enabled: Option<bool>,
    pub provider: Option<String>,
    pub mode: Option<String>,
    pub model: Option<String>,
}

/// 更新智能体输入
#[derive(Debug, Deserialize)]
pub struct UpdateAgentInput {
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub agent_type: Option<String>,
    pub acp_command: Option<String>,
    pub cli_path: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model_id: Option<String>,
    pub custom_model_enabled: Option<bool>,
    pub provider: Option<String>,
    pub mode: Option<String>,
    pub model: Option<String>,
    pub status: Option<String>,
}

fn normalize_agent_cli_command(value: Option<String>) -> Option<String> {
    value.and_then(|item| normalize_cli_identifier(&item))
}

fn map_agent_row(row: &Row<'_>) -> rusqlite::Result<Agent> {
    let cli_path = normalize_agent_cli_command(row.get(4)?);

    Ok(Agent {
        id: row.get(0)?,
        name: row.get(1)?,
        agent_type: row.get(2)?,
        provider: row.get(3)?,
        cli_path,
        api_key: row.get(5)?,
        base_url: row.get(6)?,
        model_id: row.get(7)?,
        custom_model_enabled: bool_from_int(row.get::<_, Option<i32>>(8)?),
        mode: row.get(9)?,
        model: row.get(10)?,
        status: row.get(11)?,
        test_message: row.get(12)?,
        tested_at: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        acp_command: row.get(16)?,
    })
}

/// 解析智能体的运行模式。
///
/// 当前所有智能体统一使用 ACP 运行时，`agent_type` 恒为 `"acp"`，
/// 仅需根据传入的 provider / mode 兜底默认值。
fn resolve_agent_mode(
    provider: Option<&String>,
    mode: Option<&String>,
) -> (Option<String>, String) {
    let resolved_mode = mode.cloned().unwrap_or_else(|| "acp".to_string());
    (provider.cloned(), resolved_mode)
}

/// 获取所有智能体配置
#[tauri::command]
pub fn list_agents() -> Result<Vec<Agent>, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, type, provider, cli_path, api_key, base_url, model_id, custom_model_enabled,
                   mode, model, status, test_message, tested_at, created_at, updated_at, acp_command
            FROM agents
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let agents = stmt
        .query_map([], map_agent_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(agents)
}

/// 创建新智能体配置
#[tauri::command]
pub fn create_agent(input: CreateAgentInput) -> Result<Agent, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let status = "offline".to_string();

    let (final_provider, final_mode) = resolve_agent_mode(
        input.provider.as_ref(),
        input.mode.as_ref(),
    );
    let final_type = "acp".to_string();

    let custom_model_enabled_int = if input.custom_model_enabled.unwrap_or(false) {
        1
    } else {
        0
    };
    let cli_path = normalize_agent_cli_command(input.cli_path.clone());

    conn.execute(
        "INSERT INTO agents (id, name, type, provider, cli_path, api_key, base_url, model_id, custom_model_enabled, mode, model, status, acp_command, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        rusqlite::params![
            &id,
            &input.name,
            &final_type,
            &final_provider,
            &cli_path,
            &input.api_key,
            &input.base_url,
            &input.model_id,
            &custom_model_enabled_int,
            &final_mode,
            &input.model,
            &status,
            &input.acp_command,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    ensure_builtin_sub_agents(&conn)?;

    Ok(Agent {
        id,
        name: input.name,
        agent_type: final_type,
        provider: final_provider,
        cli_path,
        api_key: input.api_key,
        base_url: input.base_url,
        model_id: input.model_id,
        custom_model_enabled: input.custom_model_enabled,
        mode: Some(final_mode),
        model: input.model,
        status: Some(status),
        test_message: None,
        tested_at: None,
        acp_command: input.acp_command,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新智能体配置
#[tauri::command]
pub fn update_agent(id: String, input: UpdateAgentInput) -> Result<Agent, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let now = now_rfc3339();
    let cli_path = normalize_agent_cli_command(input.cli_path.clone());

    let mut updates = UpdateSqlBuilder::new();
    updates.push("name", input.name.is_some());
    updates.push("type", input.agent_type.is_some());
    updates.push("provider", input.provider.is_some());
    updates.push("cli_path", input.cli_path.is_some());
    updates.push("api_key", input.api_key.is_some());
    updates.push("base_url", input.base_url.is_some());
    updates.push("model_id", input.model_id.is_some());
    updates.push("custom_model_enabled", input.custom_model_enabled.is_some());
    updates.push("mode", input.mode.is_some());
    updates.push("model", input.model.is_some());
    updates.push("status", input.status.is_some());
    updates.push("acp_command", input.acp_command.is_some());

    let sql = updates.finish("agents", "id");

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    let mut param_count = 1;
    bind_value(&mut stmt, &mut param_count, &now).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.name).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.agent_type).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.provider).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &cli_path).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.api_key).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.base_url).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.model_id).map_err(|e| e.to_string())?;
    bind_optional_mapped(
        &mut stmt,
        &mut param_count,
        &input.custom_model_enabled,
        |value| if *value { 1 } else { 0 },
    )
    .map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.mode).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.model).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.status).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.acp_command).map_err(|e| e.to_string())?;
    bind_value(&mut stmt, &mut param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    ensure_builtin_sub_agents(&conn)?;

    // 获取更新后的智能体
    let agent = get_agent_by_id(&conn, &id)?;

    Ok(agent)
}

/// 获取单个智能体
fn get_agent_by_id(conn: &Connection, id: &str) -> Result<Agent, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, type, provider, cli_path, api_key, base_url, model_id, custom_model_enabled,
                   mode, model, status, test_message, tested_at, created_at, updated_at, acp_command
            FROM agents
            WHERE id = ?1
            "#,
        )
        .map_err(|e| e.to_string())?;

    let agent = stmt
        .query_row([id], map_agent_row)
        .map_err(|e| e.to_string())?;

    Ok(agent)
}

/// 删除智能体配置
#[tauri::command]
pub fn delete_agent(id: String) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM agents WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    ensure_builtin_sub_agents(&conn)?;

    Ok(())
}

/// 测试智能体连接
#[tauri::command]
pub async fn test_agent_connection(id: String) -> Result<TestResult, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    // 获取智能体配置
    let agent = get_agent_by_id(&conn, &id)?;

    // 更新状态为 testing
    let now = now_rfc3339();
    conn.execute(
        "UPDATE agents SET status = 'testing', updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &id],
    )
    .map_err(|e| e.to_string())?;

    // 当前所有智能体统一使用 ACP 运行时，直接走 ACP 连接测试
    let (success, message) = test_acp_connection(&agent).await;

    // 更新测试结果
    let status = if success { "online" } else { "error" };
    let tested_at = now_rfc3339();
    conn.execute(
        "UPDATE agents SET status = ?1, test_message = ?2, tested_at = ?3, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![status, &message, &tested_at, &id],
    )
    .map_err(|e| e.to_string())?;

    Ok(TestResult { success, message })
}

async fn test_acp_connection(agent: &Agent) -> (bool, String) {
    use std::str::FromStr;

    let acp_command = match agent
        .acp_command
        .as_deref()
        .or_else(|| agent.cli_path.as_deref())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        Some(cmd) => cmd,
        None => return (false, "ACP 命令未配置".to_string()),
    };

    match agent_client_protocol_tokio::AcpAgent::from_str(acp_command) {
        Ok(_) => (true, format!("ACP 命令解析成功: {}", acp_command)),
        Err(e) => (false, format!("ACP 命令解析失败: {}", e)),
    }
}
