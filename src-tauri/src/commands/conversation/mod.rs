//! 对话执行模块
//!
//! 通过 ACP (Agent Client Protocol) 统一执行智能体调用。

pub mod abort;
pub mod executor;
pub mod permission;
pub mod running_tasks;
pub mod strategies;
pub mod strategy;
pub mod types;

pub use abort::set_abort_flag;
pub use executor::init_registry;

#[tauri::command]
pub async fn abort_agent_execution(session_id: String) -> Result<(), String> {
    set_abort_flag(&session_id, true).await;
    Ok(())
}

#[tauri::command]
pub async fn clear_session_abort_flag(session_id: String) -> Result<(), String> {
    abort::clear_abort_flag(&session_id).await;
    Ok(())
}

/// 前端回传 ACP 工具权限决策（仅在 ask 模式下由权限询问弹窗调用）。
#[tauri::command]
pub async fn respond_permission(
    session_id: String,
    request_id: String,
    option_id: String,
) -> Result<(), String> {
    let ok = permission::resolve_approval(
        &session_id,
        &request_id,
        permission::PermissionDecision { option_id },
    )
    .await;
    if ok {
        Ok(())
    } else {
        Err("未找到待处理的权限询问，可能已超时或被取消".to_string())
    }
}
