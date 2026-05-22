use std::str::FromStr;

use anyhow::Result;
use async_trait::async_trait;
use tauri::{AppHandle, Emitter};

use agent_client_protocol::schema::{
    ContentBlock, McpServer, McpServerStdio, NewSessionRequest, SessionNotification, SessionUpdate,
};
use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{Client, SessionMessage};
use agent_client_protocol_tokio::AcpAgent;

use super::cli_common::{
    build_content_event, build_error_event, build_system_event,
    timeout_config_for_execution_mode, read_cli_timeout_minutes,
    CliExecutionMonitor,
};
use crate::commands::conversation::abort::{
    clear_abort_flag, should_abort,
    unregister_session_pid,
};
use crate::commands::conversation::strategy::{AgentExecutionStrategy, AgentRuntimeKind};
use crate::commands::conversation::types::{AcpStreamEvent, ExecutionRequest, McpServerConfig};
use crate::commands::mcp_shared::parse_args_string;

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

fn build_prompt_from_messages(messages: &[super::super::types::MessageInput]) -> String {
    let mut parts = Vec::new();
    for msg in messages {
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

fn build_done_event(session_id: &str) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "done".to_string(),
        session_id: session_id.to_string(),
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
    }
}

fn build_thinking_event(session_id: &str, content: String) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "thinking".to_string(),
        session_id: session_id.to_string(),
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
    }
}

fn build_tool_use_event(
    session_id: &str,
    tool_call_id: String,
    title: String,
    tool_input: String,
) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "tool_use".to_string(),
        session_id: session_id.to_string(),
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
    }
}

fn build_tool_result_event(
    session_id: &str,
    tool_call_id: String,
    tool_result: Option<String>,
) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "tool_result".to_string(),
        session_id: session_id.to_string(),
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
    }
}

fn build_session_started_event(session_id: &str, external_sid: String) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "session_started".to_string(),
        session_id: session_id.to_string(),
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
    }
}

fn build_plan_event(session_id: &str, plan_json: String) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "plan".to_string(),
        session_id: session_id.to_string(),
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

fn resolve_acp_command(raw_command: &str) -> String {
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
        let event_name = AgentRuntimeKind::Acp.event_name(&session_id);
        let _plan_id = request.plan_id.clone();
        let acp_command = resolve_acp_command(&request.acp_command.clone());
        let working_directory = request.working_directory.clone();
        let execution_mode = request.execution_mode.clone();

        log_info!(
            "Starting ACP session | session_id={} | command={} | cwd={}",
            session_id,
            acp_command,
            working_directory.as_deref().unwrap_or("-")
        );

        let _ = app.emit(
            &event_name,
            &build_system_event(&session_id, "Connecting to agent via ACP...".to_string()),
        );

        let agent = match AcpAgent::from_str(&acp_command) {
            Ok(agent) => agent,
            Err(e) => {
                let error_msg = format!("Failed to parse ACP command '{}': {}", acp_command, e);
                log_error!("{}", error_msg);
                let _ = app.emit(&event_name, &build_error_event(&session_id, error_msg.clone()));
                return Err(anyhow::anyhow!(error_msg));
            }
        };

        let mcp_servers: Vec<McpServer> = request
            .mcp_servers
            .as_ref()
            .map(|servers| servers.iter().filter_map(convert_mcp_config).collect())
            .unwrap_or_default();

        let prompt_text = build_prompt_from_messages(&request.messages);
        if prompt_text.trim().is_empty() {
            let error_msg = "No prompt content provided".to_string();
            log_error!("{}", error_msg);
            let _ = app.emit(&event_name, &build_error_event(&session_id, error_msg.clone()));
            return Err(anyhow::anyhow!(error_msg));
        }

        #[allow(unused_assignments)]
        let result = Client
            .connect_with(agent, async |connection| {
                let mut session_request = if let Some(ref cwd) = working_directory {
                    NewSessionRequest::new(cwd)
                } else {
                    NewSessionRequest::new(std::env::current_dir().unwrap_or_default())
                };
                if !mcp_servers.is_empty() {
                    session_request = session_request.mcp_servers(mcp_servers);
                }

                let mut session = connection
                    .build_session_from(session_request)
                    .block_task()
                    .start_session()
                    .await?;

                log_info!("ACP session started | session_id={}", session_id);

                let external_sid = session.session_id().to_string();
                let _ = app.emit(&event_name, &build_session_started_event(&session_id, external_sid));

                session.send_prompt(&prompt_text)?;

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
                            &build_system_event(&session_id, "Execution cancelled by user.".to_string()),
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
                        let _ = app.emit(&event_name, &build_error_event(&session_id, error_msg.clone()));
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
                                                                &build_content_event(&session_id, text),
                                                            );
                                                        }
                                                        SessionUpdate::AgentThoughtChunk(chunk) => {
                                                            let text = match &chunk.content {
                                                                ContentBlock::Text(t) => t.text.clone(),
                                                                other => format!("{:?}", other),
                                                            };
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_thinking_event(&session_id, text),
                                                            );
                                                        }
                                                        SessionUpdate::ToolCall(tool_call) => {
                                                            let tool_input_str = tool_call.raw_input
                                                                .as_ref()
                                                                .map(|v| serde_json::to_string(v).unwrap_or_default())
                                                                .unwrap_or_default();
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_tool_use_event(
                                                                    &session_id,
                                                                    tool_call.tool_call_id.to_string(),
                                                                    tool_call.title,
                                                                    tool_input_str,
                                                                ),
                                                            );
                                                        }
                                                        SessionUpdate::ToolCallUpdate(tool_update) => {
                                                            let result_text = tool_update.fields.content
                                                                .as_ref()
                                                                .map(|blocks| extract_text_from_tool_call_content(blocks));
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_tool_result_event(
                                                                    &session_id,
                                                                    tool_update.tool_call_id.to_string(),
                                                                    result_text,
                                                                ),
                                                            );
                                                        }
                                                        SessionUpdate::Plan(plan) => {
                                                            let plan_json = serde_json::to_string(&plan)
                                                                .unwrap_or_default();
                                                            let _ = app.emit(
                                                                &event_name,
                                                                &build_plan_event(&session_id, plan_json),
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
                                            &build_error_event(&session_id, format!("ACP session error: {}", error_str)),
                                        );
                                    }
                                    break;
                                }
                            }
                        }
                        _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => {
                            continue;
                        }
                    }
                }

                Ok(())
            })
            .await;

        unregister_session_pid(&session_id).await;
        clear_abort_flag(&session_id).await;

        let _ = app.emit(&event_name, &build_done_event(&session_id));
        log_info!("ACP execution completed | session_id={}", session_id);

        result.map_err(|e| anyhow::anyhow!("ACP execution failed: {}", e))
    }
}
