use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::commands::scan::{parse_mcp_server_config, McpConfigScope, ScannedMcpServer};

pub(crate) fn read_json_file(path: &Path) -> Option<serde_json::Value> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<serde_json::Value>(&content).ok()
}

/// 解析 CLI 的配置根目录，跨平台 + 支持各 CLI 的环境变量覆盖。
///
/// - **claude**: 始终 `~/.claude`（官方文档确认 Claude Code 不遵循 XDG，各平台均用 home 目录）
/// - **codex**: `$CODEX_HOME`（若设）否则 `~/.codex`（官方确认非 XDG，Windows 为 `%USERPROFILE%\.codex`）
/// - **opencode**: `$OPENCODE_CONFIG_DIR` > `$XDG_CONFIG_HOME/opencode` > `~/.config/opencode`
///   （OpenCode 委托给 xdg-basedir；macOS 非 `~/Library/...`，Windows 非 `%APPDATA%`）
///
/// `home_dir` 由调用方传入（便于测试注入）。
pub(crate) fn resolve_cli_config_base_dir(cli_name: &str, home_dir: &Path) -> PathBuf {
    match cli_name {
        "codex" => env_path("CODEX_HOME").unwrap_or_else(|| home_dir.join(".codex")),
        "opencode" => env_path("OPENCODE_CONFIG_DIR")
            .unwrap_or_else(|| {
                env_path("XDG_CONFIG_HOME")
                    .map(|xdg| xdg.join("opencode"))
                    .unwrap_or_else(|| home_dir.join(".config").join("opencode"))
            }),
        // claude / claude-code / qwen / 其它：始终 home 目录
        _ => home_dir.join(".claude"),
    }
}

/// 读取环境变量为非空绝对路径（相对路径忽略，避免误解析）。
fn env_path(key: &str) -> Option<PathBuf> {
    std::env::var(key)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
}

pub(crate) fn parse_author_value(value: Option<&serde_json::Value>) -> Option<String> {
    match value {
        Some(author) if author.is_string() => author.as_str().map(|item| item.to_string()),
        Some(author) if author.is_object() => author
            .as_object()
            .and_then(|object| object.get("name"))
            .and_then(|item| item.as_str())
            .map(|item| item.to_string()),
        _ => None,
    }
}

pub(crate) fn collect_mcp_servers_from_json(
    json: &serde_json::Value,
    scope: McpConfigScope,
    servers: &mut Vec<ScannedMcpServer>,
) {
    collect_mcp_servers_from_value(json, ["mcpServers"], scope, servers);
}

/// 从 JSON 配置（按多个候选键名查找 MCP 服务器表）收集扫描结果。
///
/// 不同 CLI 用不同键：
/// - claude: `mcpServers`
/// - opencode: `mcp`
fn collect_mcp_servers_from_value(
    value: &serde_json::Value,
    keys: [&str; 1],
    scope: McpConfigScope,
    servers: &mut Vec<ScannedMcpServer>,
) {
    for key in keys {
        let Some(mcp_servers) = value.get(key).and_then(|v| v.as_object()) else {
            continue;
        };
        for (name, config) in mcp_servers {
            if servers
                .iter()
                .any(|server| server.name == *name && server.scope == scope)
            {
                continue;
            }

            if let Some(config_obj) = config.as_object() {
                if let Some(server) = parse_mcp_server_config(name, config_obj, scope.clone()) {
                    servers.push(server);
                }
            }
        }
    }
}

/// 从 codex 的 TOML 配置（`config.toml`）收集 MCP 服务器。
///
/// Codex 用 `[mcp_servers.<name>]` 表，结构与 claude 的 JSON `mcpServers` 同构。
/// 这里把 TOML 值桥接为 serde_json::Value 后复用 JSON 解析路径，避免逻辑重复。
pub(crate) fn collect_mcp_servers_from_toml(
    toml_value: &toml::Value,
    scope: McpConfigScope,
    servers: &mut Vec<ScannedMcpServer>,
) {
    // toml::Value -> serde_json::Value（Table 变 Object、Array 变 Array、标量一一对应）
    let json_value = serde_json::to_value(toml_value).ok();
    let Some(json_value) = json_value else {
        return;
    };
    collect_mcp_servers_from_value(&json_value, ["mcp_servers"], scope, servers);
}

/// 扫描 codex 的 TOML MCP 配置文件（`config.toml`）。
pub(crate) fn scan_mcp_toml_source_file(
    path: &Path,
    scope: McpConfigScope,
    servers: &mut Vec<ScannedMcpServer>,
) {
    if !path.exists() {
        return;
    }

    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    let Ok(toml_value) = toml::from_str::<toml::Value>(&content) else {
        return;
    };
    collect_mcp_servers_from_toml(&toml_value, scope, servers);
}

pub(crate) fn scan_mcp_source_file(
    path: &Path,
    scope: McpConfigScope,
    servers: &mut Vec<ScannedMcpServer>,
) {
    if !path.exists() {
        return;
    }

    if let Some(json) = read_json_file(path) {
        collect_mcp_servers_from_json(&json, scope, servers);
    }
}

pub(crate) fn parse_string_map(
    value: Option<&serde_json::Value>,
) -> Option<HashMap<String, String>> {
    value.and_then(|item| item.as_object()).map(|object| {
        object
            .iter()
            .filter_map(|(key, value)| value.as_str().map(|entry| (key.clone(), entry.to_string())))
            .collect()
    })
}
