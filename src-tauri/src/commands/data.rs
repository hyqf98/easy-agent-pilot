use anyhow::Result;
use serde::{Deserialize, Serialize};
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;

/// 导出的数据结构
#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub projects: Vec<ProjectExport>,
    pub sessions: Vec<SessionExport>,
    pub messages: Vec<MessageExport>,
    pub agents: Vec<AgentExport>,
    pub mcp_servers: Vec<McpServerExport>,
    pub cli_paths: Vec<CliPathExport>,
    pub market_sources: Vec<MarketSourceExport>,
    pub app_settings: Vec<AppSettingExport>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectExport {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionExport {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub agent_type: String,
    pub status: String,
    pub pinned: bool,
    pub last_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessageExport {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub tokens: Option<i32>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentExport {
    pub id: String,
    pub name: String,
    pub type_: String,
    pub mode: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub cli_path: Option<String>,
    pub status: Option<String>,
    pub test_message: Option<String>,
    pub tested_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerExport {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: Option<String>,
    pub env: Option<String>,
    pub enabled: bool,
    pub test_status: Option<String>,
    pub test_message: Option<String>,
    pub tool_count: Option<i32>,
    pub tested_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CliPathExport {
    pub id: String,
    pub name: String,
    pub path: String,
    pub version: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MarketSourceExport {
    pub id: String,
    pub name: String,
    pub type_: String,
    pub url_or_path: String,
    pub status: String,
    pub enabled: bool,
    pub last_synced_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettingExport {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

/// 获取数据库路径
fn get_db_path() -> Result<PathBuf> {
    let persistence_dir = super::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}

/// 导出所有数据
#[tauri::command]
pub fn export_all_data() -> Result<ExportData, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 导出项目
    let projects = export_projects(&conn)?;
    // 导出会话
    let sessions = export_sessions(&conn)?;
    // 导出消息
    let messages = export_messages(&conn)?;
    // 导出智能体配置
    let agents = export_agents(&conn)?;
    // 导出 MCP 服务器配置
    let mcp_servers = export_mcp_servers(&conn)?;
    // 导出 CLI 路径配置
    let cli_paths = export_cli_paths(&conn)?;
    // 导出市场源配置
    let market_sources = export_market_sources(&conn)?;
    // 导出应用设置
    let app_settings = export_app_settings(&conn)?;

    Ok(ExportData {
        version: "1.0.0".to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        projects,
        sessions,
        messages,
        agents,
        mcp_servers,
        cli_paths,
        market_sources,
        app_settings,
    })
}

/// 将数据导出到文件
#[tauri::command]
pub fn export_data_to_file(file_path: String) -> Result<String, String> {
    let data = export_all_data()?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;

    let path = PathBuf::from(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(file_path)
}

fn export_projects(conn: &Connection) -> Result<Vec<ProjectExport>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, path, description, created_at, updated_at FROM projects ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let projects = stmt
        .query_map([], |row| {
            Ok(ProjectExport {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                description: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(projects)
}

fn export_sessions(conn: &Connection) -> Result<Vec<SessionExport>, String> {
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, agent_type, status, pinned, last_message, created_at, updated_at FROM sessions ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(SessionExport {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                agent_type: row.get(3)?,
                status: row.get(4)?,
                pinned: row.get::<_, i32>(5)? != 0,
                last_message: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(sessions)
}

fn export_messages(conn: &Connection) -> Result<Vec<MessageExport>, String> {
    let mut stmt = conn
        .prepare("SELECT id, session_id, role, content, status, tokens, created_at FROM messages ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let messages = stmt
        .query_map([], |row| {
            Ok(MessageExport {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                status: row.get(4)?,
                tokens: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(messages)
}

fn export_agents(conn: &Connection) -> Result<Vec<AgentExport>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, type, mode, api_key, base_url, model, cli_path, status, test_message, tested_at, created_at, updated_at FROM agents ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let agents = stmt
        .query_map([], |row| {
            Ok(AgentExport {
                id: row.get(0)?,
                name: row.get(1)?,
                type_: row.get(2)?,
                mode: row.get(3)?,
                api_key: row.get(4)?,
                base_url: row.get(5)?,
                model: row.get(6)?,
                cli_path: row.get(7)?,
                status: row.get(8)?,
                test_message: row.get(9)?,
                tested_at: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(agents)
}

fn export_mcp_servers(conn: &Connection) -> Result<Vec<McpServerExport>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, command, args, env, enabled, test_status, test_message, tool_count, tested_at, created_at, updated_at FROM mcp_servers ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let mcp_servers = stmt
        .query_map([], |row| {
            Ok(McpServerExport {
                id: row.get(0)?,
                name: row.get(1)?,
                command: row.get(2)?,
                args: row.get(3)?,
                env: row.get(4)?,
                enabled: row.get::<_, i32>(5)? != 0,
                test_status: row.get(6)?,
                test_message: row.get(7)?,
                tool_count: row.get(8)?,
                tested_at: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(mcp_servers)
}

fn export_cli_paths(conn: &Connection) -> Result<Vec<CliPathExport>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, path, version, created_at, updated_at FROM cli_paths ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let cli_paths = stmt
        .query_map([], |row| {
            Ok(CliPathExport {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                version: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(cli_paths)
}

fn export_market_sources(conn: &Connection) -> Result<Vec<MarketSourceExport>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, type, url_or_path, status, enabled, last_synced_at, created_at, updated_at FROM market_sources ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let market_sources = stmt
        .query_map([], |row| {
            Ok(MarketSourceExport {
                id: row.get(0)?,
                name: row.get(1)?,
                type_: row.get(2)?,
                url_or_path: row.get(3)?,
                status: row.get(4)?,
                enabled: row.get::<_, i32>(5)? != 0,
                last_synced_at: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(market_sources)
}

fn export_app_settings(conn: &Connection) -> Result<Vec<AppSettingExport>, String> {
    let mut stmt = conn
        .prepare("SELECT key, value, updated_at FROM app_settings ORDER BY key ASC")
        .map_err(|e| e.to_string())?;

    let app_settings = stmt
        .query_map([], |row| {
            Ok(AppSettingExport {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(app_settings)
}

/// 导入结果统计
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub projects_imported: usize,
    pub sessions_imported: usize,
    pub messages_imported: usize,
    pub agents_imported: usize,
    pub mcp_servers_imported: usize,
    pub cli_paths_imported: usize,
    pub market_sources_imported: usize,
    pub app_settings_imported: usize,
}

/// 验证导入数据格式
#[tauri::command]
pub fn validate_import_data(file_path: String) -> Result<ExportData, String> {
    let content = fs::read_to_string(&file_path).map_err(|e| format!("无法读取文件: {}", e))?;

    let data: ExportData =
        serde_json::from_str(&content).map_err(|e| format!("无效的数据格式: {}", e))?;

    // 验证版本
    if data.version.is_empty() {
        return Err("缺少版本信息".to_string());
    }

    Ok(data)
}

/// 清除所有数据
#[tauri::command]
pub fn clear_all_data() -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 开启事务
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 按照外键依赖顺序删除（子表先删除）
    // 1. 删除 session_mcp（依赖 sessions 和 mcp_servers）
    tx.execute("DELETE FROM session_mcp", [])
        .map_err(|e| format!("删除 session_mcp 失败: {}", e))?;

    // 2. 删除 messages（依赖 sessions）
    tx.execute("DELETE FROM messages", [])
        .map_err(|e| format!("删除 messages 失败: {}", e))?;

    // 3. 删除 sessions（依赖 projects）
    tx.execute("DELETE FROM sessions", [])
        .map_err(|e| format!("删除 sessions 失败: {}", e))?;

    // 4. 删除 projects
    tx.execute("DELETE FROM projects", [])
        .map_err(|e| format!("删除 projects 失败: {}", e))?;

    // 5. 删除 agents
    tx.execute("DELETE FROM agents", [])
        .map_err(|e| format!("删除 agents 失败: {}", e))?;

    // 6. 删除 mcp_servers
    tx.execute("DELETE FROM mcp_servers", [])
        .map_err(|e| format!("删除 mcp_servers 失败: {}", e))?;

    // 7. 删除 cli_paths
    tx.execute("DELETE FROM cli_paths", [])
        .map_err(|e| format!("删除 cli_paths 失败: {}", e))?;

    // 8. 删除 market_sources
    tx.execute("DELETE FROM market_sources", [])
        .map_err(|e| format!("删除 market_sources 失败: {}", e))?;

    // 9. 删除 skills
    tx.execute("DELETE FROM skills", [])
        .map_err(|e| format!("删除 skills 失败: {}", e))?;

    // 10. 删除 app_settings
    tx.execute("DELETE FROM app_settings", [])
        .map_err(|e| format!("删除 app_settings 失败: {}", e))?;

    // 提交事务
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

/// 导出数据类型选项
#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    pub include_projects: bool,
    pub include_sessions: bool,
    pub include_messages: bool,
    pub include_agents: bool,
    pub include_mcp_servers: bool,
    pub include_cli_paths: bool,
    pub include_market_sources: bool,
    pub include_app_settings: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            include_projects: true,
            include_sessions: true,
            include_messages: true,
            include_agents: true,
            include_mcp_servers: true,
            include_cli_paths: true,
            include_market_sources: true,
            include_app_settings: true,
        }
    }
}

/// 导出选定的数据类型
#[tauri::command]
pub fn export_selected_data(options: ExportOptions) -> Result<ExportData, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let projects = if options.include_projects {
        export_projects(&conn)?
    } else {
        vec![]
    };

    let sessions = if options.include_sessions {
        export_sessions(&conn)?
    } else {
        vec![]
    };

    let messages = if options.include_messages {
        export_messages(&conn)?
    } else {
        vec![]
    };

    let agents = if options.include_agents {
        export_agents(&conn)?
    } else {
        vec![]
    };

    let mcp_servers = if options.include_mcp_servers {
        export_mcp_servers(&conn)?
    } else {
        vec![]
    };

    let cli_paths = if options.include_cli_paths {
        export_cli_paths(&conn)?
    } else {
        vec![]
    };

    let market_sources = if options.include_market_sources {
        export_market_sources(&conn)?
    } else {
        vec![]
    };

    let app_settings = if options.include_app_settings {
        export_app_settings(&conn)?
    } else {
        vec![]
    };

    Ok(ExportData {
        version: "1.0.0".to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        projects,
        sessions,
        messages,
        agents,
        mcp_servers,
        cli_paths,
        market_sources,
        app_settings,
    })
}

/// 将选定的数据导出到文件
#[tauri::command]
pub fn export_selected_to_file(file_path: String, options: ExportOptions) -> Result<String, String> {
    let data = export_selected_data(options)?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;

    let path = PathBuf::from(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(file_path)
}

/// 从文件导入数据
#[tauri::command]
pub fn import_data_from_file(file_path: String) -> Result<ImportResult, String> {
    // 先验证数据格式
    let data = validate_import_data(file_path)?;

    // 获取数据库路径并打开连接
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 开启事务
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut result = ImportResult {
        projects_imported: 0,
        sessions_imported: 0,
        messages_imported: 0,
        agents_imported: 0,
        mcp_servers_imported: 0,
        cli_paths_imported: 0,
        market_sources_imported: 0,
        app_settings_imported: 0,
    };

    // 导入项目
    for project in &data.projects {
        let res = tx.execute(
            "INSERT OR REPLACE INTO projects (id, name, path, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            [
                &project.id,
                &project.name,
                &project.path,
                &project.description.clone().unwrap_or_default(),
                &project.created_at,
                &project.updated_at,
            ],
        );
        if res.is_ok() {
            result.projects_imported += 1;
        }
    }

    // 导入会话
    for session in &data.sessions {
        let pinned = if session.pinned { 1 } else { 0 };
        let res = tx.execute(
            "INSERT OR REPLACE INTO sessions (id, project_id, name, agent_type, status, pinned, last_message, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            [
                &session.id,
                &session.project_id,
                &session.name,
                &session.agent_type,
                &session.status,
                &pinned.to_string(),
                &session.last_message.clone().unwrap_or_default(),
                &session.created_at,
                &session.updated_at,
            ],
        );
        if res.is_ok() {
            result.sessions_imported += 1;
        }
    }

    // 导入消息
    for message in &data.messages {
        let tokens = message.tokens.map(|t| t.to_string()).unwrap_or_default();
        let res = tx.execute(
            "INSERT OR REPLACE INTO messages (id, session_id, role, content, status, tokens, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            [
                &message.id,
                &message.session_id,
                &message.role,
                &message.content,
                &message.status,
                &tokens,
                &message.created_at,
            ],
        );
        if res.is_ok() {
            result.messages_imported += 1;
        }
    }

    // 导入智能体配置
    for agent in &data.agents {
        let res = tx.execute(
            "INSERT OR REPLACE INTO agents (id, name, type, mode, api_key, base_url, model, cli_path, status, test_message, tested_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            [
                &agent.id,
                &agent.name,
                &agent.type_,
                &agent.mode,
                &agent.api_key.clone().unwrap_or_default(),
                &agent.base_url.clone().unwrap_or_default(),
                &agent.model.clone().unwrap_or_default(),
                &agent.cli_path.clone().unwrap_or_default(),
                &agent.status.clone().unwrap_or_default(),
                &agent.test_message.clone().unwrap_or_default(),
                &agent.tested_at.clone().unwrap_or_default(),
                &agent.created_at,
                &agent.updated_at,
            ],
        );
        if res.is_ok() {
            result.agents_imported += 1;
        }
    }

    // 导入 MCP 服务器配置
    for server in &data.mcp_servers {
        let enabled = if server.enabled { 1 } else { 0 };
        let tool_count = server.tool_count.map(|t| t.to_string()).unwrap_or_default();
        let res = tx.execute(
            "INSERT OR REPLACE INTO mcp_servers (id, name, command, args, env, enabled, test_status, test_message, tool_count, tested_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            [
                &server.id,
                &server.name,
                &server.command,
                &server.args.clone().unwrap_or_default(),
                &server.env.clone().unwrap_or_default(),
                &enabled.to_string(),
                &server.test_status.clone().unwrap_or_default(),
                &server.test_message.clone().unwrap_or_default(),
                &tool_count,
                &server.tested_at.clone().unwrap_or_default(),
                &server.created_at,
                &server.updated_at,
            ],
        );
        if res.is_ok() {
            result.mcp_servers_imported += 1;
        }
    }

    // 导入 CLI 路径配置
    for cli in &data.cli_paths {
        let res = tx.execute(
            "INSERT OR REPLACE INTO cli_paths (id, name, path, version, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            [
                &cli.id,
                &cli.name,
                &cli.path,
                &cli.version.clone().unwrap_or_default(),
                &cli.created_at,
                &cli.updated_at,
            ],
        );
        if res.is_ok() {
            result.cli_paths_imported += 1;
        }
    }

    // 导入市场源配置
    for source in &data.market_sources {
        let enabled = if source.enabled { 1 } else { 0 };
        let res = tx.execute(
            "INSERT OR REPLACE INTO market_sources (id, name, type, url_or_path, status, enabled, last_synced_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            [
                &source.id,
                &source.name,
                &source.type_,
                &source.url_or_path,
                &source.status,
                &enabled.to_string(),
                &source.last_synced_at.clone().unwrap_or_default(),
                &source.created_at,
                &source.updated_at,
            ],
        );
        if res.is_ok() {
            result.market_sources_imported += 1;
        }
    }

    // 导入应用设置
    for setting in &data.app_settings {
        let res = tx.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at)
             VALUES (?1, ?2, ?3)",
            [&setting.key, &setting.value, &setting.updated_at],
        );
        if res.is_ok() {
            result.app_settings_imported += 1;
        }
    }

    // 提交事务
    tx.commit().map_err(|e| e.to_string())?;

    Ok(result)
}
