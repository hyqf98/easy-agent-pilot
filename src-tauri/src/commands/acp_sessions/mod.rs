//! ACP 会话查询模块入口 + Tauri command 定义。
//!
//! 提供 4 个 Tauri command，封装 ACP 协议的会话查询能力：
//! - `list_acp_sessions`：调用 `session/list` 获取会话列表
//! - `read_acp_session_history`：调用 `session/load` 回放会话历史
//! - `delete_session_by_id`：本地删除会话（ACP 无 delete 能力，走 fallback）
//! - `probe_acp_session_capabilities`：探测 Agent 的会话能力

pub(crate) mod query_service;
pub(crate) mod session_delete;
pub(crate) mod session_history;
pub(crate) mod session_list;
pub(crate) mod types;

use query_service::probe_capabilities;
use session_delete::delete_session_locally;
use session_history::read_session_history;
use session_list::list_sessions;

use types::{
    AcpCapabilities, AcpSessionHistoryResult, AcpSessionListResult,
};

/// 调用 ACP `session/list` 获取会话列表。
///
/// 支持可选的 `cwd` 参数按工作目录过滤。返回的 `project_paths` 是
/// 从所有会话中去重聚合的工作目录路径列表。
///
/// # 参数
/// - `agent_cmd`：ACP 命令（如 `"opencode"` / `"claude"` / `"codex"`）
/// - `cwd`：可选的工作目录过滤
#[tauri::command]
pub async fn list_acp_sessions(
    agent_cmd: String,
    cwd: Option<String>,
) -> Result<AcpSessionListResult, String> {
    list_sessions(&agent_cmd, cwd.as_deref()).await
}

/// 调用 ACP `session/load` 回放会话历史。
///
/// Agent 会通过 `session/update` 通知流式回放全部历史消息，
/// 所有事件被收集为 `AcpReplayedEvent` 列表返回。
///
/// # 参数
/// - `agent_cmd`：ACP 命令
/// - `session_id`：要回放的会话 ID
/// - `cwd`：工作目录
#[tauri::command]
pub async fn read_acp_session_history(
    agent_cmd: String,
    session_id: String,
    cwd: String,
) -> Result<AcpSessionHistoryResult, String> {
    read_session_history(&agent_cmd, &session_id, &cwd).await
}

/// 删除会话。
///
/// ACP 协议 0.11 版本不包含 `session/delete` 能力，
/// 因此直接走本地文件系统 / SQLite 删除。
///
/// # 参数
/// - `agent_cmd`：ACP 命令（用于判断 CLI 类型）
/// - `cli_name`：CLI 名称（`"opencode"` / `"claude"` / `"codex"`）
/// - `session_id`：要删除的会话 ID
/// - `_cwd`：工作目录（保留参数，当前未使用）
#[tauri::command]
pub async fn delete_session_by_id(
    _agent_cmd: String,
    cli_name: String,
    session_id: String,
    _cwd: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        delete_session_locally(&cli_name, &session_id)
    })
    .await
    .map_err(|e| format!("删除任务执行失败: {}", e))?
}

/// 探测 ACP Agent 的会话能力。
///
/// 建立 ACP 连接，读取 `initialize` 响应中的 `agentCapabilities.sessionCapabilities`，
/// 返回布尔值列表表示各能力是否支持。
///
/// # 参数
/// - `agent_cmd`：ACP 命令
#[tauri::command]
pub async fn probe_acp_session_capabilities(
    agent_cmd: String,
) -> Result<AcpCapabilities, String> {
    probe_capabilities(&agent_cmd).await
}