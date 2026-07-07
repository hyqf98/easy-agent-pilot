//! 无人值守渠道/账号/线程/审计事件的持久化层（rbatis）。
//!
//! 所有函数均为 `async`，通过 `db::rb()`（全局 RBatis 单例）访问数据库，
//! 不再依赖 rusqlite。事务使用 `db::rb().acquire_begin().await?`。
//!
//! 布尔列（enabled / allow_all_senders）在 SQLite 中存为 INTEGER，本层用
//! `Option<i64>` 读写并 `!= 0` 还原为 bool。

use crate::commands::support::now_rfc3339;
use crate::db;
use crate::mappers::unattended as mapper;
use crate::mappers::unattended::{
    ChannelWriteRow, EventInsertRow, EventListRow, ThreadContextUpdateRow, ThreadInsertRow,
    ThreadTouchRow, WeixinAccountUpsert,
};
use crate::models::{
    value_to_json_string_opt, UnattendedAccountRow, UnattendedChannelRow, UnattendedEventRow,
    UnattendedThreadRow,
};

use super::constants::{
    AUTH_MODE_ALLOW_ALL, LOGIN_STATUS_CONNECTED, REPLY_STYLE_FINAL_ONLY, RUNTIME_STATUS_IDLE,
};
use super::types::{
    CreateUnattendedChannelInput, ListUnattendedEventsInput, RecordUnattendedEventInput,
    RuntimeStatusSummary, UnattendedChannel, UnattendedChannelAccount, UnattendedEventRecord,
    UnattendedThread, UpdateUnattendedChannelInput, UpdateUnattendedThreadContextInput,
    WeixinLoginStatus,
};

// ==================== Row → DTO 转换 ====================

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn channel_row_to_dto(row: UnattendedChannelRow) -> Result<UnattendedChannel, String> {
    Ok(UnattendedChannel {
        id: row.id.ok_or_else(|| "missing id".to_string())?,
        channel_type: row.channel_type.ok_or_else(|| "missing channel_type".to_string())?,
        name: row.name.ok_or_else(|| "missing name".to_string())?,
        enabled: row.enabled.unwrap_or(0) != 0,
        default_project_id: row.default_project_id,
        default_agent_id: row.default_agent_id,
        default_model_id: row.default_model_id,
        reply_style: row.reply_style.ok_or_else(|| "missing reply_style".to_string())?,
        allow_all_senders: row.allow_all_senders.unwrap_or(0) != 0,
        future_auth_mode: row
            .future_auth_mode
            .ok_or_else(|| "missing future_auth_mode".to_string())?,
        created_at: row.created_at.ok_or_else(|| "missing created_at".to_string())?,
        updated_at: row.updated_at.ok_or_else(|| "missing updated_at".to_string())?,
    })
}

fn account_row_to_dto(row: UnattendedAccountRow) -> Result<UnattendedChannelAccount, String> {
    Ok(UnattendedChannelAccount {
        id: row.id.ok_or_else(|| "missing id".to_string())?,
        channel_id: row.channel_id.ok_or_else(|| "missing channel_id".to_string())?,
        account_id: row.account_id.ok_or_else(|| "missing account_id".to_string())?,
        user_id: row.user_id,
        base_url: row.base_url.ok_or_else(|| "missing base_url".to_string())?,
        bot_token: row.bot_token.ok_or_else(|| "missing bot_token".to_string())?,
        sync_cursor: row.sync_cursor,
        login_status: row.login_status.ok_or_else(|| "missing login_status".to_string())?,
        runtime_status: row
            .runtime_status
            .ok_or_else(|| "missing runtime_status".to_string())?,
        last_connected_at: row.last_connected_at,
        last_error: row.last_error,
        created_at: row.created_at.ok_or_else(|| "missing created_at".to_string())?,
        updated_at: row.updated_at.ok_or_else(|| "missing updated_at".to_string())?,
    })
}

fn thread_row_to_dto(row: UnattendedThreadRow) -> Result<UnattendedThread, String> {
    Ok(UnattendedThread {
        id: row.id.ok_or_else(|| "missing id".to_string())?,
        channel_account_id: row
            .channel_account_id
            .ok_or_else(|| "missing channel_account_id".to_string())?,
        peer_id: row.peer_id.ok_or_else(|| "missing peer_id".to_string())?,
        peer_name_snapshot: row.peer_name_snapshot,
        session_id: row.session_id,
        active_project_id: row.active_project_id,
        active_agent_id: row.active_agent_id,
        active_model_id: row.active_model_id,
        last_context_token: row.last_context_token,
        last_plan_id: row.last_plan_id,
        last_task_id: row.last_task_id,
        last_message_at: row.last_message_at,
        created_at: row.created_at.ok_or_else(|| "missing created_at".to_string())?,
        updated_at: row.updated_at.ok_or_else(|| "missing updated_at".to_string())?,
    })
}

fn event_row_to_dto(row: UnattendedEventRow) -> Result<UnattendedEventRecord, String> {
    Ok(UnattendedEventRecord {
        id: row.id.ok_or_else(|| "missing id".to_string())?,
        channel_account_id: row.channel_account_id,
        thread_id: row.thread_id,
        direction: row.direction.ok_or_else(|| "missing direction".to_string())?,
        event_type: row.event_type.ok_or_else(|| "missing event_type".to_string())?,
        status: row.status.ok_or_else(|| "missing status".to_string())?,
        summary: row.summary,
        payload_json: value_to_json_string_opt(row.payload_json),
        correlation_id: row.correlation_id,
        created_at: row.created_at.ok_or_else(|| "missing created_at".to_string())?,
    })
}

// ============================================================================
// 渠道（unattended_channels）
// ============================================================================

/// 列出无人值守渠道配置。
pub async fn list_channels() -> Result<Vec<UnattendedChannel>, String> {
    let rows = mapper::list_channels(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(channel_row_to_dto).collect()
}

/// 创建无人值守渠道配置。
pub async fn create_channel(input: CreateUnattendedChannelInput) -> Result<UnattendedChannel, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let enabled = input.enabled.unwrap_or(true);
    let allow_all_senders = input.allow_all_senders.unwrap_or(true);
    let reply_style = input
        .reply_style
        .unwrap_or_else(|| REPLY_STYLE_FINAL_ONLY.to_string());

    let row = ChannelWriteRow {
        id: id.clone(),
        channel_type: input.channel_type,
        name: input.name,
        enabled: Some(bool_to_i64(enabled)),
        default_project_id: input.default_project_id,
        default_agent_id: input.default_agent_id,
        default_model_id: input.default_model_id,
        reply_style,
        allow_all_senders: Some(bool_to_i64(allow_all_senders)),
        future_auth_mode: Some(AUTH_MODE_ALLOW_ALL.to_string()),
        created_at: Some(now.clone()),
        updated_at: Some(now),
    };
    mapper::insert_channel(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    get_channel(&id).await
}

/// 更新无人值守渠道配置。
pub async fn update_channel(
    id: String,
    input: UpdateUnattendedChannelInput,
) -> Result<UnattendedChannel, String> {
    let current = get_channel(&id).await?;
    let now = now_rfc3339();
    let next_default_project_id = if input.default_project_id.is_some() {
        normalize_optional_text(input.default_project_id)
    } else {
        current.default_project_id
    };
    let next_default_agent_id = if input.default_agent_id.is_some() {
        normalize_optional_text(input.default_agent_id)
    } else {
        current.default_agent_id
    };
    let next_default_model_id = if input.default_model_id.is_some() {
        normalize_optional_text(input.default_model_id)
    } else {
        current.default_model_id
    };

    let row = ChannelWriteRow {
        id: id.clone(),
        channel_type: current.channel_type.clone(),
        name: input.name.unwrap_or(current.name),
        enabled: Some(bool_to_i64(input.enabled.unwrap_or(current.enabled))),
        default_project_id: next_default_project_id,
        default_agent_id: next_default_agent_id,
        default_model_id: next_default_model_id,
        reply_style: input.reply_style.unwrap_or(current.reply_style),
        allow_all_senders: Some(bool_to_i64(
            input.allow_all_senders.unwrap_or(current.allow_all_senders),
        )),
        future_auth_mode: Some(current.future_auth_mode.clone()),
        created_at: Some(current.created_at.clone()),
        updated_at: Some(now),
    };
    mapper::update_channel(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    get_channel(&id).await
}

/// 删除无人值守渠道配置。
pub async fn delete_channel(id: String) -> Result<(), String> {
    mapper::delete_channel(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取单个无人值守渠道。
pub async fn get_channel(id: &str) -> Result<UnattendedChannel, String> {
    let row = mapper::get_channel_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("渠道不存在: {id}"))?;
    channel_row_to_dto(row)
}

// ============================================================================
// 账号（unattended_channel_accounts）
// ============================================================================

/// 按渠道列出账号。
pub async fn list_accounts(channel_id: Option<String>) -> Result<Vec<UnattendedChannelAccount>, String> {
    let rows = mapper::list_accounts(db::rb(), channel_id.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(account_row_to_dto).collect()
}

/// 获取单个账号。
pub async fn get_account(account_row_id: &str) -> Result<UnattendedChannelAccount, String> {
    let row = mapper::get_account_by_id(db::rb(), account_row_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("账号不存在: {account_row_id}"))?;
    account_row_to_dto(row)
}

/// 通过登录状态更新或创建账号（事务）。
pub async fn upsert_weixin_account(
    channel_id: &str,
    login_status: &WeixinLoginStatus,
) -> Result<UnattendedChannelAccount, String> {
    let now = now_rfc3339();

    let account_id = login_status
        .account_id
        .clone()
        .ok_or_else(|| "缺少 account_id".to_string())?;
    let user_id = login_status.user_id.clone();
    let base_url = login_status
        .base_url
        .clone()
        .unwrap_or_else(|| super::constants::DEFAULT_WEIXIN_BASE_URL.to_string());
    let bot_token = login_status
        .bot_token
        .clone()
        .ok_or_else(|| "缺少 bot_token".to_string())?;

    // 事务：查询已有 id → upsert
    let mut tx = db::rb()
        .acquire_begin()
        .await
        .map_err(|e| e.to_string())?;

    let existing = mapper::get_account_id_by_channel_and_account(&tx, channel_id, &account_id)
        .await
        .map_err(|e| e.to_string())?;
    let row_id = existing
        .into_iter()
        .next()
        .and_then(|item| crate::models::value_to_json_string_opt(item.value))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let upsert = WeixinAccountUpsert {
        id: row_id.clone(),
        channel_id: channel_id.to_string(),
        account_id,
        user_id,
        base_url,
        bot_token,
        login_status: LOGIN_STATUS_CONNECTED.to_string(),
        runtime_status: RUNTIME_STATUS_IDLE.to_string(),
        last_connected_at: now.clone(),
        created_at: now.clone(),
        updated_at: now,
    };
    mapper::upsert_weixin_account(&tx, &upsert)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    get_account(&row_id).await
}

/// 删除无人值守账号。
pub async fn delete_account(account_row_id: &str) -> Result<(), String> {
    mapper::delete_account(db::rb(), account_row_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 更新账号运行状态。
pub async fn update_account_runtime_status(
    account_row_id: &str,
    runtime_status: &str,
    last_error: Option<&str>,
) -> Result<(), String> {
    let now = now_rfc3339();
    mapper::update_account_runtime_status(
        db::rb(),
        account_row_id,
        runtime_status,
        last_error,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 更新账号同步游标。
pub async fn update_account_sync_cursor(
    account_row_id: &str,
    sync_cursor: Option<&str>,
) -> Result<(), String> {
    let now = now_rfc3339();
    mapper::update_account_sync_cursor(db::rb(), account_row_id, sync_cursor, &now)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 查询运行时状态。
pub async fn list_runtime_status(
    channel_id: Option<String>,
) -> Result<Vec<RuntimeStatusSummary>, String> {
    let accounts = list_accounts(channel_id).await?;
    Ok(accounts
        .into_iter()
        .map(|account| RuntimeStatusSummary {
            account_id: account.account_id,
            channel_account_id: account.id,
            runtime_status: account.runtime_status,
            last_error: account.last_error,
        })
        .collect())
}

// ============================================================================
// 线程（unattended_threads）
// ============================================================================

/// 根据账号与用户获取或创建线程（事务）。
#[allow(clippy::too_many_arguments)]
pub async fn upsert_thread(
    channel_account_id: &str,
    peer_id: &str,
    peer_name_snapshot: Option<&str>,
    context_token: Option<&str>,
) -> Result<UnattendedThread, String> {
    let now = now_rfc3339();

    let mut tx = db::rb()
        .acquire_begin()
        .await
        .map_err(|e| e.to_string())?;

    let existing = mapper::get_thread_by_channel_and_peer(&tx, channel_account_id, peer_id)
        .await
        .map_err(|e| e.to_string())?;

    let thread = if let Some(existing) = existing.into_iter().next() {
        let touch = ThreadTouchRow {
            id: existing.id.clone().unwrap_or_default(),
            peer_name_snapshot: peer_name_snapshot.map(str::to_string),
            last_context_token: context_token.map(str::to_string),
            last_message_at: now.clone(),
            updated_at: now.clone(),
        };
        mapper::touch_thread_on_upsert(&tx, &touch)
            .await
            .map_err(|e| e.to_string())?;

        let mut merged = thread_row_to_dto(existing)?;
        merged.peer_name_snapshot = touch.peer_name_snapshot.or(merged.peer_name_snapshot.clone());
        merged.last_context_token = touch
            .last_context_token
            .or(merged.last_context_token.clone());
        merged.last_message_at = Some(now.clone());
        merged.updated_at = now.clone();
        merged
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        let insert = ThreadInsertRow {
            id: id.clone(),
            channel_account_id: channel_account_id.to_string(),
            peer_id: peer_id.to_string(),
            peer_name_snapshot: peer_name_snapshot.map(str::to_string),
            last_context_token: context_token.map(str::to_string),
            last_message_at: now.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        mapper::insert_thread(&tx, &insert)
            .await
            .map_err(|e| e.to_string())?;

        UnattendedThread {
            id,
            channel_account_id: channel_account_id.to_string(),
            peer_id: peer_id.to_string(),
            peer_name_snapshot: peer_name_snapshot.map(str::to_string),
            session_id: None,
            active_project_id: None,
            active_agent_id: None,
            active_model_id: None,
            last_context_token: context_token.map(str::to_string),
            last_plan_id: None,
            last_task_id: None,
            last_message_at: Some(now.clone()),
            created_at: now.clone(),
            updated_at: now,
        }
    };

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(thread)
}

/// 列出线程。
pub async fn list_threads(channel_id: Option<String>) -> Result<Vec<UnattendedThread>, String> {
    let rows = mapper::list_threads(db::rb(), channel_id.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(thread_row_to_dto).collect()
}

/// 更新线程上下文。
pub async fn update_thread_context(
    thread_id: &str,
    input: UpdateUnattendedThreadContextInput,
) -> Result<UnattendedThread, String> {
    let now = now_rfc3339();
    let row = ThreadContextUpdateRow {
        id: thread_id.to_string(),
        session_id: input.session_id,
        active_project_id: input.active_project_id,
        active_agent_id: input.active_agent_id,
        active_model_id: input.active_model_id,
        last_context_token: input.last_context_token,
        last_plan_id: input.last_plan_id,
        last_task_id: input.last_task_id,
        updated_at: now,
    };
    mapper::update_thread_context(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    get_thread(thread_id).await
}

/// 获取单个线程。
pub async fn get_thread(thread_id: &str) -> Result<UnattendedThread, String> {
    let row = mapper::get_thread_by_id(db::rb(), thread_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("线程不存在: {thread_id}"))?;
    thread_row_to_dto(row)
}

// ============================================================================
// 审计事件（unattended_events）
// ============================================================================

/// 记录无人值守审计事件。
pub async fn record_event(input: RecordUnattendedEventInput) -> Result<UnattendedEventRecord, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let status = input.status.unwrap_or_else(|| "success".to_string());

    let row = EventInsertRow {
        id: id.clone(),
        channel_account_id: input.channel_account_id.clone(),
        thread_id: input.thread_id.clone(),
        direction: input.direction.clone(),
        event_type: input.event_type.clone(),
        status: status.clone(),
        summary: input.summary.clone(),
        payload_json: input.payload_json.clone(),
        correlation_id: input.correlation_id.clone(),
        created_at: now.clone(),
    };
    mapper::insert_event(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    Ok(UnattendedEventRecord {
        id,
        channel_account_id: input.channel_account_id,
        thread_id: input.thread_id,
        direction: input.direction,
        event_type: input.event_type,
        status,
        summary: input.summary,
        payload_json: input.payload_json,
        correlation_id: input.correlation_id,
        created_at: now,
    })
}

/// 列出审计事件。
pub async fn list_events(
    input: Option<ListUnattendedEventsInput>,
) -> Result<Vec<UnattendedEventRecord>, String> {
    let filter = input.unwrap_or(ListUnattendedEventsInput {
        channel_account_id: None,
        thread_id: None,
        event_type: None,
        limit: Some(200),
    });
    let limit = filter.limit.unwrap_or(200).clamp(1, 1000) as i64;

    let row = EventListRow {
        channel_account_id: filter.channel_account_id,
        thread_id: filter.thread_id,
        event_type: filter.event_type,
        limit,
    };
    let rows = mapper::list_events(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(event_row_to_dto).collect()
}
