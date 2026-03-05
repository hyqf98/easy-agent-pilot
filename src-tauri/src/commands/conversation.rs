use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::process::Command as TokioCommand;
use tokio::sync::RwLock;

// 简单的日志宏
macro_rules! log_info {
    ($($arg:tt)*) => {
        println!("[INFO][conversation] {}", format!($($arg)*))
    };
}

macro_rules! log_error {
    ($($arg:tt)*) => {
        eprintln!("[ERROR][conversation] {}", format!($($arg)*))
    };
}

macro_rules! log_debug {
    ($($arg:tt)*) => {
        println!("[DEBUG][conversation] {}", format!($($arg)*))
    };
}

// ============== 类型定义 ==============

/// CLI 执行请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliExecutionRequest {
    /// 会话 ID
    pub session_id: String,
    /// CLI 路径
    pub cli_path: String,
    /// 模型 ID
    pub model_id: Option<String>,
    /// 消息历史
    pub messages: Vec<MessageInput>,
    /// 工作目录
    pub working_directory: Option<String>,
    /// 允许的工具列表
    pub allowed_tools: Option<Vec<String>>,
}

/// SDK 执行请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SdkExecutionRequest {
    /// 会话 ID
    pub session_id: String,
    /// API 密钥
    pub api_key: String,
    /// API 端点
    pub base_url: Option<String>,
    /// 模型 ID
    pub model_id: String,
    /// 消息历史
    pub messages: Vec<MessageInput>,
    /// 系统提示
    pub system_prompt: Option<String>,
    /// 最大令牌数
    pub max_tokens: Option<u32>,
    /// 工具定义
    pub tools: Option<Vec<ToolDefinition>>,
}

/// 消息输入
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageInput {
    pub role: String,
    pub content: String,
}

/// 工具定义
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// CLI 流式事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliStreamEvent {
    /// 事件类型
    #[serde(rename = "type")]
    pub event_type: String,
    /// 会话 ID
    pub session_id: String,
    /// 内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 工具名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    /// 工具调用 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// 工具输入
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// 工具结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<String>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 输入 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    /// 输出 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    /// 模型名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// SDK 流式事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdkStreamEvent {
    /// 事件类型
    #[serde(rename = "type")]
    pub event_type: String,
    /// 会话 ID
    pub session_id: String,
    /// 内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 工具名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    /// 工具调用 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// 工具输入
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// 工具结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<String>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 输入 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    /// 输出 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    /// 模型名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

// ============== 中断控制 ==============

// 全局中断状态存储
lazy_static::lazy_static! {
    static ref ABORT_FLAGS: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>> = Arc::new(RwLock::new(HashMap::new()));
}

/// 获取或创建中断标志
async fn get_abort_flag(session_id: &str) -> Arc<AtomicBool> {
    let flags = ABORT_FLAGS.read().await;
    if let Some(flag) = flags.get(session_id) {
        return flag.clone();
    }
    drop(flags);

    let mut flags = ABORT_FLAGS.write().await;
    let flag = Arc::new(AtomicBool::new(false));
    flags.insert(session_id.to_string(), flag.clone());
    flag
}

/// 设置中断标志
async fn set_abort_flag(session_id: &str, abort: bool) {
    let flag = get_abort_flag(session_id).await;
    flag.store(abort, Ordering::SeqCst);
}

/// 检查是否应该中断
async fn should_abort(session_id: &str) -> bool {
    get_abort_flag(session_id).await.load(Ordering::SeqCst)
}

/// 清理中断标志
async fn clear_abort_flag(session_id: &str) {
    let mut flags = ABORT_FLAGS.write().await;
    flags.remove(session_id);
}

// ============== CLI 执行命令 ==============

/// 执行 Claude CLI 命令
#[tauri::command]
pub async fn execute_claude_cli(
    app: AppHandle,
    request: CliExecutionRequest,
) -> Result<(), String> {
    let session_id = request.session_id.clone();
    let event_name = format!("claude-stream-{}", session_id);

    log_info!("开始执行 Claude CLI, session_id: {}", session_id);
    log_info!("CLI 路径: {}", request.cli_path);
    log_info!("模型 ID: {:?}", request.model_id);
    log_info!("工作目录: {:?}", request.working_directory);
    log_info!("消息数量: {}", request.messages.len());

    // 重置中断标志
    set_abort_flag(&session_id, false).await;

    // 构建命令参数
    // 使用 stream-json 格式支持流式输出（需要 --verbose）
    let mut args = vec![
        "-p".to_string(),
        "--verbose".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
    ];

    // 添加模型参数（只有当模型 ID 非空且不是默认值时才添加）
    if let Some(model_id) = &request.model_id {
        let trimmed = model_id.trim();
        if !trimmed.is_empty() && trimmed != "default" {
            args.push("--model".to_string());
            args.push(trimmed.to_string());
            log_info!("使用模型: {}", trimmed);
        } else {
            log_info!("使用 CLI 默认模型（未指定模型参数）");
        }
    } else {
        log_info!("使用 CLI 默认模型（model_id 为空）");
    }

    // 添加允许的工具
    if let Some(tools) = &request.allowed_tools {
        if !tools.is_empty() {
            args.push("--allowedTools".to_string());
            args.push(tools.join(","));
            log_info!("允许的工具: {:?}", tools);
        }
    }

    log_info!("CLI 参数: {:?}", args);

    // 构建输入消息
    let input_text = request.messages
        .iter()
        .map(|m| format!("{}: {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n\n");

    log_debug!("输入文本长度: {} 字节", input_text.len());

    // 执行命令
    let mut cmd = TokioCommand::new(&request.cli_path);
    cmd.args(&args);

    // 设置工作目录
    if let Some(working_dir) = &request.working_directory {
        cmd.current_dir(working_dir);
        log_info!("设置工作目录: {}", working_dir);
    }

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // 移除 CLAUDECODE 环境变量，允许在 Claude Code 会话中嵌套运行
        .env_remove("CLAUDECODE");

    log_info!("启动 CLI 进程...");
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            log_error!("启动 CLI 失败: {}", e);
            return Err(format!("启动 CLI 失败: {}", e));
        }
    };
    log_info!("CLI 进程已启动");

    // 写入输入
    if let Some(mut stdin) = child.stdin.take() {
        match stdin.write_all(input_text.as_bytes()).await {
            Ok(_) => log_debug!("输入已写入 stdin"),
            Err(e) => {
                log_error!("写入输入失败: {}", e);
                return Err(format!("写入输入失败: {}", e));
            }
        }
    }

    // 读取输出
    let stdout = child.stdout.take().ok_or("无法获取标准输出")?;
    let stderr = child.stderr.take().ok_or("无法获取标准错误")?;

    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    let event_name_clone = event_name.clone();

    // 处理标准输出
    tokio::spawn(async move {
        let reader = tokio::io::BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut line_count = 0;

        log_info!("[stdout] 开始读取输出, session: {}", session_id_clone);

        while let Ok(Some(line)) = lines.next_line().await {
            line_count += 1;
            // 安全截断日志，避免 UTF-8 边界问题
            let log_preview: String = line.chars().take(200).collect();
            log_debug!("[stdout] 第 {} 行: {}", line_count, log_preview);

            // 检查中断
            if should_abort(&session_id_clone).await {
                log_info!("[stdout] 检测到中断信号，停止读取");
                break;
            }

            // 解析 JSON 输出
            match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(json_value) => {
                    log_debug!("[stdout] JSON 解析成功");
                    let event = parse_claude_json_output(&session_id_clone, &json_value);
                    if let Some(event) = event {
                        log_debug!("[stdout] 发送事件: type={}", event.event_type);
                        let _ = app_clone.emit(&event_name_clone, event);
                    } else {
                        log_debug!("[stdout] 事件解析返回 None");
                    }
                }
                Err(e) => {
                    let error_preview: String = line.chars().take(100).collect();
                    log_error!("[stdout] JSON 解析失败: {}, 原始内容: {}", e, error_preview);
                }
            }
        }

        log_info!("[stdout] 读取完成，共 {} 行", line_count);
    });

    // 处理标准错误
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    let event_name_clone = event_name.clone();

    tokio::spawn(async move {
        let reader = tokio::io::BufReader::new(stderr);
        let mut lines = reader.lines();

        log_info!("[stderr] 开始读取错误输出, session: {}", session_id_clone);

        while let Ok(Some(line)) = lines.next_line().await {
            log_error!("[stderr] {}", line);

            if should_abort(&session_id_clone).await {
                break;
            }

            // 发送错误事件
            let event = CliStreamEvent {
                event_type: "error".to_string(),
                session_id: session_id_clone.clone(),
                content: None,
                tool_name: None,
                tool_call_id: None,
                tool_input: None,
                tool_result: None,
                error: Some(line),
                input_tokens: None,
                output_tokens: None,
                model: None,
            };
            let _ = app_clone.emit(&event_name_clone, event);
        }

        log_info!("[stderr] 读取完成");
    });

    // 等待命令完成
    log_info!("等待 CLI 进程完成...");
    let status = match child.wait().await {
        Ok(s) => s,
        Err(e) => {
            log_error!("等待命令完成失败: {}", e);
            return Err(format!("等待命令完成失败: {}", e));
        }
    };

    log_info!("CLI 进程完成，退出状态: {:?}", status.code());

    // 发送完成事件
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
    log_info!("已发送 done 事件");

    // 清理中断标志
    clear_abort_flag(&session_id).await;

    if !status.success() {
        return Err(format!("CLI 执行失败，退出码: {:?}", status.code()));
    }

    Ok(())
}

/// 根据模型名称获取 tiktoken 编码器
fn get_tokenizer_for_model(model: &str) -> Option<tiktoken_rs::CoreBPE> {
    // 根据模型名称选择合适的编码器
    let model_lower = model.to_lowercase();

    // Claude 模型使用 cl100k_base
    if model_lower.contains("claude") {
        tiktoken_rs::get_bpe_from_model("gpt-4").ok()
    }
    // GPT-4, GPT-3.5, text-embedding 系列使用 cl100k_base
    else if model_lower.contains("gpt-4") || model_lower.contains("gpt-3.5") || model_lower.contains("gpt-4o") {
        tiktoken_rs::get_bpe_from_model(model).ok()
    }
    // GLM 模型和其他模型使用 cl100k_base（与 GPT-4 相同）
    else if model_lower.contains("glm") || model_lower.contains("qwen") || model_lower.contains("deepseek") {
        tiktoken_rs::get_bpe_from_model("gpt-4").ok()
    }
    // 默认使用 cl100k_base
    else {
        tiktoken_rs::get_bpe_from_model("gpt-4").ok()
    }
}

/// 计算文本的 token 数量
fn count_tokens(text: &str, model: Option<&str>) -> Option<u32> {
    if text.is_empty() {
        return Some(0);
    }

    let bpe = model.and_then(|m| get_tokenizer_for_model(m))
        .or_else(|| tiktoken_rs::get_bpe_from_model("gpt-4").ok())?;

    Some(bpe.encode_with_special_tokens(text).len() as u32)
}

/// 解析 Claude CLI JSON 输出
fn parse_claude_json_output(session_id: &str, json: &serde_json::Value) -> Option<CliStreamEvent> {
    let event_type = json.get("type")?.as_str()?;

    match event_type {
        // 内容增量事件
        "content_block_delta" => {
            let delta = json.get("delta")?;

            // 处理普通文本内容
            if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                return Some(CliStreamEvent {
                    event_type: "content".to_string(),
                    session_id: session_id.to_string(),
                    content: Some(text.to_string()),
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                });
            }

            // 处理思考内容（扩展思考模型）
            if let Some(thinking) = delta.get("thinking").and_then(|t| t.as_str()) {
                return Some(CliStreamEvent {
                    event_type: "thinking".to_string(),
                    session_id: session_id.to_string(),
                    content: Some(thinking.to_string()),
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                });
            }

            // 处理工具输入增量
            if let Some(partial_json) = delta.get("partial_json").and_then(|p| p.as_str()) {
                let index = json.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                return Some(CliStreamEvent {
                    event_type: "tool_input_delta".to_string(),
                    session_id: session_id.to_string(),
                    content: Some(partial_json.to_string()),
                    tool_name: None,
                    tool_call_id: Some(index.to_string()),
                    tool_input: Some(partial_json.to_string()),
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                });
            }

            None
        }
        // 内容块开始事件
        "content_block_start" => {
            let content_block = json.get("content_block")?;
            let block_type = content_block.get("type")?.as_str()?;

            match block_type {
                "tool_use" => Some(CliStreamEvent {
                    event_type: "tool_use".to_string(),
                    session_id: session_id.to_string(),
                    content: None,
                    tool_name: content_block.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()),
                    tool_call_id: content_block.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()),
                    tool_input: None,
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                }),
                "thinking" => Some(CliStreamEvent {
                    event_type: "thinking_start".to_string(),
                    session_id: session_id.to_string(),
                    content: None,
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                }),
                _ => None,
            }
        }
        // 内容块停止事件
        "content_block_stop" => {
            // 内容块结束，可以用于清理状态
            None
        }
        // 工具结果（user 消息中的工具结果）
        "tool_result" => {
            Some(CliStreamEvent {
                event_type: "tool_result".to_string(),
                session_id: session_id.to_string(),
                content: None,
                tool_name: None,
                tool_call_id: json.get("tool_use_id").and_then(|i| i.as_str()).map(|s| s.to_string()),
                tool_input: None,
                tool_result: json.get("content").and_then(|c| c.as_str()).map(|s| s.to_string()),
                error: None,
                input_tokens: None,
                output_tokens: None,
                model: None,
            })
        }
        // 错误事件
        "error" => {
            let error_msg = json.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .or_else(|| json.get("error").and_then(|e| e.as_str()))
                .map(|s| s.to_string());

            Some(CliStreamEvent {
                event_type: "error".to_string(),
                session_id: session_id.to_string(),
                content: None,
                tool_name: None,
                tool_call_id: None,
                tool_input: None,
                tool_result: None,
                error: error_msg,
                input_tokens: None,
                output_tokens: None,
                model: None,
            })
        }
        // 消息开始事件
        "message_start" => {
            // 消息开始，可以用于初始化状态
            None
        }
        // 消息增量事件
        "message_delta" => {
            // 消息增量，可能包含停止原因等
            None
        }
        // 消息停止事件
        "message_stop" => {
            Some(CliStreamEvent {
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
                model: None,
            })
        }
        // 处理 CLI 最终结果（json 格式的输出）
        "result" => {
            let is_error = json.get("is_error").and_then(|e| e.as_bool()).unwrap_or(false);
            let result_text = json.get("result").and_then(|r| r.as_str()).map(|s| s.to_string());

            if is_error {
                Some(CliStreamEvent {
                    event_type: "error".to_string(),
                    session_id: session_id.to_string(),
                    content: None,
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_result: None,
                    error: result_text,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                })
            } else {
                // 成功结果，将内容作为普通消息发送
                Some(CliStreamEvent {
                    event_type: "content".to_string(),
                    session_id: session_id.to_string(),
                    content: result_text,
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                })
            }
        }
        // 处理 assistant 消息（GLM 模型格式）
        "assistant" => {
            let message = json.get("message")?;
            let content_array = message.get("content").and_then(|c| c.as_array())?;

            // 获取模型名称
            let model_name = message.get("model").and_then(|m| m.as_str()).map(|s| s.to_string());

            // 尝试从 API 响应中获取 token 使用量
            let (api_input_tokens, api_output_tokens) = if let Some(usage) = message.get("usage") {
                // API 返回了 usage 信息
                let input = usage.get("prompt_tokens")
                    .or_else(|| usage.get("input_tokens"))
                    .and_then(|t| t.as_u64())
                    .map(|t| t as u32);
                let output = usage.get("completion_tokens")
                    .or_else(|| usage.get("output_tokens"))
                    .and_then(|t| t.as_u64())
                    .map(|t| t as u32);
                (input, output)
            } else {
                (None, None)
            };

            // 处理 content 数组中的第一个元素
            if let Some(content_item) = content_array.first() {
                let item_type = content_item.get("type").and_then(|t| t.as_str()).unwrap_or("");

                match item_type {
                    // 文本内容
                    "text" => {
                        let text = content_item.get("text").and_then(|t| t.as_str()).unwrap_or("");

                        // 如果 API 没有返回 token 使用量，则计算输出 token
                        let output_tokens = if api_output_tokens.is_none() {
                            count_tokens(text, model_name.as_deref())
                        } else {
                            api_output_tokens
                        };

                        Some(CliStreamEvent {
                            event_type: "content".to_string(),
                            session_id: session_id.to_string(),
                            content: Some(text.to_string()),
                            tool_name: None,
                            tool_call_id: None,
                            tool_input: None,
                            tool_result: None,
                            error: None,
                            input_tokens: api_input_tokens,
                            output_tokens,
                            model: model_name,
                        })
                    }
                    // 工具调用
                    "tool_use" => {
                        let tool_name = content_item.get("name").and_then(|n| n.as_str()).map(|s| s.to_string());
                        let tool_id = content_item.get("id").and_then(|i| i.as_str()).map(|s| s.to_string());
                        let tool_input = content_item.get("input").and_then(|i| {
                            serde_json::to_string(i).ok()
                        });

                        // 计算工具调用的 token
                        let output_tokens = if api_output_tokens.is_none() {
                            tool_input.as_ref().and_then(|input| count_tokens(input, model_name.as_deref()))
                        } else {
                            api_output_tokens
                        };

                        Some(CliStreamEvent {
                            event_type: "tool_use".to_string(),
                            session_id: session_id.to_string(),
                            content: None,
                            tool_name,
                            tool_call_id: tool_id,
                            tool_input,
                            tool_result: None,
                            error: None,
                            input_tokens: api_input_tokens,
                            output_tokens,
                            model: model_name,
                        })
                    }
                    // 思考内容
                    "thinking" => {
                        let thinking = content_item.get("thinking").and_then(|t| t.as_str()).unwrap_or("");

                        // 计算思考内容的 token
                        let output_tokens = if api_output_tokens.is_none() {
                            count_tokens(thinking, model_name.as_deref())
                        } else {
                            api_output_tokens
                        };

                        Some(CliStreamEvent {
                            event_type: "thinking".to_string(),
                            session_id: session_id.to_string(),
                            content: Some(thinking.to_string()),
                            tool_name: None,
                            tool_call_id: None,
                            tool_input: None,
                            tool_result: None,
                            error: None,
                            input_tokens: api_input_tokens,
                            output_tokens,
                            model: model_name,
                        })
                    }
                    _ => {
                        log_debug!("[parse] assistant 消息中未处理的内容类型: {}", item_type);
                        None
                    }
                }
            } else {
                None
            }
        }
        // 处理 user 消息（GLM 模型格式，通常是工具结果）
        "user" => {
            let message = json.get("message")?;
            let content_array = message.get("content").and_then(|c| c.as_array())?;

            // 处理 content 数组中的第一个元素
            if let Some(content_item) = content_array.first() {
                let item_type = content_item.get("type").and_then(|t| t.as_str()).unwrap_or("");

                match item_type {
                    // 工具结果
                    "tool_result" => {
                        let tool_use_id = content_item.get("tool_use_id").and_then(|i| i.as_str()).map(|s| s.to_string());
                        let result_content = content_item.get("content").and_then(|c| c.as_str()).map(|s| s.to_string());

                        Some(CliStreamEvent {
                            event_type: "tool_result".to_string(),
                            session_id: session_id.to_string(),
                            content: None,
                            tool_name: None,
                            tool_call_id: tool_use_id,
                            tool_input: None,
                            tool_result: result_content,
                            error: None,
                            input_tokens: None,
                            output_tokens: None,
                            model: None,
                        })
                    }
                    _ => {
                        log_debug!("[parse] user 消息中未处理的内容类型: {}", item_type);
                        None
                    }
                }
            } else {
                None
            }
        }
        _ => {
            log_debug!("[parse] 未处理的事件类型: {}", event_type);
            None
        }
    }
}

/// 执行 Codex CLI 命令
#[tauri::command]
pub async fn execute_codex_cli(
    app: AppHandle,
    request: CliExecutionRequest,
) -> Result<(), String> {
    let session_id = request.session_id.clone();
    let event_name = format!("codex-stream-{}", session_id);

    // 重置中断标志
    set_abort_flag(&session_id, false).await;

    // Codex CLI 的参数格式可能不同，这里使用类似的逻辑
    let mut args = vec!["ask".to_string()];

    if let Some(model_id) = &request.model_id {
        args.push("--model".to_string());
        args.push(model_id.clone());
    }

    // 构建输入消息
    let input_text = request.messages
        .last()
        .map(|m| m.content.clone())
        .unwrap_or_default();

    args.push(input_text);

    // 执行命令
    let mut cmd = TokioCommand::new(&request.cli_path);
    cmd.args(&args);

    if let Some(working_dir) = &request.working_directory {
        cmd.current_dir(working_dir);
    }

    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // 移除 CLAUDECODE 环境变量，允许在 Claude Code 会话中嵌套运行
        .env_remove("CLAUDECODE");

    let mut child = cmd.spawn().map_err(|e| format!("启动 Codex CLI 失败: {}", e))?;

    // 读取输出
    let stdout = child.stdout.take().ok_or("无法获取标准输出")?;
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    let event_name_clone = event_name.clone();

    // 处理标准输出
    tokio::spawn(async move {
        let reader = tokio::io::BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut accumulated = String::new();

        while let Ok(Some(line)) = lines.next_line().await {
            if should_abort(&session_id_clone).await {
                break;
            }

            accumulated.push_str(&line);
            accumulated.push('\n');

            let event = CliStreamEvent {
                event_type: "content".to_string(),
                session_id: session_id_clone.clone(),
                content: Some(line),
                tool_name: None,
                tool_call_id: None,
                tool_input: None,
                tool_result: None,
                error: None,
                input_tokens: None,
                output_tokens: None,
                model: None,
            };
            let _ = app_clone.emit(&event_name_clone, event);
        }
    });

    // 等待命令完成
    let status = child.wait().await.map_err(|e| format!("等待命令完成失败: {}", e))?;

    // 发送完成事件
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

    // 清理中断标志
    clear_abort_flag(&session_id).await;

    if !status.success() {
        return Err(format!("Codex CLI 执行失败，退出码: {:?}", status.code()));
    }

    Ok(())
}

// ============== SDK 执行命令 ==============

/// 执行 Claude SDK API 调用
#[tauri::command]
pub async fn execute_claude_sdk(
    app: AppHandle,
    request: SdkExecutionRequest,
) -> Result<(), String> {
    let session_id = request.session_id.clone();
    let event_name = format!("sdk-stream-{}", session_id);

    // 重置中断标志
    set_abort_flag(&session_id, false).await;

    // 构建请求
    let base_url = request.base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string());
    let url = format!("{}/v1/messages", base_url);

    // 构建消息数组
    let messages: Vec<serde_json::Value> = request.messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| serde_json::json!({
            "role": m.role,
            "content": m.content
        }))
        .collect();

    let mut body = serde_json::json!({
        "model": request.model_id,
        "messages": messages,
        "max_tokens": request.max_tokens.unwrap_or(4096),
        "stream": true
    });

    if let Some(system) = &request.system_prompt {
        body["system"] = serde_json::json!(system);
    }

    // 发送请求
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("x-api-key", &request.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API 请求失败: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误: {}", error_text));
    }

    // 处理 SSE 流
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    let event_name_clone = event_name.clone();

    tokio::spawn(async move {
        use futures::StreamExt;

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            if should_abort(&session_id_clone).await {
                break;
            }

            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    let event = SdkStreamEvent {
                        event_type: "error".to_string(),
                        session_id: session_id_clone.clone(),
                        content: None,
                        tool_name: None,
                        tool_call_id: None,
                        tool_input: None,
                        tool_result: None,
                        error: Some(e.to_string()),
                        input_tokens: None,
                        output_tokens: None,
                        model: None,
                    };
                    let _ = app_clone.emit(&event_name_clone, event);
                    break;
                }
            };

            buffer.push_str(&String::from_utf8_lossy(chunk.as_ref()));

            // 解析 SSE 事件
            while let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                if let Some(event) = parse_sse_event(&session_id_clone, &event_str) {
                    let _ = app_clone.emit(&event_name_clone, event);
                }
            }
        }

        // 发送完成事件
        let done_event = SdkStreamEvent {
            event_type: "done".to_string(),
            session_id: session_id_clone.clone(),
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
        let _ = app_clone.emit(&event_name_clone, done_event);

        // 清理中断标志
        clear_abort_flag(&session_id_clone).await;
    });

    Ok(())
}

/// 解析 SSE 事件
fn parse_sse_event(session_id: &str, event_str: &str) -> Option<SdkStreamEvent> {
    for line in event_str.lines() {
        if line.starts_with("data: ") {
            let data = &line[6..];
            if data == "[DONE]" {
                return Some(SdkStreamEvent {
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
                    model: None,
                });
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                return parse_anthropic_stream_event(session_id, &json);
            }
        }
    }
    None
}

/// 解析 Anthropic 流式事件
fn parse_anthropic_stream_event(session_id: &str, json: &serde_json::Value) -> Option<SdkStreamEvent> {
    let event_type = json.get("type")?.as_str()?;

    match event_type {
        "content_block_delta" => {
            let delta = json.get("delta")?;
            if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                Some(SdkStreamEvent {
                    event_type: "content".to_string(),
                    session_id: session_id.to_string(),
                    content: Some(text.to_string()),
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                })
            } else if let Some(thinking) = delta.get("thinking").and_then(|t| t.as_str()) {
                Some(SdkStreamEvent {
                    event_type: "thinking".to_string(),
                    session_id: session_id.to_string(),
                    content: Some(thinking.to_string()),
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                })
            } else {
                None
            }
        }
        "content_block_start" => {
            let content_block = json.get("content_block")?;
            let block_type = content_block.get("type")?.as_str()?;

            match block_type {
                "tool_use" => Some(SdkStreamEvent {
                    event_type: "tool_use".to_string(),
                    session_id: session_id.to_string(),
                    content: None,
                    tool_name: content_block.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()),
                    tool_call_id: content_block.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()),
                    tool_input: None,
                    tool_result: None,
                    error: None,
                    input_tokens: None,
                    output_tokens: None,
                    model: None,
                }),
                _ => None,
            }
        }
        "content_block_stop" => {
            // 内容块结束，不需要特别处理
            None
        }
        "message_delta" => {
            // 消息增量，可能包含停止原因等
            None
        }
        "message_stop" => Some(SdkStreamEvent {
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
            model: None,
        }),
        "error" => Some(SdkStreamEvent {
            event_type: "error".to_string(),
            session_id: session_id.to_string(),
            content: None,
            tool_name: None,
            tool_call_id: None,
            tool_input: None,
            tool_result: None,
            error: json.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).map(|s| s.to_string()),
            input_tokens: None,
            output_tokens: None,
            model: None,
        }),
        _ => None,
    }
}

// ============== 中断命令 ==============

/// 中断 CLI 执行
#[tauri::command]
pub async fn abort_cli_execution(session_id: String) -> Result<(), String> {
    set_abort_flag(&session_id, true).await;
    Ok(())
}

/// 中断 SDK 执行
#[tauri::command]
pub async fn abort_sdk_execution(session_id: String) -> Result<(), String> {
    set_abort_flag(&session_id, true).await;
    Ok(())
}
