//! ACP 会话查询模块的本地类型定义。
//!
//! 将 `agent-client-protocol` 的 schema 类型映射为前端兼容的简化结构，
//! 避免 ACP 库类型直接暴露给 Tauri command 序列化层。

use serde::{Deserialize, Serialize};

/// ACP `session/list` 返回的单条会话信息（映射到前端兼容格式）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionInfo {
    /// 会话唯一 ID
    pub session_id: String,
    /// 工作目录（绝对路径）
    pub cwd: String,
    /// 会话标题（可能为空）
    pub title: Option<String>,
    /// 最后活动时间（ISO 8601）
    pub updated_at: Option<String>,
    /// 消息数量（可能不提供）
    pub message_count: Option<u64>,
}

/// `session/list` 的完整结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionListResult {
    /// 当前页的会话列表
    pub sessions: Vec<AcpSessionInfo>,
    /// 分页游标（如果 Agent 支持分页）
    pub next_cursor: Option<String>,
    /// 去重后的工作目录路径列表
    pub project_paths: Vec<String>,
}

/// `session/load` 回放的单个事件（从 `SessionUpdate` 映射）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpReplayedEvent {
    /// 事件类型：`user_message` / `agent_message` / `agent_thought` / `tool_call` / `tool_result` / `usage`
    pub event_type: String,
    /// 文本内容
    pub content: Option<String>,
    /// 角色（仅消息类事件）
    pub role: Option<String>,
    /// 工具调用 ID
    pub tool_call_id: Option<String>,
    /// 工具名称
    pub tool_name: Option<String>,
    /// 工具输入（JSON 字符串）
    pub tool_input: Option<String>,
    /// 工具执行结果文本
    pub tool_result: Option<String>,
    /// 输入 token 数
    pub input_tokens: Option<u32>,
    /// 输出 token 数
    pub output_tokens: Option<u32>,
}

/// `session/load` 回放的完整结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionHistoryResult {
    /// 会话 ID
    pub session_id: String,
    /// 回放事件列表（按时间顺序）
    pub events: Vec<AcpReplayedEvent>,
}

/// Agent 的会话能力探测结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpCapabilities {
    /// 是否支持 `session/list`
    pub supports_list: bool,
    /// 是否支持 `session/load`
    pub supports_load: bool,
    /// 是否支持 `session/delete`（当前协议版本中暂无此能力）
    pub supports_delete: bool,
    /// 是否支持 `session/close`
    pub supports_close: bool,
    /// 是否支持 `session/resume`
    pub supports_resume: bool,
}

impl Default for AcpCapabilities {
    fn default() -> Self {
        Self {
            supports_list: false,
            supports_load: false,
            supports_delete: false,
            supports_close: false,
            supports_resume: false,
        }
    }
}