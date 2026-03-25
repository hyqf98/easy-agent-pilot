use tauri::AppHandle;

use super::channels::weixin::api::WeixinClient;
use super::constants::CHANNEL_TYPE_WEIXIN;
use super::repository;
use super::runtime;
use super::types::{
    CreateUnattendedChannelInput, ListUnattendedEventsInput, RecordUnattendedEventInput,
    RuntimeStatusSummary, SendUnattendedTextInput, UnattendedChannel, UnattendedChannelAccount,
    UnattendedEventRecord, UnattendedThread, UpdateUnattendedChannelInput,
    UpdateUnattendedThreadContextInput, WeixinLoginQrCode, WeixinLoginStatus,
};

/// 列出无人值守渠道配置。
#[tauri::command]
pub fn list_unattended_channels() -> Result<Vec<UnattendedChannel>, String> {
    repository::list_channels()
}

/// 创建无人值守渠道配置。
#[tauri::command]
pub fn create_unattended_channel(
    input: CreateUnattendedChannelInput,
) -> Result<UnattendedChannel, String> {
    repository::create_channel(input)
}

/// 更新无人值守渠道配置。
#[tauri::command]
pub fn update_unattended_channel(
    id: String,
    input: UpdateUnattendedChannelInput,
) -> Result<UnattendedChannel, String> {
    repository::update_channel(id, input)
}

/// 删除无人值守渠道配置。
#[tauri::command]
pub fn delete_unattended_channel(id: String) -> Result<(), String> {
    repository::delete_channel(id)
}

/// 列出渠道账号。
#[tauri::command]
pub fn list_unattended_channel_accounts(
    channel_id: Option<String>,
) -> Result<Vec<UnattendedChannelAccount>, String> {
    repository::list_accounts(channel_id)
}

/// 启动微信扫码登录流程。
#[tauri::command]
pub async fn start_unattended_weixin_login(channel_id: String) -> Result<WeixinLoginQrCode, String> {
    let channel = repository::get_channel(&channel_id)?;
    if channel.channel_type != CHANNEL_TYPE_WEIXIN {
        return Err("仅支持微信渠道".to_string());
    }
    let client = WeixinClient::with_base_url(
        super::constants::DEFAULT_WEIXIN_BASE_URL.to_string(),
    )
    .map_err(|e| e.to_string())?;
    client.get_bot_qrcode().await.map_err(|e| e.to_string())
}

/// 轮询微信扫码状态，确认后自动持久化账号。
#[tauri::command]
pub async fn get_unattended_weixin_login_status(
    app: AppHandle,
    channel_id: String,
    qrcode: String,
) -> Result<WeixinLoginStatus, String> {
    let channel = repository::get_channel(&channel_id)?;
    if channel.channel_type != CHANNEL_TYPE_WEIXIN {
        return Err("仅支持微信渠道".to_string());
    }
    let client = WeixinClient::with_base_url(
        super::constants::DEFAULT_WEIXIN_BASE_URL.to_string(),
    )
    .map_err(|e| e.to_string())?;
    let status = client
        .get_qrcode_status(&qrcode)
        .await
        .map_err(|e| e.to_string())?;
    if status.status == "confirmed" {
        let _ = repository::upsert_weixin_account(&channel_id, &status)?;
        runtime::start_channel_runtime(&app, &channel_id).await?;
    }
    Ok(status)
}

/// 移除无人值守账号。
#[tauri::command]
pub fn logout_unattended_account(account_row_id: String) -> Result<(), String> {
    repository::delete_account(&account_row_id)
}

/// 启动渠道运行时。
#[tauri::command]
pub async fn start_unattended_runtime(app: AppHandle, channel_id: String) -> Result<(), String> {
    runtime::start_channel_runtime(&app, &channel_id).await
}

/// 停止渠道运行时。
#[tauri::command]
pub async fn stop_unattended_runtime(app: AppHandle, channel_id: String) -> Result<(), String> {
    runtime::stop_channel_runtime(&app, &channel_id).await
}

/// 列出运行时状态。
#[tauri::command]
pub fn list_unattended_runtime_status(
    channel_id: Option<String>,
) -> Result<Vec<RuntimeStatusSummary>, String> {
    repository::list_runtime_status(channel_id)
}

/// 列出远程线程。
#[tauri::command]
pub fn list_unattended_threads(channel_id: Option<String>) -> Result<Vec<UnattendedThread>, String> {
    repository::list_threads(channel_id)
}

/// 更新远程线程上下文。
#[tauri::command]
pub fn update_unattended_thread_context(
    thread_id: String,
    input: UpdateUnattendedThreadContextInput,
) -> Result<UnattendedThread, String> {
    repository::update_thread_context(&thread_id, input)
}

/// 列出审计事件。
#[tauri::command]
pub fn list_unattended_events(
    input: Option<ListUnattendedEventsInput>,
) -> Result<Vec<UnattendedEventRecord>, String> {
    repository::list_events(input)
}

/// 写入审计事件。
#[tauri::command]
pub fn record_unattended_event(
    input: RecordUnattendedEventInput,
) -> Result<UnattendedEventRecord, String> {
    repository::record_event(input)
}

/// 发送文本到当前无人值守渠道。
#[tauri::command]
pub async fn send_unattended_text(
    app: AppHandle,
    input: SendUnattendedTextInput,
) -> Result<(), String> {
    runtime::send_text(
        &app,
        &input.channel_account_id,
        &input.peer_id,
        &input.text,
        input.context_token.as_deref(),
        input.correlation_id.as_deref(),
    )
    .await
}
