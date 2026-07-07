//! 智能体（agents 主表）命令 —— 已从 rusqlite 同步迁移到 rbatis async。
//!
//! DB 访问全部走 `mappers::agent` + `sql/agent.html`。
//! 内置子代理种子经 `sub_agent::ensure_builtin_sub_agents`（已迁移到 rbatis）直接调用。

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::cli_support::normalize_cli_identifier;
use super::sub_agent::ensure_builtin_sub_agents;
use super::support::now_rfc3339;

use crate::db;
use crate::mappers::agent as agent_mapper;
use crate::models::AgentRow;

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
    #[allow(dead_code)]
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

/// 把 rbatis 行映射 `AgentRow` 转成对外 DTO `Agent`（含 cli_path 归一化、bool 还原）。
fn row_to_agent(row: AgentRow) -> Agent {
    Agent {
        id: row.id.unwrap_or_default(),
        name: row.name.unwrap_or_default(),
        agent_type: row.agent_type.unwrap_or_else(|| "acp".to_string()),
        acp_command: row.acp_command,
        cli_path: normalize_agent_cli_command(row.cli_path),
        api_key: row.api_key,
        base_url: row.base_url,
        model_id: row.model_id,
        custom_model_enabled: row.custom_model_enabled.map(|v| v != 0),
        provider: row.provider,
        mode: row.mode,
        model: row.model,
        status: row.status,
        test_message: row.test_message,
        tested_at: row.tested_at,
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    }
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

/// 执行内置子代理种子（sub_agent 模块已迁移到 rbatis，直接异步调用）。
async fn ensure_builtin_sub_agents_safe() -> Result<(), String> {
    ensure_builtin_sub_agents().await
}

/// 获取所有智能体配置
#[tauri::command]
pub async fn list_agents() -> Result<Vec<Agent>, String> {
    let rows = agent_mapper::list_agents(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(row_to_agent).collect())
}

/// 创建新智能体配置
#[tauri::command]
pub async fn create_agent(input: CreateAgentInput) -> Result<Agent, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let status = "offline".to_string();

    let (final_provider, final_mode) =
        resolve_agent_mode(input.provider.as_ref(), input.mode.as_ref());
    let final_type = "acp".to_string();

    let custom_model_enabled_int = if input.custom_model_enabled.unwrap_or(false) {
        1
    } else {
        0
    };
    let cli_path = normalize_agent_cli_command(input.cli_path.clone());

    agent_mapper::create_agent(
        db::rb(),
        &id,
        &input.name,
        &final_type,
        final_provider.as_deref(),
        cli_path.as_deref(),
        input.api_key.as_deref(),
        input.base_url.as_deref(),
        input.model_id.as_deref(),
        custom_model_enabled_int,
        &final_mode,
        input.model.as_deref(),
        &status,
        input.acp_command.as_deref(),
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    ensure_builtin_sub_agents_safe().await?;

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
pub async fn update_agent(id: String, input: UpdateAgentInput) -> Result<Agent, String> {
    let now = now_rfc3339();
    let cli_path = normalize_agent_cli_command(input.cli_path.clone());
    let custom_model_enabled = input.custom_model_enabled.map(|v| if v { 1 } else { 0 });

    agent_mapper::update_agent(
        db::rb(),
        &id,
        &now,
        input.name.as_deref(),
        input.agent_type.as_deref(),
        input.provider.as_deref(),
        cli_path.as_deref(),
        input.api_key.as_deref(),
        input.base_url.as_deref(),
        input.model_id.as_deref(),
        custom_model_enabled,
        input.mode.as_deref(),
        input.model.as_deref(),
        input.status.as_deref(),
        input.acp_command.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;

    ensure_builtin_sub_agents_safe().await?;

    // 获取更新后的智能体
    let row = agent_mapper::get_agent_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("智能体不存在: {}", id))?;
    Ok(row_to_agent(row))
}

/// 删除智能体配置
#[tauri::command]
pub async fn delete_agent(id: String) -> Result<(), String> {
    agent_mapper::delete_agent(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;

    ensure_builtin_sub_agents_safe().await?;

    Ok(())
}

/// 测试智能体连接
#[tauri::command]
pub async fn test_agent_connection(id: String) -> Result<TestResult, String> {
    // 获取智能体配置
    let row = agent_mapper::get_agent_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("智能体不存在: {}", id))?;
    let agent = row_to_agent(row);

    // 更新状态为 testing
    let now = now_rfc3339();
    agent_mapper::update_agent_status_testing(db::rb(), &id, &now)
        .await
        .map_err(|e| e.to_string())?;

    // 当前所有智能体统一使用 ACP 运行时，直接走 ACP 连接测试
    let (success, message) = test_acp_connection(&agent).await;

    // 更新测试结果
    let status = if success { "online" } else { "error" };
    let tested_at = now_rfc3339();
    agent_mapper::update_agent_test_result(
        db::rb(),
        &id,
        status,
        &message,
        &tested_at,
        &tested_at,
    )
    .await
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
