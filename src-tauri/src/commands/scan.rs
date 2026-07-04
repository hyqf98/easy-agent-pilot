use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::commands::cli_support::resolve_cli_name;

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
    pub disabled: bool,
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

fn build_cli_config_scan_result(
    config_dir: String,
    mcp_servers: Vec<ScannedMcpServer>,
    skills: Vec<ScannedSkill>,
    plugins: Vec<ScannedPlugin>,
) -> ClaudeConfigScanResult {
    ClaudeConfigScanResult {
        claude_dir: config_dir,
        mcp_servers,
        skills,
        plugins,
        scan_success: true,
        error_message: None,
    }
}

fn build_cli_config_scan_error(
    config_dir: String,
    error_message: String,
) -> ClaudeConfigScanResult {
    ClaudeConfigScanResult {
        claude_dir: config_dir,
        mcp_servers: Vec::new(),
        skills: Vec::new(),
        plugins: Vec::new(),
        scan_success: false,
        error_message: Some(error_message),
    }
}

fn get_cli_config_dir(
    cli_path: Option<&str>,
    cli_type_hint: Option<&str>,
) -> Result<(PathBuf, PathBuf, String), String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;

    let cli_name = resolve_cli_name(cli_path, cli_type_hint, "claude");

    // 配置根目录统一走跨平台解析（支持 $CODEX_HOME / $XDG_CONFIG_HOME / $OPENCODE_CONFIG_DIR）
    let config_dir = crate::commands::scan_shared::resolve_cli_config_base_dir(&cli_name, &home_dir);

    match cli_name.as_str() {
        "claude" | "claude-code" => {
            // Claude CLI: 配置目录 ~/.claude/，主配置文件是 home 根的 ~/.claude.json（非目录内）
            let config_file = home_dir.join(".claude.json");
            Ok((config_dir, config_file, "claude".to_string()))
        }
        "codex" => {
            // Codex CLI: 配置在 $CODEX_HOME/config.toml（默认 ~/.codex/config.toml）
            let config_file = config_dir.join("config.toml");
            Ok((config_dir, config_file, "codex".to_string()))
        }
        "opencode" => {
            // OpenCode CLI: 配置在 $XDG_CONFIG_HOME/opencode/opencode.json
            let config_file = config_dir.join("opencode.json");
            Ok((config_dir, config_file, "opencode".to_string()))
        }
        "qwen" | "qwen-code" => {
            // Qwen Code: 配置在 ~/.qwen/settings.json
            let config_dir = home_dir.join(".qwen");
            let config_file = config_dir.join("settings.json");
            Ok((config_dir, config_file, "qwen".to_string()))
        }
        _ => {
            // 默认使用 Claude 配置
            let config_file = home_dir.join(".claude.json");
            Ok((config_dir, config_file, "claude".to_string()))
        }
    }
}

/// 解析单个 MCP 服务器配置
fn transport_from_config_value(value: &str) -> Option<McpTransportType> {
    match value.to_lowercase().as_str() {
        "sse" => Some(McpTransportType::Sse),
        "http" => Some(McpTransportType::Http),
        "stdio" => Some(McpTransportType::Stdio),
        _ => None,
    }
}

fn infer_transport_from_fields(
    url: Option<&String>,
    command: Option<&String>,
) -> Option<McpTransportType> {
    if let Some(url_str) = url {
        return Some(if url_str.contains("/sse") || url_str.contains("sse") {
            McpTransportType::Sse
        } else {
            McpTransportType::Http
        });
    }

    command.map(|_| McpTransportType::Stdio)
}

fn parse_disabled_flag(config_obj: &serde_json::Map<String, serde_json::Value>) -> bool {
    if let Some(enabled) = config_obj.get("enabled").and_then(|value| value.as_bool()) {
        return !enabled;
    }

    config_obj
        .get("disabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

pub(crate) fn parse_mcp_server_config(
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
    let env = crate::commands::scan_shared::parse_string_map(config_obj.get("env"));

    // 解析 headers 字段
    let headers = crate::commands::scan_shared::parse_string_map(
        config_obj
            .get("http_headers")
            .or_else(|| config_obj.get("headers")),
    );

    let disabled = parse_disabled_flag(config_obj);

    // 推断传输类型
    let transport = config_obj
        .get("transport")
        .and_then(|value| value.as_str())
        .and_then(transport_from_config_value)
        .or_else(|| infer_transport_from_fields(url.as_ref(), command.as_ref()))?;

    Some(ScannedMcpServer {
        name: name.to_string(),
        transport,
        scope,
        command,
        args,
        env,
        url,
        headers,
        disabled,
    })
}

fn normalize_project_config_key(raw: &str) -> String {
    let normalized = raw.trim().replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/').to_string();
    let bytes = trimmed.as_bytes();

    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        return trimmed.to_lowercase();
    }

    trimmed
}

fn scan_claude_project_mcp_from_main_config(
    config_file: &Path,
    project_root: &Path,
    servers: &mut Vec<ScannedMcpServer>,
) {
    let Some(json) = crate::commands::scan_shared::read_json_file(config_file) else {
        return;
    };
    let global_mcp_servers = json.get("mcpServers").and_then(|value| value.as_object());
    let Some(projects) = json.get("projects").and_then(|value| value.as_object()) else {
        return;
    };

    let mut lookup_keys = vec![normalize_project_config_key(
        project_root.to_string_lossy().as_ref(),
    )];

    if let Ok(canonical_path) = project_root.canonicalize() {
        lookup_keys.push(normalize_project_config_key(
            canonical_path.to_string_lossy().as_ref(),
        ));
    }

    lookup_keys.sort();
    lookup_keys.dedup();

    let project_entry = projects.iter().find_map(|(project_key, value)| {
        let normalized_key = normalize_project_config_key(project_key);
        if lookup_keys
            .iter()
            .any(|candidate| candidate == &normalized_key)
        {
            value.as_object()
        } else {
            None
        }
    });

    let Some(project_obj) = project_entry else {
        return;
    };
    let Some(mcp_servers) = project_obj
        .get("mcpServers")
        .or_else(|| project_obj.get("mcp_servers"))
        .and_then(|value| value.as_object())
    else {
        return;
    };

    for (name, config) in mcp_servers {
        if servers
            .iter()
            .any(|server| server.name == *name && server.scope == McpConfigScope::Project)
        {
            continue;
        }

        let Some(config_obj) = config.as_object() else {
            continue;
        };

        if let Some(server) = parse_mcp_server_config(name, config_obj, McpConfigScope::Project) {
            servers.push(server);
            continue;
        }

        let Some(global_config_obj) = global_mcp_servers
            .and_then(|items| items.get(name))
            .and_then(|value| value.as_object())
        else {
            continue;
        };

        let mut merged_config = global_config_obj.clone();
        for (key, value) in config_obj {
            merged_config.insert(key.clone(), value.clone());
        }

        if let Some(server) = parse_mcp_server_config(name, &merged_config, McpConfigScope::Project)
        {
            servers.push(server);
        }
    }
}

fn scan_opencode_mcp_source_file(
    path: &Path,
    scope: McpConfigScope,
    servers: &mut Vec<ScannedMcpServer>,
) {
    let Some(json) = crate::commands::scan_shared::read_json_file(path) else {
        return;
    };
    let Some(mcp_obj) = json.get("mcp").and_then(|value| value.as_object()) else {
        return;
    };

    for (name, config) in mcp_obj {
        if servers
            .iter()
            .any(|server| server.name == *name && server.scope == scope)
        {
            continue;
        }

        let Some(config_obj) = config.as_object() else {
            continue;
        };

        let server_type = config_obj
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or("local");
        let enabled = config_obj
            .get("enabled")
            .and_then(|value| value.as_bool())
            .unwrap_or(true);

        if server_type == "remote" {
            let url = config_obj
                .get("url")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            let transport =
                infer_transport_from_fields(url.as_ref(), None).unwrap_or(McpTransportType::Http);

            servers.push(ScannedMcpServer {
                name: name.clone(),
                transport,
                scope: scope.clone(),
                command: None,
                args: None,
                env: None,
                url,
                headers: crate::commands::scan_shared::parse_string_map(config_obj.get("headers")),
                disabled: !enabled,
            });
            continue;
        }

        let command_array = config_obj.get("command").and_then(|value| value.as_array());
        let command = command_array
            .and_then(|values| values.first())
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        let args = command_array.map(|values| {
            values
                .iter()
                .skip(1)
                .filter_map(|value| value.as_str().map(|entry| entry.to_string()))
                .collect::<Vec<String>>()
        });

        servers.push(ScannedMcpServer {
            name: name.clone(),
            transport: McpTransportType::Stdio,
            scope: scope.clone(),
            command,
            args,
            env: crate::commands::scan_shared::parse_string_map(config_obj.get("environment")),
            url: None,
            headers: None,
            disabled: !enabled,
        });
    }
}

/// 扫描 MCP 配置
fn scan_mcp_config(
    cli_name: &str,
    config_dir: &Path,
    config_file: &Path,
    project_path: Option<&Path>,
) -> Result<Vec<ScannedMcpServer>> {
    let mut servers = Vec::new();

    // 1. 首先尝试从用户级配置文件读取 MCP 配置 (user scope)
    //    - claude: ~/.claude.json (JSON, mcpServers)
    //    - codex:  ~/.codex/config.toml (TOML, mcp_servers)
    //    - opencode: ~/.config/opencode/opencode.json (JSON, mcp)
    if cli_name == "opencode" {
        scan_opencode_mcp_source_file(config_file, McpConfigScope::User, &mut servers);
    } else if cli_name == "codex" {
        crate::commands::scan_shared::scan_mcp_toml_source_file(
            config_file,
            McpConfigScope::User,
            &mut servers,
        );
    } else {
        crate::commands::scan_shared::scan_mcp_source_file(
            config_file,
            McpConfigScope::User,
            &mut servers,
        );
    }

    // 2. 尝试从 config_dir/settings.json 读取 MCP 配置 (user scope)
    let settings_path = config_dir.join("settings.json");
    crate::commands::scan_shared::scan_mcp_source_file(
        &settings_path,
        McpConfigScope::User,
        &mut servers,
    );

    if let Some(project_root) = project_path {
        match cli_name {
            "claude" => {
                let mcp_json_path = project_root.join(".mcp.json");
                crate::commands::scan_shared::scan_mcp_source_file(
                    &mcp_json_path,
                    McpConfigScope::Local,
                    &mut servers,
                );
                scan_claude_project_mcp_from_main_config(config_file, project_root, &mut servers);
            }
            "opencode" => {
                let project_config_path = project_root.join("opencode.json");
                scan_opencode_mcp_source_file(
                    &project_config_path,
                    McpConfigScope::Project,
                    &mut servers,
                );
            }
            "codex" => {
                // 项目级 codex 配置：~/.codex/config.toml 的项目等价物
                let project_config_path = project_root.join(".codex").join("config.toml");
                crate::commands::scan_shared::scan_mcp_toml_source_file(
                    &project_config_path,
                    McpConfigScope::Project,
                    &mut servers,
                );
            }
            _ => {}
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
        lines
            .iter()
            .skip(start + 1)
            .position(|line| line.trim() == "---")
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
fn check_skill_subdirectories(skill_path: &Path) -> SkillSubdirectories {
    SkillSubdirectories {
        has_scripts: skill_path.join("scripts").exists(),
        has_references: skill_path.join("references").exists(),
        has_assets: skill_path.join("assets").exists(),
    }
}

fn resolve_scan_entry_path(path: &Path) -> PathBuf {
    if !path.is_symlink() {
        return path.to_path_buf();
    }

    match fs::read_link(path) {
        Ok(target) if target.is_relative() => path
            .parent()
            .map(|parent| parent.join(&target))
            .unwrap_or_else(|| path.to_path_buf()),
        Ok(target) => target,
        Err(_) => path.to_path_buf(),
    }
}

fn find_skill_markdown_path(skill_dir: &Path) -> Option<PathBuf> {
    ["SKILL.md", "skill.md"]
        .iter()
        .map(|name| skill_dir.join(name))
        .find(|path| path.exists())
}

fn build_directory_skill(path: &Path, actual_path: &Path) -> ScannedSkill {
    let dir_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let (frontmatter_name, description) = find_skill_markdown_path(actual_path)
        .and_then(|md_path| fs::read_to_string(md_path).ok())
        .map(|content| parse_yaml_frontmatter(&content))
        .unwrap_or((None, None));

    ScannedSkill {
        name: frontmatter_name.clone().unwrap_or_else(|| dir_name.clone()),
        path: path.to_string_lossy().to_string(),
        description,
        frontmatter_name,
        subdirectories: check_skill_subdirectories(actual_path),
    }
}

fn build_markdown_skill(path: &PathBuf) -> ScannedSkill {
    let name = path
        .file_stem()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let description = fs::read_to_string(path)
        .ok()
        .and_then(|content| content.lines().next().map(|line| line.trim().to_string()));

    ScannedSkill {
        name,
        path: path.to_string_lossy().to_string(),
        description,
        frontmatter_name: None,
        subdirectories: SkillSubdirectories {
            has_scripts: false,
            has_references: false,
            has_assets: false,
        },
    }
}

/// 扫描 Skills 目录
fn scan_skills_directory_at(skills_dir: &Path) -> Result<Vec<ScannedSkill>> {
    let mut skills = Vec::new();

    if !skills_dir.exists() {
        return Ok(skills);
    }

    let entries = fs::read_dir(&skills_dir)?;
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };

        let path = entry.path();
        let actual_path = resolve_scan_entry_path(&path);

        if actual_path.is_dir() {
            skills.push(build_directory_skill(&path, &actual_path));
            continue;
        }

        if path.extension().is_some_and(|extension| extension == "md") {
            skills.push(build_markdown_skill(&path));
        }
    }

    Ok(skills)
}

fn scan_skills_directory(
    config_dir: &Path,
    cli_name: &str,
    project_path: Option<&Path>,
) -> Result<Vec<ScannedSkill>> {
    // 各 CLI 的 skills 目录名拼写：opencode 源码用 {skill,skills} glob，两种都接受。
    // 这里先扫复数 skills，不存在时回退单数 skill。
    let mut skills = scan_skills_dir_with_fallback(config_dir, "skills", "skill")?;

    if let Some(project_root) = project_path {
        // 项目级 skills 目录
        let project_skills_dirs: Vec<PathBuf> = match cli_name {
            "claude" => vec![project_root.join(".claude").join("skills")],
            "opencode" => vec![
                project_root.join(".opencode").join("skills"),
                // opencode 兼容：项目级 .claude/skills、.agents/skills
                project_root.join(".claude").join("skills"),
                project_root.join(".agents").join("skills"),
            ],
            _ => vec![],
        };

        for skills_dir in project_skills_dirs {
            for skill in scan_skills_directory_at(&skills_dir)? {
                if skills.iter().any(|existing| existing.path == skill.path) {
                    continue;
                }
                skills.push(skill);
            }
        }
    }

    // opencode 多根发现：额外扫描全局兼容目录 ~/.claude/skills、~/.agents/skills
    // （opencode 源码 OPENCODE_SKILL_PATTERN + EXTERNAL_SKILL_PATTERN 会读这些位置）
    if cli_name == "opencode" {
        if let Some(home_dir) = dirs::home_dir() {
            let compat_dirs = [
                home_dir.join(".claude").join("skills"),
                home_dir.join(".agents").join("skills"),
            ];
            for skills_dir in compat_dirs {
                for skill in scan_skills_directory_at(&skills_dir)? {
                    if skills.iter().any(|existing| existing.path == skill.path) {
                        continue;
                    }
                    skills.push(skill);
                }
            }
        }
    }

    Ok(skills)
}

/// 扫描指定名字的 skills 目录；若不存在则尝试备选拼写（如 skills → skill）。
fn scan_skills_dir_with_fallback(
    parent: &Path,
    primary: &str,
    fallback: &str,
) -> Result<Vec<ScannedSkill>> {
    let primary_dir = parent.join(primary);
    if primary_dir.exists() {
        return scan_skills_directory_at(&primary_dir);
    }
    let fallback_dir = parent.join(fallback);
    scan_skills_directory_at(&fallback_dir)
}

/// 解析 plugin.json 文件
fn parse_plugin_json(plugin_json_path: &Path) -> (Option<String>, Option<String>, Option<String>) {
    if let Ok(content) = fs::read_to_string(plugin_json_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let version = json
                .get("version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let description = json
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let author = crate::commands::scan_shared::parse_author_value(json.get("author"));

            return (version, description, author);
        }
    }
    (None, None, None)
}

fn plugin_manifest_dir_candidates(cli_name: &str) -> &'static [&'static str] {
    match cli_name {
        "codex" => &[".codex-plugin", ".claude-plugin"],
        _ => &[".claude-plugin", ".codex-plugin"],
    }
}

fn resolve_plugin_manifest_path(plugin_path: &Path, cli_name: &str) -> Option<PathBuf> {
    plugin_manifest_dir_candidates(cli_name)
        .iter()
        .map(|dir_name| plugin_path.join(dir_name).join("plugin.json"))
        .find(|candidate| candidate.exists())
}

/// 检查 Plugin 目录的子目录结构
fn check_plugin_subdirectories(plugin_path: &Path) -> PluginSubdirectories {
    PluginSubdirectories {
        has_agents: plugin_path.join("agents").exists(),
        has_commands: plugin_path.join("commands").exists(),
        has_skills: plugin_path.join("skills").exists(),
        has_hooks: plugin_path.join("hooks").exists(),
        has_scripts: plugin_path.join("scripts").exists(),
    }
}

fn build_scanned_plugin(
    plugin_path: &Path,
    name: String,
    enabled: bool,
    cli_name: &str,
) -> ScannedPlugin {
    let (version, description, author) = resolve_plugin_manifest_path(plugin_path, cli_name)
        .map(|plugin_json_path| parse_plugin_json(&plugin_json_path))
        .unwrap_or((None, None, None));

    ScannedPlugin {
        name,
        path: plugin_path.to_string_lossy().to_string(),
        enabled,
        version,
        description,
        author,
        subdirectories: check_plugin_subdirectories(plugin_path),
    }
}

fn scan_installed_plugins_file(plugins_dir: &Path, cli_name: &str) -> Vec<ScannedPlugin> {
    let installed_plugins_path = plugins_dir.join("installed_plugins.json");
    let Ok(content) = fs::read_to_string(installed_plugins_path) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return Vec::new();
    };
    let Some(plugins_obj) = json.get("plugins").and_then(|value| value.as_object()) else {
        return Vec::new();
    };
    let mut plugins = Vec::new();

    for (plugin_key, plugin_entries) in plugins_obj {
        let Some(first_entry) = plugin_entries
            .as_array()
            .and_then(|entries| entries.first())
        else {
            continue;
        };
        let Some(install_path_str) = first_entry
            .get("installPath")
            .and_then(|value| value.as_str())
        else {
            continue;
        };

        let install_path = PathBuf::from(install_path_str);
        if !install_path.exists() {
            continue;
        }

        let display_name = plugin_key
            .split('@')
            .next()
            .unwrap_or(plugin_key)
            .to_string();
        let enabled = first_entry
            .get("scope")
            .and_then(|value| value.as_str())
            .map(|scope| scope == "user")
            .unwrap_or(true);

        plugins.push(build_scanned_plugin(
            &install_path,
            display_name,
            enabled,
            cli_name,
        ));
    }

    plugins
}

fn scan_plugin_directories(plugins_dir: &Path, cli_name: &str) -> Result<Vec<ScannedPlugin>> {
    let mut plugins = Vec::new();

    for entry in fs::read_dir(plugins_dir)? {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let has_manifest = resolve_plugin_manifest_path(&path, cli_name).is_some();
        let subdirectories = check_plugin_subdirectories(&path);
        if !has_manifest
            && !subdirectories.has_agents
            && !subdirectories.has_commands
            && !subdirectories.has_skills
            && !subdirectories.has_hooks
            && !subdirectories.has_scripts
        {
            continue;
        }

        let name = path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        let enabled = !path.join(".disabled").exists();
        plugins.push(build_scanned_plugin(&path, name, enabled, cli_name));
    }

    Ok(plugins)
}

/// 扫描 Plugins 目录
fn scan_plugins_directory_at(plugins_dir: &Path, cli_name: &str) -> Result<Vec<ScannedPlugin>> {
    if !plugins_dir.exists() {
        return Ok(Vec::new());
    }

    let plugins = scan_installed_plugins_file(&plugins_dir, cli_name);
    if plugins.is_empty() {
        return scan_plugin_directories(&plugins_dir, cli_name);
    }

    Ok(plugins)
}

fn scan_plugins_directory(
    config_dir: &Path,
    cli_name: &str,
    project_path: Option<&Path>,
) -> Result<Vec<ScannedPlugin>> {
    let mut plugins = scan_plugins_directory_at(&config_dir.join("plugins"), cli_name)?;

    if let Some(project_root) = project_path {
        let project_plugins_dir = match cli_name {
            "opencode" => Some(project_root.join(".opencode").join("plugins")),
            _ => None,
        };

        if let Some(plugins_dir) = project_plugins_dir {
            for plugin in scan_plugins_directory_at(&plugins_dir, cli_name)? {
                if plugins.iter().any(|existing| existing.path == plugin.path) {
                    continue;
                }
                plugins.push(plugin);
            }
        }
    }

    Ok(plugins)
}

pub fn scan_cli_config_sync(
    cli_path: Option<String>,
    cli_type: Option<String>,
    project_path: Option<String>,
) -> Result<ClaudeConfigScanResult, String> {
    let (config_dir, config_file, cli_name) =
        match get_cli_config_dir(cli_path.as_deref(), cli_type.as_deref()) {
            Ok(result) => result,
            Err(e) => {
                return Ok(build_cli_config_scan_error(
                    String::new(),
                    format!("无法确定配置目录: {}", e),
                ));
            }
        };

    let config_dir_str = config_dir.to_string_lossy().to_string();

    if !config_file.exists() && !config_dir.exists() {
        return Ok(build_cli_config_scan_error(
            config_dir_str,
            format!("{} 配置不存在", cli_name),
        ));
    }

    let project_root = project_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists() && path.is_dir());

    let mcp_servers = scan_mcp_config(
        &cli_name,
        &config_dir,
        &config_file,
        project_root.as_deref(),
    )
    .unwrap_or_default();
    let skills =
        scan_skills_directory(&config_dir, &cli_name, project_root.as_deref()).unwrap_or_default();
    let plugins =
        scan_plugins_directory(&config_dir, &cli_name, project_root.as_deref()).unwrap_or_default();

    Ok(build_cli_config_scan_result(
        config_dir_str,
        mcp_servers,
        skills,
        plugins,
    ))
}

/// 扫描 CLI 配置 (Tauri 命令，异步)
#[tauri::command]
pub async fn scan_cli_config(
    cli_path: Option<String>,
    cli_type: Option<String>,
    project_path: Option<String>,
) -> Result<ClaudeConfigScanResult, String> {
    tokio::task::spawn_blocking(move || scan_cli_config_sync(cli_path, cli_type, project_path))
        .await
        .map_err(|e| e.to_string())?
}
