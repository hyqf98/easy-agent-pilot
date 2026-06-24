//! opencode ACP token usage 链路集成测试
//!
//! 验证通过 ACP 协议连接真实 opencode 进程后，
//! PromptResponse.usage 能被正确捕获（input/output tokens、cache 字段）。
//!
//! 注意：token 提取逻辑本身的正确性已由 acp.rs::extract_prompt_usage 单测覆盖，
//! 本文件验证的是端到端"从真实 opencode 流里捕获 usage"的链路。
//!
//! 未安装 opencode 时自动跳过。

mod common;

use common::{is_opencode_available, run_with_config_and_usage, SessionConfig};

/// 没有安装 opencode 时自动跳过。返回 false 表示跳过。
fn ensure_opencode_or_skip() -> bool {
    if !is_opencode_available() {
        eprintln!("skipping: opencode not found in PATH");
        false
    } else {
        true
    }
}

/// 验证 PromptResponse.usage 被捕获，input/output tokens > 0
#[tokio::test]
async fn prompt_response_usage_captured() {
    if !ensure_opencode_or_skip() {
        return;
    }

    let (collector, snapshot) = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        run_with_config_and_usage(
            "Reply with exactly one word: hello",
            &SessionConfig::default(),
            120,
        ),
    )
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => panic!("run_with_config_and_usage failed: {e}"),
        Err(_) => panic!("test timed out after 120s"),
    };

    println!("usage snapshot: {:?}", snapshot);
    println!("event count: {}", collector.events.len());

    // 至少应该收到 agent 回复
    assert!(
        collector.count("agent_message") > 0,
        "expected at least one agent_message event"
    );

    // usage 快照的 input/output tokens 必须存在且 > 0
    assert!(
        snapshot.input_tokens.unwrap_or(0) > 0,
        "expected positive input_tokens, got {:?}",
        snapshot.input_tokens
    );
    assert!(
        snapshot.output_tokens.unwrap_or(0) > 0,
        "expected positive output_tokens, got {:?}",
        snapshot.output_tokens
    );

    println!(
        "verified: input_tokens={}, output_tokens={}",
        snapshot.input_tokens.unwrap(),
        snapshot.output_tokens.unwrap()
    );
}

/// 验证 usage 事件被记录在 collector.events 中（usage event 存在性）
#[tokio::test]
async fn usage_event_recorded_in_collector() {
    if !ensure_opencode_or_skip() {
        return;
    }

    let (collector, _snapshot) = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        run_with_config_and_usage(
            "What is 2+2? Reply with just the number.",
            &SessionConfig::default(),
            120,
        ),
    )
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => panic!("run_with_config_and_usage failed: {e}"),
        Err(_) => panic!("test timed out after 120s"),
    };

    let usage_count = collector.count("usage");
    println!("usage event count: {}", usage_count);

    // 至少有一个 usage 事件
    assert!(
        usage_count > 0,
        "expected at least one usage event, got 0. Events: {:?}",
        collector
            .events
            .iter()
            .map(|e| e.event_type.as_str())
            .collect::<Vec<_>>()
    );

    // 找到 usage 事件并验证 input_tokens 字段
    let usage_event = collector
        .events
        .iter()
        .find(|e| e.event_type == "usage")
        .expect("usage event must exist");

    let input_tokens = usage_event.input_tokens.unwrap_or(0);
    assert!(
        input_tokens > 0,
        "usage event input_tokens should be positive, got {input_tokens}"
    );
    println!("verified usage event: input_tokens={}", input_tokens);
}

/// 验证 system_prompt 配置下 usage 仍能被正确捕获
#[tokio::test]
async fn usage_captured_with_system_prompt() {
    if !ensure_opencode_or_skip() {
        return;
    }

    let config = SessionConfig {
        system_prompt: Some("You are a helpful assistant. Be concise.".to_string()),
        ..Default::default()
    };

    let (collector, snapshot) = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        run_with_config_and_usage("What is the capital of France?", &config, 120),
    )
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => panic!("run_with_config_and_usage failed: {e}"),
        Err(_) => panic!("test timed out after 120s"),
    };

    // 回复正常
    let full_text = collector.agent_message_text();
    assert!(
        !full_text.trim().is_empty(),
        "agent should reply with system_prompt configured"
    );

    // usage 仍被捕获
    assert!(
        snapshot.input_tokens.unwrap_or(0) > 0,
        "expected positive input_tokens with system_prompt, got {:?}",
        snapshot.input_tokens
    );
    assert!(
        snapshot.output_tokens.unwrap_or(0) > 0,
        "expected positive output_tokens with system_prompt, got {:?}",
        snapshot.output_tokens
    );

    println!(
        "usage with system_prompt: input={}, output={}",
        snapshot.input_tokens.unwrap(),
        snapshot.output_tokens.unwrap()
    );
}
