use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

// ============================================================================
// MCP 配置相关结构和命令
// ============================================================================

/// MCP 传输类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum McpTransportType {
    Stdio,
    Sse,
    Http,
}

impl Default for McpTransportType {
    fn default() -> Self {
        Self::Stdio
    }
}

/// MCP 配置范围
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum McpConfigScope {
    User,
    Local,
    Project,
}

impl Default for McpConfigScope {
    fn default() -> Self {
        Self::User
    }
}

/// SDK 智能体 MCP 配置
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

/// 创建 MCP 配置输入
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

/// 更新 MCP 配置输入
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

/// 获取数据库路径
fn get_db_path() -> Result<std::path::PathBuf> {
    let persistence_dir = super::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}

/// 获取智能体的所有 MCP 配置
#[tauri::command]
pub fn list_agent_mcp_configs(agent_id: String) -> Result<Vec<AgentMcpConfig>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, agent_id, name, transport_type, command, args, env, url, headers, scope, enabled, created_at, updated_at
            FROM agent_mcp_configs
            WHERE agent_id = ?1
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let configs = stmt
        .query_map([&agent_id], |row| {
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
                enabled: row.get::<_, Option<i32>>(10)?.map(|v| v != 0).unwrap_or(true),
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(configs)
}

/// 创建 MCP 配置
#[tauri::command]
pub fn create_agent_mcp_config(input: CreateAgentMcpConfigInput) -> Result<AgentMcpConfig, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
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

/// 更新 MCP 配置
#[tauri::command]
pub fn update_agent_mcp_config(id: String, input: UpdateAgentMcpConfigInput) -> Result<AgentMcpConfig, String> {
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
    if input.transport_type.is_some() {
        updates.push(format!("transport_type = ?{}", param_index));
        param_index += 1;
    }
    if input.command.is_some() {
        updates.push(format!("command = ?{}", param_index));
        param_index += 1;
    }
    if input.args.is_some() {
        updates.push(format!("args = ?{}", param_index));
        param_index += 1;
    }
    if input.env.is_some() {
        updates.push(format!("env = ?{}", param_index));
        param_index += 1;
    }
    if input.url.is_some() {
        updates.push(format!("url = ?{}", param_index));
        param_index += 1;
    }
    if input.headers.is_some() {
        updates.push(format!("headers = ?{}", param_index));
        param_index += 1;
    }
    if input.scope.is_some() {
        updates.push(format!("scope = ?{}", param_index));
        param_index += 1;
    }
    if input.enabled.is_some() {
        updates.push(format!("enabled = ?{}", param_index));
        param_index += 1;
    }

    let sql = format!(
        "UPDATE agent_mcp_configs SET {} WHERE id = ?{}",
        updates.join(", "),
        param_index
    );

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    // 绑定参数
    let mut param_count = 1;
    stmt.raw_bind_parameter(param_count, &now).map_err(|e| e.to_string())?;
    param_count += 1;

    if let Some(ref name) = input.name {
        stmt.raw_bind_parameter(param_count, name).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref transport_type) = input.transport_type {
        stmt.raw_bind_parameter(param_count, transport_type).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref command) = input.command {
        stmt.raw_bind_parameter(param_count, command).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref args) = input.args {
        stmt.raw_bind_parameter(param_count, args).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref env) = input.env {
        stmt.raw_bind_parameter(param_count, env).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref url) = input.url {
        stmt.raw_bind_parameter(param_count, url).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref headers) = input.headers {
        stmt.raw_bind_parameter(param_count, headers).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref scope) = input.scope {
        stmt.raw_bind_parameter(param_count, scope).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(enabled) = input.enabled {
        let val = if enabled { 1 } else { 0 };
        stmt.raw_bind_parameter(param_count, val).map_err(|e| e.to_string())?;
        param_count += 1;
    }

    stmt.raw_bind_parameter(param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    // 获取更新后的配置
    get_mcp_config_by_id(&conn, &id)
}

/// 获取单个 MCP 配置
fn get_mcp_config_by_id(conn: &Connection, id: &str) -> Result<AgentMcpConfig, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, agent_id, name, transport_type, command, args, env, url, headers, scope, enabled, created_at, updated_at
            FROM agent_mcp_configs
            WHERE id = ?1
            "#,
        )
        .map_err(|e| e.to_string())?;

    let config = stmt
        .query_row([id], |row| {
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
                enabled: row.get::<_, Option<i32>>(10)?.map(|v| v != 0).unwrap_or(true),
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(config)
}

/// 删除 MCP 配置
#[tauri::command]
pub fn delete_agent_mcp_config(id: String) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM agent_mcp_configs WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
// Skills 配置相关结构和命令
// ============================================================================

/// SDK 智能体 Skills 配置
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

/// 创建 Skills 配置输入
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

/// 更新 Skills 配置输入
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

/// 获取智能体的所有 Skills 配置
#[tauri::command]
pub fn list_agent_skills_configs(agent_id: String) -> Result<Vec<AgentSkillsConfig>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, agent_id, name, description, skill_path, scripts_path, references_path, assets_path, enabled, created_at, updated_at
            FROM agent_skills_configs
            WHERE agent_id = ?1
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let configs = stmt
        .query_map([&agent_id], |row| {
            Ok(AgentSkillsConfig {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                skill_path: row.get(4)?,
                scripts_path: row.get(5)?,
                references_path: row.get(6)?,
                assets_path: row.get(7)?,
                enabled: row.get::<_, Option<i32>>(8)?.map(|v| v != 0).unwrap_or(true),
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(configs)
}

/// 创建 Skills 配置
#[tauri::command]
pub fn create_agent_skills_config(input: CreateAgentSkillsConfigInput) -> Result<AgentSkillsConfig, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

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

/// 更新 Skills 配置
#[tauri::command]
pub fn update_agent_skills_config(id: String, input: UpdateAgentSkillsConfigInput) -> Result<AgentSkillsConfig, String> {
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
    if input.skill_path.is_some() {
        updates.push(format!("skill_path = ?{}", param_index));
        param_index += 1;
    }
    if input.scripts_path.is_some() {
        updates.push(format!("scripts_path = ?{}", param_index));
        param_index += 1;
    }
    if input.references_path.is_some() {
        updates.push(format!("references_path = ?{}", param_index));
        param_index += 1;
    }
    if input.assets_path.is_some() {
        updates.push(format!("assets_path = ?{}", param_index));
        param_index += 1;
    }
    if input.enabled.is_some() {
        updates.push(format!("enabled = ?{}", param_index));
        param_index += 1;
    }

    let sql = format!(
        "UPDATE agent_skills_configs SET {} WHERE id = ?{}",
        updates.join(", "),
        param_index
    );

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    // 绑定参数
    let mut param_count = 1;
    stmt.raw_bind_parameter(param_count, &now).map_err(|e| e.to_string())?;
    param_count += 1;

    if let Some(ref name) = input.name {
        stmt.raw_bind_parameter(param_count, name).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref description) = input.description {
        stmt.raw_bind_parameter(param_count, description).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref skill_path) = input.skill_path {
        stmt.raw_bind_parameter(param_count, skill_path).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref scripts_path) = input.scripts_path {
        stmt.raw_bind_parameter(param_count, scripts_path).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref references_path) = input.references_path {
        stmt.raw_bind_parameter(param_count, references_path).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref assets_path) = input.assets_path {
        stmt.raw_bind_parameter(param_count, assets_path).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(enabled) = input.enabled {
        let val = if enabled { 1 } else { 0 };
        stmt.raw_bind_parameter(param_count, val).map_err(|e| e.to_string())?;
        param_count += 1;
    }

    stmt.raw_bind_parameter(param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    // 获取更新后的配置
    get_skills_config_by_id(&conn, &id)
}

/// 获取单个 Skills 配置
fn get_skills_config_by_id(conn: &Connection, id: &str) -> Result<AgentSkillsConfig, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, agent_id, name, description, skill_path, scripts_path, references_path, assets_path, enabled, created_at, updated_at
            FROM agent_skills_configs
            WHERE id = ?1
            "#,
        )
        .map_err(|e| e.to_string())?;

    let config = stmt
        .query_row([id], |row| {
            Ok(AgentSkillsConfig {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                skill_path: row.get(4)?,
                scripts_path: row.get(5)?,
                references_path: row.get(6)?,
                assets_path: row.get(7)?,
                enabled: row.get::<_, Option<i32>>(8)?.map(|v| v != 0).unwrap_or(true),
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(config)
}

/// 删除 Skills 配置
#[tauri::command]
pub fn delete_agent_skills_config(id: String) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM agent_skills_configs WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
// Plugins 配置相关结构和命令
// ============================================================================

/// SDK 智能体 Plugins 配置
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

/// 创建 Plugins 配置输入
#[derive(Debug, Deserialize)]
pub struct CreateAgentPluginsConfigInput {
    pub agent_id: String,
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub plugin_path: String,
}

/// 更新 Plugins 配置输入
#[derive(Debug, Deserialize)]
pub struct UpdateAgentPluginsConfigInput {
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub plugin_path: Option<String>,
    pub enabled: Option<bool>,
}

/// 获取智能体的所有 Plugins 配置
#[tauri::command]
pub fn list_agent_plugins_configs(agent_id: String) -> Result<Vec<AgentPluginsConfig>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, agent_id, name, version, description, plugin_path, enabled, created_at, updated_at
            FROM agent_plugins_configs
            WHERE agent_id = ?1
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let configs = stmt
        .query_map([&agent_id], |row| {
            Ok(AgentPluginsConfig {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                name: row.get(2)?,
                version: row.get(3)?,
                description: row.get(4)?,
                plugin_path: row.get(5)?,
                enabled: row.get::<_, Option<i32>>(6)?.map(|v| v != 0).unwrap_or(true),
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(configs)
}

/// 创建 Plugins 配置
#[tauri::command]
pub fn create_agent_plugins_config(input: CreateAgentPluginsConfigInput) -> Result<AgentPluginsConfig, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

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

/// 更新 Plugins 配置
#[tauri::command]
pub fn update_agent_plugins_config(id: String, input: UpdateAgentPluginsConfigInput) -> Result<AgentPluginsConfig, String> {
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
    if input.version.is_some() {
        updates.push(format!("version = ?{}", param_index));
        param_index += 1;
    }
    if input.description.is_some() {
        updates.push(format!("description = ?{}", param_index));
        param_index += 1;
    }
    if input.plugin_path.is_some() {
        updates.push(format!("plugin_path = ?{}", param_index));
        param_index += 1;
    }
    if input.enabled.is_some() {
        updates.push(format!("enabled = ?{}", param_index));
        param_index += 1;
    }

    let sql = format!(
        "UPDATE agent_plugins_configs SET {} WHERE id = ?{}",
        updates.join(", "),
        param_index
    );

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    // 绑定参数
    let mut param_count = 1;
    stmt.raw_bind_parameter(param_count, &now).map_err(|e| e.to_string())?;
    param_count += 1;

    if let Some(ref name) = input.name {
        stmt.raw_bind_parameter(param_count, name).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref version) = input.version {
        stmt.raw_bind_parameter(param_count, version).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref description) = input.description {
        stmt.raw_bind_parameter(param_count, description).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref plugin_path) = input.plugin_path {
        stmt.raw_bind_parameter(param_count, plugin_path).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(enabled) = input.enabled {
        let val = if enabled { 1 } else { 0 };
        stmt.raw_bind_parameter(param_count, val).map_err(|e| e.to_string())?;
        param_count += 1;
    }

    stmt.raw_bind_parameter(param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    // 获取更新后的配置
    get_plugins_config_by_id(&conn, &id)
}

/// 获取单个 Plugins 配置
fn get_plugins_config_by_id(conn: &Connection, id: &str) -> Result<AgentPluginsConfig, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, agent_id, name, version, description, plugin_path, enabled, created_at, updated_at
            FROM agent_plugins_configs
            WHERE id = ?1
            "#,
        )
        .map_err(|e| e.to_string())?;

    let config = stmt
        .query_row([id], |row| {
            Ok(AgentPluginsConfig {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                name: row.get(2)?,
                version: row.get(3)?,
                description: row.get(4)?,
                plugin_path: row.get(5)?,
                enabled: row.get::<_, Option<i32>>(6)?.map(|v| v != 0).unwrap_or(true),
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(config)
}

/// 删除 Plugins 配置
#[tauri::command]
pub fn delete_agent_plugins_config(id: String) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM agent_plugins_configs WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
// 模型配置相关结构和命令
// ============================================================================

/// SDK 智能体模型配置
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
    pub created_at: String,
    pub updated_at: String,
}

/// 创建模型配置输入
#[derive(Debug, Deserialize)]
pub struct CreateAgentModelInput {
    pub agent_id: String,
    pub model_id: String,
    pub display_name: String,
    pub is_builtin: Option<bool>,
    pub is_default: Option<bool>,
    pub sort_order: Option<i32>,
    pub context_window: Option<i32>,
}

/// 更新模型配置输入
#[derive(Debug, Deserialize)]
pub struct UpdateAgentModelInput {
    pub model_id: Option<String>,
    pub display_name: Option<String>,
    pub is_default: Option<bool>,
    pub sort_order: Option<i32>,
    pub enabled: Option<bool>,
    pub context_window: Option<i32>,
}

/// 批量创建内置模型输入
#[derive(Debug, Deserialize)]
pub struct CreateBuiltinModelsInput {
    pub agent_id: String,
    pub provider: String,
}

/// 获取智能体的所有模型配置
#[tauri::command]
pub fn list_agent_models(agent_id: String) -> Result<Vec<AgentModelConfig>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, created_at, updated_at
            FROM agent_models
            WHERE agent_id = ?1
            ORDER BY sort_order ASC, created_at ASC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let configs = stmt
        .query_map([&agent_id], |row| {
            Ok(AgentModelConfig {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                model_id: row.get(2)?,
                display_name: row.get(3)?,
                is_builtin: row.get::<_, Option<i32>>(4)?.map(|v| v != 0).unwrap_or(false),
                is_default: row.get::< _, Option<i32>>(5)?.map(|v| v != 0).unwrap_or(false),
                sort_order: row.get::< _, Option<i32>>(6)?.unwrap_or(0),
                enabled: row.get::< _, Option<i32>>(7)?.map(|v| v != 0).unwrap_or(true),
                context_window: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(configs)
}

/// 创建模型配置
#[tauri::command]
pub fn create_agent_model(input: CreateAgentModelInput) -> Result<AgentModelConfig, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let is_builtin = input.is_builtin.unwrap_or(false);
    let is_default = input.is_default.unwrap_or(false);
    let sort_order = input.sort_order.unwrap_or(0);
    let context_window = input.context_window;

    // 如果设置为默认，需要先清除其他默认设置
    if is_default {
        conn.execute(
            "UPDATE agent_models SET is_default = 0 WHERE agent_id = ?1",
            [&input.agent_id],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT INTO agent_models (id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 批量创建内置模型
#[tauri::command]
pub fn create_builtin_models(input: CreateBuiltinModelsInput) -> Result<Vec<AgentModelConfig>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    let mut configs: Vec<AgentModelConfig> = Vec::new();

    // 根据提供商类型定义内置模型（包含上下文窗口大小）
    // context_window: None 表示使用默认值 128K
    let builtin_models = if input.provider == "codex" {
        vec![
            ("", "使用默认模型", 0, true, None),
            ("gpt-5", "GPT-5", 1, false, Some(128000)),
            ("gpt-5.1", "GPT-5.1", 2, false, Some(128000)),
            ("gpt-5.2", "GPT-5.2", 3, false, Some(128000)),
            ("gpt-4.5", "GPT-4.5", 4, false, Some(128000)),
            ("o3", "O3", 5, false, Some(200000)),
            ("o3-mini", "O3 Mini", 6, false, Some(200000)),
            ("o4-mini", "O4 Mini", 7, false, Some(200000)),
        ]
    } else {
        // Claude 默认模型列表
        vec![
            ("", "使用默认模型", 0, true, None),
            ("claude-opus-4-6-20250514", "Claude Opus 4.6", 1, false, Some(200000)),
            ("claude-sonnet-4-6-20250514", "Claude Sonnet 4.6", 2, false, Some(200000)),
            ("claude-haiku-4-5-20250514", "Claude Haiku 4.5", 3, false, Some(200000)),
        ]
    };

    // 使用事务批量插入
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (model_id, display_name, sort_order, is_default, context_window) in builtin_models {
        let id = uuid::Uuid::new_v4().to_string();
        let is_default_val = if is_default { 1 } else { 0 };

        tx.execute(
            "INSERT INTO agent_models (id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, 1, ?7, ?8, ?9)",
            rusqlite::params![
                &id,
                &input.agent_id,
                model_id,
                display_name,
                is_default_val,
                sort_order,
                context_window,
                &now,
                &now
            ],
        )
        .map_err(|e| e.to_string())?;

        configs.push(AgentModelConfig {
            id,
            agent_id: input.agent_id.clone(),
            model_id: model_id.to_string(),
            display_name: display_name.to_string(),
            is_builtin: true,
            is_default,
            sort_order,
            enabled: true,
            context_window,
            created_at: now.clone(),
            updated_at: now.clone(),
        });
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(configs)
}

/// 更新模型配置
#[tauri::command]
pub fn update_agent_model(id: String, input: UpdateAgentModelInput) -> Result<AgentModelConfig, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // 如果设置为默认，需要先清除其他默认设置
    if input.is_default.unwrap_or(false) {
        // 获取当前模型的 agent_id
        let agent_id: String = conn
            .query_row("SELECT agent_id FROM agent_models WHERE id = ?1", [&id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE agent_models SET is_default = 0 WHERE agent_id = ?1",
            [&agent_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // 构建动态更新语句
    let mut updates: Vec<String> = vec!["updated_at = ?1".to_string()];
    let mut param_index = 2;

    if input.model_id.is_some() {
        updates.push(format!("model_id = ?{}", param_index));
        param_index += 1;
    }
    if input.display_name.is_some() {
        updates.push(format!("display_name = ?{}", param_index));
        param_index += 1;
    }
    if input.is_default.is_some() {
        updates.push(format!("is_default = ?{}", param_index));
        param_index += 1;
    }
    if input.sort_order.is_some() {
        updates.push(format!("sort_order = ?{}", param_index));
        param_index += 1;
    }
    if input.enabled.is_some() {
        updates.push(format!("enabled = ?{}", param_index));
        param_index += 1;
    }
    if input.context_window.is_some() {
        updates.push(format!("context_window = ?{}", param_index));
        param_index += 1;
    }

    let sql = format!(
        "UPDATE agent_models SET {} WHERE id = ?{}",
        updates.join(", "),
        param_index
    );

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    // 绑定参数
    let mut param_count = 1;
    stmt.raw_bind_parameter(param_count, &now).map_err(|e| e.to_string())?;
    param_count += 1;

    if let Some(ref model_id) = input.model_id {
        stmt.raw_bind_parameter(param_count, model_id).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref display_name) = input.display_name {
        stmt.raw_bind_parameter(param_count, display_name).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(is_default) = input.is_default {
        let val = if is_default { 1 } else { 0 };
        stmt.raw_bind_parameter(param_count, val).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(sort_order) = input.sort_order {
        stmt.raw_bind_parameter(param_count, sort_order).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(enabled) = input.enabled {
        let val = if enabled { 1 } else { 0 };
        stmt.raw_bind_parameter(param_count, val).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(context_window) = input.context_window {
        stmt.raw_bind_parameter(param_count, context_window).map_err(|e| e.to_string())?;
        param_count += 1;
    }

    stmt.raw_bind_parameter(param_count, &id).map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    // 获取更新后的配置
    get_model_config_by_id(&conn, &id)
}

/// 获取单个模型配置
fn get_model_config_by_id(conn: &Connection, id: &str) -> Result<AgentModelConfig, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, created_at, updated_at
            FROM agent_models
            WHERE id = ?1
            "#,
        )
        .map_err(|e| e.to_string())?;

    let config = stmt
        .query_row([id], |row| {
            Ok(AgentModelConfig {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                model_id: row.get(2)?,
                display_name: row.get(3)?,
                is_builtin: row.get::< _, Option<i32>>(4)?.map(|v| v != 0).unwrap_or(false),
                is_default: row.get::< _, Option<i32>>(5)?.map(|v| v != 0).unwrap_or(false),
                sort_order: row.get::< _, Option<i32>>(6)?.unwrap_or(0),
                enabled: row.get::< _, Option<i32>>(7)?.map(|v| v != 0).unwrap_or(true),
                context_window: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(config)
}

/// 删除模型配置
#[tauri::command]
pub fn delete_agent_model(id: String) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM agent_models WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 重置内置模型（删除所有模型并重新创建内置模型）
#[tauri::command]
pub fn reset_builtin_models(input: CreateBuiltinModelsInput) -> Result<Vec<AgentModelConfig>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // 使用事务：先删除所有模型，再创建内置模型
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 删除该智能体的所有模型
    tx.execute("DELETE FROM agent_models WHERE agent_id = ?1", [&input.agent_id])
        .map_err(|e| e.to_string())?;

    // 根据提供商类型定义内置模型（包含上下文窗口大小）
    let builtin_models = if input.provider == "codex" {
        vec![
            ("", "使用默认模型", 0, true, None),
            ("gpt-5", "GPT-5", 1, false, Some(128000)),
            ("gpt-5.1", "GPT-5.1", 2, false, Some(128000)),
            ("gpt-5.2", "GPT-5.2", 3, false, Some(128000)),
            ("gpt-4.5", "GPT-4.5", 4, false, Some(128000)),
            ("o3", "O3", 5, false, Some(200000)),
            ("o3-mini", "O3 Mini", 6, false, Some(200000)),
            ("o4-mini", "O4 Mini", 7, false, Some(200000)),
        ]
    } else {
        // Claude 默认模型列表
        vec![
            ("", "使用默认模型", 0, true, None),
            ("claude-opus-4-6-20250514", "Claude Opus 4.6", 1, false, Some(200000)),
            ("claude-sonnet-4-6-20250514", "Claude Sonnet 4.6", 2, false, Some(200000)),
            ("claude-haiku-4-5-20250514", "Claude Haiku 4.5", 3, false, Some(200000)),
        ]
    };

    let mut configs: Vec<AgentModelConfig> = Vec::new();

    for (model_id, display_name, sort_order, is_default, context_window) in builtin_models {
        let id = uuid::Uuid::new_v4().to_string();
        let is_default_val = if is_default { 1 } else { 0 };

        tx.execute(
            "INSERT INTO agent_models (id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, 1, ?7, ?8, ?9)",
            rusqlite::params![
                &id,
                &input.agent_id,
                model_id,
                display_name,
                is_default_val,
                sort_order,
                context_window,
                &now,
                &now
            ],
        )
        .map_err(|e| e.to_string())?;

        configs.push(AgentModelConfig {
            id,
            agent_id: input.agent_id.clone(),
            model_id: model_id.to_string(),
            display_name: display_name.to_string(),
            is_builtin: true,
            is_default,
            sort_order,
            enabled: true,
            context_window,
            created_at: now.clone(),
            updated_at: now.clone(),
        });
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(configs)
}
