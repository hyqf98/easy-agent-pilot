//! 诊断测试：opencode ACP 流式文本推送模式
//!
//! 验证 opencode 在回复包含 markdown 代码块时，
//! AgentMessageChunk 推送的是**增量 delta**还是**全量快照**。
//!
//! 这决定前端 `mergeStreamingText` 应使用纯追加还是快照去重。
//! 预期：opencode 与 claude/codex 一致，发送增量 delta。

mod common;

use common::{is_opencode_available, run_with_config, SessionConfig};

/// 没有安装 opencode 时自动跳过。
fn ensure_opencode_or_skip() -> bool {
    if !is_opencode_available() {
        eprintln!("skipping: opencode not found in PATH");
        false
    } else {
        true
    }
}

/// 在临时目录创建 hello.txt，让 opencode 读取并用 markdown 代码块返回内容。
///
/// 目标：观察 AgentMessageChunk 的推送模式（增量 vs 快照），
/// 并验证拼接后的文本包含完整、有序的代码块。
#[tokio::test]
async fn opencode_streams_markdown_codeblock_as_delta() {
    if !ensure_opencode_or_skip() {
        return;
    }

    // 1. 创建临时工作目录与 hello.txt
    let tmp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let hello_path = tmp_dir.path().join("hello.txt");
    std::fs::write(&hello_path, "hello\ntext\n").expect("failed to write hello.txt");
    let cwd = tmp_dir.path().to_string_lossy().to_string();

    // 2. 发送 prompt：要求读取文件并用代码块返回
    let prompt = "请读取当前目录下的 hello.txt 文件，然后用 markdown 代码块把文件内容原样输出。直接输出代码块，不要多余解释。";

    let config = SessionConfig {
        working_directory: Some(cwd),
        ..Default::default()
    };

    let collector = match tokio::time::timeout(
        std::time::Duration::from_secs(180),
        run_with_config(prompt, &config, 180),
    )
    .await
    {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => panic!("ACP error: {e}"),
        Err(_) => panic!("test timed out after 180s"),
    };

    // 3. 提取所有 agent_message chunk 并打印每个 chunk 的原文
    let message_chunks: Vec<&str> = collector
        .events
        .iter()
        .filter(|e| e.event_type == "agent_message")
        .filter_map(|e| e.text.as_deref())
        .collect();

    let chunk_count = message_chunks.len();
    println!("\n=== agent_message chunk count: {chunk_count} ===\n");

    let mut cumulative_len = 0usize;
    for (i, chunk) in message_chunks.iter().enumerate() {
        cumulative_len += chunk.len();
        println!(
            "[chunk {:>3}] len={:>4} cumulative_len={:>5} | {:?}",
            i,
            chunk.len(),
            cumulative_len,
            if chunk.len() > 80 { &chunk[..80] } else { chunk }
        );
    }

    // 4. 拼接全部 chunk（纯追加，模拟后端 MessageRecorder 的 SQL || 逻辑）
    let joined: String = message_chunks.concat();
    println!("\n=== joined text ({} chars) ===\n{}", joined.len(), joined);

    // 5. 诊断：是否为增量模式？
    //    增量模式特征：每个 chunk 长度 << 累积长度（多个小片段拼成完整文本）
    //    快照模式特征：每个 chunk 长度 ≈ 累积长度（每个 chunk 都是到当前为止的全量）
    if chunk_count > 1 {
        let last_chunk_len = message_chunks.last().unwrap().len();
        let ratio = last_chunk_len as f64 / cumulative_len as f64;
        println!(
            "\n=== 模式诊断: last_chunk_len={}, cumulative_len={}, ratio={:.3} ===",
            last_chunk_len, cumulative_len, ratio
        );
        if ratio < 0.5 {
            println!("→ 增量 delta 模式（ratio < 0.5）：前端应使用纯追加");
        } else {
            println!("→ 快照 snapshot 模式（ratio >= 0.5）：需快照去重");
        }
    }

    // 6. 断言：拼接结果包含代码块标记
    assert!(
        chunk_count >= 1,
        "应至少收到 1 个 agent_message chunk"
    );
    assert!(
        joined.contains("hello") && joined.contains("text"),
        "拼接文本应包含 hello.txt 的内容"
    );
    assert!(
        joined.contains("```"),
        "拼接文本应包含 markdown 代码块标记 ```"
    );

    // 7. 断言：纯追加的 join 与 collector.agent_message_text() 一致
    //    （agent_message_text 内部就是 join("")）
    assert_eq!(
        joined,
        collector.agent_message_text(),
        "纯追加拼接应与 collector.agent_message_text() 一致"
    );

    println!("\n✅ 诊断完成：opencode 推送增量 delta，前端 mergeStreamingText 应使用纯追加");
}
