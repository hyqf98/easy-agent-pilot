use std::path::PathBuf;
use std::process::Stdio;

use anyhow::Result;
use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt};
use tokio::process::Command as TokioCommand;
use uuid::Uuid;

use crate::commands::conversation::abort::{
    clear_abort_flag, register_session_pid, set_abort_flag, should_abort, unregister_session_pid,
};
use crate::commands::conversation::strategy::AgentExecutionStrategy;
use crate::commands::conversation::types::{CliStreamEvent, ExecutionRequest};

/// Codex CLI 策略
pub struct CodexCliStrategy;

// 简单的日志宏
macro_rules! log_info {
    ($($arg:tt)*) => {
        println!("[INFO][codex-cli] {}", format!($($arg)*))
    };
}

macro_rules! log_error {
    ($($arg:tt)*) => {
        eprintln!("[ERROR][codex-cli] {}", format!($($arg)*))
    };
}

struct StdoutReadOutcome {
    emitted_content: bool,
    emitted_error: bool,
}

impl StdoutReadOutcome {
    fn none() -> Self {
        Self {
            emitted_content: false,
            emitted_error: false,
        }
    }
}

struct TempSchemaFile {
    path: PathBuf,
}

impl TempSchemaFile {
    async fn create(schema: &str) -> Result<Self> {
        let path =
            std::env::temp_dir().join(format!("codex-output-schema-{}.json", Uuid::new_v4()));
        tokio::fs::write(&path, schema).await?;
        Ok(Self { path })
    }

    fn to_path_string(&self) -> String {
        self.path.to_string_lossy().to_string()
    }
}

impl Drop for TempSchemaFile {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_file(&self.path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                log_error!(
                    "清理临时 schema 文件失败: {} ({})",
                    self.path.display(),
                    error
                );
            }
        }
    }
}

#[async_trait]
impl AgentExecutionStrategy for CodexCliStrategy {
    fn name(&self) -> &str {
        "Codex CLI"
    }

    fn supports(&self, agent_type: &str, provider: &str) -> bool {
        agent_type == "cli" && provider == "codex"
    }

    async fn execute(&self, app: AppHandle, request: ExecutionRequest) -> Result<()> {
        let session_id = request.session_id.clone();
        let event_name = format!("codex-stream-{}", session_id);

        log_info!("开始执行 Codex CLI, session_id: {}", session_id);

        // 重置中断标志
        set_abort_flag(&session_id, false).await;

        let cli_path = request
            .cli_path
            .clone()
            .unwrap_or_else(|| "codex".to_string());
        let model_id = request.model_id.clone();
        let working_directory = request.working_directory.clone();
        let cli_output_format = request
            .cli_output_format
            .clone()
            .unwrap_or_else(|| "text".to_string());
        let json_schema = request.json_schema.clone();
        let extra_cli_args = request.extra_cli_args.clone();
        let messages = request.messages.clone();

        let schema_text = json_schema
            .as_deref()
            .map(str::trim)
            .filter(|schema| !schema.is_empty());
        let use_exec_mode = cli_output_format != "text" || schema_text.is_some();
        let is_json_output = use_exec_mode
            && (cli_output_format == "json"
                || cli_output_format == "stream-json"
                || schema_text.is_some());

        let mut args = Vec::<String>::new();
        if use_exec_mode {
            args.push("exec".to_string());
            if is_json_output {
                args.push("--json".to_string());
            }
        } else {
            // 兼容旧实现
            args.push("ask".to_string());
        }

        if let Some(model_id) = &model_id {
            let trimmed = model_id.trim();
            if !trimmed.is_empty() && trimmed != "default" {
                args.push("--model".to_string());
                args.push(trimmed.to_string());
            }
        }

        let mut schema_file: Option<TempSchemaFile> = None;
        if let Some(schema) = schema_text {
            if is_json_output {
                let file = TempSchemaFile::create(schema).await?;
                args.push("--output-schema".to_string());
                args.push(file.to_path_string());
                schema_file = Some(file);
            }
        }

        if let Some(custom_args) = &extra_cli_args {
            if !custom_args.is_empty() {
                args.extend(custom_args.iter().cloned());
                log_info!("追加自定义 CLI 参数: {:?}", custom_args);
            }
        }

        let input_text = if use_exec_mode {
            messages
                .iter()
                .map(|m| format!("{}: {}", m.role, m.content))
                .collect::<Vec<_>>()
                .join("\n\n")
        } else {
            messages
                .last()
                .map(|m| m.content.clone())
                .unwrap_or_default()
        };

        args.push(input_text.clone());

        let mut cmd = TokioCommand::new(&cli_path);
        cmd.args(&args);

        if let Some(working_dir) = &working_directory {
            cmd.current_dir(working_dir);
        }

        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env_remove("CLAUDECODE");

        let mut child = cmd.spawn()?;

        // 注册进程 PID，用于后续可能的中断操作
        if let Some(pid) = child.id() {
            register_session_pid(&session_id, pid).await;
        }

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("无法获取标准输出"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("无法获取标准错误"))?;

        let session_id_clone = session_id.clone();
        let app_clone = app.clone();
        let event_name_clone = event_name.clone();

        let stdout_handle = tokio::spawn(async move {
            if is_json_output {
                let reader = tokio::io::BufReader::new(stdout);
                let mut lines = reader.lines();
                let mut outcome = StdoutReadOutcome::none();

                while let Ok(Some(line)) = lines.next_line().await {
                    if should_abort(&session_id_clone).await {
                        break;
                    }

                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<serde_json::Value>(trimmed) {
                        Ok(json_value) => {
                            if let Some(event) =
                                parse_codex_json_output(&session_id_clone, &json_value)
                            {
                                outcome.emitted_content |= event.event_type == "content";
                                outcome.emitted_error |= event.event_type == "error";
                                let _ = app_clone.emit(&event_name_clone, event);
                            }
                        }
                        Err(error) => {
                            let preview = preview_text(trimmed, 120);
                            log_error!("[stdout] 非 JSON 行已忽略: {} | {}", error, preview);
                        }
                    }
                }

                return outcome;
            }

            let mut reader = tokio::io::BufReader::new(stdout);
            let mut full_output = String::new();
            if let Err(error) = reader.read_to_string(&mut full_output).await {
                log_error!("[stdout] 读取失败: {}", error);
                return StdoutReadOutcome::none();
            }

            if should_abort(&session_id_clone).await {
                return StdoutReadOutcome::none();
            }

            let normalized = full_output.trim();
            if normalized.is_empty() {
                return StdoutReadOutcome::none();
            }

            let _ = app_clone.emit(
                &event_name_clone,
                build_content_event(&session_id_clone, normalized.to_string()),
            );
            StdoutReadOutcome {
                emitted_content: true,
                emitted_error: false,
            }
        });

        let session_id_clone = session_id.clone();
        let app_clone = app.clone();
        let event_name_clone = event_name.clone();

        let stderr_handle = tokio::spawn(async move {
            let reader = tokio::io::BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                log_error!("[stderr] {}", trimmed);

                if should_abort(&session_id_clone).await {
                    break;
                }

                let event = CliStreamEvent {
                    event_type: "error".to_string(),
                    session_id: session_id_clone.clone(),
                    content: None,
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_result: None,
                    error: Some(trimmed.to_string()),
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                };
                let _ = app_clone.emit(&event_name_clone, event);
            }
        });

        let status = child.wait().await?;
        let stdout_outcome = match stdout_handle.await {
            Ok(outcome) => outcome,
            Err(error) => {
                log_error!("[stdout] 任务等待失败: {}", error);
                StdoutReadOutcome::none()
            }
        };
        let _ = stderr_handle.await;

        let done_event = CliStreamEvent {
            event_type: "done".to_string(),
            session_id: session_id.clone(),
            content: None,
            tool_name: None,
            tool_call_id: None,
            tool_input: None,
            tool_result: None,
            error: None,
            input_tokens: None,
            output_tokens: None,
            model: None,
        };
        let _ = app.emit(&event_name, done_event);

        // 注销进程 PID
        unregister_session_pid(&session_id).await;

        clear_abort_flag(&session_id).await;

        drop(schema_file);

        if !status.success() {
            if stdout_outcome.emitted_content && !stdout_outcome.emitted_error {
                return Ok(());
            }
            return Err(anyhow::anyhow!(
                "Codex CLI 执行失败，退出码: {:?}",
                status.code()
            ));
        }

        Ok(())
    }
}

fn build_content_event(session_id: &str, content: String) -> CliStreamEvent {
    CliStreamEvent {
        event_type: "content".to_string(),
        session_id: session_id.to_string(),
        content: Some(content),
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        model: None,
    }
}

fn build_thinking_event(session_id: &str, content: String) -> CliStreamEvent {
    CliStreamEvent {
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
        model: None,
    }
}

fn build_error_event(session_id: &str, error: String) -> CliStreamEvent {
    CliStreamEvent {
        event_type: "error".to_string(),
        session_id: session_id.to_string(),
        content: None,
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: Some(error),
        input_tokens: None,
        output_tokens: None,
        model: None,
    }
}

fn parse_codex_json_output(session_id: &str, json: &serde_json::Value) -> Option<CliStreamEvent> {
    let event_type = json
        .get("type")
        .and_then(|value| value.as_str())
        .unwrap_or_default();

    match event_type {
        "item.completed" => {
            let item = json.get("item")?;
            let item_type = item.get("type").and_then(|value| value.as_str())?;

            match item_type {
                "agent_message" => {
                    let text = extract_item_text(item)?;
                    Some(build_content_event(session_id, text))
                }
                "reasoning" => {
                    let text = extract_item_text(item)?;
                    Some(build_thinking_event(session_id, text))
                }
                _ => None,
            }
        }
        "item.delta" => {
            if let Some(text) = extract_text_value(json.get("delta")) {
                return Some(build_content_event(session_id, text));
            }
            None
        }
        "turn.completed" => {
            extract_turn_output(json).map(|content| build_content_event(session_id, content))
        }
        "result" => extract_structured_payload(json)
            .or_else(|| extract_text_value(json.get("result")))
            .map(|content| build_content_event(session_id, content)),
        "turn.failed" => {
            let error_text = extract_text_value(json.get("error"))
                .or_else(|| extract_text_value(json.get("message")))
                .unwrap_or_else(|| "Codex CLI turn failed".to_string());
            Some(build_error_event(session_id, error_text))
        }
        "error" => {
            let error_text = extract_text_value(json.get("message"))
                .or_else(|| extract_text_value(json.get("error")))
                .unwrap_or_else(|| "Codex CLI 返回未知错误".to_string());

            Some(build_error_event(session_id, error_text))
        }
        _ => extract_structured_payload(json)
            .or_else(|| extract_turn_output(json))
            .map(|content| build_content_event(session_id, content)),
    }
}

fn extract_item_text(item: &serde_json::Value) -> Option<String> {
    extract_text_value(item.get("text"))
        .or_else(|| extract_structured_payload(item))
        .or_else(|| extract_text_value(item.get("content")))
}

fn extract_structured_payload(value: &serde_json::Value) -> Option<String> {
    value
        .get("structured_output")
        .or_else(|| value.get("structuredOutput"))
        .or_else(|| value.get("output_struct"))
        .or_else(|| value.get("outputStruct"))
        .and_then(|v| serde_json::to_string(v).ok())
}

fn extract_turn_output(value: &serde_json::Value) -> Option<String> {
    extract_structured_payload(value)
        .or_else(|| extract_text_value(value.get("output")))
        .or_else(|| extract_text_value(value.get("result")))
        .or_else(|| {
            value
                .pointer("/result/output")
                .and_then(|v| extract_text_value(Some(v)))
        })
}

fn extract_text_value(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;

    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(array) = value.as_array() {
        let combined = array
            .iter()
            .filter_map(|part| extract_text_value(Some(part)))
            .collect::<Vec<_>>()
            .join("");
        let trimmed = combined.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
        return None;
    }

    if value.is_object() {
        if let Some(text) = value
            .get("text")
            .and_then(|part| part.as_str())
            .map(|part| part.trim().to_string())
            .filter(|part| !part.is_empty())
        {
            return Some(text);
        }

        if let Some(content) = value.get("content") {
            if let Some(text) = extract_text_value(Some(content)) {
                return Some(text);
            }
        }

        if let Some(message) = value
            .get("message")
            .and_then(|part| part.as_str())
            .map(|part| part.trim().to_string())
            .filter(|part| !part.is_empty())
        {
            return Some(message);
        }

        if let Ok(serialized) = serde_json::to_string(value) {
            if !serialized.is_empty() {
                return Some(serialized);
            }
        }
    }

    None
}

fn preview_text(text: &str, max_chars: usize) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_chars {
        return normalized;
    }
    normalized.chars().take(max_chars).collect::<String>() + "..."
}
