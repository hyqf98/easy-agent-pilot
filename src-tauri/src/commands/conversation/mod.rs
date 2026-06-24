//! 对话执行模块
//!
//! 通过 ACP (Agent Client Protocol) 统一执行智能体调用。

pub mod abort;
pub mod executor;
pub mod message_recorder;
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
