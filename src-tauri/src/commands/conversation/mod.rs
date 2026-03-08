//! 对话执行模块
//!
//! 该模块实现了智能体执行的策略模式，支持多种智能体类型：
//! - Claude CLI: 通过 Claude CLI 工具执行
//! - Codex CLI: 通过 Codex CLI 工具执行
//! - Claude SDK: 通过 Claude API 执行
//! - Codex SDK: 通过 OpenAI 兼容 API 执行

pub mod abort;
pub mod executor;
pub mod strategies;
pub mod strategy;
pub mod types;

// 重新导出常用类型和函数
pub use abort::set_abort_flag;
pub use executor::{get_registry, init_registry};
pub use strategy::AgentExecutionStrategy;
pub use types::{CliExecutionRequest, ExecutionRequest, SdkExecutionRequest};

use anyhow::Result;
use tauri::AppHandle;

// ============== 向后兼容的命令包装器 ==============

/// 执行 Claude CLI 命令（向后兼容）
#[tauri::command]
pub async fn execute_claude_cli(
    app: AppHandle,
    request: CliExecutionRequest,
) -> Result<(), String> {
    // 转换为统一请求格式
    let unified_request = ExecutionRequest {
        session_id: request.session_id,
        agent_type: "cli".to_string(),
        provider: "claude".to_string(),
        cli_path: Some(request.cli_path),
        api_key: None,
        base_url: None,
        model_id: request.model_id,
        messages: request.messages,
        working_directory: request.working_directory,
        allowed_tools: request.allowed_tools,
        system_prompt: None,
        max_tokens: None,
        tools: None,
        cli_output_format: request.cli_output_format,
        json_schema: request.json_schema,
        extra_cli_args: request.extra_cli_args,
        mcp_servers: request.mcp_servers,
        execution_mode: None,
        response_mode: None,
    };

    // 调用策略执行
    let registry = get_registry().await;
    let registry = registry.read().await;
    registry
        .execute(app, unified_request)
        .await
        .map_err(|e| e.to_string())
}

/// 执行 Codex CLI 命令（向后兼容）
#[tauri::command]
pub async fn execute_codex_cli(app: AppHandle, request: CliExecutionRequest) -> Result<(), String> {
    // 转换为统一请求格式
    let unified_request = ExecutionRequest {
        session_id: request.session_id,
        agent_type: "cli".to_string(),
        provider: "codex".to_string(),
        cli_path: Some(request.cli_path),
        api_key: None,
        base_url: None,
        model_id: request.model_id,
        messages: request.messages,
        working_directory: request.working_directory,
        allowed_tools: request.allowed_tools,
        system_prompt: None,
        max_tokens: None,
        tools: None,
        cli_output_format: request.cli_output_format,
        json_schema: request.json_schema,
        extra_cli_args: request.extra_cli_args,
        mcp_servers: request.mcp_servers,
        execution_mode: None,
        response_mode: None,
    };

    // 调用策略执行
    let registry = get_registry().await;
    let registry = registry.read().await;
    registry
        .execute(app, unified_request)
        .await
        .map_err(|e| e.to_string())
}

/// 执行 Claude SDK API 调用（向后兼容）
#[tauri::command]
pub async fn execute_claude_sdk(
    app: AppHandle,
    request: SdkExecutionRequest,
) -> Result<(), String> {
    // 转换为统一请求格式
    let unified_request = ExecutionRequest {
        session_id: request.session_id,
        agent_type: "sdk".to_string(),
        provider: "claude".to_string(),
        cli_path: None,
        api_key: Some(request.api_key),
        base_url: request.base_url,
        model_id: Some(request.model_id),
        messages: request.messages,
        working_directory: None,
        allowed_tools: None,
        system_prompt: request.system_prompt,
        max_tokens: request.max_tokens,
        tools: request.tools,
        cli_output_format: None,
        json_schema: None,
        extra_cli_args: None,
        mcp_servers: request.mcp_servers,
        execution_mode: None,
        response_mode: None,
    };

    // 调用策略执行
    let registry = get_registry().await;
    let registry = registry.read().await;
    registry
        .execute(app, unified_request)
        .await
        .map_err(|e| e.to_string())
}
/// 执行 Codex SDK API 调用（新命令）
#[tauri::command]
pub async fn execute_codex_sdk(app: AppHandle, request: SdkExecutionRequest) -> Result<(), String> {
    // 转换为统一请求格式
    let unified_request = ExecutionRequest {
        session_id: request.session_id,
        agent_type: "sdk".to_string(),
        provider: "codex".to_string(),
        cli_path: None,
        api_key: Some(request.api_key),
        base_url: request.base_url,
        model_id: Some(request.model_id),
        messages: request.messages,
        working_directory: None,
        allowed_tools: None,
        system_prompt: request.system_prompt,
        max_tokens: request.max_tokens,
        tools: request.tools,
        cli_output_format: None,
        json_schema: None,
        extra_cli_args: None,
        mcp_servers: request.mcp_servers,
        execution_mode: None,
        response_mode: None,
    };

    // 调用策略执行
    let registry = get_registry().await;
    let registry = registry.read().await;
    registry
        .execute(app, unified_request)
        .await
        .map_err(|e| e.to_string())
}
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
