//! ACP `session/load` 回放收集。
//!
//! 通过短连接发送 `LoadSessionRequest`，Agent 会通过 `session/update` 通知
//! 流式回放全部历史，结束后返回 `LoadSessionResponse`（result: null）。
//! 所有 `SessionUpdate` 被收集为 `AcpReplayedEvent` 列表。
//!
//! 实现模式：在 `Client.builder()` 上注册 `on_receive_notification(SessionNotification)`
//! 收集事件，在 `connect_with` 闭包中发 `session/load`，等待响应返回后结束。

use std::sync::Arc;
use std::time::Duration;

use agent_client_protocol::schema::{
    ContentBlock, LoadSessionRequest, SessionNotification, SessionUpdate, ToolCallContent,
};
use agent_client_protocol::{on_receive_request, Agent, Client};

use super::query_service::{create_agent, default_cwd, log_info};
use super::types::{AcpReplayedEvent, AcpSessionHistoryResult};

/// 将一条 `SessionUpdate` 转换为 `AcpReplayedEvent`。
///
/// 参考 `acp.rs` 和 `tests/common/mod.rs` 中的 `SessionUpdate` 匹配模式。
fn map_session_update(update: &SessionUpdate) -> Option<AcpReplayedEvent> {
    match update {
        SessionUpdate::AgentMessageChunk(chunk) => {
            let text = match &chunk.content {
                ContentBlock::Text(t) => t.text.clone(),
                other => format!("{other:?}"),
            };
            Some(AcpReplayedEvent {
                event_type: "agent_message".to_string(),
                content: Some(text),
                role: Some("agent".to_string()),
                tool_call_id: None,
                tool_name: None,
                tool_input: None,
                tool_result: None,
                input_tokens: None,
                output_tokens: None,
            })
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            let text = match &chunk.content {
                ContentBlock::Text(t) => t.text.clone(),
                other => format!("{other:?}"),
            };
            Some(AcpReplayedEvent {
                event_type: "agent_thought".to_string(),
                content: Some(text),
                role: Some("agent".to_string()),
                tool_call_id: None,
                tool_name: None,
                tool_input: None,
                tool_result: None,
                input_tokens: None,
                output_tokens: None,
            })
        }
        SessionUpdate::UserMessageChunk(chunk) => {
            let text = match &chunk.content {
                ContentBlock::Text(t) => t.text.clone(),
                other => format!("{other:?}"),
            };
            Some(AcpReplayedEvent {
                event_type: "user_message".to_string(),
                content: Some(text),
                role: Some("user".to_string()),
                tool_call_id: None,
                tool_name: None,
                tool_input: None,
                tool_result: None,
                input_tokens: None,
                output_tokens: None,
            })
        }
        SessionUpdate::ToolCall(tool_call) => {
            let tool_input_str = tool_call
                .raw_input
                .as_ref()
                .map(|v| serde_json::to_string(v).unwrap_or_default())
                .unwrap_or_default();
            Some(AcpReplayedEvent {
                event_type: "tool_call".to_string(),
                content: None,
                role: None,
                tool_call_id: Some(tool_call.tool_call_id.to_string()),
                tool_name: Some(tool_call.title.clone()),
                tool_input: Some(tool_input_str),
                tool_result: None,
                input_tokens: None,
                output_tokens: None,
            })
        }
        SessionUpdate::ToolCallUpdate(tool_update) => {
            let result_text = tool_update
                .fields
                .content
                .as_ref()
                .map(|blocks| {
                    blocks
                        .iter()
                        .filter_map(|c| match c {
                            ToolCallContent::Content(inner) => match &inner.content {
                                ContentBlock::Text(t) => Some(t.text.clone()),
                                _ => None,
                            },
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                });
            Some(AcpReplayedEvent {
                event_type: "tool_result".to_string(),
                content: result_text.clone(),
                role: None,
                tool_call_id: Some(tool_update.tool_call_id.to_string()),
                tool_name: None,
                tool_input: None,
                tool_result: result_text,
                input_tokens: None,
                output_tokens: None,
            })
        }
        SessionUpdate::UsageUpdate(usage) => Some(AcpReplayedEvent {
            event_type: "usage".to_string(),
            content: None,
            role: None,
            tool_call_id: None,
            tool_name: None,
            tool_input: None,
            tool_result: None,
            input_tokens: Some(usage.used as u32),
            output_tokens: Some(usage.size as u32),
        }),
        // 其他类型（Plan, SessionInfoUpdate 等）忽略
        _ => None,
    }
}

/// 调用 `session/load` 收集回放历史。
///
/// `session/load` 返回后，Agent 会持续推送 `session/update` 通知来回放历史，
/// 直到 `LoadSessionResponse` 返回（result: null）表示回放结束。
///
/// # 参数
/// - `agent_cmd`：原始命令（如 `"opencode"`）
/// - `session_id`：要回放的会话 ID
/// - `cwd`：工作目录
pub(super) async fn read_session_history(
    agent_cmd: &str,
    session_id: &str,
    cwd: &str,
) -> Result<AcpSessionHistoryResult, String> {
    let agent = create_agent(agent_cmd)?;

    let effective_cwd = if cwd.is_empty() {
        default_cwd()
    } else {
        cwd.to_string()
    };

    log_info!(
        "session/load | command={} | session_id={} | cwd={}",
        agent_cmd,
        session_id,
        effective_cwd
    );

    // 事件收集器（共享 between notification handler 和 connect_with 闭包）
    let events: Arc<std::sync::Mutex<Vec<AcpReplayedEvent>>> =
        Arc::new(std::sync::Mutex::new(Vec::new()));
    let events_for_handler = events.clone();

    let target_session_id = session_id.to_string();
    let target_cwd = effective_cwd.clone();

    let probe = async {
        Client
            .builder()
            // 注册 SessionNotification handler 收集回放事件
            .on_receive_notification(
                async move |notif: SessionNotification, _cx| {
                    if let Some(event) = map_session_update(&notif.update) {
                        let mut guard = events_for_handler.lock().unwrap();
                        guard.push(event);
                    }
                    Ok(())
                },
                agent_client_protocol::on_receive_notification!(),
            )
            // 对于查询场景，简单忽略权限请求
            .on_receive_request(
                async |_request: agent_client_protocol::schema::RequestPermissionRequest,
                        _responder,
                        _cx| {
                    Ok(())
                },
                on_receive_request!(),
            )
            .connect_with(agent, async move |connection| {
                // 发送 session/load，等待响应返回（表示回放结束）
                let load_request = LoadSessionRequest::new(
                    target_session_id.clone(),
                    std::path::PathBuf::from(&target_cwd),
                );

                let _load_response = connection
                    .send_request_to(Agent, load_request)
                    .block_task()
                    .await?;

                // LoadSessionResponse 已返回，所有 session/update 已被 handler 收集
                Ok::<_, agent_client_protocol::Error>(target_session_id)
            })
            .await
            .map_err(|e| format!("session/load 失败: {}", e))
    };

    let final_session_id = tokio::time::timeout(Duration::from_secs(60), probe)
        .await
        .map_err(|_| "session/load 超时（60s）".to_string())??;

    let collected_events = events.lock().unwrap().clone();

    log_info!(
        "session/load completed | session_id={} | events={}",
        final_session_id,
        collected_events.len()
    );

    Ok(AcpSessionHistoryResult {
        session_id: final_session_id,
        events: collected_events,
    })
}