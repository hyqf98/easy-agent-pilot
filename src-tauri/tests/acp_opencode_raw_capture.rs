//! 诊断测试：捕获 opencode ACP 完整原始事件流并输出可读文件
//!
//! 用一个稍复杂的问题（读文件 + 分析 + 代码块输出）触发
//! AgentThoughtChunk / ToolCall / ToolCallUpdate / AgentMessageChunk 等多种事件，
//! 把每个 SessionUpdate 的原始 JSON 写入 markdown 文件供人工审阅。

mod common;

use std::str::FromStr;
use std::time::Duration;

use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{
    on_receive_request, Agent, Client, SessionMessage,
};
use agent_client_protocol::schema::{
    NewSessionRequest, PermissionOptionKind, RequestPermissionOutcome,
    RequestPermissionResponse, RequestPermissionRequest, SelectedPermissionOutcome,
    SessionNotification,
};
use agent_client_protocol_tokio::AcpAgent;

/// 单条原始事件记录
struct RawEvent {
    index: usize,
    timestamp: String,
    update_json: serde_json::Value,
}

/// 从序列化的 SessionUpdate JSON 中提取事件类型标签。
///
/// SessionUpdate 是 externally tagged enum，序列化形如：
/// {"sessionUpdate": "agent_message_chunk", "content": {...}}
fn extract_event_type(json: &serde_json::Value) -> &'static str {
    let tag = json
        .get("sessionUpdate")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    match tag {
        "agent_message_chunk" => "agent_message_chunk",
        "agent_thought_chunk" => "agent_thought_chunk",
        "tool_call" => "tool_call",
        "tool_call_update" => "tool_call_update",
        "plan" => "plan",
        "usage_update" => "usage_update",
        "available_commands_update" => "available_commands_update",
        "session_info_update" => "session_info_update",
        "current_mode_update" => "current_mode_update",
        "config_option_update" => "config_option_update",
        "user_message_chunk" => "user_message_chunk",
        _ => "unknown",
    }
}

#[tokio::test]
async fn capture_opencode_acp_raw_events() {
    // 1. 创建临时工作目录，放几个文件让任务有足够复杂度
    let tmp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let cwd = tmp_dir.path();

    std::fs::write(
        cwd.join("config.ts"),
        r#"export const API_BASE = "https://api.example.com"
export const TIMEOUT = 5000
export const MAX_RETRIES = 3
"#,
    )
    .expect("write config.ts");

    std::fs::write(
        cwd.join("utils.ts"),
        r#"export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function retry(fn: () => Promise<void>, max: number): Promise<void> {
  return fn().catch(() => max > 1 ? retry(fn, max - 1) : Promise.reject())
}
"#,
    )
    .expect("write utils.ts");

    // 2. 一个足够复杂的 prompt：需要读文件、分析、给代码块
    let prompt = "请先读取 config.ts 和 utils.ts 这两个文件，然后分析 utils.ts 中的 retry 函数有什么问题，最后用 markdown 代码块给出你改进后的完整 utils.ts 代码。";

    let cwd_str = cwd.to_string_lossy().to_string();
    let agent = AcpAgent::from_str("opencode acp").expect("failed to create agent");

    let raw_events: std::sync::Arc<std::sync::Mutex<Vec<RawEvent>>> =
        std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let raw_events_clone = raw_events.clone();
    let event_counter = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let counter_clone = event_counter.clone();

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
            let session_request = NewSessionRequest::new(&cwd_str);
            let mut session = connection
                .build_session_from(session_request)
                .block_task()
                .start_session()
                .await?;

            let prompt_session_id = session.session_id().clone();
            let prompt_content: Vec<agent_client_protocol::schema::ContentBlock> =
                vec![prompt.to_string().into()];
            // send_request_to 返回 builder（非 Result），不能加 ?
            // 与 common/mod.rs 一致，用 send_prompt 即可触发流式响应
            session.send_prompt(prompt)?;

            loop {
                tokio::select! {
                    update_result = session.read_update() => {
                        match update_result {
                            Ok(SessionMessage::SessionMessage(dispatch)) => {
                                MatchDispatch::new(dispatch)
                                    .if_notification(async |notif: SessionNotification| {
                                        let idx = counter_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                                        let update_json = serde_json::to_value(&notif.update)
                                            .unwrap_or_else(|e| serde_json::json!({"_serialize_error": e.to_string()}));
                                        let mut events = raw_events_clone.lock().unwrap();
                                        events.push(RawEvent {
                                            index: idx,
                                            timestamp: chrono::Utc::now().format("%H:%M:%S%.3f").to_string(),
                                            update_json,
                                        });
                                        Ok(())
                                    })
                                    .await
                                    .otherwise_ignore();
                            }
                            Ok(SessionMessage::StopReason(_)) => break,
                            Ok(_) => {}
                            Err(e) => {
                                eprintln!("read error: {e}");
                                break;
                            }
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_secs(180)) => {
                        eprintln!("timeout");
                        break;
                    }
                }
            }
            Ok(())
        })
        .await;

    result.expect("ACP connection failed");

    // 3. 把原始事件格式化为可读 markdown
    let events = raw_events.lock().unwrap();
    let mut output = String::new();

    output.push_str("# opencode ACP 协议原始事件流\n\n");
    output.push_str(&format!("- **Prompt**: {}\n", prompt));
    output.push_str(&format!("- **工作目录**: `{}`\n", cwd_str));
    output.push_str(&format!("- **事件总数**: {}\n", events.len()));
    output.push_str(&format!("- **捕获时间**: {}\n\n", chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")));

    // 按事件类型分组统计
    // SessionUpdate 序列化为 externally tagged enum：
    // {"sessionUpdate": "agent_message_chunk", "content": {...}}
    output.push_str("## 事件类型统计\n\n");
    output.push_str("| 类型 | 数量 |\n");
    output.push_str("|------|------|\n");
    let mut type_counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for e in events.iter() {
        *type_counts.entry(extract_event_type(&e.update_json)).or_default() += 1;
    }
    let mut sorted_types: Vec<_> = type_counts.into_iter().collect();
    sorted_types.sort_by_key(|(_, c)| std::cmp::Reverse(*c));
    for (t, c) in sorted_types {
        output.push_str(&format!("| {} | {} |\n", t, c));
    }
    output.push_str("\n---\n\n## 完整事件序列（按到达顺序）\n\n");

    for e in events.iter() {
        let event_type = extract_event_type(&e.update_json);

        output.push_str(&format!("### [{}] `{}`\n\n", e.index, event_type));
        output.push_str(&format!("⏱ {} \n\n", e.timestamp));

        // 提取关键字段做简要说明
        match event_type {
            "agent_message_chunk" | "agent_thought_chunk" => {
                if let Some(text) = e.update_json.get("content")
                    .and_then(|c| c.get("text"))
                    .and_then(|v| v.as_str())
                {
                    output.push_str(&format!("**文本内容** (len={}):\n", text.len()));
                    output.push_str("```\n");
                    output.push_str(text);
                    output.push_str("\n```\n\n");
                } else {
                    output.push_str("**未能提取 text 字段**\n\n");
                }
            }
            "tool_call" => {
                let title = e.update_json.get("toolCall")
                    .and_then(|t| t.get("title"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let tool_call_id = e.update_json.get("toolCall")
                    .and_then(|t| t.get("toolCallId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let kind = e.update_json.get("toolCall")
                    .and_then(|t| t.get("kind"))
                    .map(|v| v.to_string())
                    .unwrap_or("null".to_string());
                output.push_str(&format!("- **工具**: `{}`  (kind={})\n", title, kind));
                output.push_str(&format!("- **toolCallId**: `{}`\n\n", tool_call_id));
            }
            "tool_call_update" => {
                let tool_call_id = e.update_json.get("toolCallUpdate")
                    .and_then(|t| t.get("toolCallId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let status = e.update_json.get("toolCallUpdate")
                    .and_then(|t| t.get("status"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                output.push_str(&format!("- **toolCallId**: `{}`\n", tool_call_id));
                output.push_str(&format!("- **status**: `{}`\n\n", status));
            }
            _ => {}
        }

        // 完整 JSON（pretty printed）
        output.push_str("<details>\n<summary>完整 JSON</summary>\n\n");
        output.push_str("```json\n");
        output.push_str(&serde_json::to_string_pretty(&e.update_json).unwrap_or_default());
        output.push_str("\n```\n\n");
        output.push_str("</details>\n\n---\n\n");
    }

    // 4. 写到项目根目录的 docs 下
    let output_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("docs")
        .join("opencode_acp_raw_events.md");

    std::fs::create_dir_all(output_path.parent().unwrap()).expect("create docs dir");
    std::fs::write(&output_path, &output).expect("write output file");

    println!("\n✅ 原始事件已写入: {}\n", output_path.display());
    println!("事件总数: {}", events.len());

    assert!(!events.is_empty(), "应至少捕获到一个事件");
}
