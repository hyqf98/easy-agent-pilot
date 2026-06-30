use serde::{Deserialize, Serialize};

use crate::commands::message::MessageAttachment;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport_type: String,
    pub command: Option<String>,
    pub args: Option<String>,
    pub env: Option<String>,
    pub url: Option<String>,
    pub headers: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionRequest {
    pub session_id: String,
    pub request_id: String,
    pub plan_id: Option<String>,
    pub acp_command: String,
    pub messages: Vec<MessageInput>,
    pub working_directory: Option<String>,
    pub system_prompt: Option<String>,
    pub mcp_servers: Option<Vec<McpServerConfig>>,
    pub execution_mode: Option<String>,
    pub reasoning_effort: Option<String>,
    /// 子代理/会话选定的模型 ID，经 ACP config option 回填给执行器。
    pub model_id: Option<String>,
    /// 记忆库仓库运行时：是否向 ACP 会话注入内置 MCP 工具（查询对话历史）。
    #[serde(default)]
    pub internal_tools_enabled: bool,
    /// 记忆库仓库 ID，决定内置工具查询的数据源范围（配合 internal_tools_enabled）。
    pub repo_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInput {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub attachments: Option<Vec<MessageAttachment>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_session_id: Option<String>,
    /// ACP 权限询问时携带的可选项（仅 permission_request 事件使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_options: Option<Vec<PermissionOptionView>>,
    /// 文件变更（仅 file_edit 事件使用）：ACP Diff 捕获到的修改前/后内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_edit: Option<FileEditView>,
}

/// 文件变更的前端视图（ACP Diff → create/modify/delete）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEditView {
    pub tool_call_id: String,
    pub file_path: String,
    pub relative_path: String,
    /// create / modify / delete
    pub change_type: String,
    /// 修改前内容（新建文件为 None）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before_content: Option<String>,
    /// 修改后内容（删除文件为空串）
    pub after_content: String,
}

/// ACP 权限选项的前端视图（option_id / 名称 / 类型）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOptionView {
    pub option_id: String,
    pub name: String,
    pub kind: String,
}

pub type AcpStreamEvent = StreamEvent;
