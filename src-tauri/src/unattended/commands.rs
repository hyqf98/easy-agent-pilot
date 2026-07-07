use tauri::AppHandle;

use crate::logging::write_log;

use super::channels::weixin::api::WeixinClient;
use super::constants::CHANNEL_TYPE_WEIXIN;
use super::repository;
use super::runtime;
use super::structured;
use super::types::{
    CreateUnattendedChannelInput, ListUnattendedEventsInput,
    ProcessUnattendedStructuredIntentInput, ProcessUnattendedStructuredIntentResult,
    RecordUnattendedEventInput, RuntimeStatusSummary, SendUnattendedTextInput, UnattendedChannel,
    UnattendedChannelAccount, UnattendedEventRecord, UnattendedThread,
    UpdateUnattendedChannelInput, UpdateUnattendedThreadContextInput, WeixinLoginQrCode,
    WeixinLoginStatus,
};

const LOGIN_LOG_TARGET: &str = "unattended.weixin.login";

/// 列出无人值守渠道配置。
#[tauri::command]
pub async fn list_unattended_channels() -> Result<Vec<UnattendedChannel>, String> {
    repository::list_channels().await
}

/// 创建无人值守渠道配置。
#[tauri::command]
pub async fn create_unattended_channel(
    input: CreateUnattendedChannelInput,
) -> Result<UnattendedChannel, String> {
    repository::create_channel(input).await
}

/// 更新无人值守渠道配置。
#[tauri::command]
pub async fn update_unattended_channel(
    id: String,
    input: UpdateUnattendedChannelInput,
) -> Result<UnattendedChannel, String> {
    repository::update_channel(id, input).await
}

/// 删除无人值守渠道配置。
#[tauri::command]
pub async fn delete_unattended_channel(id: String) -> Result<(), String> {
    repository::delete_channel(id).await
}

/// 列出渠道账号。
#[tauri::command]
pub async fn list_unattended_channel_accounts(
    channel_id: Option<String>,
) -> Result<Vec<UnattendedChannelAccount>, String> {
    repository::list_accounts(channel_id).await
}

/// 启动微信扫码登录流程。
#[tauri::command]
pub async fn start_unattended_weixin_login(
    channel_id: String,
) -> Result<WeixinLoginQrCode, String> {
    write_log(
        "INFO",
        LOGIN_LOG_TARGET,
        &format!("start_weixin_login begin: channel_id={channel_id}"),
    );
    let channel = repository::get_channel(&channel_id).await?;
    if channel.channel_type != CHANNEL_TYPE_WEIXIN {
        return Err("仅支持微信渠道".to_string());
    }
    let client = WeixinClient::with_base_url(super::constants::DEFAULT_WEIXIN_BASE_URL.to_string())
        .map_err(|e| e.to_string())?;
    let qr = client.get_bot_qrcode().await.map_err(|error| {
        let message = format!("start_weixin_login failed: channel_id={channel_id}, error={error}");
        write_log("ERROR", LOGIN_LOG_TARGET, &message);
        message
    })?;
    write_log(
        "INFO",
        LOGIN_LOG_TARGET,
        &format!(
            "start_weixin_login success: channel_id={}, qrcode_len={}, image_len={}",
            channel_id,
            qr.qrcode.len(),
            qr.qrcode_img.len()
        ),
    );
    Ok(qr)
}

/// 轮询微信扫码状态，确认后自动持久化账号。
#[tauri::command]
pub async fn get_unattended_weixin_login_status(
    app: AppHandle,
    channel_id: String,
    qrcode: String,
) -> Result<WeixinLoginStatus, String> {
    write_log(
        "INFO",
        LOGIN_LOG_TARGET,
        &format!(
            "poll_weixin_login begin: channel_id={}, qrcode={}",
            channel_id,
            mask_qrcode(&qrcode)
        ),
    );
    let channel = repository::get_channel(&channel_id).await?;
    if channel.channel_type != CHANNEL_TYPE_WEIXIN {
        return Err("仅支持微信渠道".to_string());
    }
    let client = WeixinClient::with_base_url(super::constants::DEFAULT_WEIXIN_BASE_URL.to_string())
        .map_err(|e| e.to_string())?;
    let status = client.get_qrcode_status(&qrcode).await.map_err(|error| {
        let message = format!(
            "poll_weixin_login failed: channel_id={}, qrcode={}, error={error}",
            channel_id,
            mask_qrcode(&qrcode)
        );
        write_log("ERROR", LOGIN_LOG_TARGET, &message);
        message
    })?;
    write_log(
        "INFO",
        LOGIN_LOG_TARGET,
        &format!(
            "poll_weixin_login status: channel_id={}, qrcode={}, status={}, has_bot_token={}, has_base_url={}, account_id={}, user_id={}",
            channel_id,
            mask_qrcode(&qrcode),
            status.status,
            status.bot_token.is_some(),
            status.base_url.is_some(),
            status.account_id.as_deref().unwrap_or(""),
            status.user_id.as_deref().unwrap_or("")
        ),
    );
    if status.status == "confirmed" {
        let account = repository::upsert_weixin_account(&channel_id, &status).await?;
        write_log(
            "INFO",
            LOGIN_LOG_TARGET,
            &format!(
                "poll_weixin_login persisted account: channel_id={}, account_row_id={}, remote_account_id={}",
                channel_id, account.id, account.account_id
            ),
        );
        runtime::start_channel_runtime(&app, &channel_id)
            .await
            .map_err(|error| {
                let message = format!(
                    "poll_weixin_login runtime_start_failed: channel_id={}, account_row_id={}, error={error}",
                    channel_id, account.id
                );
                write_log("ERROR", LOGIN_LOG_TARGET, &message);
                message
            })?;
        write_log(
            "INFO",
            LOGIN_LOG_TARGET,
            &format!(
                "poll_weixin_login runtime_started: channel_id={}, account_row_id={}",
                channel_id, account.id
            ),
        );
    }
    Ok(status)
}

fn mask_qrcode(value: &str) -> String {
    let char_count = value.chars().count();
    if char_count <= 12 {
        return "***".to_string();
    }

    let prefix: String = value.chars().take(8).collect();
    let suffix: String = value
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{prefix}...{suffix}")
}

/// 移除无人值守账号。
#[tauri::command]
pub async fn logout_unattended_account(account_row_id: String) -> Result<(), String> {
    repository::delete_account(&account_row_id).await
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
pub async fn list_unattended_runtime_status(
    channel_id: Option<String>,
) -> Result<Vec<RuntimeStatusSummary>, String> {
    repository::list_runtime_status(channel_id).await
}

/// 列出远程线程。
#[tauri::command]
pub async fn list_unattended_threads(
    channel_id: Option<String>,
) -> Result<Vec<UnattendedThread>, String> {
    repository::list_threads(channel_id).await
}

/// 更新远程线程上下文。
#[tauri::command]
pub async fn update_unattended_thread_context(
    thread_id: String,
    input: UpdateUnattendedThreadContextInput,
) -> Result<UnattendedThread, String> {
    repository::update_thread_context(&thread_id, input).await
}

/// 列出审计事件。
#[tauri::command]
pub async fn list_unattended_events(
    input: Option<ListUnattendedEventsInput>,
) -> Result<Vec<UnattendedEventRecord>, String> {
    repository::list_events(input).await
}

/// 写入审计事件。
#[tauri::command]
pub async fn record_unattended_event(
    input: RecordUnattendedEventInput,
) -> Result<UnattendedEventRecord, String> {
    repository::record_event(input).await
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

/// 在后端执行无人值守结构化意图。
///
/// 用途：
/// - 将项目切换、计划/任务查询与基础增改逻辑下沉到后端
/// - 让无人值守线程在前端未持有完整业务状态时仍可依赖后端执行结构化动作
#[tauri::command]
pub fn process_unattended_structured_intent(
    input: ProcessUnattendedStructuredIntentInput,
) -> Result<ProcessUnattendedStructuredIntentResult, String> {
    structured::process_structured_intent(input)
}
