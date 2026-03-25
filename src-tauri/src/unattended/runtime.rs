use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

use super::channels::weixin::api::{WeixinApiError, WeixinClient};
use super::constants::{
    DIRECTION_INBOUND, DIRECTION_OUTBOUND, EVENT_TYPE_INBOUND_MESSAGE, EVENT_TYPE_OUTBOUND_MESSAGE,
    FRONTEND_EVENT_INCOMING, FRONTEND_EVENT_STATUS, RUNTIME_STATUS_ERROR, RUNTIME_STATUS_LISTENING,
    RUNTIME_STATUS_STOPPED,
};
use super::repository;
use super::types::{
    RecordUnattendedEventInput, RuntimeStatusEvent, UnattendedInboundMessage,
    WeixinMessage,
};

#[derive(Default)]
pub struct UnattendedRuntimeState {
    tasks: Arc<RwLock<HashMap<String, JoinHandle<()>>>>,
}

impl UnattendedRuntimeState {
    async fn has_task(&self, account_row_id: &str) -> bool {
        self.tasks.read().await.contains_key(account_row_id)
    }

    async fn insert_task(&self, account_row_id: String, handle: JoinHandle<()>) {
        self.tasks.write().await.insert(account_row_id, handle);
    }

    async fn take_task(&self, account_row_id: &str) -> Option<JoinHandle<()>> {
        self.tasks.write().await.remove(account_row_id)
    }
}

/// 启动指定渠道下所有账号的监听循环。
pub async fn start_channel_runtime(app: &AppHandle, channel_id: &str) -> Result<(), String> {
    let state = app.state::<UnattendedRuntimeState>();
    let accounts = repository::list_accounts(Some(channel_id.to_string()))?;

    for account in accounts {
        if state.has_task(&account.id).await {
            continue;
        }

        repository::update_account_runtime_status(&account.id, RUNTIME_STATUS_LISTENING, None)?;
        let _ = app.emit(
            FRONTEND_EVENT_STATUS,
            RuntimeStatusEvent {
                channel_account_id: account.id.clone(),
                runtime_status: RUNTIME_STATUS_LISTENING.to_string(),
                last_error: None,
            },
        );

        let app_handle = app.clone();
        let account_row_id = account.id.clone();
        let cleanup_account_row_id = account.id.clone();
        let channel_id = account.channel_id.clone();
        let tasks = state.tasks.clone();
        let handle = tokio::spawn(async move {
            let _ = run_weixin_loop(
                app_handle,
                account_row_id,
                channel_id,
                account.base_url,
                account.bot_token,
                account.sync_cursor,
            )
            .await;
            tasks.write().await.remove(&cleanup_account_row_id);
        });
        state.insert_task(account.id.clone(), handle).await;
    }

    Ok(())
}

/// 恢复所有已启用渠道的监听循环，复用已持久化的微信 token。
pub async fn restore_runtime(app: &AppHandle) -> Result<(), String> {
    let channels = repository::list_channels()?;

    for channel in channels.into_iter().filter(|item| item.enabled) {
        let accounts = repository::list_accounts(Some(channel.id.clone()))?;
        if accounts.is_empty() {
            continue;
        }

        if let Err(error) = start_channel_runtime(app, &channel.id).await {
            crate::logging::write_log(
                "ERROR",
                "unattended",
                &format!(
                    "failed to restore unattended runtime for channel {}: {}",
                    channel.id, error
                ),
            );
        }
    }

    Ok(())
}

/// 停止指定渠道下所有账号的监听循环。
pub async fn stop_channel_runtime(app: &AppHandle, channel_id: &str) -> Result<(), String> {
    let state = app.state::<UnattendedRuntimeState>();
    let accounts = repository::list_accounts(Some(channel_id.to_string()))?;

    for account in accounts {
        if let Some(handle) = state.take_task(&account.id).await {
            handle.abort();
        }
        repository::update_account_runtime_status(&account.id, RUNTIME_STATUS_STOPPED, None)?;
        let _ = app.emit(
            FRONTEND_EVENT_STATUS,
            RuntimeStatusEvent {
                channel_account_id: account.id.clone(),
                runtime_status: RUNTIME_STATUS_STOPPED.to_string(),
                last_error: None,
            },
        );
    }

    Ok(())
}

async fn run_weixin_loop(
    app: AppHandle,
    account_row_id: String,
    channel_id: String,
    base_url: String,
    bot_token: String,
    mut sync_cursor: Option<String>,
) -> Result<(), String> {
    let client = WeixinClient::with_base_url(base_url).map_err(|e| e.to_string())?;
    let (final_status, final_error) = loop {
        match client
            .get_updates(&bot_token, sync_cursor.as_deref())
            .await
        {
            Ok((next_cursor, messages)) => {
                if let Some(cursor) = next_cursor.clone() {
                    repository::update_account_sync_cursor(&account_row_id, Some(&cursor))?;
                    sync_cursor = Some(cursor);
                }

                repository::update_account_runtime_status(&account_row_id, RUNTIME_STATUS_LISTENING, None)?;

                for message in messages {
                    handle_incoming_message(&app, &channel_id, &account_row_id, message).await?;
                }
            }
            Err(WeixinApiError::SessionExpired | WeixinApiError::InvalidToken) => {
                let error_message = "微信 token 已失效，需要重新扫码登录".to_string();
                repository::update_account_runtime_status(
                    &account_row_id,
                    RUNTIME_STATUS_ERROR,
                    Some(&error_message),
                )?;
                let _ = app.emit(
                    FRONTEND_EVENT_STATUS,
                    RuntimeStatusEvent {
                        channel_account_id: account_row_id.clone(),
                        runtime_status: RUNTIME_STATUS_ERROR.to_string(),
                        last_error: Some(error_message.clone()),
                    },
                );
                break (RUNTIME_STATUS_ERROR.to_string(), Some(error_message));
            }
            Err(error) => {
                let error_message = error.to_string();
                repository::update_account_runtime_status(
                    &account_row_id,
                    RUNTIME_STATUS_ERROR,
                    Some(&error_message),
                )?;
                let _ = app.emit(
                    FRONTEND_EVENT_STATUS,
                    RuntimeStatusEvent {
                        channel_account_id: account_row_id.clone(),
                        runtime_status: RUNTIME_STATUS_ERROR.to_string(),
                        last_error: Some(error_message.clone()),
                    },
                );
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    };
    repository::update_account_runtime_status(
        &account_row_id,
        &final_status,
        final_error.as_deref(),
    )?;
    let _ = app.emit(
        FRONTEND_EVENT_STATUS,
        RuntimeStatusEvent {
            channel_account_id: account_row_id,
            runtime_status: final_status,
            last_error: final_error,
        },
    );
    Ok(())
}

async fn handle_incoming_message(
    app: &AppHandle,
    channel_id: &str,
    account_row_id: &str,
    message: WeixinMessage,
) -> Result<(), String> {
    let thread = repository::upsert_thread(
        account_row_id,
        &message.from_user_id,
        None,
        message.context_token.as_deref(),
    )?;
    let created_at = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(message.create_time_ms)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339();
    let text = message.text.unwrap_or_default();

    repository::record_event(RecordUnattendedEventInput {
        channel_account_id: Some(account_row_id.to_string()),
        thread_id: Some(thread.id.clone()),
        direction: DIRECTION_INBOUND.to_string(),
        event_type: EVENT_TYPE_INBOUND_MESSAGE.to_string(),
        status: Some("success".to_string()),
        summary: Some(text.chars().take(80).collect()),
        payload_json: Some(
            serde_json::json!({
                "messageId": message.id,
                "peerId": thread.peer_id,
                "text": text,
                "contextToken": message.context_token,
            })
            .to_string(),
        ),
        correlation_id: Some(message.id.clone()),
    })?;

    let _ = app.emit(
        FRONTEND_EVENT_INCOMING,
        UnattendedInboundMessage {
            message_id: message.id,
            channel_id: channel_id.to_string(),
            channel_account_id: account_row_id.to_string(),
            thread_id: thread.id,
            peer_id: thread.peer_id,
            text,
            context_token: message.context_token,
            created_at,
        },
    );

    Ok(())
}

/// 发送无人值守文本消息并记审计日志。
pub async fn send_text(
    app: &AppHandle,
    channel_account_id: &str,
    peer_id: &str,
    text: &str,
    context_token: Option<&str>,
    correlation_id: Option<&str>,
) -> Result<(), String> {
    let account = repository::get_account(channel_account_id)?;
    let client = WeixinClient::with_base_url(account.base_url.clone()).map_err(|e| e.to_string())?;
    let message = client
        .send_text_message(&account.bot_token, peer_id, context_token, text)
        .await
        .map_err(|e| e.to_string())?;

    let thread = repository::upsert_thread(channel_account_id, peer_id, None, context_token)?;
    repository::record_event(RecordUnattendedEventInput {
        channel_account_id: Some(channel_account_id.to_string()),
        thread_id: Some(thread.id),
        direction: DIRECTION_OUTBOUND.to_string(),
        event_type: EVENT_TYPE_OUTBOUND_MESSAGE.to_string(),
        status: Some("success".to_string()),
        summary: Some(text.chars().take(80).collect()),
        payload_json: Some(
            serde_json::json!({
                "messageId": message.id,
                "peerId": peer_id,
                "text": text,
                "contextToken": context_token,
            })
            .to_string(),
        ),
        correlation_id: correlation_id.map(str::to_string),
    })?;

    let _ = app.emit(
        FRONTEND_EVENT_STATUS,
        RuntimeStatusEvent {
            channel_account_id: channel_account_id.to_string(),
            runtime_status: RUNTIME_STATUS_LISTENING.to_string(),
            last_error: None,
        },
    );

    Ok(())
}
