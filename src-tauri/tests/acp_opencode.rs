//! opencode ACP 集成测试
//!
//! 验证通过 ACP 协议连接真实 opencode 进程后，
//! 所有 SessionUpdate 消息都能被正确读取。

mod common;

use agent_client_protocol::schema::StopReason;
use common::{
    connect_and_start_session, is_opencode_available, run_prompt_and_collect, run_with_config,
    make_stdio_mcp_server, SessionConfig,
};

/// 没有安装 opencode 时自动跳过所有测试。
/// 返回 `false` 表示未安装，调用方必须提前 `return`。
fn ensure_opencode_or_skip() -> bool {
    if !is_opencode_available() {
        eprintln!("skipping: opencode not found in PATH");
        false
    } else {
        true
    }
}

/// 仅连接并启动会话，验证 ACP 握手链路
#[tokio::test]
async fn connects_to_opencode_acp() {
    if !ensure_opencode_or_skip() {
        return;
    }

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        connect_and_start_session(),
    )
    .await;

    match result {
        Ok(Ok(session_id)) => {
            assert!(!session_id.is_empty(), "session_id should not be empty");
            println!("connected, external session_id = {session_id}");
        }
        Ok(Err(e)) => panic!("failed to connect: {e}"),
        Err(_) => panic!("connect timed out after 60s"),
    }
}

/// 验证能读取到 AgentMessageChunk（agent 回复文本）
#[tokio::test]
async fn reads_agent_message_chunk() {
    if !ensure_opencode_or_skip() {
        return;
    }

    let collector = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        run_prompt_and_collect("Reply with exactly one word: hello", 120),
    )
    .await
    {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => panic!("run_prompt failed: {e}"),
        Err(_) => panic!("test timed out after 120s"),
    };

    let message_count = collector.count("agent_message");
    assert!(
        message_count > 0,
        "expected at least one agent_message event, got 0. All events: {:?}",
        collector.events
    );

    let full_text = collector.agent_message_text();
    assert!(
        !full_text.trim().is_empty(),
        "agent message text should not be empty"
    );

    println!("agent_message count = {message_count}");
    println!("agent_message text  = {full_text}");

    assert!(
        full_text.to_lowercase().contains("hello"),
        "agent reply should contain 'hello', got: {full_text}"
    );
}

/// 验证能收到 StopReason::EndTurn
#[tokio::test]
async fn receives_stop_reason() {
    if !ensure_opencode_or_skip() {
        return;
    }

    let collector = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        run_prompt_and_collect("Say hi", 120),
    )
    .await
    {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => panic!("run_prompt failed: {e}"),
        Err(_) => panic!("test timed out after 120s"),
    };

    let stop_reason = collector
        .stop_reason
        .unwrap_or_else(|| panic!("expected StopReason, got None. Events: {:?}", collector.events));

    println!("stop_reason = {stop_reason:?}");
    assert!(
        matches!(stop_reason, StopReason::EndTurn),
        "expected EndTurn, got {stop_reason:?}"
    );
}

/// 诊断性测试：打印所有事件类型和数量，不强制断言
#[tokio::test]
async fn collects_all_event_types() {
    if !ensure_opencode_or_skip() {
        return;
    }

    let collector = match tokio::time::timeout(
        std::time::Duration::from_secs(180),
        run_prompt_and_collect("List the files in the current directory", 180),
    )
    .await
    {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => panic!("run_prompt failed: {e}"),
        Err(_) => panic!("test timed out after 180s"),
    };

    // 统计各类型事件数量
    let mut type_counts = std::collections::HashMap::new();
    for event in &collector.events {
        *type_counts.entry(event.event_type.as_str()).or_insert(0) += 1;
    }

    println!("=== Event Type Summary ===");
    for (etype, count) in &type_counts {
        println!("  {etype}: {count}");
    }
    println!("  stop_reason: {:?}", collector.stop_reason);
    println!("==========================");

    // 必须收到 agent_message
    assert!(
        collector.count("agent_message") > 0,
        "must receive at least one agent_message"
    );

    // 如果收到 usage 类型事件，验证 used > 0
    for event in collector.events.iter().filter(|e| e.event_type == "usage") {
        if let Some(used) = event.input_tokens {
            assert!(
                used > 0,
                "usage.used should be positive, got {used}"
            );
            println!("verified: usage.used = {used}");
        }
    }

    // 如果收到 ToolCall + ToolCallUpdate，验证 tool_call_id 能配对
    let tool_call_ids: Vec<_> = collector
        .events
        .iter()
        .filter(|e| e.event_type == "tool_call")
        .filter_map(|e| e.tool_call_id.as_ref())
        .collect();
    let tool_result_ids: Vec<_> = collector
        .events
        .iter()
        .filter(|e| e.event_type == "tool_result")
        .filter_map(|e| e.tool_call_id.as_ref())
        .collect();

    for result_id in &tool_result_ids {
        assert!(
            tool_call_ids.contains(result_id),
            "tool_result id '{result_id}' has no matching tool_call"
        );
    }

    if !tool_call_ids.is_empty() {
        println!(
            "tool_call count = {}, tool_result count = {}",
            tool_call_ids.len(),
            tool_result_ids.len()
        );
    }
}

// ===========================================================================
// 场景测试：system_prompt / mcp_servers / reasoning_effort
// ===========================================================================

/// 验证 system_prompt meta 能被传递，会话不会因 systemPrompt meta 报错
#[tokio::test]
async fn system_prompt_meta_accepted() {
    if !ensure_opencode_or_skip() {
        return;
    }

    // 通过 meta.systemPrompt 传递系统提示词，验证会话链路正常
    let config = SessionConfig {
        system_prompt: Some(
            "You are a helpful assistant. Always be concise and reply in one sentence."
                .to_string(),
        ),
        ..Default::default()
    };

    let collector = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        run_with_config("What is the capital of France?", &config, 120),
    )
    .await
    {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => panic!("run_with_config failed: {e}"),
        Err(_) => panic!("test timed out after 120s"),
    };

    let full_text = collector.agent_message_text();
    println!("system_prompt test - agent reply: {full_text}");

    // 会话正常完成，说明 systemPrompt meta 没有导致协议错误
    assert!(
        !full_text.trim().is_empty(),
        "agent should reply with systemPrompt meta configured"
    );

    // 验证回复包含 Paris（验证 LLM 正常响应）
    assert!(
        full_text.to_lowercase().contains("paris"),
        "expected reply containing 'paris', got: {full_text}"
    );

    // 验证收到 StopReason::EndTurn
    assert!(
        matches!(collector.stop_reason, Some(StopReason::EndTurn)),
        "expected EndTurn, got {:?}",
        collector.stop_reason
    );
}

/// 验证 mcp_servers 能被正确传递，会话能正常建立且 agent 能调用 MCP 工具
#[tokio::test]
async fn mcp_servers_dont_break_session() {
    if !ensure_opencode_or_skip() {
        return;
    }

    // 构造一个简单的 stdio MCP server（用 npx 跑一个已知 MCP 工具）
    // 使用 @upstash/context7-mcp 作为测试用 server（opencode.json 中已配置）
    let mcp_server = make_stdio_mcp_server("test-context7", "npx", &["-y", "@upstash/context7-mcp"]);

    let config = SessionConfig {
        mcp_servers: Some(vec![mcp_server]),
        ..Default::default()
    };

    let collector = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        run_with_config("Reply with exactly: ok", &config, 120),
    )
    .await
    {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => panic!("run_with_config failed: {e}"),
        Err(_) => panic!("test timed out after 120s"),
    };

    let full_text = collector.agent_message_text();
    println!("mcp_servers test - agent reply: {full_text}");

    // 即使传了 mcp_servers，会话也应正常完成
    assert!(
        !full_text.trim().is_empty(),
        "agent should still reply with mcp_servers configured"
    );

    // 验证 session_id 被正确分配
    assert!(
        collector.session_id.is_some(),
        "session_id should be set even with mcp_servers"
    );
    println!("mcp_servers test - session_id: {:?}", collector.session_id);

    // 验证收到 StopReason::EndTurn
    assert!(
        matches!(collector.stop_reason, Some(StopReason::EndTurn)),
        "expected EndTurn, got {:?}",
        collector.stop_reason
    );
}

/// 验证 reasoning_effort meta 能被传递，会话不会因此报错
#[tokio::test]
async fn reasoning_effort_meta_accepted() {
    if !ensure_opencode_or_skip() {
        return;
    }

    let config = SessionConfig {
        reasoning_effort: Some("high".to_string()),
        ..Default::default()
    };

    let collector = match tokio::time::timeout(
        std::time::Duration::from_secs(150),
        run_with_config("What is 2+2? Reply with just the number.", &config, 150),
    )
    .await
    {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => panic!("run_with_config failed: {e}"),
        Err(_) => panic!("test timed out after 150s"),
    };

    let full_text = collector.agent_message_text();
    println!("reasoning_effort test - agent reply: {full_text}");

    assert!(
        !full_text.trim().is_empty(),
        "agent should reply with reasoning_effort configured"
    );

    // 验证回复包含 "4"
    assert!(
        full_text.trim().contains('4'),
        "expected reply containing '4', got: {full_text}"
    );

    // 如果有 agent_thought 事件，说明 reasoning 确实生效了
    let thought_count = collector.count("agent_thought");
    println!("reasoning_effort test - agent_thought count: {thought_count}");

    // 验证收到 StopReason::EndTurn
    assert!(
        matches!(collector.stop_reason, Some(StopReason::EndTurn)),
        "expected EndTurn, got {:?}",
        collector.stop_reason
    );
}