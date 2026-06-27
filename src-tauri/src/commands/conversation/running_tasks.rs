//! 执行中的会话 / 计划拆分任务注册表。
//!
//! 记录 Conversation 与 PlanSplit 两类执行任务，提供「列出在跑任务」「强制取消」
//! 两个能力，补齐 `ACTIVE_EXECUTION_SESSIONS` 只做轻量存活判定的缺口：
//! - 额外保存任务类型 / 关联 planId / 起始时间，便于前端枚举与诊断；
//! - 复用 `abort::ABORT_FLAGS` 中同一个 `Arc<AtomicBool>` 作为协作式中断标志，
//!   `force_abort_execution` 置位后 ACP 主循环会尽快退出。
//!
//! 设计上沿用现有 conversation 模块的 `lazy_static` 全局范式（与 `ABORT_FLAGS` /
//! `ACTIVE_EXECUTION_SESSIONS` / `REGISTRY` 一致），而非托管 `State<>`：
//! 计划拆分在 `tauri::async_runtime::spawn` 内通过 `registry.execute` 复用执行链路，
//! 托管 State 无法跨 spawn 透传，全局 + 自由函数最贴合现有 idiom。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::RwLock;

lazy_static::lazy_static! {
    static ref RUNNING_EXECUTIONS: Arc<RwLock<HashMap<String, ExecutionHandle>>> =
        Arc::new(RwLock::new(HashMap::new()));
}

/// 执行任务类型。会话走 Conversation，计划拆分走 PlanSplit。
#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionKind {
    Conversation,
    PlanSplit,
}

/// 单个执行任务的注册句柄。
///
/// `abort_flag` 与 `abort::ABORT_FLAGS` 共享同一个 `Arc<AtomicBool>`，
/// 因此本注册表置位与 `set_abort_flag` 完全等价，ACP 主循环据此协作式退出。
pub struct ExecutionHandle {
    pub kind: ExecutionKind,
    pub plan_id: Option<String>,
    pub abort_flag: Arc<AtomicBool>,
    pub started_at: String,
}

/// 对外（前端）暴露的在跑任务概要。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningExecutionInfo {
    pub session_id: String,
    pub kind: ExecutionKind,
    pub plan_id: Option<String>,
    pub started_at: String,
}

/// 注册一个执行任务。任务结束时必须调用 [`unregister`] 清理。
pub async fn register(session_id: &str, handle: ExecutionHandle) {
    let mut map = RUNNING_EXECUTIONS.write().await;
    map.insert(session_id.to_string(), handle);
}

/// 注销一个执行任务（任务已自然结束，仅清理记录）。
pub async fn unregister(session_id: &str) {
    let mut map = RUNNING_EXECUTIONS.write().await;
    map.remove(session_id);
}

/// 强制取消：置位协作式中断标志。
///
/// 返回是否命中已注册任务。未命中时调用方应回退到 `abort::set_abort_flag`
/// 兜底（保留其进程清理逻辑）。
pub async fn abort_execution(session_id: &str) -> bool {
    let map = RUNNING_EXECUTIONS.read().await;
    if let Some(handle) = map.get(session_id) {
        handle.abort_flag.store(true, Ordering::SeqCst);
        return true;
    }
    false
}

/// 列出所有在跑任务的概要（按起始时间稳定排序，便于前端展示）。
pub async fn list_running_executions_internal() -> Vec<RunningExecutionInfo> {
    let map = RUNNING_EXECUTIONS.read().await;
    let mut items: Vec<RunningExecutionInfo> = map
        .iter()
        .map(|(session_id, handle)| RunningExecutionInfo {
            session_id: session_id.clone(),
            kind: handle.kind,
            plan_id: handle.plan_id.clone(),
            started_at: handle.started_at.clone(),
        })
        .collect();
    items.sort_by(|a, b| a.started_at.cmp(&b.started_at));
    items
}

/// 列出所有在跑的执行任务。
#[tauri::command]
pub async fn list_running_executions() -> Result<Vec<RunningExecutionInfo>, String> {
    Ok(list_running_executions_internal().await)
}

/// 强制取消指定会话的执行任务。
///
/// 先尝试命中注册表中的协作式标志；无论是否命中，都再调用 `set_abort_flag`
/// 走完整中断路径（含进程清理），保证与既有 `abort_agent_execution` 行为一致。
#[tauri::command]
pub async fn force_abort_execution(session_id: String) -> Result<(), String> {
    let hit = abort_execution(&session_id).await;
    if !hit {
        crate::logging::write_log(
            "INFO",
            "running_tasks",
            &format!(
                "force_abort_execution: 任务未在注册表中，回退 set_abort_flag | session_id={}",
                session_id
            ),
        );
    }
    super::abort::set_abort_flag(&session_id, true).await;
    Ok(())
}
