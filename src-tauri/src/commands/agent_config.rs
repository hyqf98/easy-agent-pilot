//! Agent 子配置（MCP / Skills / Plugins / Models）命令 —— 已从 rusqlite 同步
//! 迁移到 rbatis async。
//!
//! - DB 访问全部走 `mappers::agent_config` + `sql/agent_config.html`。
//! - 动态更新用 .html 里的 `<set>+<if>`，彻底消灭旧 `UpdateSqlBuilder`
//!   "push 字段顺序必须等于 bind 顺序" 的隐性 bug。
//! - `sync_agent_models` 的事务改为 `rb.acquire_begin()` + `&mut tx` + `commit`。
//! - 读取 agent provider / ACP 命令复用 `mappers::agent`。

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::support::now_rfc3339;

use crate::db;
use crate::mappers::agent as agent_mapper;
use crate::mappers::agent_config as ac;
use crate::models::{
    value_to_json_string_opt, AgentMcpConfigRow, AgentModelRow, AgentPluginsConfigRow,
    AgentSkillsConfigRow,
};

// ============================================================================
// MCP 配置
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMcpConfig {
    pub id: String,
    pub agent_id: String,
    pub name: String,
    pub transport_type: String,
    pub command: Option<String>,
    pub args: Option<String>,
    pub env: Option<String>,
    pub url: Option<String>,
    pub headers: Option<String>,
    pub scope: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentMcpConfigInput {
    pub agent_id: String,
    pub name: String,
    pub transport_type: Option<String>,
    pub command: Option<String>,
    pub args: Option<String>,
    pub env: Option<String>,
    pub url: Option<String>,
    pub headers: Option<String>,
    pub scope: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgentMcpConfigInput {
    pub name: Option<String>,
    pub transport_type: Option<String>,
    pub command: Option<String>,
    pub args: Option<String>,
    pub env: Option<String>,
    pub url: Option<String>,
    pub headers: Option<String>,
    pub scope: Option<String>,
    pub enabled: Option<bool>,
}

fn is_legacy_codex_builtin_model(model_id: &str) -> bool {
    matches!(
        model_id,
        "gpt-4.5"
            | "o3"
            | "o3-mini"
            | "o4-mini"
            | "gpt-5-codex"
            | "gpt-5.2-codex"
            | "gpt-5.1-codex"
            | "gpt-5.2"
            | "gpt-5.1"
            | "gpt-5"
    )
}

/// 读取 agent 的 provider（用于判定 codex/opencode）。
async fn get_agent_provider(agent_id: &str) -> Result<Option<String>, String> {
    // 直接用 rb.query 绕过 #[html_sql] 宏对 Option<T> + 0 行的反序列化问题
    let value = db::rb()
        .query(
            "select provider as value from agents where id = ?",
            vec![rbs::Value::String(agent_id.to_string())],
        )
        .await
        .map_err(|e| e.to_string())?;
    // 解析 Value::Array，取首行 Map 的首列；provider 是 TEXT，匹配 String
    if let rbs::Value::Array(rows) = &value {
        if let Some(first_row) = rows.first() {
            if let rbs::Value::Map(m) = first_row {
                if let Some((_, rbs::Value::String(s))) = m.0.iter().next() {
                    return Ok(Some(s.clone()));
                }
            }
        }
    }
    Ok(None)
}

// ----------------------------- 行映射转换 ---------------------------------

fn row_to_mcp(row: AgentMcpConfigRow) -> AgentMcpConfig {
    AgentMcpConfig {
        id: row.id.unwrap_or_default(),
        agent_id: row.agent_id.unwrap_or_default(),
        name: row.name.unwrap_or_default(),
        transport_type: row
            .transport_type
            .unwrap_or_else(|| "stdio".to_string()),
        command: row.command,
        args: value_to_json_string_opt(row.args),
        env: value_to_json_string_opt(row.env),
        url: row.url,
        headers: value_to_json_string_opt(row.headers),
        scope: row.scope.unwrap_or_else(|| "user".to_string()),
        enabled: row.enabled.map(|v| v != 0).unwrap_or(true),
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    }
}

fn row_to_skills(row: AgentSkillsConfigRow) -> AgentSkillsConfig {
    AgentSkillsConfig {
        id: row.id.unwrap_or_default(),
        agent_id: row.agent_id.unwrap_or_default(),
        name: row.name.unwrap_or_default(),
        description: row.description,
        skill_path: row.skill_path.unwrap_or_default(),
        scripts_path: row.scripts_path,
        references_path: row.references_path,
        assets_path: row.assets_path,
        enabled: row.enabled.map(|v| v != 0).unwrap_or(true),
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    }
}

fn row_to_plugins(row: AgentPluginsConfigRow) -> AgentPluginsConfig {
    AgentPluginsConfig {
        id: row.id.unwrap_or_default(),
        agent_id: row.agent_id.unwrap_or_default(),
        name: row.name.unwrap_or_default(),
        version: row.version,
        description: row.description,
        plugin_path: row.plugin_path.unwrap_or_default(),
        enabled: row.enabled.map(|v| v != 0).unwrap_or(true),
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    }
}

fn row_to_model(row: AgentModelRow) -> AgentModelConfig {
    AgentModelConfig {
        id: row.id.unwrap_or_default(),
        agent_id: row.agent_id.unwrap_or_default(),
        model_id: row.model_id.unwrap_or_default(),
        display_name: row.display_name.unwrap_or_default(),
        is_builtin: row.is_builtin.map(|v| v != 0).unwrap_or(false),
        is_default: row.is_default.map(|v| v != 0).unwrap_or(false),
        sort_order: row.sort_order.map(|v| v as i32).unwrap_or(0),
        enabled: row.enabled.map(|v| v != 0).unwrap_or(true),
        context_window: row.context_window.map(|v| v as i32),
        input_cost_per_million_usd: row.input_cost_per_million_usd,
        output_cost_per_million_usd: row.output_cost_per_million_usd,
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    }
}

/// 列出某 agent 的模型（含 codex 旧内置模型过滤逻辑，与旧实现一致）。
async fn list_models_for_agent(agent_id: &str) -> Result<Vec<AgentModelConfig>, String> {
    let rows = ac::select_models_by_agent(db::rb(), agent_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut models: Vec<AgentModelConfig> = rows.into_iter().map(row_to_model).collect();

    if get_agent_provider(agent_id).await?.as_deref() == Some("codex") {
        models.retain(|model| !(model.is_builtin && is_legacy_codex_builtin_model(&model.model_id)));
    }

    Ok(models)
}

#[tauri::command]
pub async fn list_agent_mcp_configs(agent_id: String) -> Result<Vec<AgentMcpConfig>, String> {
    let rows = ac::select_mcp_by_agent(db::rb(), &agent_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(row_to_mcp).collect())
}

#[tauri::command]
pub async fn create_agent_mcp_config(
    input: CreateAgentMcpConfigInput,
) -> Result<AgentMcpConfig, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let transport_type = input.transport_type.unwrap_or_else(|| "stdio".to_string());
    let scope = input.scope.unwrap_or_else(|| "user".to_string());

    ac::insert_mcp(
        db::rb(),
        &id,
        &input.agent_id,
        &input.name,
        &transport_type,
        input.command.as_deref(),
        input
            .args
            .as_ref()
            .map(|v| rbs::Value::String(v.clone())),
        input
            .env
            .as_ref()
            .map(|v| rbs::Value::String(v.clone())),
        input.url.as_deref(),
        input
            .headers
            .as_ref()
            .map(|v| rbs::Value::String(v.clone())),
        &scope,
        1,
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(AgentMcpConfig {
        id,
        agent_id: input.agent_id,
        name: input.name,
        transport_type,
        command: input.command,
        args: input.args,
        env: input.env,
        url: input.url,
        headers: input.headers,
        scope,
        enabled: true,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_agent_mcp_config(
    id: String,
    input: UpdateAgentMcpConfigInput,
) -> Result<AgentMcpConfig, String> {
    let now = now_rfc3339();
    let enabled = input.enabled.map(|v| if v { 1 } else { 0 });

    ac::update_mcp(
        db::rb(),
        &id,
        &now,
        input.name.as_deref(),
        input.transport_type.as_deref(),
        input.command.as_deref(),
        input
            .args
            .as_ref()
            .map(|v| rbs::Value::String(v.clone())),
        input
            .env
            .as_ref()
            .map(|v| rbs::Value::String(v.clone())),
        input.url.as_deref(),
        input
            .headers
            .as_ref()
            .map(|v| rbs::Value::String(v.clone())),
        input.scope.as_deref(),
        enabled,
    )
    .await
    .map_err(|e| e.to_string())?;

    let row = ac::select_mcp_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("MCP 配置不存在: {}", id))?;
    Ok(row_to_mcp(row))
}

#[tauri::command]
pub async fn delete_agent_mcp_config(id: String) -> Result<(), String> {
    ac::delete_mcp(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Skills 配置
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSkillsConfig {
    pub id: String,
    pub agent_id: String,
    pub name: String,
    pub description: Option<String>,
    pub skill_path: String,
    pub scripts_path: Option<String>,
    pub references_path: Option<String>,
    pub assets_path: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentSkillsConfigInput {
    pub agent_id: String,
    pub name: String,
    pub description: Option<String>,
    pub skill_path: String,
    pub scripts_path: Option<String>,
    pub references_path: Option<String>,
    pub assets_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgentSkillsConfigInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub skill_path: Option<String>,
    pub scripts_path: Option<String>,
    pub references_path: Option<String>,
    pub assets_path: Option<String>,
    pub enabled: Option<bool>,
}

#[tauri::command]
pub async fn list_agent_skills_configs(agent_id: String) -> Result<Vec<AgentSkillsConfig>, String> {
    let rows = ac::select_skills_by_agent(db::rb(), &agent_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(row_to_skills).collect())
}

#[tauri::command]
pub async fn create_agent_skills_config(
    input: CreateAgentSkillsConfigInput,
) -> Result<AgentSkillsConfig, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    ac::insert_skills(
        db::rb(),
        &id,
        &input.agent_id,
        &input.name,
        input.description.as_deref(),
        &input.skill_path,
        input.scripts_path.as_deref(),
        input.references_path.as_deref(),
        input.assets_path.as_deref(),
        1,
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(AgentSkillsConfig {
        id,
        agent_id: input.agent_id,
        name: input.name,
        description: input.description,
        skill_path: input.skill_path,
        scripts_path: input.scripts_path,
        references_path: input.references_path,
        assets_path: input.assets_path,
        enabled: true,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_agent_skills_config(
    id: String,
    input: UpdateAgentSkillsConfigInput,
) -> Result<AgentSkillsConfig, String> {
    let now = now_rfc3339();
    let enabled = input.enabled.map(|v| if v { 1 } else { 0 });

    ac::update_skills(
        db::rb(),
        &id,
        &now,
        input.name.as_deref(),
        input.description.as_deref(),
        input.skill_path.as_deref(),
        input.scripts_path.as_deref(),
        input.references_path.as_deref(),
        input.assets_path.as_deref(),
        enabled,
    )
    .await
    .map_err(|e| e.to_string())?;

    let row = ac::select_skills_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("Skills 配置不存在: {}", id))?;
    Ok(row_to_skills(row))
}

#[tauri::command]
pub async fn delete_agent_skills_config(id: String) -> Result<(), String> {
    ac::delete_skills(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Plugins 配置
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPluginsConfig {
    pub id: String,
    pub agent_id: String,
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub plugin_path: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentPluginsConfigInput {
    pub agent_id: String,
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub plugin_path: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgentPluginsConfigInput {
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub plugin_path: Option<String>,
    pub enabled: Option<bool>,
}

#[tauri::command]
pub async fn list_agent_plugins_configs(
    agent_id: String,
) -> Result<Vec<AgentPluginsConfig>, String> {
    let rows = ac::select_plugins_by_agent(db::rb(), &agent_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(row_to_plugins).collect())
}

#[tauri::command]
pub async fn create_agent_plugins_config(
    input: CreateAgentPluginsConfigInput,
) -> Result<AgentPluginsConfig, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    ac::insert_plugins(
        db::rb(),
        &id,
        &input.agent_id,
        &input.name,
        input.version.as_deref(),
        input.description.as_deref(),
        &input.plugin_path,
        1,
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(AgentPluginsConfig {
        id,
        agent_id: input.agent_id,
        name: input.name,
        version: input.version,
        description: input.description,
        plugin_path: input.plugin_path,
        enabled: true,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_agent_plugins_config(
    id: String,
    input: UpdateAgentPluginsConfigInput,
) -> Result<AgentPluginsConfig, String> {
    let now = now_rfc3339();
    let enabled = input.enabled.map(|v| if v { 1 } else { 0 });

    ac::update_plugins(
        db::rb(),
        &id,
        &now,
        input.name.as_deref(),
        input.version.as_deref(),
        input.description.as_deref(),
        input.plugin_path.as_deref(),
        enabled,
    )
    .await
    .map_err(|e| e.to_string())?;

    let row = ac::select_plugins_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("Plugins 配置不存在: {}", id))?;
    Ok(row_to_plugins(row))
}

#[tauri::command]
pub async fn delete_agent_plugins_config(id: String) -> Result<(), String> {
    ac::delete_plugins(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// 模型配置
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentModelConfig {
    pub id: String,
    pub agent_id: String,
    pub model_id: String,
    pub display_name: String,
    pub is_builtin: bool,
    pub is_default: bool,
    pub sort_order: i32,
    pub enabled: bool,
    pub context_window: Option<i32>,
    pub input_cost_per_million_usd: Option<f64>,
    pub output_cost_per_million_usd: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentModelInput {
    pub agent_id: String,
    pub model_id: String,
    pub display_name: String,
    pub is_builtin: Option<bool>,
    pub is_default: Option<bool>,
    pub sort_order: Option<i32>,
    pub context_window: Option<i32>,
    pub input_cost_per_million_usd: Option<f64>,
    pub output_cost_per_million_usd: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgentModelInput {
    pub model_id: Option<String>,
    pub display_name: Option<String>,
    pub is_default: Option<bool>,
    pub sort_order: Option<i32>,
    pub enabled: Option<bool>,
    pub context_window: Option<i32>,
    pub input_cost_per_million_usd: Option<f64>,
    pub output_cost_per_million_usd: Option<f64>,
}

#[tauri::command]
pub async fn list_agent_models(agent_id: String) -> Result<Vec<AgentModelConfig>, String> {
    list_models_for_agent(&agent_id).await
}

#[tauri::command]
pub async fn create_agent_model(input: CreateAgentModelInput) -> Result<AgentModelConfig, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let is_builtin = input.is_builtin.unwrap_or(false);
    let is_default = input.is_default.unwrap_or(false);
    let sort_order = input.sort_order.unwrap_or(0);
    let context_window = input.context_window;
    let input_cost_per_million_usd = input.input_cost_per_million_usd;
    let output_cost_per_million_usd = input.output_cost_per_million_usd;

    // 如果设置为默认，需要先清除其他默认配置
    if is_default {
        ac::clear_default_models(db::rb(), &input.agent_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    ac::insert_model(
        db::rb(),
        &id,
        &input.agent_id,
        &input.model_id,
        &input.display_name,
        if is_builtin { 1 } else { 0 },
        if is_default { 1 } else { 0 },
        sort_order as i64,
        1,
        context_window.map(|v| v as i64),
        input_cost_per_million_usd,
        output_cost_per_million_usd,
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(AgentModelConfig {
        id,
        agent_id: input.agent_id,
        model_id: input.model_id,
        display_name: input.display_name,
        is_builtin,
        is_default,
        sort_order,
        enabled: true,
        context_window,
        input_cost_per_million_usd,
        output_cost_per_million_usd,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新模型配置
#[tauri::command]
pub async fn update_agent_model(
    id: String,
    input: UpdateAgentModelInput,
) -> Result<AgentModelConfig, String> {
    let now = now_rfc3339();

    // 如果设置为默认，需要先清除同 agent 的其他默认配置
    if input.is_default.unwrap_or(false) {
        // 复用 select_model_by_id 取得 agent_id（避免新增专用 SQL/结构）
        let existing = ac::select_model_by_id(db::rb(), &id)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .next()
            .ok_or_else(|| format!("模型配置不存在: {}", id))?;
        let agent_id = existing.agent_id.unwrap_or_default();
        ac::clear_default_models(db::rb(), &agent_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    let is_default = input.is_default.map(|v| if v { 1 } else { 0 });
    let enabled = input.enabled.map(|v| if v { 1 } else { 0 });
    let sort_order = input.sort_order.map(|v| v as i64);
    let context_window = input.context_window.map(|v| v as i64);

    ac::update_model(
        db::rb(),
        &id,
        &now,
        input.model_id.as_deref(),
        input.display_name.as_deref(),
        is_default,
        sort_order,
        enabled,
        context_window,
        input.input_cost_per_million_usd,
        input.output_cost_per_million_usd,
    )
    .await
    .map_err(|e| e.to_string())?;

    let row = ac::select_model_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("模型配置不存在: {}", id))?;
    Ok(row_to_model(row))
}

/// 删除模型配置
#[tauri::command]
pub async fn delete_agent_model(id: String) -> Result<(), String> {
    ac::delete_model(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 同步模型结果：本次新增数量、跳过（已存在）数量、合并后的完整列表。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAgentModelsResult {
    pub synced_count: usize,
    pub skipped_count: usize,
    pub models: Vec<AgentModelConfig>,
}

/// 通过 ACP 标准协议同步 Agent 支持的模型清单。
///
/// 流程：读取 agent 的 `acp_command`（fallback `cli_path`）→ 建立短命探测会话
/// 读取 `NewSessionResponse.models.available_models` → 按 `model_id` 去重合并进
/// `agent_models`（已存在的跳过、不覆盖用户配置，缺失的新增）。探测会话不发送任何 prompt。
#[tauri::command]
pub async fn sync_agent_models(agent_id: String) -> Result<SyncAgentModelsResult, String> {
    use crate::commands::conversation::strategies::{
        probe_acp_models, probe_opencode_models, resolve_acp_command,
    };

    // 1. 读取 agent 的 ACP 命令（与 test_acp_connection 同款取值优先级）
    let raw_command = agent_mapper::select_agent_command(db::rb(), &agent_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .and_then(|row| crate::models::value_to_json_string_opt(row.value));
    let raw_command = raw_command
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "该 Agent 未配置 ACP 命令".to_string())?;

    // 2. 按 provider 选择探测方式：
    //    - opencode 不通过 ACP 暴露模型，走原生 `opencode models` CLI
    //    - 其他（claude/codex/custom）走 ACP session/new 协议路径
    let provider = get_agent_provider(&agent_id).await?;
    let probed_ids = if provider.as_deref() == Some("opencode") {
        probe_opencode_models().await?
    } else {
        let resolved = resolve_acp_command(&raw_command);
        probe_acp_models(&resolved).await?
    };

    // 3. 事务内按 model_id 去重合并：已存在的跳过，缺失的新增
    let existing = list_models_for_agent(&agent_id).await?;
    let existing_ids: std::collections::HashSet<&str> =
        existing.iter().map(|m| m.model_id.as_str()).collect();

    let mut synced_count = 0usize;
    let mut skipped_count = 0usize;

    if !probed_ids.is_empty() {
        let now = now_rfc3339();
        let rb = db::rb();
        let mut tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

        for model_id in &probed_ids {
            if existing_ids.contains(model_id.as_str()) {
                skipped_count += 1;
                continue;
            }

            let new_id = uuid::Uuid::new_v4().to_string();
            ac::insert_synced_model(&mut tx, &new_id, &agent_id, model_id, &now)
                .await
                .map_err(|e| e.to_string())?;
            synced_count += 1;
        }

        tx.commit().await.map_err(|e| e.to_string())?;
    }

    // 4. 返回合并后的完整列表（复用 list_models_for_agent 保留 codex 旧模型过滤逻辑）
    let models = list_models_for_agent(&agent_id).await?;

    Ok(SyncAgentModelsResult {
        synced_count,
        skipped_count,
        models,
    })
}
