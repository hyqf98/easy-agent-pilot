use super::support::{
    bind_optional, bind_optional_mapped, bind_value, bool_from_int, now_rfc3339,
    open_db_connection, UpdateSqlBuilder,
};
use anyhow::Result;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

// ============================================================================
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

fn open_conn() -> Result<Connection, String> {
    open_db_connection().map_err(|e| e.to_string())
}

const MCP_SELECT_BY_AGENT_SQL: &str = r#"
    SELECT id, agent_id, name, transport_type, command, args, env, url, headers, scope, enabled, created_at, updated_at
    FROM agent_mcp_configs
    WHERE agent_id = ?1
    ORDER BY updated_at DESC
"#;
const MCP_SELECT_BY_ID_SQL: &str = r#"
    SELECT id, agent_id, name, transport_type, command, args, env, url, headers, scope, enabled, created_at, updated_at
    FROM agent_mcp_configs
    WHERE id = ?1
"#;

const SKILLS_SELECT_BY_AGENT_SQL: &str = r#"
    SELECT id, agent_id, name, description, skill_path, scripts_path, references_path, assets_path, enabled, created_at, updated_at
    FROM agent_skills_configs
    WHERE agent_id = ?1
    ORDER BY updated_at DESC
"#;
const SKILLS_SELECT_BY_ID_SQL: &str = r#"
    SELECT id, agent_id, name, description, skill_path, scripts_path, references_path, assets_path, enabled, created_at, updated_at
    FROM agent_skills_configs
    WHERE id = ?1
"#;

const PLUGINS_SELECT_BY_AGENT_SQL: &str = r#"
    SELECT id, agent_id, name, version, description, plugin_path, enabled, created_at, updated_at
    FROM agent_plugins_configs
    WHERE agent_id = ?1
    ORDER BY updated_at DESC
"#;
const PLUGINS_SELECT_BY_ID_SQL: &str = r#"
    SELECT id, agent_id, name, version, description, plugin_path, enabled, created_at, updated_at
    FROM agent_plugins_configs
    WHERE id = ?1
"#;

const MODELS_SELECT_BY_AGENT_SQL: &str = r#"
    SELECT id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, input_cost_per_million_usd, output_cost_per_million_usd, created_at, updated_at
    FROM agent_models
    WHERE agent_id = ?1
    ORDER BY sort_order ASC, created_at ASC
"#;
const MODELS_SELECT_BY_ID_SQL: &str = r#"
    SELECT id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, input_cost_per_million_usd, output_cost_per_million_usd, created_at, updated_at
    FROM agent_models
    WHERE id = ?1
"#;

fn bool_from_db(value: Option<i32>, default: bool) -> bool {
    bool_from_int(value).unwrap_or(default)
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

fn is_codex_agent(conn: &Connection, agent_id: &str) -> Result<bool, String> {
    Ok(get_agent_provider(conn, agent_id)?.as_deref() == Some("codex"))
}

fn get_agent_provider(conn: &Connection, agent_id: &str) -> Result<Option<String>, String> {
    let provider = conn
        .query_row(
            "SELECT provider FROM agents WHERE id = ?1",
            [agent_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(provider)
}

fn list_configs<T, F>(
    conn: &Connection,
    sql: &str,
    agent_id: &str,
    mapper: F,
) -> Result<Vec<T>, String>
where
    F: FnMut(&Row<'_>) -> rusqlite::Result<T>,
{
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([agent_id], mapper)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn fetch_config_by_id<T, F>(conn: &Connection, sql: &str, id: &str, mapper: F) -> Result<T, String>
where
    F: FnOnce(&Row<'_>) -> rusqlite::Result<T>,
{
    conn.query_row(sql, [id], mapper).map_err(|e| e.to_string())
}

fn map_agent_mcp_config_row(row: &Row<'_>) -> rusqlite::Result<AgentMcpConfig> {
    Ok(AgentMcpConfig {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        name: row.get(2)?,
        transport_type: row.get(3)?,
        command: row.get(4)?,
        args: row.get(5)?,
        env: row.get(6)?,
        url: row.get(7)?,
        headers: row.get(8)?,
        scope: row.get(9)?,
        enabled: bool_from_db(row.get::<_, Option<i32>>(10)?, true),
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn map_agent_skills_config_row(row: &Row<'_>) -> rusqlite::Result<AgentSkillsConfig> {
    Ok(AgentSkillsConfig {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        skill_path: row.get(4)?,
        scripts_path: row.get(5)?,
        references_path: row.get(6)?,
        assets_path: row.get(7)?,
        enabled: bool_from_db(row.get::<_, Option<i32>>(8)?, true),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn map_agent_plugins_config_row(row: &Row<'_>) -> rusqlite::Result<AgentPluginsConfig> {
    Ok(AgentPluginsConfig {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        name: row.get(2)?,
        version: row.get(3)?,
        description: row.get(4)?,
        plugin_path: row.get(5)?,
        enabled: bool_from_db(row.get::<_, Option<i32>>(6)?, true),
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn map_agent_model_config_row(row: &Row<'_>) -> rusqlite::Result<AgentModelConfig> {
    Ok(AgentModelConfig {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        model_id: row.get(2)?,
        display_name: row.get(3)?,
        is_builtin: bool_from_db(row.get::<_, Option<i32>>(4)?, false),
        is_default: bool_from_db(row.get::<_, Option<i32>>(5)?, false),
        sort_order: row.get::<_, Option<i32>>(6)?.unwrap_or(0),
        enabled: bool_from_db(row.get::<_, Option<i32>>(7)?, true),
        context_window: row.get(8)?,
        input_cost_per_million_usd: row.get(9)?,
        output_cost_per_million_usd: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn clear_default_models(conn: &Connection, agent_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_models SET is_default = 0 WHERE agent_id = ?1",
        [agent_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_model_agent_id(conn: &Connection, id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT agent_id FROM agent_models WHERE id = ?1",
        [id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

fn list_models_for_agent(
    conn: &Connection,
    agent_id: &str,
) -> Result<Vec<AgentModelConfig>, String> {
    let mut models = list_configs(
        conn,
        MODELS_SELECT_BY_AGENT_SQL,
        agent_id,
        map_agent_model_config_row,
    )?;

    if is_codex_agent(conn, agent_id)? {
        models
            .retain(|model| !(model.is_builtin && is_legacy_codex_builtin_model(&model.model_id)));
    }

    Ok(models)
}

#[tauri::command]
pub fn list_agent_mcp_configs(agent_id: String) -> Result<Vec<AgentMcpConfig>, String> {
    let conn = open_conn()?;
    list_configs(
        &conn,
        MCP_SELECT_BY_AGENT_SQL,
        &agent_id,
        map_agent_mcp_config_row,
    )
}

#[tauri::command]
pub fn create_agent_mcp_config(input: CreateAgentMcpConfigInput) -> Result<AgentMcpConfig, String> {
    let conn = open_conn()?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let transport_type = input.transport_type.unwrap_or_else(|| "stdio".to_string());
    let scope = input.scope.unwrap_or_else(|| "user".to_string());

    conn.execute(
        "INSERT INTO agent_mcp_configs (id, agent_id, name, transport_type, command, args, env, url, headers, scope, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            &id,
            &input.agent_id,
            &input.name,
            &transport_type,
            &input.command,
            &input.args,
            &input.env,
            &input.url,
            &input.headers,
            &scope,
            1,
            &now,
            &now
        ],
    )
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
pub fn update_agent_mcp_config(
    id: String,
    input: UpdateAgentMcpConfigInput,
) -> Result<AgentMcpConfig, String> {
    let conn = open_conn()?;

    let now = now_rfc3339();
    let mut updates = UpdateSqlBuilder::new();
    updates.push("name", input.name.is_some());
    updates.push("transport_type", input.transport_type.is_some());
    updates.push("command", input.command.is_some());
    updates.push("args", input.args.is_some());
    updates.push("env", input.env.is_some());
    updates.push("url", input.url.is_some());
    updates.push("headers", input.headers.is_some());
    updates.push("scope", input.scope.is_some());
    updates.push("enabled", input.enabled.is_some());

    let sql = updates.finish("agent_mcp_configs", "id");
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    let mut param_count = 1;
    bind_value(&mut stmt, &mut param_count, &now).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.name).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.transport_type).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.command).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.args).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.env).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.url).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.headers).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.scope).map_err(|e| e.to_string())?;
    bind_optional_mapped(&mut stmt, &mut param_count, &input.enabled, |enabled| {
        if *enabled {
            1
        } else {
            0
        }
    })
    .map_err(|e| e.to_string())?;
    bind_value(&mut stmt, &mut param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    get_mcp_config_by_id(&conn, &id)
}

fn get_mcp_config_by_id(conn: &Connection, id: &str) -> Result<AgentMcpConfig, String> {
    fetch_config_by_id(conn, MCP_SELECT_BY_ID_SQL, id, map_agent_mcp_config_row)
}

#[tauri::command]
pub fn delete_agent_mcp_config(id: String) -> Result<(), String> {
    let conn = open_conn()?;

    conn.execute("DELETE FROM agent_mcp_configs WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
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
pub fn list_agent_skills_configs(agent_id: String) -> Result<Vec<AgentSkillsConfig>, String> {
    let conn = open_conn()?;
    list_configs(
        &conn,
        SKILLS_SELECT_BY_AGENT_SQL,
        &agent_id,
        map_agent_skills_config_row,
    )
}

#[tauri::command]
pub fn create_agent_skills_config(
    input: CreateAgentSkillsConfigInput,
) -> Result<AgentSkillsConfig, String> {
    let conn = open_conn()?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    conn.execute(
        "INSERT INTO agent_skills_configs (id, agent_id, name, description, skill_path, scripts_path, references_path, assets_path, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            &id,
            &input.agent_id,
            &input.name,
            &input.description,
            &input.skill_path,
            &input.scripts_path,
            &input.references_path,
            &input.assets_path,
            1,
            &now,
            &now
        ],
    )
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
pub fn update_agent_skills_config(
    id: String,
    input: UpdateAgentSkillsConfigInput,
) -> Result<AgentSkillsConfig, String> {
    let conn = open_conn()?;

    let now = now_rfc3339();
    let mut updates = UpdateSqlBuilder::new();
    updates.push("name", input.name.is_some());
    updates.push("description", input.description.is_some());
    updates.push("skill_path", input.skill_path.is_some());
    updates.push("scripts_path", input.scripts_path.is_some());
    updates.push("references_path", input.references_path.is_some());
    updates.push("assets_path", input.assets_path.is_some());
    updates.push("enabled", input.enabled.is_some());

    let sql = updates.finish("agent_skills_configs", "id");
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    let mut param_count = 1;
    bind_value(&mut stmt, &mut param_count, &now).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.name).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.description).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.skill_path).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.scripts_path).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.references_path)
        .map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.assets_path).map_err(|e| e.to_string())?;
    bind_optional_mapped(&mut stmt, &mut param_count, &input.enabled, |enabled| {
        if *enabled {
            1
        } else {
            0
        }
    })
    .map_err(|e| e.to_string())?;
    bind_value(&mut stmt, &mut param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    get_skills_config_by_id(&conn, &id)
}

fn get_skills_config_by_id(conn: &Connection, id: &str) -> Result<AgentSkillsConfig, String> {
    fetch_config_by_id(
        conn,
        SKILLS_SELECT_BY_ID_SQL,
        id,
        map_agent_skills_config_row,
    )
}

#[tauri::command]
pub fn delete_agent_skills_config(id: String) -> Result<(), String> {
    let conn = open_conn()?;

    conn.execute("DELETE FROM agent_skills_configs WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
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
pub fn list_agent_plugins_configs(agent_id: String) -> Result<Vec<AgentPluginsConfig>, String> {
    let conn = open_conn()?;
    list_configs(
        &conn,
        PLUGINS_SELECT_BY_AGENT_SQL,
        &agent_id,
        map_agent_plugins_config_row,
    )
}

#[tauri::command]
pub fn create_agent_plugins_config(
    input: CreateAgentPluginsConfigInput,
) -> Result<AgentPluginsConfig, String> {
    let conn = open_conn()?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    conn.execute(
        "INSERT INTO agent_plugins_configs (id, agent_id, name, version, description, plugin_path, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &id,
            &input.agent_id,
            &input.name,
            &input.version,
            &input.description,
            &input.plugin_path,
            1,
            &now,
            &now
        ],
    )
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
pub fn update_agent_plugins_config(
    id: String,
    input: UpdateAgentPluginsConfigInput,
) -> Result<AgentPluginsConfig, String> {
    let conn = open_conn()?;

    let now = now_rfc3339();
    let mut updates = UpdateSqlBuilder::new();
    updates.push("name", input.name.is_some());
    updates.push("version", input.version.is_some());
    updates.push("description", input.description.is_some());
    updates.push("plugin_path", input.plugin_path.is_some());
    updates.push("enabled", input.enabled.is_some());

    let sql = updates.finish("agent_plugins_configs", "id");
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    let mut param_count = 1;
    bind_value(&mut stmt, &mut param_count, &now).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.name).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.version).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.description).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.plugin_path).map_err(|e| e.to_string())?;
    bind_optional_mapped(&mut stmt, &mut param_count, &input.enabled, |enabled| {
        if *enabled {
            1
        } else {
            0
        }
    })
    .map_err(|e| e.to_string())?;
    bind_value(&mut stmt, &mut param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    get_plugins_config_by_id(&conn, &id)
}

fn get_plugins_config_by_id(conn: &Connection, id: &str) -> Result<AgentPluginsConfig, String> {
    fetch_config_by_id(
        conn,
        PLUGINS_SELECT_BY_ID_SQL,
        id,
        map_agent_plugins_config_row,
    )
}

#[tauri::command]
pub fn delete_agent_plugins_config(id: String) -> Result<(), String> {
    let conn = open_conn()?;

    conn.execute("DELETE FROM agent_plugins_configs WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
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
pub fn list_agent_models(agent_id: String) -> Result<Vec<AgentModelConfig>, String> {
    let conn = open_conn()?;
    list_models_for_agent(&conn, &agent_id)
}

#[tauri::command]
pub fn create_agent_model(input: CreateAgentModelInput) -> Result<AgentModelConfig, String> {
    let conn = open_conn()?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let is_builtin = input.is_builtin.unwrap_or(false);
    let is_default = input.is_default.unwrap_or(false);
    let sort_order = input.sort_order.unwrap_or(0);
    let context_window = input.context_window;
    let input_cost_per_million_usd = input.input_cost_per_million_usd;
    let output_cost_per_million_usd = input.output_cost_per_million_usd;

    // 濡傛灉璁剧疆涓洪粯璁わ紝闇€瑕佸厛娓呴櫎鍏朵粬榛樿璁剧�?
    if is_default {
        clear_default_models(&conn, &input.agent_id)?;
    }

    conn.execute(
        "INSERT INTO agent_models (id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, input_cost_per_million_usd, output_cost_per_million_usd, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            &id,
            &input.agent_id,
            &input.model_id,
            &input.display_name,
            if is_builtin { 1 } else { 0 },
            if is_default { 1 } else { 0 },
            sort_order,
            1,
            context_window,
            input_cost_per_million_usd,
            output_cost_per_million_usd,
            &now,
            &now
        ],
    )
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
/// 鏇存柊妯″��閰嶇疆
#[tauri::command]
pub fn update_agent_model(
    id: String,
    input: UpdateAgentModelInput,
) -> Result<AgentModelConfig, String> {
    let conn = open_conn()?;

    let now = now_rfc3339();

    // 濡傛灉璁剧疆涓洪粯璁わ紝闇€瑕佸厛娓呴櫎鍏朵粬榛樿璁剧�?
    if input.is_default.unwrap_or(false) {
        clear_default_models(&conn, &get_model_agent_id(&conn, &id)?)?;
    }

    let mut updates = UpdateSqlBuilder::new();
    updates.push("model_id", input.model_id.is_some());
    updates.push("display_name", input.display_name.is_some());
    updates.push("is_default", input.is_default.is_some());
    updates.push("sort_order", input.sort_order.is_some());
    updates.push("enabled", input.enabled.is_some());
    updates.push("context_window", input.context_window.is_some());
    updates.push("input_cost_per_million_usd", input.input_cost_per_million_usd.is_some());
    updates.push("output_cost_per_million_usd", input.output_cost_per_million_usd.is_some());

    let sql = updates.finish("agent_models", "id");
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    let mut param_count = 1;
    bind_value(&mut stmt, &mut param_count, &now).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.model_id).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.display_name).map_err(|e| e.to_string())?;
    bind_optional_mapped(&mut stmt, &mut param_count, &input.is_default, |value| {
        if *value {
            1
        } else {
            0
        }
    })
    .map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.sort_order).map_err(|e| e.to_string())?;
    bind_optional_mapped(&mut stmt, &mut param_count, &input.enabled, |value| {
        if *value {
            1
        } else {
            0
        }
    })
    .map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.context_window).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.input_cost_per_million_usd).map_err(|e| e.to_string())?;
    bind_optional(&mut stmt, &mut param_count, &input.output_cost_per_million_usd).map_err(|e| e.to_string())?;
    bind_value(&mut stmt, &mut param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    get_model_config_by_id(&conn, &id)
}

fn get_model_config_by_id(conn: &Connection, id: &str) -> Result<AgentModelConfig, String> {
    fetch_config_by_id(
        conn,
        MODELS_SELECT_BY_ID_SQL,
        id,
        map_agent_model_config_row,
    )
}

/// 鍒犻櫎妯″��閰嶇疆
#[tauri::command]
pub fn delete_agent_model(id: String) -> Result<(), String> {
    let conn = open_conn()?;

    conn.execute("DELETE FROM agent_models WHERE id = ?1", [&id])
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
    let mut conn = open_conn()?;
    let raw_command = conn
        .query_row(
            "SELECT acp_command, cli_path FROM agents WHERE id = ?1",
            [&agent_id],
            |row| {
                let acp_command: Option<String> = row.get(0)?;
                let cli_path: Option<String> = row.get(1)?;
                Ok(acp_command.or(cli_path))
            },
        )
        .map_err(|e| e.to_string())?;
    let raw_command = raw_command
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "该 Agent 未配置 ACP 命令".to_string())?;

    // 2. 按 provider 选择探测方式：
    //    - opencode 不通过 ACP 暴露模型，走原生 `opencode models` CLI
    //    - 其他（claude/codex/custom）走 ACP session/new 协议路径
    let provider = get_agent_provider(&conn, &agent_id)?;
    let probed_ids = if provider.as_deref() == Some("opencode") {
        probe_opencode_models().await?
    } else {
        let resolved = resolve_acp_command(&raw_command);
        probe_acp_models(&resolved).await?
    };

    // 3. 事务内按 model_id 去重合并：已存在的跳过，缺失的新增
    let existing = list_models_for_agent(&conn, &agent_id)?;
    let existing_ids: std::collections::HashSet<&str> =
        existing.iter().map(|m| m.model_id.as_str()).collect();

    let mut synced_count = 0usize;
    let mut skipped_count = 0usize;

    if !probed_ids.is_empty() {
        let now = now_rfc3339();
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        for model_id in &probed_ids {
            if existing_ids.contains(model_id.as_str()) {
                skipped_count += 1;
                continue;
            }

            let id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO agent_models (id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, input_cost_per_million_usd, output_cost_per_million_usd, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 0, 0, 0, 1, 128000, NULL, NULL, ?5, ?5)",
                rusqlite::params![&id, &agent_id, model_id, model_id, &now],
            )
            .map_err(|e| e.to_string())?;
            synced_count += 1;
        }

        tx.commit().map_err(|e| e.to_string())?;
    }

    // 4. 返回合并后的完整列表（复用 list_models_for_agent 保留 codex 旧模型过滤逻辑）
    let models = list_models_for_agent(&conn, &agent_id)?;

    Ok(SyncAgentModelsResult {
        synced_count,
        skipped_count,
        models,
    })
}

