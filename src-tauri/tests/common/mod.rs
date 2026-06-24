//! ACP 集成测试公共 harness
//!
//! 复刻 acp.rs 的连接逻辑，但不依赖 Tauri AppHandle，
//! 而是将所有 SessionUpdate 收集到 AcpEventCollector 中供断言。

use std::str::FromStr;
use std::time::Duration;

use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{on_receive_request, Client, SessionMessage};
use agent_client_protocol::schema::{
    ContentBlock, McpServer, McpServerStdio, PermissionOptionKind, RequestPermissionOutcome,
    RequestPermissionResponse, RequestPermissionRequest, SelectedPermissionOutcome,
    SessionNotification, SessionUpdate, StopReason,
};
use agent_client_protocol_tokio::AcpAgent;

/// 检测 opencode 是否在 PATH 中可用
pub fn is_opencode_available() -> bool {
    which::which("opencode").is_ok()
}

/// ACP 命令字符串，与 acp.rs 的 resolve_acp_command 保持一致
pub fn acp_command() -> String {
    "opencode acp".to_string()
}

/// 工作目录：取项目根目录的上层（避免在 src-tauri 里没有 opencode.json）
pub fn default_working_directory() -> String {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    // manifest_dir = .../src-tauri，向上一层到项目根
    std::path::Path::new(manifest_dir)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| manifest_dir.to_string())
}

/// 收集到的单个事件摘要
#[derive(Debug, Clone)]
pub struct CollectedEvent {
    pub event_type: String,
    pub text: Option<String>,
    pub tool_call_id: Option<String>,
    #[allow(dead_code)]
    pub tool_name: Option<String>,
    pub input_tokens: Option<u64>,
    #[allow(dead_code)]
    pub output_tokens: Option<u64>,
}

impl CollectedEvent {
    fn new(event_type: &str) -> Self {
        Self {
            event_type: event_type.to_string(),
            text: None,
            tool_call_id: None,
            tool_name: None,
            input_tokens: None,
            output_tokens: None,
        }
    }
}

/// 收集 ACP 会话中的所有事件
#[derive(Debug, Default, Clone)]
pub struct AcpEventCollector {
    pub events: Vec<CollectedEvent>,
    pub session_id: Option<String>,
    pub stop_reason: Option<StopReason>,
}

impl AcpEventCollector {
    pub fn new() -> Self {
        Self::default()
    }

    /// 从 SessionUpdate 提取信息并记录
    pub fn record(&mut self, update: &SessionUpdate) {
        let event = match update {
            SessionUpdate::AgentMessageChunk(chunk) => {
                let text = match &chunk.content {
                    ContentBlock::Text(t) => t.text.clone(),
                    other => format!("{other:?}"),
                };
                CollectedEvent {
                    event_type: "agent_message".to_string(),
                    text: Some(text),
                    tool_call_id: None,
                    tool_name: None,
                    input_tokens: None,
                    output_tokens: None,
                }
            }
            SessionUpdate::AgentThoughtChunk(chunk) => {
                let text = match &chunk.content {
                    ContentBlock::Text(t) => t.text.clone(),
                    other => format!("{other:?}"),
                };
                CollectedEvent {
                    event_type: "agent_thought".to_string(),
                    text: Some(text),
                    tool_call_id: None,
                    tool_name: None,
                    input_tokens: None,
                    output_tokens: None,
                }
            }
            SessionUpdate::ToolCall(tool_call) => CollectedEvent {
                event_type: "tool_call".to_string(),
                text: None,
                tool_call_id: Some(tool_call.tool_call_id.to_string()),
                tool_name: Some(tool_call.title.clone()),
                input_tokens: None,
                output_tokens: None,
            },
            SessionUpdate::ToolCallUpdate(tool_update) => {
                let result_text = tool_update
                    .fields
                    .content
                    .as_ref()
                    .map(|blocks| {
                        blocks
                            .iter()
                            .filter_map(|c| match c {
                                agent_client_protocol::schema::ToolCallContent::Content(inner) => {
                                    match &inner.content {
                                        ContentBlock::Text(t) => Some(t.text.clone()),
                                        _ => None,
                                    }
                                }
                                _ => None,
                            })
                            .collect::<Vec<_>>()
                            .join("\n")
                    });
                CollectedEvent {
                    event_type: "tool_result".to_string(),
                    text: result_text,
                    tool_call_id: Some(tool_update.tool_call_id.to_string()),
                    tool_name: None,
                    input_tokens: None,
                    output_tokens: None,
                }
            }
            SessionUpdate::Plan(plan) => CollectedEvent {
                event_type: "plan".to_string(),
                text: Some(serde_json::to_string(plan).unwrap_or_default()),
                tool_call_id: None,
                tool_name: None,
                input_tokens: None,
                output_tokens: None,
            },
            SessionUpdate::UsageUpdate(usage) => CollectedEvent {
                event_type: "usage".to_string(),
                text: None,
                tool_call_id: None,
                tool_name: None,
                input_tokens: Some(usage.used),
                output_tokens: Some(usage.size),
            },
            SessionUpdate::SessionInfoUpdate(_) => CollectedEvent::new("session_info"),
            SessionUpdate::AvailableCommandsUpdate(_) => {
                CollectedEvent::new("available_commands")
            }
            SessionUpdate::CurrentModeUpdate(_) => CollectedEvent::new("current_mode"),
            SessionUpdate::ConfigOptionUpdate(_) => CollectedEvent::new("config_option"),
            SessionUpdate::UserMessageChunk(chunk) => {
                let text = match &chunk.content {
                    ContentBlock::Text(t) => t.text.clone(),
                    other => format!("{other:?}"),
                };
                CollectedEvent {
                    event_type: "user_message".to_string(),
                    text: Some(text),
                    tool_call_id: None,
                    tool_name: None,
                    input_tokens: None,
                    output_tokens: None,
                }
            }
            _ => CollectedEvent::new("unknown"),
        };
        self.events.push(event);
    }

    pub fn record_stop_reason(&mut self, reason: StopReason) {
        self.stop_reason = Some(reason);
    }

    /// 提取所有 agent_message 文本并拼接
    pub fn agent_message_text(&self) -> String {
        self.events
            .iter()
            .filter(|e| e.event_type == "agent_message")
            .filter_map(|e| e.text.as_ref())
            .cloned()
            .collect::<Vec<_>>()
            .join("")
    }

    /// 统计某类型事件数量
    pub fn count(&self, event_type: &str) -> usize {
        self.events
            .iter()
            .filter(|e| e.event_type == event_type)
            .count()
    }
}

/// 测试会话配置：封装 system_prompt、mcp_servers、reasoning_effort 等可选参数
#[derive(Debug, Clone, Default)]
pub struct SessionConfig {
    pub system_prompt: Option<String>,
    pub mcp_servers: Option<Vec<McpServer>>,
    pub reasoning_effort: Option<String>,
    pub working_directory: Option<String>,
}

/// 连接到 opencode acp，发送 prompt，收集所有事件
pub async fn run_prompt_and_collect(
    prompt: &str,
    timeout_secs: u64,
) -> anyhow::Result<AcpEventCollector> {
    run_with_config(prompt, &SessionConfig::default(), timeout_secs).await
}

/// 带完整配置连接到 opencode acp，发送 prompt，收集所有事件
pub async fn run_with_config(
    prompt: &str,
    config: &SessionConfig,
    timeout_secs: u64,
) -> anyhow::Result<AcpEventCollector> {
    let collector = std::sync::Arc::new(tokio::sync::Mutex::new(AcpEventCollector::new()));
    let cwd = config
        .working_directory
        .clone()
        .unwrap_or_else(default_working_directory);
    let agent = AcpAgent::from_str(&acp_command())?;

    let collector_for_handler = collector.clone();
    let mcp_servers = config.mcp_servers.clone().unwrap_or_default();
    let system_prompt = config.system_prompt.clone();
    let reasoning_effort = config.reasoning_effort.clone();

    let result = Client
        .builder()
        .on_receive_request(
            async move |request: RequestPermissionRequest, responder, _cx| {
                let outcome = request
                    .options
                    .iter()
                    .find(|o| o.kind == PermissionOptionKind::AllowOnce)
                    .map(|o| {
                        RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                            o.option_id.clone(),
                        ))
                    })
                    .unwrap_or(RequestPermissionOutcome::Cancelled);

                let _ = responder.respond(RequestPermissionResponse::new(outcome));
                Ok(())
            },
            on_receive_request!(),
        )
        .connect_with(agent, async |connection| {
            use agent_client_protocol::schema::NewSessionRequest;

            let mut session_request = NewSessionRequest::new(&cwd);
            if !mcp_servers.is_empty() {
                session_request = session_request.mcp_servers(mcp_servers.clone());
            }

            let mut session_meta = serde_json::Map::new();
            if let Some(ref effort) = reasoning_effort {
                if !effort.trim().is_empty() {
                    session_meta.insert(
                        "reasoningEffort".to_string(),
                        serde_json::Value::String(effort.clone()),
                    );
                }
            }
            if let Some(ref prompt) = system_prompt {
                if !prompt.trim().is_empty() {
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

            {
                let mut c = collector_for_handler.lock().await;
                c.session_id = Some(session.session_id().to_string());
            }

            session.send_prompt(prompt)?;

            loop {
                tokio::select! {
                    update_result = session.read_update() => {
                        match update_result {
                            Ok(session_message) => match session_message {
                                SessionMessage::SessionMessage(dispatch) => {
                                    let dispatch_result = MatchDispatch::new(dispatch)
                                        .if_notification(async |notif: SessionNotification| {
                                            let mut c = collector_for_handler.lock().await;
                                            c.record(&notif.update);
                                            Ok(())
                                        })
                                        .await
                                        .otherwise_ignore();

                                    if let Err(e) = dispatch_result {
                                        eprintln!("MatchDispatch error: {e}");
                                    }
                                }
                                SessionMessage::StopReason(reason) => {
                                    let mut c = collector_for_handler.lock().await;
                                    c.record_stop_reason(reason);
                                    break;
                                }
                                _ => {
                                    eprintln!("ACP unknown session message variant");
                                }
                            },
                            Err(e) => {
                                let error_str = e.to_string();
                                if error_str.contains("EOF")
                                    || error_str.contains("closed")
                                    || error_str.contains("channel")
                                {
                                    eprintln!("ACP session ended normally");
                                } else {
                                    eprintln!("ACP read error: {error_str}");
                                }
                                break;
                            }
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_secs(timeout_secs)) => {
                        eprintln!("ACP test timed out after {timeout_secs}s");
                        break;
                    }
                }
            }

            Ok(())
        })
        .await;

    result?;

    // handler 闭包可能仍持有 Arc clone，用 lock 提取数据并 clone 出来
    let final_collector = collector.lock().await.clone();

    Ok(final_collector)
}

/// 仅连接到 opencode acp 并启动会话，不发送 prompt
pub async fn connect_and_start_session() -> anyhow::Result<String> {
    let cwd = default_working_directory();
    let agent = AcpAgent::from_str(&acp_command())?;

    let session_id = Client
        .builder()
        .connect_with(agent, async |connection| {
            use agent_client_protocol::schema::NewSessionRequest;
            let session_request = NewSessionRequest::new(&cwd);
            let session = connection
                .build_session_from(session_request)
                .block_task()
                .start_session()
                .await?;
            Ok(session.session_id().to_string())
        })
        .await?;

    Ok(session_id)
}

/// 构造一个 stdio MCP server 配置（用于测试 mcp_servers 场景）
pub fn make_stdio_mcp_server(name: &str, command: &str, args: &[&str]) -> McpServer {
    let mut server = McpServerStdio::new(name.to_string(), command);
    if !args.is_empty() {
        server = server.args(args.iter().map(|a| a.to_string()).collect::<Vec<_>>());
    }
    McpServer::Stdio(server)
}