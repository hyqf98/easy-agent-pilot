use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// MCP 传输类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpTransportType {
    Stdio,
    Sse,
    Http,
}

/// MCP 配置范围
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpConfigScope {
    User,
    Local,
    Project,
}

/// 扫描到的 MCP 配置项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedMcpServer {
    pub name: String,
    pub transport: McpTransportType,
    pub scope: McpConfigScope,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub url: Option<String>,
    pub headers: Option<std::collections::HashMap<String, String>>,
}

/// Skill 子目录信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSubdirectories {
    pub has_scripts: bool,
    pub has_references: bool,
    pub has_assets: bool,
}

/// 扫描到的 Skill 配置项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedSkill {
    /// 从 YAML frontmatter 解析的名称
    pub name: String,
    /// Skill 目录路径
    pub path: String,
    /// 从 YAML frontmatter 解析的描述
    pub description: Option<String>,
    /// YAML frontmatter 中的原始名称（可能与目录名不同）
    pub frontmatter_name: Option<String>,
    /// 子目录信息
    pub subdirectories: SkillSubdirectories,
}

/// Plugin 子目录信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSubdirectories {
    pub has_agents: bool,
    pub has_commands: bool,
    pub has_skills: bool,
    pub has_hooks: bool,
    pub has_scripts: bool,
}

/// 扫描到的 Plugin 配置项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedPlugin {
    /// 插件名称（从 plugin.json 解析，否则使用目录名）
    pub name: String,
    /// 插件路径
    pub path: String,
    /// 是否启用
    pub enabled: bool,
    /// 从 plugin.json 解析的版本
    pub version: Option<String>,
    /// 从 plugin.json 解析的描述
    pub description: Option<String>,
    /// 作者信息
    pub author: Option<String>,
    /// 子目录信息
    pub subdirectories: PluginSubdirectories,
}

/// Claude CLI 配置扫描结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfigScanResult {
    pub claude_dir: String,
    pub mcp_servers: Vec<ScannedMcpServer>,
    pub skills: Vec<ScannedSkill>,
    pub plugins: Vec<ScannedPlugin>,
    pub scan_success: bool,
    pub error_message: Option<String>,
}

/// 根据 CLI 路径获取配置目录和信息
fn get_cli_config_dir(cli_path: Option<&str>) -> Result<(PathBuf, PathBuf, String), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    // 如果没有提供 cliPath，默认使用 Claude
    let cli_name = if let Some(path) = cli_path {
        // 从路径中提取 CLI 名称
        std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("claude")
            .to_lowercase()
    } else {
        "claude".to_string()
    };

    match cli_name.as_str() {
        "claude" | "claude-code" => {
            // Claude CLI: 配置在 ~/.claude/ 目录，配置文件是 ~/.claude.json
            let config_dir = home_dir.join(".claude");
            let config_file = home_dir.join(".claude.json");
            Ok((config_dir, config_file, "claude".to_string()))
        }
        "codex" => {
            // Codex CLI: 配置在 ~/.codex/config.toml
            let config_dir = home_dir.join(".codex");
            let config_file = home_dir.join(".codex").join("config.toml");
            Ok((config_dir, config_file, "codex".to_string()))
        }
        "qwen" | "qwen-code" => {
            // Qwen Code: 配置在 ~/.qwen/settings.json
            let config_dir = home_dir.join(".qwen");
            let config_file = home_dir.join(".qwen").join("settings.json");
            Ok((config_dir, config_file, "qwen".to_string()))
        }
        _ => {
            // 默认使用 Claude 配置
            let config_dir = home_dir.join(".claude");
            let config_file = home_dir.join(".claude.json");
            Ok((config_dir, config_file, "claude".to_string()))
        }
    }
}

/// 获取 Claude 配置目录路径
#[allow(dead_code)]
fn get_claude_config_dir() -> Result<PathBuf> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
    Ok(home_dir.join(".claude"))
}

/// 解析单个 MCP 服务器配置
fn parse_mcp_server_config(
    name: &str,
    config_obj: &serde_json::Map<String, serde_json::Value>,
    scope: McpConfigScope,
) -> Option<ScannedMcpServer> {
    // 解析 url 字段
    let url = config_obj
        .get("url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // 解析 command 字段
    let command = config_obj
        .get("command")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // 解析 args 字段
    let args = config_obj
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        });

    // 解析 env 字段
    let env = config_obj
        .get("env")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        });

    // 解析 headers 字段
    let headers = config_obj
        .get("headers")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        });

    // 推断传输类型
    let transport = if let Some(transport_str) = config_obj
        .get("transport")
        .and_then(|v| v.as_str())
    {
        // 如果配置中明确指定了 transport 字段
        match transport_str.to_lowercase().as_str() {
            "sse" => McpTransportType::Sse,
            "http" => McpTransportType::Http,
            "stdio" => McpTransportType::Stdio,
            _ => {
                // 未知类型，根据其他字段推断
                if url.is_some() {
                    McpTransportType::Http
                } else if command.is_some() {
                    McpTransportType::Stdio
                } else {
                    return None; // 无法推断传输类型
                }
            }
        }
    } else if url.is_some() {
        // 有 url 字段，检查 URL 是否包含 sse
        if let Some(ref url_str) = url {
            if url_str.contains("/sse") || url_str.contains("sse") {
                McpTransportType::Sse
            } else {
                McpTransportType::Http
            }
        } else {
            McpTransportType::Http
        }
    } else if command.is_some() {
        // 有 command 字段，为 stdio 类型
        McpTransportType::Stdio
    } else {
        // 无法推断传输类型
        return None;
    };

    Some(ScannedMcpServer {
        name: name.to_string(),
        transport,
        scope,
        command,
        args,
        env,
        url,
        headers,
    })
}

/// 扫描 MCP 配置
fn scan_mcp_config(config_dir: &PathBuf, config_file: &PathBuf) -> Result<Vec<ScannedMcpServer>> {
    let mut servers = Vec::new();

    // 1. 首先尝试从 ~/.claude.json (或对应 CLI 的配置文件) 读取用户级 MCP 配置 (user scope)
    if config_file.exists() {
        if let Ok(content) = fs::read_to_string(config_file) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(mcp_servers) = json.get("mcpServers").and_then(|v| v.as_object()) {
                    for (name, config) in mcp_servers {
                        if let Some(config_obj) = config.as_object() {
                            if let Some(server) =
                                parse_mcp_server_config(name, config_obj, McpConfigScope::User)
                            {
                                // 避免重复添加
                                if !servers.iter().any(|s: &ScannedMcpServer| s.name == *name) {
                                    servers.push(server);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. 尝试从 config_dir/settings.json 读取 MCP 配置 (user scope)
    let settings_path = config_dir.join("settings.json");
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(mcp_servers) = json.get("mcpServers").and_then(|v| v.as_object()) {
                    for (name, config) in mcp_servers {
                        if let Some(config_obj) = config.as_object() {
                            if let Some(server) =
                                parse_mcp_server_config(name, config_obj, McpConfigScope::User)
                            {
                                // 避免重复添加
                                if !servers.iter().any(|s: &ScannedMcpServer| s.name == *name) {
                                    servers.push(server);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. 尝试从 .mcp.json 读取项目级配置 (local scope)
    let mcp_json_path = config_dir.join(".mcp.json");
    if mcp_json_path.exists() {
        if let Ok(content) = fs::read_to_string(&mcp_json_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(mcp_servers) = json.get("mcpServers").and_then(|v| v.as_object()) {
                    for (name, config) in mcp_servers {
                        // 避免重复添加
                        if servers.iter().any(|s: &ScannedMcpServer| s.name == *name) {
                            continue;
                        }

                        if let Some(config_obj) = config.as_object() {
                            if let Some(server) =
                                parse_mcp_server_config(name, config_obj, McpConfigScope::Local)
                            {
                                servers.push(server);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(servers)
}

/// 解析 YAML frontmatter 中的字段
fn parse_yaml_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    // YAML frontmatter 格式:
    // ---
    // name: skill-name
    // description: skill description
    // ---
    let lines: Vec<&str> = content.lines().collect();

    // 查找 frontmatter 边界
    let start_idx = lines.iter().position(|line| line.trim() == "---");
    let end_idx = if let Some(start) = start_idx {
        lines.iter().skip(start + 1).position(|line| line.trim() == "---")
            .map(|idx| start + 1 + idx)
    } else {
        None
    };

    if let (Some(start), Some(end)) = (start_idx, end_idx) {
        let frontmatter_lines = &lines[start + 1..end];
        let mut name: Option<String> = None;
        let mut description: Option<String> = None;

        for line in frontmatter_lines {
            let line = line.trim();
            if let Some((key, value)) = line.split_once(':') {
                let key = key.trim();
                let value = value.trim();
                match key {
                    "name" => name = Some(value.to_string()),
                    "description" => description = Some(value.to_string()),
                    _ => {}
                }
            }
        }

        (name, description)
    } else {
        (None, None)
    }
}

/// 检查 Skill 目录的子目录结构
fn check_skill_subdirectories(skill_path: &PathBuf) -> SkillSubdirectories {
    SkillSubdirectories {
        has_scripts: skill_path.join("scripts").exists(),
        has_references: skill_path.join("references").exists(),
        has_assets: skill_path.join("assets").exists(),
    }
}

/// 扫描 Skills 目录
fn scan_skills_directory(claude_dir: &PathBuf) -> Result<Vec<ScannedSkill>> {
    let mut skills = Vec::new();
    let skills_dir = claude_dir.join("skills");

    if !skills_dir.exists() {
        return Ok(skills);
    }

    let entries = fs::read_dir(&skills_dir)?;
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();

            // 检查是否为符号链接，如果是则获取目标路径
            let actual_path = if path.is_symlink() {
                match fs::read_link(&path) {
                    Ok(target) => {
                        // 如果是相对路径，转换为绝对路径
                        if target.is_relative() {
                            path.parent()
                                .map(|p| p.join(&target))
                                .unwrap_or(path.clone())
                        } else {
                            target
                        }
                    }
                    Err(_) => path.clone(),
                }
            } else {
                path.clone()
            };

            if actual_path.is_dir() {
                // 使用目录名作为默认名称
                let dir_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                // 尝试读取 SKILL.md（优先）或 skill.md
                let skill_md = actual_path.join("SKILL.md");
                let skill_md_lower = actual_path.join("skill.md");

                let md_path = if skill_md.exists() {
                    Some(skill_md)
                } else if skill_md_lower.exists() {
                    Some(skill_md_lower)
                } else {
                    None
                };

                let (frontmatter_name, description) = if let Some(md_path) = md_path {
                    if let Ok(content) = fs::read_to_string(&md_path) {
                        parse_yaml_frontmatter(&content)
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                };

                // 使用 frontmatter 中的 name 作为显示名称，否则使用目录名
                let display_name = frontmatter_name.clone().unwrap_or_else(|| dir_name.clone());

                // 检查子目录
                let subdirectories = check_skill_subdirectories(&actual_path);

                skills.push(ScannedSkill {
                    name: display_name,
                    path: path.to_string_lossy().to_string(),
                    description,
                    frontmatter_name,
                    subdirectories,
                });
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                // 单个 .md 文件作为 skill（不支持 frontmatter，保持向后兼容）
                let name = path
                    .file_stem()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let description = fs::read_to_string(&path)
                    .ok()
                    .and_then(|content| content.lines().next().map(|s| s.trim().to_string()));

                skills.push(ScannedSkill {
                    name,
                    path: path.to_string_lossy().to_string(),
                    description,
                    frontmatter_name: None,
                    subdirectories: SkillSubdirectories {
                        has_scripts: false,
                        has_references: false,
                        has_assets: false,
                    },
                });
            }
        }
    }

    Ok(skills)
}

/// 解析 plugin.json 文件
fn parse_plugin_json(plugin_json_path: &PathBuf) -> (Option<String>, Option<String>, Option<String>) {
    if let Ok(content) = fs::read_to_string(plugin_json_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let version = json.get("version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let description = json.get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // 作者信息可能是字符串或对象
            let author = if let Some(author_obj) = json.get("author") {
                if let Some(author_str) = author_obj.as_str() {
                    Some(author_str.to_string())
                } else if let Some(author_obj) = author_obj.as_object() {
                    author_obj.get("name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                } else {
                    None
                }
            } else {
                None
            };

            return (version, description, author);
        }
    }
    (None, None, None)
}

/// 检查 Plugin 目录的子目录结构
fn check_plugin_subdirectories(plugin_path: &PathBuf) -> PluginSubdirectories {
    PluginSubdirectories {
        has_agents: plugin_path.join("agents").exists(),
        has_commands: plugin_path.join("commands").exists(),
        has_skills: plugin_path.join("skills").exists(),
        has_hooks: plugin_path.join("hooks").exists(),
        has_scripts: plugin_path.join("scripts").exists(),
    }
}

/// 扫描 Plugins 目录
fn scan_plugins_directory(claude_dir: &PathBuf) -> Result<Vec<ScannedPlugin>> {
    let mut plugins = Vec::new();
    let plugins_dir = claude_dir.join("plugins");

    if !plugins_dir.exists() {
        return Ok(plugins);
    }

    // 尝试从 installed_plugins.json 读取已安装的插件
    let installed_plugins_path = plugins_dir.join("installed_plugins.json");
    if installed_plugins_path.exists() {
        if let Ok(content) = fs::read_to_string(&installed_plugins_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                // 解析 installed_plugins.json 格式:
                // { "version": 2, "plugins": { "name@source": [ { "installPath": "...", "version": "...", ... } ] } }
                if let Some(plugins_obj) = json.get("plugins").and_then(|v| v.as_object()) {
                    for (plugin_key, plugin_entries) in plugins_obj {
                        // 获取第一个安装条目（通常只有一个）
                        if let Some(entries) = plugin_entries.as_array() {
                            if let Some(first_entry) = entries.first() {
                                // 获取安装路径
                                if let Some(install_path_str) = first_entry.get("installPath").and_then(|v| v.as_str()) {
                                    let install_path = PathBuf::from(install_path_str);

                                    if install_path.exists() {
                                        // 解析 plugin.json（位于 .claude-plugin/plugin.json）
                                        let plugin_json_path = install_path.join(".claude-plugin").join("plugin.json");
                                        let (version, description, author) = parse_plugin_json(&plugin_json_path);

                                        // 检查子目录
                                        let subdirectories = check_plugin_subdirectories(&install_path);

                                        // 从 plugin_key 中提取名称（格式: name@source）
                                        let display_name = plugin_key.split('@').next().unwrap_or(plugin_key);

                                        // 检查是否启用（检查 scope 是否为 user）
                                        let enabled = first_entry.get("scope")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s == "user")
                                            .unwrap_or(true);

                                        plugins.push(ScannedPlugin {
                                            name: display_name.to_string(),
                                            path: install_path.to_string_lossy().to_string(),
                                            enabled,
                                            version,
                                            description,
                                            author,
                                            subdirectories,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 如果没有从 installed_plugins.json 解析到插件，则扫描目录（向后兼容）
    if plugins.is_empty() {
        let entries = fs::read_dir(&plugins_dir)?;
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // 检查是否启用（可以通过存在 .disabled 文件来判断）
                    let disabled_marker = path.join(".disabled");
                    let enabled = !disabled_marker.exists();

                    // 尝试解析 plugin.json
                    let plugin_json_path = path.join(".claude-plugin").join("plugin.json");
                    let (version, description, author) = parse_plugin_json(&plugin_json_path);

                    // 检查子目录
                    let subdirectories = check_plugin_subdirectories(&path);

                    plugins.push(ScannedPlugin {
                        name,
                        path: path.to_string_lossy().to_string(),
                        enabled,
                        version,
                        description,
                        author,
                        subdirectories,
                    });
                }
            }
        }
    }

    Ok(plugins)
}

/// 扫描 CLI 配置 (Tauri 命令)
#[tauri::command]
pub fn scan_cli_config(cli_path: Option<String>) -> Result<ClaudeConfigScanResult, String> {
    // 获取 CLI 配置目录和配置文件路径
    let (config_dir, config_file, cli_name) = match get_cli_config_dir(cli_path.as_deref()) {
        Ok(result) => result,
        Err(e) => {
            return Ok(ClaudeConfigScanResult {
                claude_dir: String::new(),
                mcp_servers: Vec::new(),
                skills: Vec::new(),
                plugins: Vec::new(),
                scan_success: false,
                error_message: Some(format!("无法确定配置目录: {}", e)),
            });
        }
    };

    let config_dir_str = config_dir.to_string_lossy().to_string();

    // 检查配置文件是否存在
    if !config_file.exists() && !config_dir.exists() {
        return Ok(ClaudeConfigScanResult {
            claude_dir: config_dir_str,
            mcp_servers: Vec::new(),
            skills: Vec::new(),
            plugins: Vec::new(),
            scan_success: false,
            error_message: Some(format!("{} 配置不存在", cli_name)),
        });
    }

    // 扫描 MCP 配置
    let mcp_servers = scan_mcp_config(&config_dir, &config_file).unwrap_or_default();

    // 扫描 Skills 目录
    let skills = scan_skills_directory(&config_dir).unwrap_or_default();

    // 扫描 Plugins 目录
    let plugins = scan_plugins_directory(&config_dir).unwrap_or_default();

    Ok(ClaudeConfigScanResult {
        claude_dir: config_dir_str,
        mcp_servers,
        skills,
        plugins,
        scan_success: true,
        error_message: None,
    })
}

/// 尝试通过 claude mcp list 命令获取 MCP 配置
#[tauri::command]
pub fn scan_claude_mcp_list() -> Result<Vec<ScannedMcpServer>, String> {
    let output = Command::new("claude").arg("mcp").arg("list").output();

    match output {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // 解析输出，格式可能是：
                // server-name: command args
                let mut servers = Vec::new();
                for line in stdout.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }

                    // 尝试解析 "name: command args" 格式
                    if let Some((name, rest)) = line.split_once(':') {
                        let name = name.trim().to_string();
                        let rest = rest.trim();

                        // 简单分割命令和参数
                        let parts: Vec<&str> = rest.split_whitespace().collect();
                        if !parts.is_empty() {
                            let command = parts[0].to_string();
                            let args: Vec<String> =
                                parts[1..].iter().map(|s| s.to_string()).collect();

                            servers.push(ScannedMcpServer {
                                name,
                                transport: McpTransportType::Stdio,
                                scope: McpConfigScope::User,
                                command: Some(command),
                                args: if args.is_empty() { None } else { Some(args) },
                                env: None,
                                url: None,
                                headers: None,
                            });
                        }
                    }
                }
                Ok(servers)
            } else {
                // 命令执行失败，返回空列表
                Ok(Vec::new())
            }
        }
        Err(_) => {
            // claude 命令不存在，返回空列表
            Ok(Vec::new())
        }
    }
}

/// 扫描到的智能体会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedCliSession {
    /// 会话ID
    pub session_id: String,
    /// 会话文件路径
    pub session_path: String,
    /// 项目路径（如果适用）
    pub project_path: Option<String>,
    /// 首条消息（作为会话名称的参考）
    pub first_message: Option<String>,
    /// 消息数量
    pub message_count: i32,
    /// 创建时间（文件修改时间）
    pub created_at: String,
    /// 更新时间（文件修改时间）
    pub updated_at: String,
}

/// 扫描智能体会话历史的输入参数
#[derive(Debug, Deserialize)]
pub struct ScanCliSessionsInput {
    /// CLI路径（用于确定智能体类型）
    pub cli_path: Option<String>,
    /// 项目路径（可选，用于筛选特定项目的会话）
    pub project_path: Option<String>,
}

/// 扫描智能体会话历史的结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanCliSessionsResult {
    /// CLI名称
    pub cli_name: String,
    /// 配置目录
    pub config_dir: String,
    /// 扫描到的会话列表
    pub sessions: Vec<ScannedCliSession>,
    /// 扫描是否成功
    pub scan_success: bool,
    /// 错误信息
    pub error_message: Option<String>,
}

/// 从会话jsonl文件中提取会话信息
fn extract_session_info(session_path: &PathBuf) -> Option<ScannedCliSession> {
    let file_name = session_path.file_stem()?.to_string_lossy().to_string();

    // 读取文件获取元数据
    if let Ok(content) = fs::read_to_string(session_path) {
        let mut first_message: Option<String> = None;
        let mut message_count = 0;
        let mut project_path: Option<String> = None;
        let mut earliest_timestamp: Option<String> = None;
        let mut latest_timestamp: Option<String> = None;

        for line in content.lines() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                // 统计消息数量（只统计user和assistant类型的消息）
                if let Some(msg_type) = json.get("type").and_then(|v| v.as_str()) {
                    if msg_type == "user" || msg_type == "assistant" {
                        message_count += 1;

                        // 获取第一条用户消息
                        if first_message.is_none() && msg_type == "user" {
                            if let Some(message) = json.get("message") {
                                if let Some(content) = message.get("content") {
                                    if let Some(text) = content.as_str() {
                                        first_message = Some(text.chars().take(100).collect());
                                    } else if let Some(arr) = content.as_array() {
                                        // 处理数组格式的content
                                        for item in arr {
                                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                                first_message = Some(text.chars().take(100).collect());
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // 获取项目路径
                if project_path.is_none() {
                    project_path = json.get("cwd")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                }

                // 获取时间戳
                if let Some(timestamp) = json.get("timestamp").and_then(|v| v.as_str()) {
                    let ts = timestamp.to_string();
                    if earliest_timestamp.is_none() || &ts < earliest_timestamp.as_ref().unwrap() {
                        earliest_timestamp = Some(ts.clone());
                    }
                    if latest_timestamp.is_none() || &ts > latest_timestamp.as_ref().unwrap() {
                        latest_timestamp = Some(ts);
                    }
                }
            }
        }

        // 获取文件元数据作为备选时间
        let metadata = fs::metadata(session_path).ok()?;
        let modified = metadata.modified().ok()
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        let modified_str = chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339();

        Some(ScannedCliSession {
            session_id: file_name,
            session_path: session_path.to_string_lossy().to_string(),
            project_path,
            first_message,
            message_count,
            created_at: earliest_timestamp.unwrap_or_else(|| modified_str.clone()),
            updated_at: latest_timestamp.unwrap_or(modified_str),
        })
    } else {
        None
    }
}

/// 扫描智能体会话历史 (Tauri 命令)
#[tauri::command]
pub fn scan_cli_sessions(input: ScanCliSessionsInput) -> Result<ScanCliSessionsResult, String> {
    // 获取 CLI 配置目录
    let (config_dir, _, cli_name) = match get_cli_config_dir(input.cli_path.as_deref()) {
        Ok(result) => result,
        Err(e) => {
            return Ok(ScanCliSessionsResult {
                cli_name: String::new(),
                config_dir: String::new(),
                sessions: Vec::new(),
                scan_success: false,
                error_message: Some(format!("无法确定配置目录: {}", e)),
            });
        }
    };

    let config_dir_str = config_dir.to_string_lossy().to_string();

    // 检查配置目录是否存在
    if !config_dir.exists() {
        return Ok(ScanCliSessionsResult {
            cli_name: cli_name.clone(),
            config_dir: config_dir_str,
            sessions: Vec::new(),
            scan_success: false,
            error_message: Some(format!("{} 配置目录不存在", cli_name)),
        });
    }

    let mut sessions = Vec::new();

    // 根据CLI类型扫描会话
    match cli_name.as_str() {
        "claude" | "claude-code" => {
            // Claude CLI: 会话存储在 ~/.claude/projects/<project-path>/ 目录下
            let projects_dir = config_dir.join("projects");
            if projects_dir.exists() {
                if let Some(filter_project) = &input.project_path {
                    // 如果指定了项目路径，只扫描该项目的会话
                    let project_dir_name = filter_project.replace('/', "-");
                    let project_session_dir = projects_dir.join(&project_dir_name);
                    if project_session_dir.exists() {
                        if let Ok(entries) = fs::read_dir(&project_session_dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                                    if let Some(session) = extract_session_info(&path) {
                                        sessions.push(session);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // 扫描所有项目的会话
                    if let Ok(project_entries) = fs::read_dir(&projects_dir) {
                        for project_entry in project_entries.flatten() {
                            let project_path = project_entry.path();
                            if project_path.is_dir() {
                                if let Ok(session_entries) = fs::read_dir(&project_path) {
                                    for session_entry in session_entries.flatten() {
                                        let session_path = session_entry.path();
                                        if session_path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                                            if let Some(session) = extract_session_info(&session_path) {
                                                sessions.push(session);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        "codex" => {
            // Codex CLI: 会话存储格式可能不同，需要根据实际情况调整
            // 暂时返回空列表
        }
        "qwen" | "qwen-code" => {
            // Qwen Code: 会话存储格式可能不同，需要根据实际情况调整
            // 暂时返回空列表
        }
        _ => {
            // 未知CLI类型
        }
    }

    // 按更新时间排序（最新的在前）
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(ScanCliSessionsResult {
        cli_name,
        config_dir: config_dir_str,
        sessions,
        scan_success: true,
        error_message: None,
    })
}
