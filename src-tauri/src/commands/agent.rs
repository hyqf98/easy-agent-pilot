use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// 智能体配置数据结构
/// 统一支持 CLI 和 SDK 两种类型的智能体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    /// 智能体类型: cli 或 sdk
    #[serde(rename = "type")]
    pub agent_type: String,
    /// 提供商: claude 或 codex
    pub provider: Option<String>,
    /// CLI 可执行文件路径 (CLI 类型专用)
    pub cli_path: Option<String>,
    /// API 密钥 (SDK 类型专用，加密存储)
    pub api_key: Option<String>,
    /// API 端点 (SDK 类型专用)
    pub base_url: Option<String>,
    /// 模型 ID
    pub model_id: Option<String>,
    /// 是否启用自定义模型
    pub custom_model_enabled: Option<bool>,
    /// 兼容旧字段
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
    /// 智能体类型: cli 或 sdk
    #[serde(rename = "type")]
    pub agent_type: String,
    /// 提供商: claude 或 codex
    pub provider: Option<String>,
    /// CLI 可执行文件路径 (CLI 类型专用)
    pub cli_path: Option<String>,
    /// API 密钥 (SDK 类型专用)
    pub api_key: Option<String>,
    /// API 端点 (SDK 类型专用)
    pub base_url: Option<String>,
    /// 模型 ID
    pub model_id: Option<String>,
    /// 是否启用自定义模型
    pub custom_model_enabled: Option<bool>,
    /// 兼容旧字段
    pub mode: Option<String>,
    pub model: Option<String>,
}

/// 更新智能体输入
#[derive(Debug, Deserialize)]
pub struct UpdateAgentInput {
    pub name: Option<String>,
    /// 智能体类型: cli 或 sdk
    #[serde(rename = "type")]
    pub agent_type: Option<String>,
    /// 提供商: claude 或 codex
    pub provider: Option<String>,
    /// CLI 可执行文件路径 (CLI 类型专用)
    pub cli_path: Option<String>,
    /// API 密钥 (SDK 类型专用)
    pub api_key: Option<String>,
    /// API 端点 (SDK 类型专用)
    pub base_url: Option<String>,
    /// 模型 ID
    pub model_id: Option<String>,
    /// 是否启用自定义模型
    pub custom_model_enabled: Option<bool>,
    /// 兼容旧字段
    pub mode: Option<String>,
    pub model: Option<String>,
    pub status: Option<String>,
}

/// 获取数据库路径
fn get_db_path() -> Result<std::path::PathBuf> {
    let persistence_dir = super::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}

/// 获取所有智能体配置
#[tauri::command]
pub fn list_agents() -> Result<Vec<Agent>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, type, provider, cli_path, api_key, base_url, model_id, custom_model_enabled,
                   mode, model, status, test_message, tested_at, created_at, updated_at
            FROM agents
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let agents = stmt
        .query_map([], |row| {
            Ok(Agent {
                id: row.get(0)?,
                name: row.get(1)?,
                agent_type: row.get(2)?,
                provider: row.get(3)?,
                cli_path: row.get(4)?,
                api_key: row.get(5)?,
                base_url: row.get(6)?,
                model_id: row.get(7)?,
                custom_model_enabled: row.get::<_, Option<i32>>(8)?.map(|v| v != 0),
                mode: row.get(9)?,
                model: row.get(10)?,
                status: row.get(11)?,
                test_message: row.get(12)?,
                tested_at: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(agents)
}

/// 创建新智能体配置
#[tauri::command]
pub fn create_agent(input: CreateAgentInput) -> Result<Agent, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = "offline".to_string();

    // 兼容性处理：如果 agent_type 是旧的值（claude/codex/custom），则将其作为 provider
    // 并将 mode 作为 type
    let (final_type, final_provider, final_mode) = if ["claude", "codex", "custom"].contains(&input.agent_type.as_str()) {
        // 旧格式：type=claude/codex, mode=cli/api
        let t = input.mode.clone().unwrap_or_else(|| "cli".to_string());
        let p = if input.agent_type == "custom" {
            None
        } else {
            Some(input.agent_type.clone())
        };
        let m = input.mode.clone().unwrap_or_else(|| "cli".to_string());
        (t, p, m)
    } else {
        // 新格式：type=cli/sdk, provider=claude/codex
        // mode 字段使用 type 的值作为默认值
        let m = input.mode.clone().unwrap_or_else(|| input.agent_type.clone());
        (input.agent_type.clone(), input.provider.clone(), m)
    };

    let custom_model_enabled_int = if input.custom_model_enabled.unwrap_or(false) { 1 } else { 0 };

    conn.execute(
        "INSERT INTO agents (id, name, type, provider, cli_path, api_key, base_url, model_id, custom_model_enabled, mode, model, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            &id,
            &input.name,
            &final_type,
            &final_provider,
            &input.cli_path,
            &input.api_key,
            &input.base_url,
            &input.model_id,
            &custom_model_enabled_int,
            &final_mode,
            &input.model,
            &status,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Agent {
        id,
        name: input.name,
        agent_type: final_type,
        provider: final_provider,
        cli_path: input.cli_path,
        api_key: input.api_key,
        base_url: input.base_url,
        model_id: input.model_id,
        custom_model_enabled: input.custom_model_enabled,
        mode: Some(final_mode),
        model: input.model,
        status: Some(status),
        test_message: None,
        tested_at: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新智能体配置
#[tauri::command]
pub fn update_agent(id: String, input: UpdateAgentInput) -> Result<Agent, String> {
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
    if input.agent_type.is_some() {
        updates.push(format!("type = ?{}", param_index));
        param_index += 1;
    }
    if input.provider.is_some() {
        updates.push(format!("provider = ?{}", param_index));
        param_index += 1;
    }
    if input.cli_path.is_some() {
        updates.push(format!("cli_path = ?{}", param_index));
        param_index += 1;
    }
    if input.api_key.is_some() {
        updates.push(format!("api_key = ?{}", param_index));
        param_index += 1;
    }
    if input.base_url.is_some() {
        updates.push(format!("base_url = ?{}", param_index));
        param_index += 1;
    }
    if input.model_id.is_some() {
        updates.push(format!("model_id = ?{}", param_index));
        param_index += 1;
    }
    if input.custom_model_enabled.is_some() {
        updates.push(format!("custom_model_enabled = ?{}", param_index));
        param_index += 1;
    }
    if input.mode.is_some() {
        updates.push(format!("mode = ?{}", param_index));
        param_index += 1;
    }
    if input.model.is_some() {
        updates.push(format!("model = ?{}", param_index));
        param_index += 1;
    }
    if input.status.is_some() {
        updates.push(format!("status = ?{}", param_index));
        param_index += 1;
    }

    let sql = format!(
        "UPDATE agents SET {} WHERE id = ?{}",
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
    if let Some(ref agent_type) = input.agent_type {
        stmt.raw_bind_parameter(param_count, agent_type)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref provider) = input.provider {
        stmt.raw_bind_parameter(param_count, provider)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref cli_path) = input.cli_path {
        stmt.raw_bind_parameter(param_count, cli_path)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref api_key) = input.api_key {
        stmt.raw_bind_parameter(param_count, api_key)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref base_url) = input.base_url {
        stmt.raw_bind_parameter(param_count, base_url)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref model_id) = input.model_id {
        stmt.raw_bind_parameter(param_count, model_id)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(custom_model_enabled) = input.custom_model_enabled {
        let val = if custom_model_enabled { 1 } else { 0 };
        stmt.raw_bind_parameter(param_count, val)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref mode) = input.mode {
        stmt.raw_bind_parameter(param_count, mode)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref model) = input.model {
        stmt.raw_bind_parameter(param_count, model)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref status) = input.status {
        stmt.raw_bind_parameter(param_count, status)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }

    stmt.raw_bind_parameter(param_count, &id)
        .map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

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
                   mode, model, status, test_message, tested_at, created_at, updated_at
            FROM agents
            WHERE id = ?1
            "#,
        )
        .map_err(|e| e.to_string())?;

    let agent = stmt
        .query_row([id], |row| {
            Ok(Agent {
                id: row.get(0)?,
                name: row.get(1)?,
                agent_type: row.get(2)?,
                provider: row.get(3)?,
                cli_path: row.get(4)?,
                api_key: row.get(5)?,
                base_url: row.get(6)?,
                model_id: row.get(7)?,
                custom_model_enabled: row.get::<_, Option<i32>>(8)?.map(|v| v != 0),
                mode: row.get(9)?,
                model: row.get(10)?,
                status: row.get(11)?,
                test_message: row.get(12)?,
                tested_at: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(agent)
}

/// 删除智能体配置
#[tauri::command]
pub fn delete_agent(id: String) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM agents WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 测试智能体连接
#[tauri::command]
pub async fn test_agent_connection(id: String) -> Result<TestResult, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 获取智能体配置
    let agent = get_agent_by_id(&conn, &id)?;

    // 更新状态为 testing
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE agents SET status = 'testing', updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &id],
    )
    .map_err(|e| e.to_string())?;

    // 根据类型进行测试 (type 字段决定是 cli 还是 sdk)
    let (success, message) = if agent.agent_type == "cli" {
        test_cli_connection(&agent).await
    } else {
        test_api_connection(&agent).await
    };

    // 更新测试结果
    let status = if success { "online" } else { "error" };
    let tested_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE agents SET status = ?1, test_message = ?2, tested_at = ?3, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![status, &message, &tested_at, &id],
    )
    .map_err(|e| e.to_string())?;

    Ok(TestResult { success, message })
}

/// 测试 CLI 连接
async fn test_cli_connection(agent: &Agent) -> (bool, String) {
    use std::process::Command;

    let cli_path = match &agent.cli_path {
        Some(path) => path,
        None => return (false, "CLI 路径未配置".to_string()),
    };

    // 检查路径是否存在
    let path = std::path::Path::new(cli_path);
    if !path.exists() {
        return (false, format!("CLI 路径不存在: {}", cli_path));
    }

    // 尝试执行 --version 命令
    let output = Command::new(cli_path)
        .arg("--version")
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                (true, format!("连接成功: {}", version))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                (false, format!("CLI 执行失败: {}", stderr))
            }
        }
        Err(e) => (false, format!("无法执行 CLI: {}", e)),
    }
}

/// 测试 API 连接
async fn test_api_connection(agent: &Agent) -> (bool, String) {
    let base_url = match &agent.base_url {
        Some(url) => url,
        None => return (false, "API Base URL 未配置".to_string()),
    };

    // 构建测试 URL（尝试访问 /v1/models 端点）
    let test_url = if base_url.ends_with('/') {
        format!("{}v1/models", base_url)
    } else {
        format!("{}/v1/models", base_url)
    };

    // 使用 reqwest 发送请求
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build();

    let client = match client {
        Ok(c) => c,
        Err(e) => return (false, format!("创建 HTTP 客户端失败: {}", e)),
    };

    let mut request = client.get(&test_url);

    // 如果有 API Key，添加到请求头
    if let Some(api_key) = &agent.api_key {
        if !api_key.is_empty() {
            request = request.bearer_auth(api_key);
        }
    }

    let response = request.send().await;

    match response {
        Ok(resp) => {
            if resp.status().is_success() {
                (true, "连接成功: API 服务可用".to_string())
            } else {
                let status = resp.status();
                (false, format!("API 返回错误状态: {}", status))
            }
        }
        Err(e) => {
            let err_msg = if e.is_timeout() {
                "连接超时".to_string()
            } else if e.is_connect() {
                format!("无法连接到服务器: {}", e)
            } else {
                format!("请求失败: {}", e)
            };
            (false, err_msg)
        }
    }
}
