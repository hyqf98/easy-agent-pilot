use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnattendedChannel {
    pub id: String,
    pub channel_type: String,
    pub name: String,
    pub enabled: bool,
    pub default_project_id: Option<String>,
    pub default_agent_id: Option<String>,
    pub default_model_id: Option<String>,
    pub reply_style: String,
    pub allow_all_senders: bool,
    pub future_auth_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUnattendedChannelInput {
    pub channel_type: String,
    pub name: String,
    pub enabled: Option<bool>,
    pub default_project_id: Option<String>,
    pub default_agent_id: Option<String>,
    pub default_model_id: Option<String>,
    pub reply_style: Option<String>,
    pub allow_all_senders: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUnattendedChannelInput {
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub default_project_id: Option<String>,
    pub default_agent_id: Option<String>,
    pub default_model_id: Option<String>,
    pub reply_style: Option<String>,
    pub allow_all_senders: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnattendedChannelAccount {
    pub id: String,
    pub channel_id: String,
    pub account_id: String,
    pub user_id: Option<String>,
    pub base_url: String,
    pub bot_token: String,
    pub sync_cursor: Option<String>,
    pub login_status: String,
    pub runtime_status: String,
    pub last_connected_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnattendedThread {
    pub id: String,
    pub channel_account_id: String,
    pub peer_id: String,
    pub peer_name_snapshot: Option<String>,
    pub session_id: Option<String>,
    pub active_project_id: Option<String>,
    pub active_agent_id: Option<String>,
    pub active_model_id: Option<String>,
    pub last_context_token: Option<String>,
    pub last_plan_id: Option<String>,
    pub last_task_id: Option<String>,
    pub last_message_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUnattendedThreadContextInput {
    pub session_id: Option<String>,
    pub active_project_id: Option<String>,
    pub active_agent_id: Option<String>,
    pub active_model_id: Option<String>,
    pub last_context_token: Option<String>,
    pub last_plan_id: Option<String>,
    pub last_task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnattendedEventRecord {
    pub id: String,
    pub channel_account_id: Option<String>,
    pub thread_id: Option<String>,
    pub direction: String,
    pub event_type: String,
    pub status: String,
    pub summary: Option<String>,
    pub payload_json: Option<String>,
    pub correlation_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordUnattendedEventInput {
    pub channel_account_id: Option<String>,
    pub thread_id: Option<String>,
    pub direction: String,
    pub event_type: String,
    pub status: Option<String>,
    pub summary: Option<String>,
    pub payload_json: Option<String>,
    pub correlation_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListUnattendedEventsInput {
    pub channel_account_id: Option<String>,
    pub thread_id: Option<String>,
    pub event_type: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatusSummary {
    pub account_id: String,
    pub channel_account_id: String,
    pub runtime_status: String,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginQrCode {
    pub qrcode: String,
    pub qrcode_img: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginStatus {
    pub status: String,
    pub bot_token: Option<String>,
    pub base_url: Option<String>,
    pub account_id: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnattendedInboundMessage {
    pub message_id: String,
    pub channel_id: String,
    pub channel_account_id: String,
    pub thread_id: String,
    pub peer_id: String,
    pub text: String,
    pub context_token: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatusEvent {
    pub channel_account_id: String,
    pub runtime_status: String,
    pub last_error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendUnattendedTextInput {
    pub channel_account_id: String,
    pub peer_id: String,
    pub text: String,
    pub context_token: Option<String>,
    pub correlation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinMessage {
    pub id: String,
    pub from_user_id: String,
    pub create_time_ms: i64,
    pub text: Option<String>,
    pub context_token: Option<String>,
    pub is_outgoing: bool,
}
