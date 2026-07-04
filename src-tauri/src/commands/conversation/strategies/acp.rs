use std::str::FromStr;

use anyhow::Result;
use async_trait::async_trait;
use rusqlite::params;
use tauri::{AppHandle, Emitter};

use agent_client_protocol::schema::{
    ContentBlock, McpServer, McpServerStdio, NewSessionRequest, PermissionOptionKind,
    PromptRequest, PromptResponse,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionNotification, SessionUpdate, SetSessionConfigOptionRequest,
};
use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{on_receive_request, Agent, Client, SessionMessage};
use agent_client_protocol_tokio::AcpAgent;

use super::cli_common::{
    build_content_event, build_error_event, build_system_event,
    timeout_config_for_execution_mode, read_cli_timeout_minutes,
    read_acp_permission_mode,
    CliExecutionMonitor,
};
use crate::commands::conversation::abort::{
    clear_abort_flag, should_abort,
    unregister_session_pid,
};
use crate::commands::conversation::strategy::{AgentExecutionStrategy, AgentRuntimeKind};
use crate::commands::conversation::types::{AcpStreamEvent, ExecutionRequest, McpServerConfig};
use crate::commands::mcp_shared::parse_args_string;
use crate::commands::support::{now_rfc3339, open_db_connection};

pub struct AcpStrategy;

macro_rules! log_info {
    ($($arg:tt)*) => {
        crate::logging::write_log("INFO", "acp", &format!($($arg)*));
    };
}

macro_rules! log_error {
    ($($arg:tt)*) => {
        crate::logging::write_log("ERROR", "acp", &format!($($arg)*));
    };
}

/// 组装 ACP 会话的 MCP server 列表：用户配置的外部 server + 记忆库仓库内置工具。
///
/// 当请求启用内置工具（`internal_tools_enabled` 且携带 `repo_id`）时，追加一条 stdio 条目：
/// 以本可执行文件自重入为 MCP server（`<exe> --mcp-stdio --repo <id>`）。该子进程由
/// 被拉起的 CLI（ACP agent）按 stdio 启动，工具查询的数据源范围由仓库的
/// `memory_repo_sources` 配置裁剪（见 `mcp_server` 模块）。
fn build_session_mcp_servers(request: &ExecutionRequest) -> Vec<McpServerConfig> {
    let mut servers: Vec<McpServerConfig> = request
        .mcp_servers
        .as_ref()
        .map(|servers| servers.to_vec())
        .unwrap_or_default();

    if request.internal_tools_enabled {
        if let Some(repo_id) = request.repo_id.as_ref() {
            if !repo_id.trim().is_empty() {
                if let Ok(exe) = std::env::current_exe() {
                    let exe_str = exe.to_string_lossy().to_string();
                    let args = format!("--mcp-stdio --repo {repo_id}");
                    servers.push(McpServerConfig {
                        id: "__memory_internal__".to_string(),
                        name: "easy-agent-memory".to_string(),
                        transport_type: "stdio".to_string(),
                        command: Some(exe_str),
                        args: Some(args),
                        env: None,
                        url: None,
                        headers: None,
                    });
                }
            }
        }
    }

    servers
}

fn convert_mcp_config(config: &McpServerConfig) -> Option<McpServer> {
    match config.transport_type.as_str() {
        "stdio" => {
            let command = config.command.as_deref().unwrap_or("");
            if command.is_empty() {
                return None;
            }
            let args = parse_args_string(config.args.as_deref());
            let mut server = McpServerStdio::new(config.name.clone(), command);
            if !args.is_empty() {
                server = server.args(args);
            }
            if let Some(env_str) = &config.env {
                let env_pairs = parse_env_string(env_str);
                if !env_pairs.is_empty() {
                    let env_vars: Vec<agent_client_protocol::schema::EnvVariable> = env_pairs
                        .into_iter()
                        .map(|(key, value)| {
                            agent_client_protocol::schema::EnvVariable::new(key, value)
                        })
                        .collect();
                    server = server.env(env_vars);
                }
            }
            Some(McpServer::Stdio(server))
        }
        "sse" => {
            let url = config.url.as_deref().unwrap_or("");
            if url.is_empty() {
                return None;
            }
            Some(McpServer::Sse(
                agent_client_protocol::schema::McpServerSse::new(config.name.clone(), url),
            ))
        }
        "http" => {
            let url = config.url.as_deref().unwrap_or("");
            if url.is_empty() {
                return None;
            }
            Some(McpServer::Http(
                agent_client_protocol::schema::McpServerHttp::new(config.name.clone(), url),
            ))
        }
        _ => None,
    }
}

fn parse_env_string(env_str: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for pair in env_str.split(',') {
        let pair = pair.trim();
        if pair.is_empty() {
            continue;
        }
        if let Some((key, value)) = pair.split_once('=') {
            pairs.push((key.trim().to_string(), value.trim().to_string()));
        }
    }
    pairs
}

fn normalize_reasoning_effort(effort: &str) -> Option<String> {
    let normalized = effort.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }

    Some(normalized.replace('-', "_"))
}

fn acp_reasoning_config_ids() -> &'static [&'static str] {
    &[
        "thought_level",
        "reasoning_effort",
        "reasoningEffort",
        "thinking_level",
        "thinking",
        "reasoning",
    ]
}

fn acp_reasoning_value_candidates(effort: &str) -> Vec<&'static str> {
    match effort {
        "none" => vec!["none", "off", "disabled", "minimal"],
        "minimal" => vec!["minimal", "none", "low"],
        "low" => vec!["low", "minimal"],
        "medium" => vec!["medium", "normal", "default"],
        "high" => vec!["high"],
        "xhigh" | "x_high" => vec!["xhigh", "x-high", "x_high", "very_high", "extra_high", "max"],
        "max" => vec!["max", "xhigh", "x-high", "x_high", "very_high", "extra_high"],
        _ => vec![],
    }
}

/// 不同 ACP Agent 暴露的模型配置项 ID 候选（claude/opencode/codex 命名不一）。
/// 探测时按顺序尝试，命中第一个成功的即返回。
fn acp_model_config_ids() -> &'static [&'static str] {
    &["model", "defaultModel", "model_id", "modelId"]
}

fn resolve_permission_outcome(
    mode: &str,
    options: &[agent_client_protocol::schema::PermissionOption],
) -> RequestPermissionOutcome {
    let preferred_kind = match mode {
        "allow_always" => Some(PermissionOptionKind::AllowAlways),
        "reject_always" => Some(PermissionOptionKind::RejectAlways),
        _ => None,
    };

    if let Some(kind) = preferred_kind {
        if let Some(opt) = options.iter().find(|o| o.kind == kind) {
            return RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                opt.option_id.clone(),
            ));
        }
    }

    if let Some(opt) = options.iter().find(|o| o.kind == PermissionOptionKind::AllowOnce) {
        return RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
            opt.option_id.clone(),
        ));
    }

    RequestPermissionOutcome::Cancelled
}

/// 写入文件变更记录到 file_change_traces 表。
///
/// 以 (session_id, tool_call_id, file_path) 为唯一键做 UPSERT：流式期间一个工具
/// 可能多次更新同一文件，用最后一次（终态）覆盖。保留最早一次的 status，避免
/// 覆盖用户已采纳/回滚的状态。
fn write_file_change_trace(
    session_id: &str,
    request_id: &str,
    tool_call_id: &str,
    file_path: &str,
    relative_path: &str,
    change_type: &str,
    before_content: Option<&str>,
    after_content: &str,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    // seq 不再需要（recorder 移除），使用 0 作为占位
    let seq: i64 = 0;
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO file_change_traces \
         (id, session_id, request_id, tool_call_id, file_path, relative_path, change_type, \
          before_content, after_content, status, created_at, seq) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?11) \
         ON CONFLICT(session_id, tool_call_id, file_path) DO UPDATE SET \
          relative_path = excluded.relative_path, \
          change_type = excluded.change_type, \
          before_content = COALESCE(excluded.before_content, file_change_traces.before_content), \
          after_content = excluded.after_content",
        params![
            &id,
            session_id,
            request_id,
            tool_call_id,
            file_path,
            relative_path,
            change_type,
            before_content,
            after_content,
            &now,
            seq,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// 写入 Agent Plan 快照到 agent_plan_snapshots 表。
///
/// 以 (session_id, request_id) 为唯一键做 UPSERT：一个回合内 Agent 可能多次
/// 下发 Plan（全量替换语义），用最后一次（终态）覆盖。
fn write_agent_plan_snapshot(
    session_id: &str,
    request_id: &str,
    plan_json: &str,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let seq: i64 = 0;
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO agent_plan_snapshots \
         (id, session_id, request_id, plan_json, created_at, updated_at, seq) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         ON CONFLICT(session_id, request_id) DO UPDATE SET \
          plan_json = excluded.plan_json, \
          updated_at = excluded.updated_at, \
          seq = excluded.seq",
        params![&id, session_id, request_id, plan_json, &now, &now, seq],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn build_permission_event(
    session_id: &str,
    request_id: &str,
    tool_title: &str,
    options: &[agent_client_protocol::schema::PermissionOption],
    outcome: &RequestPermissionOutcome,
) -> AcpStreamEvent {
    let outcome_str = match outcome {
        RequestPermissionOutcome::Selected(sel) => {
            options
                .iter()
                .find(|o| o.option_id == sel.option_id)
                .map(|o| format!("{} ({:?})", o.name, o.kind))
                .unwrap_or_else(|| "selected".to_string())
        }
        RequestPermissionOutcome::Cancelled => "cancelled".to_string(),
        _ => "unknown".to_string(),
    };

    AcpStreamEvent {
        event_type: "permission_request".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: Some(format!(
            "Permission: {} -> {}",
            tool_title, outcome_str
        )),
        tool_name: Some(tool_title.to_string()),
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: None,
        permission_options: Some(super::super::permission::to_permission_option_views(options)),
        file_edit: None,
        tool_kind: None,
        tool_locations: None,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

fn build_prompt_from_messages(messages: &[super::super::types::MessageInput]) -> String {
    let mut parts = Vec::new();
    for msg in messages {
        if msg.role == "system" {
            continue;
        }
        let role = &msg.role;
        let content = &msg.content;
        if !content.trim().is_empty() {
            parts.push(format!("{}:\n{}", role, content));
        }
        if let Some(attachments) = &msg.attachments {
            for attachment in attachments {
                if attachment.mime_type.starts_with("image/") {
                    if !attachment.path.trim().is_empty() {
                        parts.push(format!(
                            "[Attached image: {} at {}]",
                            attachment.name, attachment.path
                        ));
                    }
                } else if !attachment.path.trim().is_empty() {
                    parts.push(format!(
                        "[Attached file: {} ({}) at {}]",
                        attachment.name, attachment.mime_type, attachment.path
                    ));
                }
            }
        }
    }
    parts.join("\n\n")
}

fn build_done_event(session_id: &str, request_id: &str) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "done".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: None,
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: None,
        permission_options: None,
        file_edit: None,
        tool_kind: None,
        tool_locations: None,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

fn build_thinking_event(
    session_id: &str,
    request_id: &str,
    content: String,
) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "thinking".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: Some(content),
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: None,
        permission_options: None,
        file_edit: None,
        tool_kind: None,
        tool_locations: None,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

fn build_tool_use_event(
    session_id: &str,
    request_id: &str,
    tool_call_id: String,
    title: String,
    tool_input: String,
    tool_kind: Option<String>,
    tool_locations: Option<Vec<super::super::types::ToolLocationView>>,
) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "tool_use".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: None,
        tool_name: Some(title),
        tool_call_id: Some(tool_call_id),
        tool_input: Some(tool_input),
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: None,
        permission_options: None,
        file_edit: None,
        tool_kind,
        tool_locations,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

fn build_tool_result_event(
    session_id: &str,
    request_id: &str,
    tool_call_id: String,
    tool_result: Option<String>,
    tool_kind: Option<String>,
    tool_locations: Option<Vec<super::super::types::ToolLocationView>>,
) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "tool_result".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: None,
        tool_name: None,
        tool_call_id: Some(tool_call_id),
        tool_input: None,
        tool_result,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: None,
        permission_options: None,
        file_edit: None,
        tool_kind,
        tool_locations,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

fn build_session_started_event(session_id: &str, request_id: &str, external_sid: String) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "session_started".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: None,
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: Some(external_sid),
        permission_options: None,
        file_edit: None,
        tool_kind: None,
        tool_locations: None,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

fn build_plan_event(session_id: &str, request_id: &str, plan_json: String) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "plan".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: Some(plan_json),
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: None,
        permission_options: None,
        file_edit: None,
        tool_kind: None,
        tool_locations: None,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

/// 构造 `available_commands` 事件：Agent 下发的可斜杠命令列表（JSON）。
///
/// 复用既有 `content` 字段承载 JSON，沿用 `plan` 事件的先例，避免改动
/// `AcpStreamEvent` 结构与所有逐字段字面量。
fn build_available_commands_event(
    session_id: &str,
    request_id: &str,
    commands_json: String,
) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "available_commands".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: Some(commands_json),
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: None,
        permission_options: None,
        file_edit: None,
        tool_kind: None,
        tool_locations: None,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
struct PromptUsageSnapshot {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cache_read_input_tokens: Option<u32>,
    cache_creation_input_tokens: Option<u32>,
}

fn extract_prompt_usage(response: &PromptResponse) -> PromptUsageSnapshot {
    let Some(usage) = response.usage.as_ref() else {
        return PromptUsageSnapshot::default();
    };

    PromptUsageSnapshot {
        input_tokens: Some(usage.input_tokens as u32),
        output_tokens: Some(usage.output_tokens as u32),
        cache_read_input_tokens: usage.cached_read_tokens.map(|v| v as u32),
        cache_creation_input_tokens: usage.cached_write_tokens.map(|v| v as u32),
    }
}

fn build_usage_event(
    session_id: &str,
    request_id: &str,
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cache_read_input_tokens: Option<u32>,
    cache_creation_input_tokens: Option<u32>,
    cost: Option<String>,
) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "usage".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: cost,
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens,
        output_tokens,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        model: None,
        external_session_id: None,
        permission_options: None,
        file_edit: None,
        tool_kind: None,
        tool_locations: None,
        message_id: None,
        seq: None,
        is_append: None,
    }
}

fn extract_text_from_content_block(block: &ContentBlock) -> Option<String> {
    match block {
        ContentBlock::Text(t) => Some(t.text.clone()),
        _ => None,
    }
}

fn extract_text_from_tool_call_content(
    contents: &[agent_client_protocol::schema::ToolCallContent],
) -> String {
    contents
        .iter()
        .filter_map(|c| match c {
            agent_client_protocol::schema::ToolCallContent::Content(inner) => {
                extract_text_from_content_block(&inner.content)
            }
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// 从 ACP ToolCallContent 中捕获文件 Diff（path / old_text / new_text）。
///
/// ACP 协议会在工具调用更新中通过 `ToolCallContent::Diff` 精确下发文件修改前后的
/// 完整内容；这里把它们抽取出来，用于持久化追踪与差异审查。
fn extract_diffs_from_tool_call_content(
    contents: &[agent_client_protocol::schema::ToolCallContent],
) -> Vec<agent_client_protocol::schema::Diff> {
    contents
        .iter()
        .filter_map(|c| match c {
            agent_client_protocol::schema::ToolCallContent::Diff(diff) => Some(diff.clone()),
            _ => None,
        })
        .collect()
}

/// 将 ACP ToolKind 转为稳定的 snake_case 字符串（read/edit/delete/...）。
///
/// ToolKind 本身 `#[serde(rename_all = "snake_case")]`，这里复用 serde 序列化，
/// 失败时回退为 "other"。
fn tool_kind_to_string(kind: &agent_client_protocol::schema::ToolKind) -> String {
    serde_json::to_value(kind)
        .ok()
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "other".to_string())
}

/// 将 ACP ToolCallLocation 列表转为前端视图（绝对路径 + 相对路径 + 可选行号）。
///
/// `locations` 来自 `ToolCall`（Vec）或 `ToolCallUpdateFields`（Option<Vec>），
/// 用于"跟随 Agent"特性——展示工具正在读/写/改的文件位置。
fn extract_locations(
    locations: &[agent_client_protocol::schema::ToolCallLocation],
    working_directory: Option<&str>,
) -> Vec<super::super::types::ToolLocationView> {
    locations
        .iter()
        .map(|loc| {
            let file_path = loc.path.to_string_lossy().into_owned();
            let relative_path = relative_path_for(&file_path, working_directory);
            super::super::types::ToolLocationView {
                path: file_path,
                relative_path,
                line: loc.line,
            }
        })
        .collect()
}

/// 将 diff 的绝对路径转为相对工作目录的路径（用于展示），失败则回退原路径。
fn relative_path_for(file_path: &str, working_directory: Option<&str>) -> String {
    let path = std::path::Path::new(file_path);
    if let Some(cwd) = working_directory {
        let cwd = std::path::Path::new(cwd);
        if let Ok(rel) = path.strip_prefix(cwd) {
            return rel.to_string_lossy().into_owned();
        }
    }
    // 兜底：取文件名作为相对展示
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| file_path.to_string())
}

/// 根据旧内容 / 新内容 / 工具类型推断变更类型：create / modify / delete。
fn infer_change_type(
    old_text: &Option<String>,
    new_text: &str,
    kind: Option<&agent_client_protocol::schema::ToolKind>,
) -> &'static str {
    use agent_client_protocol::schema::ToolKind;
    if matches!(kind, Some(ToolKind::Delete)) {
        return "delete";
    }
    let new_empty = new_text.trim().is_empty();
    let has_old = old_text.as_ref().map(|t| !t.is_empty()).unwrap_or(false);
    match (has_old, new_empty) {
        (false, _) => "create",
        (true, true) => "delete",
        (true, false) => "modify",
    }
}

fn build_file_edit_event(
    session_id: &str,
    request_id: &str,
    edit: super::super::types::FileEditView,
) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "file_edit".to_string(),
        session_id: session_id.to_string(),
        request_id: Some(request_id.to_string()),
        content: None,
        tool_name: None,
        tool_call_id: Some(edit.tool_call_id.clone()),
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
        model: None,
        external_session_id: None,
        permission_options: None,
        file_edit: Some(edit),
        tool_kind: None,
        tool_locations: None,
        message_id: None,
        seq: None,
        is_append: None,
    }
}


/// 把短名 ACP 命令展开为实际命令（claude/codex/opencode → npx/子命令）。
/// `pub(crate)` 供 `sync_agent_models` 探测会话复用。
pub(crate) fn resolve_acp_command(raw_command: &str) -> String {
    let trimmed = raw_command.trim();

    if trimmed.contains(' ') || trimmed.contains("npx") || trimmed.contains("node") {
        return trimmed.to_string();
    }

    match trimmed {
        "opencode" => "opencode acp".to_string(),
        "claude" => "npx -y --prefer-offline @zed-industries/claude-code-acp@0.16.2".to_string(),
        "codex" => "npx -y --prefer-offline @zed-industries/codex-acp@0.14.0".to_string(),
        _ => trimmed.to_string(),
    }
}

#[async_trait]
impl AgentExecutionStrategy for AcpStrategy {
    fn kind(&self) -> AgentRuntimeKind {
        AgentRuntimeKind::Acp
    }

    async fn execute(&self, app: AppHandle, request: ExecutionRequest) -> Result<()> {
        let session_id = request.session_id.clone();
        let request_id = request.request_id.clone();
        let event_name = AgentRuntimeKind::Acp.event_name(&session_id);
        let _plan_id = request.plan_id.clone();
        let acp_command = resolve_acp_command(&request.acp_command.clone());
        let working_directory = request.working_directory.clone();
        let execution_mode = request.execution_mode.clone();
        let reasoning_effort = request.reasoning_effort.clone();
        let system_prompt = request.system_prompt.clone();
        let model_id = request.model_id.clone();

        log_info!(
            "Starting ACP session | session_id={} | command={} | cwd={}",
            session_id,
            acp_command,
            working_directory.as_deref().unwrap_or("-")
        );

        // 不再下发/入库 "Connecting to agent via ACP…" 系统状态消息：
        // 1) 等待反馈由前端 AI 气泡内的加载动画（旋转圆环/正在思考）承担，更直观；
        // 2) 该瞬态消息落库会导致刷新后出现一条无意义的 system 行，影响消息列表整洁。

        let agent = match AcpAgent::from_str(&acp_command) {
            Ok(agent) => agent,
            Err(e) => {
                let error_msg = format!("Failed to parse ACP command '{}': {}", acp_command, e);
                log_error!("{}", error_msg);
                let _ = app.emit(&event_name, &build_error_event(&session_id, &request_id, error_msg.clone()));
                return Err(anyhow::anyhow!(error_msg));
            }
        };

        let mcp_servers: Vec<McpServer> = build_session_mcp_servers(&request)
            .iter()
            .filter_map(convert_mcp_config)
            .collect();

        let prompt_text = build_prompt_from_messages(&request.messages);
        if prompt_text.trim().is_empty() {
            let error_msg = "No prompt content provided".to_string();
            log_error!("{}", error_msg);
            let _ = app.emit(&event_name, &build_error_event(&session_id, &request_id, error_msg.clone()));
            return Err(anyhow::anyhow!(error_msg));
        }

        let app_for_handler = app.clone();
        let session_id_for_handler = session_id.clone();
        let request_id_for_handler = request_id.clone();
        let event_name_for_handler = event_name.clone();

        // done/清理阶段在闭包外仍需 session_id，提前克隆（闭包会 move 原值）
        let session_id_cleanup = session_id.clone();

        #[allow(unused_assignments)]
        let result = Client
            .builder()
            .on_receive_request(
                async move |request: RequestPermissionRequest, responder, _cx| {
                    let mode = read_acp_permission_mode();
                    let tool_title = request.tool_call.fields.title.clone().unwrap_or_default();
                    log_info!(
                        "ACP permission request | session_id={} | tool={} | mode={}",
                        session_id_for_handler,
                        tool_title,
                        mode
                    );

                    // ask 模式：挂起等待前端用户决策；其它模式自动决策
                    let outcome = if mode == "ask" {
                        let _ = app_for_handler.emit(
                            &event_name_for_handler,
                            &build_permission_event(
                                &session_id_for_handler,
                                &request_id_for_handler,
                                &tool_title,
                                &request.options,
                                &RequestPermissionOutcome::Cancelled,
                            ),
                        );

                        let decision = super::super::permission::await_approval(
                            &session_id_for_handler,
                            &request_id_for_handler,
                        )
                        .await;

                        match decision {
                            Some(d) => RequestPermissionOutcome::Selected(
                                SelectedPermissionOutcome::new(d.option_id),
                            ),
                            None => RequestPermissionOutcome::Cancelled,
                        }
                    } else {
                        resolve_permission_outcome(&mode, &request.options)
                    };

                    let _ = app_for_handler.emit(
                        &event_name_for_handler,
                        &build_permission_event(
                            &session_id_for_handler,
                            &request_id_for_handler,
                            &tool_title,
                            &request.options,
                            &outcome,
                        ),
                    );

                    let _ = responder.respond(RequestPermissionResponse::new(outcome));
                    Ok(())
                },
                on_receive_request!(),
            )
            .connect_with(agent, async move |connection| {
                let mut session_request = if let Some(ref cwd) = working_directory {
                    NewSessionRequest::new(cwd)
                } else {
                    NewSessionRequest::new(std::env::current_dir().unwrap_or_default())
                };
                if !mcp_servers.is_empty() {
                    session_request = session_request.mcp_servers(mcp_servers);
                }

                let mut session_meta = serde_json::Map::new();
                if let Some(ref effort) = reasoning_effort {
                    if !effort.trim().is_empty() {
                        log_info!("ACP reasoning_effort | session_id={} | effort={}", session_id, effort);
                        session_meta.insert(
                            "reasoningEffort".to_string(),
                            serde_json::Value::String(effort.clone()),
                        );
                    }
                }
                if let Some(ref prompt) = system_prompt {
                    if !prompt.trim().is_empty() {
                        log_info!("ACP system_prompt | session_id={} | length={}", session_id, prompt.len());
                        session_meta.insert(
                            "systemPrompt".to_string(),
                            serde_json::Value::String(prompt.clone()),
                        );
                    }
                }
                if !session_meta.is_empty() {
                    session_request = session_request.meta(session_meta);
                }

                let mut session = connection
                    .build_session_from(session_request)
                    .block_task()
                    .start_session()
                    .await?;

                log_info!("ACP session started | session_id={}", session_id);

                let external_sid = session.session_id().to_string();
                let _ = app.emit(&event_name, &build_session_started_event(&session_id, &request_id, external_sid));

                if let Some(effort) = reasoning_effort
                    .as_deref()
                    .and_then(normalize_reasoning_effort)
                {
                    let candidates = acp_reasoning_value_candidates(&effort);
                    let mut applied_config: Option<String> = None;

                    for config_id in acp_reasoning_config_ids() {
                        for value in &candidates {
                            let result = session
                                .connection()
                                .send_request_to(
                                    Agent,
                                    SetSessionConfigOptionRequest::new(
                                        session.session_id().clone(),
                                        *config_id,
                                        *value,
                                    ),
                                )
                                .block_task()
                                .await;

                            if result.is_ok() {
                                applied_config = Some(format!("{}={}", config_id, value));
                                break;
                            }
                        }

                        if applied_config.is_some() {
                            break;
                        }
                    }

                    if let Some(config) = applied_config {
                        log_info!(
                            "ACP thought_level applied | session_id={} | {}",
                            session_id,
                            config
                        );
                    } else {
                        log_info!(
                            "ACP thought_level config unsupported | session_id={} | effort={}",
                            session_id,
                            effort
                        );
                    }
                }

                // 子代理/会话选定的模型经 ACP config option 回填给执行器。
                // 与 reasoning_effort 同理：不同 Agent 暴露的 config id 命名不一，逐个探测直到命中。
                if let Some(model) = model_id.as_deref() {
                    let model = model.trim();
                    if !model.is_empty() {
                        let mut applied_model: Option<String> = None;
                        for config_id in acp_model_config_ids() {
                            let result = session
                                .connection()
                                .send_request_to(
                                    Agent,
                                    SetSessionConfigOptionRequest::new(
                                        session.session_id().clone(),
                                        *config_id,
                                        model.to_string(),
                                    ),
                                )
                                .block_task()
                                .await;

                            if result.is_ok() {
                                applied_model = Some(format!("{}={}", config_id, model));
                                break;
                            }
                        }

                        if let Some(config) = applied_model {
                            log_info!("ACP model applied | session_id={} | {}", session_id, config);
                        } else {
                            log_info!(
                                "ACP model config unsupported | session_id={} | model={}",
                                session_id,
                                model
                            );
                        }
                    }
                }

                // Bypass session.send_prompt() to retain PromptResponse.usage
                // (send_prompt discards it via `let PromptResponse { stop_reason, .. }`).
                // We send the request directly and capture usage via oneshot.
                let prompt_session_id = session.session_id().clone();
                let prompt_content = vec![prompt_text.clone().into()];
                let (usage_tx, mut usage_rx) = tokio::sync::oneshot::channel::<PromptUsageSnapshot>();

                session
                    .connection()
                    .send_request_to(Agent, PromptRequest::new(prompt_session_id, prompt_content))
                    .on_receiving_result(async move |result| {
                        let snapshot = match result {
                            Ok(response) => extract_prompt_usage(&response),
                            Err(_) => PromptUsageSnapshot::default(),
                        };
                        let _ = usage_tx.send(snapshot);
                        Ok(())
                    })?;

                log_info!("ACP prompt sent | session_id={}", session_id);

                let monitor = CliExecutionMonitor::new();
                let timeout_config = timeout_config_for_execution_mode(
                    execution_mode.as_deref(),
                    read_cli_timeout_minutes(),
                );

                loop {
                    if should_abort(&session_id).await {
                        log_info!("ACP abort requested | session_id={}", session_id);
                            let _ = app.emit(
                                &event_name,
                                &build_system_event(&session_id, &request_id, "Execution cancelled by user.".to_string()),
                            );
                        break;
                    }

                    let snapshot = monitor.snapshot();
                    let now = std::time::Instant::now();
                    if let Some(timeout_kind) = super::cli_common::detect_cli_timeout(
                        &snapshot,
                        timeout_config,
                        now,
                    ) {
                        let error_msg = super::cli_common::build_timeout_error_message(
                            "ACP",
                            timeout_kind,
                            &snapshot,
                            now,
                        );
                        log_error!("{}", error_msg);
                        let _ = app.emit(&event_name, &build_error_event(&session_id, &request_id, error_msg.clone()));
                        break;
                    }

                    tokio::select! {
                        update_result = session.read_update() => {
                            match update_result {
                                Ok(session_message) => {
                                    match session_message {
                                        SessionMessage::SessionMessage(dispatch) => {
                                            let dispatch_result = MatchDispatch::new(dispatch)
                                                .if_notification(async |notif: SessionNotification| {
                                                    monitor.note_activity(true);

                                                    match notif.update {
                                                        SessionUpdate::AgentMessageChunk(chunk) => {
                                                            let text = match &chunk.content {
                                                                ContentBlock::Text(t) => t.text.clone(),
                                                                other => format!("{:?}", other),
                                                            };
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_content_event(&session_id, &request_id, text),
                                                            );
                                                        }
                                                        SessionUpdate::AgentThoughtChunk(chunk) => {
                                                            let text = match &chunk.content {
                                                                ContentBlock::Text(t) => t.text.clone(),
                                                                other => format!("{:?}", other),
                                                            };
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_thinking_event(&session_id, &request_id, text),
                                                            );
                                                        }
                                                        SessionUpdate::ToolCall(tool_call) => {
                                                            let tool_input_str = tool_call.raw_input
                                                                .as_ref()
                                                                .map(|v| serde_json::to_string(v).unwrap_or_default())
                                                                .unwrap_or_default();
                                                            // 透传 ACP ToolKind / ToolCallLocation（跟随 Agent）
                                                            let tool_kind = Some(tool_kind_to_string(&tool_call.kind));
                                                            let tool_locations = Some(extract_locations(
                                                                &tool_call.locations,
                                                                working_directory.as_deref(),
                                                            ));
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_tool_use_event(
                                                                    &session_id,
                                                                    &request_id,
                                                                    tool_call.tool_call_id.to_string(),
                                                                    tool_call.title,
                                                                    tool_input_str,
                                                                    tool_kind,
                                                                    tool_locations,
                                                                ),
                                                            );
                                                        }
                                                        SessionUpdate::ToolCallUpdate(tool_update) => {
                                                            let result_text = tool_update.fields.content
                                                                .as_ref()
                                                                .map(|blocks| extract_text_from_tool_call_content(blocks))
                                                                .filter(|t| !t.is_empty())
                                                                .or_else(|| {
                                                                    tool_update.fields.raw_output
                                                                        .as_ref()
                                                                        .map(|v| serde_json::to_string(v).unwrap_or_default())
                                                                });
                                                            // 透传 ACP ToolKind / ToolCallLocation（跟随 Agent）
                                                            let tool_kind = tool_update.fields.kind
                                                                .as_ref()
                                                                .map(tool_kind_to_string);
                                                            let tool_locations = tool_update.fields.locations
                                                                .as_ref()
                                                                .map(|locs| extract_locations(locs, working_directory.as_deref()));

                                                            // raw_input 延迟到达（ToolCall 初始事件为空，更新事件才携带完整参数）
                                                            // 发 tool_input_delta 事件让前端补全 tool_use 行的参数
                                                            if let Some(raw_input) = &tool_update.fields.raw_input {
                                                                let input_str = serde_json::to_string(raw_input).unwrap_or_default();
                                                                if !input_str.is_empty() && input_str != "{}" {
                                                                    let input_kind = tool_kind.clone();
                                                                    let input_locs = tool_update.fields.locations
                                                                        .as_ref()
                                                                        .map(|locs| extract_locations(locs, working_directory.as_deref()));
                                                                    let _ = app.emit(
                                                                        &event_name,
                                                                        &AcpStreamEvent {
                                                                            event_type: "tool_input_delta".to_string(),
                                                                            session_id: session_id.clone(),
                                                                            request_id: Some(request_id.clone()),
                                                                            content: None,
                                                                            tool_name: None,
                                                                            tool_call_id: Some(tool_update.tool_call_id.to_string()),
                                                                            tool_input: Some(input_str),
                                                                            tool_result: None,
                                                                            error: None,
                                                                            input_tokens: None,
                                                                            output_tokens: None,
                                                                            raw_input_tokens: None,
                                                                            raw_output_tokens: None,
                                                                            cache_read_input_tokens: None,
                                                                            cache_creation_input_tokens: None,
                                                                            model: None,
                                                                            external_session_id: None,
                                                                            permission_options: None,
                                                                            file_edit: None,
                                                                            tool_kind: input_kind,
                                                                            tool_locations: input_locs,
                                                                            message_id: None,
                                                                            seq: None,
                                                                            is_append: None,
                                                                        },
                                                                    );
                                                                }
                                                            }

                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_tool_result_event(
                                                                    &session_id,
                                                                    &request_id,
                                                                    tool_update.tool_call_id.to_string(),
                                                                    result_text,
                                                                    tool_kind,
                                                                    tool_locations,
                                                                ),
                                                            );

                                                            // 文件变更追踪：从 ToolCallContent::Diff 捕获修改前/后内容
                                                            let diffs = tool_update.fields.content
                                                                .as_ref()
                                                                .map(|blocks| extract_diffs_from_tool_call_content(blocks))
                                                                .unwrap_or_default();
                                                            let kind = tool_update.fields.kind.as_ref();
                                                            for diff in diffs {
                                                                let file_path = diff.path.to_string_lossy().into_owned();
                                                                let relative_path = relative_path_for(&file_path, working_directory.as_deref());
                                                                let change_type = infer_change_type(&diff.old_text, &diff.new_text, kind);
                                                                let tool_call_id = tool_update.tool_call_id.to_string();
                                                                let view = super::super::types::FileEditView {
                                                                    tool_call_id: tool_call_id.clone(),
                                                                    file_path: file_path.clone(),
                                                                    relative_path: relative_path.clone(),
                                                                    change_type: change_type.to_string(),
                                                                    before_content: diff.old_text.clone(),
                                                                    after_content: diff.new_text.clone(),
                                                                };
                                                                let result = write_file_change_trace(
                                                                    &session_id,
                                                                    &request_id,
                                                                    &tool_call_id,
                                                                    &file_path,
                                                                    &relative_path,
                                                                    change_type,
                                                                    diff.old_text.as_deref(),
                                                                    &diff.new_text,
                                                                );
                                                                if let Err(e) = result {
                                                                    log_error!("Failed to write file_change_trace | session_id={} | error={}", session_id, e);
                                                                }
                                                                let _ = app.emit(
                                                                    &event_name,
                                                                    &build_file_edit_event(&session_id, &request_id, view),
                                                                );
                                                            }
                                                        }
                                                        SessionUpdate::Plan(plan) => {
                                                            let plan_json = serde_json::to_string(&plan)
                                                                .unwrap_or_default();
                                                            // 落库到 agent_plan_snapshots（同回合 UPSERT 为终态），
                                                            // 同时下发 live 事件供右侧计划面板实时更新。
                                                            let result = write_agent_plan_snapshot(
                                                                &session_id,
                                                                &request_id,
                                                                &plan_json,
                                                            );
                                                            if let Err(e) = result {
                                                                log_error!("Failed to write agent_plan_snapshot | session_id={} | error={}", session_id, e);
                                                            }
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_plan_event(&session_id, &request_id, plan_json),
                                                            );
                                                        }
                                                        SessionUpdate::UsageUpdate(usage) => {
                                                            monitor.note_activity(false);
                                                            let cost_str = usage.cost.as_ref()
                                                                .map(|c| serde_json::to_string(c).unwrap_or_default());
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &AcpStreamEvent {
                                                                    event_type: "context_window".to_string(),
                                                                    session_id: session_id.clone(),
                                                                    request_id: Some(request_id.clone()),
                                                                    content: cost_str,
                                                                    tool_name: None,
                                                                    tool_call_id: None,
                                                                    tool_input: None,
                                                                    tool_result: None,
                                                                    error: None,
                                                                    input_tokens: Some(usage.used as u32),
                                                                    output_tokens: Some(usage.size as u32),
                                                                    raw_input_tokens: None,
                                                                    raw_output_tokens: None,
                                                                    cache_read_input_tokens: None,
                                                                    cache_creation_input_tokens: None,
                                                                    model: None,
                                                                    external_session_id: None,
                                                                    permission_options: None,
                                                                    file_edit: None,
                                                                    tool_kind: None,
                                                                    tool_locations: None,
                                                                    message_id: None,
                                                                    seq: None,
                                                                    is_append: None,
                                                                },
                                                            );
                                                        }
                                                        SessionUpdate::SessionInfoUpdate(info) => {
                                                            monitor.note_activity(false);
                                                            log_info!(
                                                                "ACP session info updated | session_id={} | {:?}",
                                                                session_id, info
                                                            );
                                                        }
                                                        SessionUpdate::AvailableCommandsUpdate(cmds) => {
                                                            monitor.note_activity(false);
                                                            // 序列化为前端视图 JSON 下发，供 `/` 斜杠命令下拉合并
                                                            // Agent 命令分组。序列化失败仅记日志，不阻断流。
                                                            let cmds_json = serde_json::to_string(
                                                                &cmds.available_commands.iter().map(|c| {
                                                                    serde_json::json!({
                                                                        "name": c.name,
                                                                        "description": c.description,
                                                                        "hint": c.input.as_ref().and_then(|i| match i {
                                                                            agent_client_protocol::schema::AvailableCommandInput::Unstructured(u) => Some(u.hint.clone()),
                                                                            // AvailableCommandInput 为非穷举枚举（SDK 未来可能新增变体），
                                                                            // 未识别的输入类型无 hint 可展示，返回 None。
                                                                            _ => None,
                                                                        }),
                                                                    })
                                                                }).collect::<Vec<_>>(),
                                                            ).unwrap_or_default();
                                                            if !cmds_json.is_empty() {
                                                                let _ = app.emit(
                                                                    &event_name,
                                                                    &build_available_commands_event(&session_id, &request_id, cmds_json),
                                                                );
                                                            } else {
                                                                log_info!(
                                                                    "ACP available commands | session_id={} | count={}",
                                                                    session_id, cmds.available_commands.len()
                                                                );
                                                            }
                                                        }
                                                        SessionUpdate::CurrentModeUpdate(mode_update) => {
                                                            monitor.note_activity(false);
                                                            log_info!(
                                                                "ACP mode changed | session_id={} | mode={:?}",
                                                                session_id, mode_update.current_mode_id
                                                            );
                                                        }
                                                        SessionUpdate::ConfigOptionUpdate(config) => {
                                                            monitor.note_activity(false);
                                                            log_info!(
                                                                "ACP config updated | session_id={} | {:?}",
                                                                session_id, config
                                                            );
                                                        }
                                                        _ => {
                                                            monitor.note_activity(false);
                                                        }
                                                    }
                                                    Ok(())
                                                })
                                                .await
                                                .otherwise_ignore();

                                            if let Err(e) = dispatch_result {
                                                log_error!("MatchDispatch error | session_id={} | error={}", session_id, e);
                                            }
                                        }
                                        SessionMessage::StopReason(stop_reason) => {
                                            log_info!("ACP stop reason | session_id={} | reason={:?}", session_id, stop_reason);
                                            break;
                                        }
                                        _ => {
                                            log_info!("ACP unknown session message | session_id={}", session_id);
                                        }
                                    }
                                }
                                Err(e) => {
                                    let error_str = e.to_string();
                                    if error_str.contains("EOF")
                                        || error_str.contains("closed")
                                        || error_str.contains("channel")
                                    {
                                        log_info!("ACP session ended normally | session_id={}", session_id);
                                    } else {
                                        log_error!("ACP read error | session_id={} | error={}", session_id, error_str);
                                        let _ = app.emit(
                                            &event_name,
                                            &build_error_event(&session_id, &request_id, format!("ACP session error: {}", error_str)),
                                        );
                                    }
                                    break;
                                }
                            }
                        }
                        usage_snapshot = &mut usage_rx => {
                            let snapshot = usage_snapshot.unwrap_or_default();
                            log_info!(
                                "ACP prompt usage | session_id={} | input={} | output={} | cache_read={} | cache_creation={}",
                                session_id,
                                snapshot.input_tokens.unwrap_or(0),
                                snapshot.output_tokens.unwrap_or(0),
                                snapshot.cache_read_input_tokens.unwrap_or(0),
                                snapshot.cache_creation_input_tokens.unwrap_or(0),
                            );
                            let _ = app.emit(
                                &event_name,
                                &build_usage_event(
                                    &session_id,
                                    &request_id,
                                    snapshot.input_tokens,
                                    snapshot.output_tokens,
                                    snapshot.cache_read_input_tokens,
                                    snapshot.cache_creation_input_tokens,
                                    None,
                                ),
                            );
                            break;
                        }
                        // 5s 保活间隔改为可中断的短轮询：
                        // 中断标志置位时（用户取消）能尽快触发循环顶部的 should_abort 检查，
                        // 避免被单一长 sleep 阻塞最多 5s。
                        _ = tokio::time::sleep(std::time::Duration::from_millis(250)) => {
                            // 期间检测到中断则提前结束 select 等待
                            if should_abort(&session_id).await {
                                break;
                            }
                        }
                    }
                }

                // done 阶段：发送 done 事件（闭包内自包含，避免 move 后借用）
                let _ = app.emit(&event_name, &build_done_event(&session_id, &request_id));
                log_info!("ACP execution completed | session_id={}", session_id);

                Ok(())
            })
            .await;

        unregister_session_pid(&session_id_cleanup).await;
        clear_abort_flag(&session_id_cleanup).await;
        // 清理可能残留的待处理权限询问，避免前端弹窗悬空
        super::super::permission::cancel_session_approvals(&session_id_cleanup).await;

        result.map_err(|e| anyhow::anyhow!("ACP execution failed: {}", e))
    }
}

/// 探测某 ACP Agent 支持的模型清单。
///
/// 建立一个**短命探测会话**：发 `session/new` 拿原始 `NewSessionResponse`，
/// 读取其 `models.available_models` 后立即返回，不发送任何 prompt。
///
/// 关键：**必须绕过 `start_session`**——`attach_session`（crate session.rs）
/// 会解构丢弃 `NewSessionResponse.models`，`ActiveSession::response()` 重建时 models 恒为 None。
/// 这里直接用底层 `send_request_to(Agent, NewSessionRequest).block_task()` 拿原始响应。
///
/// 子进程清理：`connect_with` 闭包返回后连接 future 被 drop → `ChildGuard::drop` 触发
/// `start_kill()`，子进程被自动回收。外层 `tokio::time::timeout(30s)` 防止 agent 卡死。
pub(crate) async fn probe_acp_models(acp_command: &str) -> Result<Vec<String>, String> {
    use std::time::Duration;

    let agent = AcpAgent::from_str(acp_command)
        .map_err(|e| format!("ACP 命令解析失败: {}", e))?;

    let probe = async {
        Client
            .builder()
            .connect_with(agent, async move |connection| {
                let req = NewSessionRequest::new(
                    std::env::current_dir().unwrap_or_default(),
                );

                let resp: agent_client_protocol::schema::NewSessionResponse = connection
                    .send_request_to(Agent, req)
                    .block_task()
                    .await?;

                // models 为 None 表示该 agent 未声明模型能力（feature gate 字段）
                let models = resp
                    .models
                    .map(|s| s.available_models)
                    .unwrap_or_default();

                // ModelInfo.model_id 是 Arc<str> newtype，转 String 供落库去重
                let model_ids = models
                    .into_iter()
                    .map(|m| m.model_id.to_string())
                    .collect::<Vec<String>>();

                Ok::<_, agent_client_protocol::Error>(model_ids)
            })
            .await
            .map_err(|e| format!("ACP 探测连接失败: {}", e))
    };

    tokio::time::timeout(Duration::from_secs(30), probe)
        .await
        .map_err(|_| "同步模型超时（30s）".to_string())?
}

/// 探测 opencode 支持的模型清单（原生 CLI 路径）。
///
/// opencode 不通过 ACP `session/new.models` 暴露模型（实测返回空），
/// 而是用独立的 `opencode models` 子命令列出所有可用模型（每行一个 `provider/model`）。
/// 这里直接执行该命令并解析 stdout，去重去空行/可能的表头。
pub(crate) async fn probe_opencode_models() -> Result<Vec<String>, String> {
    let output = tokio::process::Command::new("opencode")
        .arg("models")
        // opencode models 不依赖 cwd，但显式指定避免继承可疑的工作目录
        .current_dir(std::env::temp_dir())
        .output()
        .await
        .map_err(|e| format!("执行 opencode models 失败（是否已安装？）: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("opencode models 执行失败: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut seen = std::collections::BTreeSet::new();
    let mut models = Vec::new();
    for line in stdout.lines() {
        let m = line.trim();
        // 跳过空行、表头（含 Provider/Model 等标题）、分隔线
        if m.is_empty()
            || m.starts_with('-')
            || m.eq_ignore_ascii_case("provider")
            || m.eq_ignore_ascii_case("model")
        {
            continue;
        }
        if seen.insert(m.to_string()) {
            models.push(m.to_string());
        }
    }

    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::conversation::types::MessageInput;
    use crate::commands::message::MessageAttachment;
    use agent_client_protocol::schema::{
        Content, Diff, PermissionOption, PermissionOptionId, StopReason, TextContent, ToolCall,
        ToolCallContent, ToolKind, Usage,
    };

    // ---- resolve_acp_command ----

    #[test]
    fn resolve_acp_command_expands_opencode() {
        assert_eq!(resolve_acp_command("opencode"), "opencode acp");
    }

    #[test]
    fn resolve_acp_command_expands_claude_and_codex() {
        let claude = resolve_acp_command("claude");
        assert!(
            claude.contains("claude-code-acp") && claude.starts_with("npx"),
            "claude command unexpected: {}",
            claude
        );
        let codex = resolve_acp_command("codex");
        assert!(
            codex.contains("codex-acp") && codex.starts_with("npx"),
            "codex command unexpected: {}",
            codex
        );
    }

    #[test]
    fn resolve_acp_command_passes_through_complex_commands() {
        // already contains a space
        assert_eq!(
            resolve_acp_command("opencode acp"),
            "opencode acp"
        );
        // npx / node prefixes pass through untouched
        assert_eq!(
            resolve_acp_command("npx -y some-pkg"),
            "npx -y some-pkg"
        );
        assert_eq!(
            resolve_acp_command("node /usr/local/bin/agent"),
            "node /usr/local/bin/agent"
        );
    }

    #[test]
    fn resolve_acp_command_unknown_returns_trimmed() {
        assert_eq!(resolve_acp_command("  weirdo  "), "weirdo");
        assert_eq!(resolve_acp_command("custom-agent"), "custom-agent");
    }

    // ---- parse_env_string ----

    #[test]
    fn parse_env_string_parses_pairs() {
        let pairs = parse_env_string("KEY1=val1, KEY2=val2");
        assert_eq!(pairs.len(), 2);
        assert_eq!(pairs[0], ("KEY1".to_string(), "val1".to_string()));
        assert_eq!(pairs[1], ("KEY2".to_string(), "val2".to_string()));
    }

    #[test]
    fn parse_env_string_skips_empty_and_invalid() {
        let pairs = parse_env_string("A=1, , B=2, noequal, C=3");
        assert_eq!(pairs.len(), 3);
        assert_eq!(pairs[0], ("A".to_string(), "1".to_string()));
        assert_eq!(pairs[2], ("C".to_string(), "3".to_string()));
    }

    #[test]
    fn parse_env_string_empty_input() {
        assert!(parse_env_string("").is_empty());
        assert!(parse_env_string("   ").is_empty());
    }

    // ---- convert_mcp_config ----

    fn stdio_config(name: &str, command: Option<&str>, args: Option<&str>, env: Option<&str>) -> McpServerConfig {
        McpServerConfig {
            id: name.to_string(),
            name: name.to_string(),
            transport_type: "stdio".to_string(),
            command: command.map(|s| s.to_string()),
            args: args.map(|s| s.to_string()),
            env: env.map(|s| s.to_string()),
            url: None,
            headers: None,
        }
    }

    fn remote_config(transport: &str, name: &str, url: Option<&str>) -> McpServerConfig {
        McpServerConfig {
            id: name.to_string(),
            name: name.to_string(),
            transport_type: transport.to_string(),
            command: None,
            args: None,
            env: None,
            url: url.map(|s| s.to_string()),
            headers: None,
        }
    }

    #[test]
    fn convert_mcp_config_stdio_without_command_returns_none() {
        assert!(convert_mcp_config(&stdio_config("empty", None, None, None)).is_none());
        assert!(convert_mcp_config(&stdio_config("empty", Some(""), None, None)).is_none());
    }

    #[test]
    fn convert_mcp_config_stdio_with_command_and_args() {
        let cfg = stdio_config("fs", Some("npx"), Some("-y @mcp/server-fs"), None);
        let server = convert_mcp_config(&cfg).expect("stdio server");
        match server {
            McpServer::Stdio(s) => {
                assert_eq!(s.command.to_string_lossy(), "npx");
                assert!(s.args.iter().any(|a| a.contains("server-fs")));
            }
            other => panic!("expected Stdio, got {:?}", other),
        }
    }

    #[test]
    fn convert_mcp_config_stdio_with_env() {
        let cfg = stdio_config("fs", Some("npx"), None, Some("API_KEY=secret, DEBUG=1"));
        let server = convert_mcp_config(&cfg).expect("stdio server");
        match server {
            McpServer::Stdio(s) => {
                assert_eq!(s.env.len(), 2);
                assert_eq!(s.env[0].name, "API_KEY");
                assert_eq!(s.env[0].value, "secret");
            }
            other => panic!("expected Stdio, got {:?}", other),
        }
    }

    #[test]
    fn convert_mcp_config_sse_with_url() {
        let cfg = remote_config("sse", "remote", Some("http://localhost:8080/sse"));
        match convert_mcp_config(&cfg).expect("sse server") {
            McpServer::Sse(s) => assert_eq!(s.url, "http://localhost:8080/sse"),
            other => panic!("expected Sse, got {:?}", other),
        }
    }

    #[test]
    fn convert_mcp_config_http_with_url() {
        let cfg = remote_config("http", "remote", Some("http://localhost:8080/mcp"));
        match convert_mcp_config(&cfg).expect("http server") {
            McpServer::Http(s) => assert_eq!(s.url, "http://localhost:8080/mcp"),
            other => panic!("expected Http, got {:?}", other),
        }
    }

    #[test]
    fn convert_mcp_config_remote_without_url_returns_none() {
        assert!(convert_mcp_config(&remote_config("sse", "remote", None)).is_none());
        assert!(convert_mcp_config(&remote_config("http", "remote", Some(""))).is_none());
    }

    #[test]
    fn convert_mcp_config_unknown_transport_returns_none() {
        assert!(convert_mcp_config(&remote_config("websocket", "remote", Some("ws://x"))).is_none());
    }

    // ---- resolve_permission_outcome ----

    fn perm_option(id: &str, name: &str, kind: PermissionOptionKind) -> PermissionOption {
        PermissionOption::new(PermissionOptionId::new(id), name, kind)
    }

    fn standard_options() -> Vec<PermissionOption> {
        vec![
            perm_option("once", "Allow Once", PermissionOptionKind::AllowOnce),
            perm_option("always", "Always Allow", PermissionOptionKind::AllowAlways),
            perm_option("reject", "Reject", PermissionOptionKind::RejectAlways),
        ]
    }

    #[test]
    fn permission_allow_always_picks_allow_always_option() {
        let opts = standard_options();
        let outcome = resolve_permission_outcome("allow_always", &opts);
        match outcome {
            RequestPermissionOutcome::Selected(sel) => {
                assert_eq!(&*sel.option_id.0, "always");
            }
            other => panic!("expected Selected, got {:?}", other),
        }
    }

    #[test]
    fn permission_allow_always_without_target_falls_back_to_allow_once() {
        let opts = vec![
            perm_option("once", "Allow Once", PermissionOptionKind::AllowOnce),
            perm_option("reject", "Reject", PermissionOptionKind::RejectAlways),
        ];
        let outcome = resolve_permission_outcome("allow_always", &opts);
        match outcome {
            RequestPermissionOutcome::Selected(sel) => assert_eq!(&*sel.option_id.0, "once"),
            other => panic!("expected Selected fallback, got {:?}", other),
        }
    }

    #[test]
    fn permission_reject_always_picks_reject_option() {
        let opts = standard_options();
        let outcome = resolve_permission_outcome("reject_always", &opts);
        match outcome {
            RequestPermissionOutcome::Selected(sel) => assert_eq!(&*sel.option_id.0, "reject"),
            other => panic!("expected Selected reject, got {:?}", other),
        }
    }

    #[test]
    fn permission_ask_mode_picks_first_allow_once() {
        let opts = standard_options();
        let outcome = resolve_permission_outcome("ask", &opts);
        match outcome {
            RequestPermissionOutcome::Selected(sel) => assert_eq!(&*sel.option_id.0, "once"),
            other => panic!("expected Selected allow once, got {:?}", other),
        }
    }

    #[test]
    fn permission_unknown_mode_falls_back_to_allow_once() {
        let opts = standard_options();
        let outcome = resolve_permission_outcome("garbage", &opts);
        assert!(matches!(outcome, RequestPermissionOutcome::Selected(_)));
    }

    #[test]
    fn permission_empty_options_returns_cancelled() {
        let outcome = resolve_permission_outcome("ask", &[]);
        assert!(matches!(outcome, RequestPermissionOutcome::Cancelled));

        let outcome2 = resolve_permission_outcome("allow_always", &[]);
        assert!(matches!(outcome2, RequestPermissionOutcome::Cancelled));
    }

    // ---- build_permission_event ----

    #[test]
    fn build_permission_event_selected_contains_tool_and_outcome() {
        let opts = standard_options();
        let outcome = resolve_permission_outcome("allow_always", &opts);
        let ev = build_permission_event("sess-1", "req-1", "Bash(exec)", &opts, &outcome);
        assert_eq!(ev.event_type, "permission_request");
        assert_eq!(ev.session_id, "sess-1");
        assert_eq!(ev.tool_name.as_deref(), Some("Bash(exec)"));
        let content = ev.content.as_deref().unwrap_or("");
        assert!(content.contains("Permission: Bash(exec)"), "content={}", content);
        assert!(content.contains("Always Allow"), "content={}", content);
    }

    #[test]
    fn build_permission_event_cancelled_contains_cancelled() {
        let ev = build_permission_event("sess-1", "req-1", "Bash(exec)", &[], &RequestPermissionOutcome::Cancelled);
        let content = ev.content.as_deref().unwrap_or("");
        assert!(content.contains("cancelled"), "content={}", content);
    }

    // ---- extract_prompt_usage ----

    #[test]
    fn extract_prompt_usage_with_full_usage() {
        let usage = Usage::new(1500, 1000, 500)
            .cached_read_tokens(300u64)
            .cached_write_tokens(200u64);
        let resp = PromptResponse::new(StopReason::EndTurn).usage(usage);
        let snap = extract_prompt_usage(&resp);
        assert_eq!(snap.input_tokens, Some(1000));
        assert_eq!(snap.output_tokens, Some(500));
        assert_eq!(snap.cache_read_input_tokens, Some(300));
        assert_eq!(snap.cache_creation_input_tokens, Some(200));
    }

    #[test]
    fn extract_prompt_usage_without_cache_fields() {
        let usage = Usage::new(800, 600, 200);
        let resp = PromptResponse::new(StopReason::EndTurn).usage(usage);
        let snap = extract_prompt_usage(&resp);
        assert_eq!(snap.input_tokens, Some(600));
        assert_eq!(snap.output_tokens, Some(200));
        assert_eq!(snap.cache_read_input_tokens, None);
        assert_eq!(snap.cache_creation_input_tokens, None);
    }

    #[test]
    fn extract_prompt_usage_without_usage_is_default() {
        let resp = PromptResponse::new(StopReason::EndTurn);
        let snap = extract_prompt_usage(&resp);
        assert_eq!(snap, PromptUsageSnapshot::default());
        assert_eq!(snap.input_tokens, None);
        assert_eq!(snap.output_tokens, None);
    }

    // ---- build_prompt_from_messages ----

    fn msg(role: &str, content: &str) -> MessageInput {
        MessageInput {
            role: role.to_string(),
            content: content.to_string(),
            attachments: None,
        }
    }

    fn attachment(name: &str, path: &str, mime: &str) -> MessageAttachment {
        MessageAttachment {
            id: name.to_string(),
            name: name.to_string(),
            path: path.to_string(),
            mime_type: mime.to_string(),
            size: 100,
            preview_url: None,
        }
    }

    #[test]
    fn build_prompt_skips_system_and_empty_content() {
        let messages = vec![
            msg("system", "you are an assistant"),
            msg("user", "hello"),
            msg("assistant", ""),
            msg("assistant", "   "),
            msg("user", "world"),
        ];
        let prompt = build_prompt_from_messages(&messages);
        assert!(!prompt.contains("you are an assistant"), "system leaked: {}", prompt);
        assert!(prompt.contains("user:\nhello"));
        assert!(prompt.contains("user:\nworld"));
        // empty assistant messages must not produce blocks
        assert!(!prompt.contains("assistant:\n"), "empty assistant leaked: {}", prompt);
    }

    #[test]
    fn build_prompt_includes_image_and_file_attachments() {
        let messages = vec![MessageInput {
            role: "user".to_string(),
            content: "see attached".to_string(),
            attachments: Some(vec![
                attachment("shot", "/tmp/x.png", "image/png"),
                attachment("doc", "/tmp/y.md", "text/markdown"),
            ]),
        }];
        let prompt = build_prompt_from_messages(&messages);
        assert!(prompt.contains("[Attached image: shot at /tmp/x.png]"), "no image tag: {}", prompt);
        assert!(prompt.contains("[Attached file: doc (text/markdown) at /tmp/y.md]"), "no file tag: {}", prompt);
    }

    #[test]
    fn build_prompt_ignores_empty_path_attachments() {
        let messages = vec![MessageInput {
            role: "user".to_string(),
            content: "hi".to_string(),
            attachments: Some(vec![attachment("nopath", "  ", "image/png")]),
        }];
        let prompt = build_prompt_from_messages(&messages);
        assert!(!prompt.contains("Attached image"));
    }

    // ---- build_*_event field correctness ----

    #[test]
    fn build_usage_event_carries_token_fields() {
        let ev = build_usage_event("s1", "req-1", Some(10), Some(20), Some(5), Some(2), Some("0.01".to_string()));
        assert_eq!(ev.event_type, "usage");
        assert_eq!(ev.input_tokens, Some(10));
        assert_eq!(ev.output_tokens, Some(20));
        assert_eq!(ev.cache_read_input_tokens, Some(5));
        assert_eq!(ev.cache_creation_input_tokens, Some(2));
        assert_eq!(ev.content.as_deref(), Some("0.01"));
    }

    #[test]
    fn build_tool_use_event_fields() {
        let ev = build_tool_use_event("s1", "req-1", "call-1".to_string(), "Bash".to_string(), "{}".to_string(), None, None);
        assert_eq!(ev.event_type, "tool_use");
        assert_eq!(ev.tool_name.as_deref(), Some("Bash"));
        assert_eq!(ev.tool_call_id.as_deref(), Some("call-1"));
        assert_eq!(ev.tool_input.as_deref(), Some("{}"));
        assert!(ev.tool_result.is_none());
    }

    #[test]
    fn build_tool_result_event_fields() {
        let ev = build_tool_result_event("s1", "req-1", "call-1".to_string(), Some("ok".to_string()), None, None);
        assert_eq!(ev.event_type, "tool_result");
        assert_eq!(ev.tool_call_id.as_deref(), Some("call-1"));
        assert_eq!(ev.tool_result.as_deref(), Some("ok"));
        assert!(ev.tool_name.is_none());
    }

    #[test]
    fn tool_kind_to_string_serializes_snake_case() {
        use agent_client_protocol::schema::ToolKind;
        assert_eq!(tool_kind_to_string(&ToolKind::Read), "read");
        assert_eq!(tool_kind_to_string(&ToolKind::Edit), "edit");
        assert_eq!(tool_kind_to_string(&ToolKind::Delete), "delete");
        assert_eq!(tool_kind_to_string(&ToolKind::Execute), "execute");
        assert_eq!(tool_kind_to_string(&ToolKind::Other), "other");
    }

    #[test]
    fn extract_locations_builds_relative_paths() {
        use agent_client_protocol::schema::{ToolCallLocation};
        use std::path::PathBuf;
        let locs = vec![
            ToolCallLocation::new(PathBuf::from("/home/user/project/src/main.rs")).line(Some(42)),
            ToolCallLocation::new(PathBuf::from("/home/user/project/README.md")),
        ];
        let views = extract_locations(&locs, Some("/home/user/project"));
        assert_eq!(views.len(), 2);
        assert_eq!(views[0].relative_path, "src/main.rs");
        assert_eq!(views[0].line, Some(42));
        assert_eq!(views[1].relative_path, "README.md");
        assert_eq!(views[1].line, None);
    }

    #[test]
    fn build_session_started_event_carries_external_id() {
        let ev = build_session_started_event("s1", "req-1", "ext-abc".to_string());
        assert_eq!(ev.event_type, "session_started");
        assert_eq!(ev.external_session_id.as_deref(), Some("ext-abc"));
    }

    #[test]
    fn build_done_event_is_terminal() {
        let ev = build_done_event("s1", "req-1");
        assert_eq!(ev.event_type, "done");
        assert_eq!(ev.session_id, "s1");
        assert!(ev.content.is_none());
        assert!(ev.tool_call_id.is_none());
    }

    // ---- extract_text_from_tool_call_content ----

    fn text_content_block(text: &str) -> ToolCallContent {
        ToolCallContent::Content(Content::new(ContentBlock::Text(TextContent::new(text))))
    }

    #[test]
    fn extract_text_from_tool_call_joins_text_blocks() {
        let contents = vec![
            text_content_block("line1"),
            text_content_block("line2"),
        ];
        assert_eq!(extract_text_from_tool_call_content(&contents), "line1\nline2");
    }

    #[test]
    fn extract_text_from_tool_call_empty_returns_empty() {
        assert_eq!(extract_text_from_tool_call_content(&[]), "");
    }

    // ---- extract_diffs_from_tool_call_content / infer_change_type / relative_path_for ----

    fn diff_content(path: &str, old: Option<&str>, new: &str) -> ToolCallContent {
        let mut diff = Diff::new(path, new);
        if let Some(old_text) = old {
            diff = diff.old_text(old_text);
        }
        ToolCallContent::Diff(diff)
    }

    #[test]
    fn extract_diffs_collects_only_diff_variants() {
        let contents = vec![
            text_content_block("ignored"),
            diff_content("src/a.ts", Some("old"), "new"),
            diff_content("src/b.ts", None, "brand new"),
        ];
        let diffs = extract_diffs_from_tool_call_content(&contents);
        assert_eq!(diffs.len(), 2);
        assert_eq!(diffs[0].path.to_string_lossy(), "src/a.ts");
        assert_eq!(diffs[1].old_text, None);
    }

    #[test]
    fn extract_diffs_empty_when_no_diff() {
        let contents = vec![text_content_block("only text")];
        assert!(extract_diffs_from_tool_call_content(&contents).is_empty());
    }

    #[test]
    fn infer_change_type_create_when_no_old() {
        assert_eq!(infer_change_type(&None, "new content", None), "create");
        // empty old_text also means create
        assert_eq!(infer_change_type(&Some(String::new()), "new content", None), "create");
    }

    #[test]
    fn infer_change_type_modify_when_both_present() {
        assert_eq!(
            infer_change_type(&Some("old".to_string()), "new", None),
            "modify"
        );
    }

    #[test]
    fn infer_change_type_delete_when_old_present_new_empty() {
        assert_eq!(
            infer_change_type(&Some("old".to_string()), "", None),
            "delete"
        );
        assert_eq!(
            infer_change_type(&Some("old".to_string()), "   \n ", None),
            "delete"
        );
    }

    #[test]
    fn infer_change_type_delete_when_kind_is_delete() {
        // 即使 new_text 非空，kind=Delete 也判定为 delete
        assert_eq!(
            infer_change_type(&Some("old".to_string()), "new", Some(&ToolKind::Delete)),
            "delete"
        );
    }

    #[test]
    fn relative_path_strips_working_directory() {
        assert_eq!(
            relative_path_for("/proj/src/a.ts", Some("/proj")),
            "src/a.ts"
        );
    }

    #[test]
    fn relative_path_falls_back_to_filename_when_unrelated() {
        assert_eq!(relative_path_for("/other/a.ts", Some("/proj")), "a.ts");
    }

    #[test]
    fn relative_path_falls_back_to_filename_when_no_cwd() {
        assert_eq!(relative_path_for("/anywhere/a.ts", None), "a.ts");
    }

    #[test]
    fn build_file_edit_event_carries_view() {
        let view = crate::commands::conversation::types::FileEditView {
            tool_call_id: "tc-1".to_string(),
            file_path: "/p/a.ts".to_string(),
            relative_path: "a.ts".to_string(),
            change_type: "modify".to_string(),
            before_content: Some("old".to_string()),
            after_content: "new".to_string(),
        };
        let ev = build_file_edit_event("s1", "req-1", view);
        assert_eq!(ev.event_type, "file_edit");
        assert_eq!(ev.session_id, "s1");
        let edit = ev.file_edit.expect("file_edit set");
        assert_eq!(edit.change_type, "modify");
        assert_eq!(edit.tool_call_id, "tc-1");
    }

    // 手动集成测试：opencode 不通过 ACP 暴露模型，走原生 `opencode models` CLI。
    // 运行：cargo test --lib probe_opencode_models_live -- --ignored --nocapture
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "需要本地安装 opencode，会真实执行子进程并联网"]
    async fn probe_opencode_models_live() {
        let models = probe_opencode_models().await.expect("probe should succeed");
        println!("opencode models ({}): {:?}", models.len(), models);
        assert!(!models.is_empty(), "opencode models 应返回非空清单");
        // opencode model_id 形如 provider/model
        assert!(
            models.iter().any(|m| m.contains('/')),
            "应包含 provider/model 格式的模型"
        );
    }
}
