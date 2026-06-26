//! ACP 工具权限询问决策注册表
//!
//! 当 `acpPermissionMode = ask` 时，后端在收到 ACP 权限请求后需要挂起等待前端用户决策。
//! 本模块以 per-(session, request) 维度保存 oneshot Sender，前端通过 `respond_permission`
//! 命令回传决策，从而把"前端异步回写"接入 ACP 协议同步响应路径。
//!
//! 结构与 `abort::ABORT_FLAGS` 一致：`lazy_static` + `tokio::sync::RwLock<HashMap>`。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{oneshot, RwLock};

use crate::commands::conversation::types::PermissionOptionView;

/// 待处理权限询问的唯一键：`{session_id}::{request_id}`
fn approval_key(session_id: &str, request_id: &str) -> String {
    format!("{}::{}", session_id, request_id)
}

/// 前端回传的用户决策（对应 ACP `option_id`）
pub struct PermissionDecision {
    pub option_id: String,
}

struct PendingApproval {
    tx: oneshot::Sender<PermissionDecision>,
}

lazy_static::lazy_static! {
    static ref PENDING_APPROVALS: Arc<RwLock<HashMap<String, PendingApproval>>> =
        Arc::new(RwLock::new(HashMap::new()));
}

/// 权限询问等待超时：超时后按"取消"处理，避免 ACP 协议永久挂起
const PERMISSION_WAIT_TIMEOUT: Duration = Duration::from_secs(300);

/// 将当前会话+请求注册为待处理权限询问，返回用于等待决策的 Receiver。
///
/// 若同一 (session, request) 已存在待处理项，先移除旧项（其 Receiver 会被丢弃，
/// 等价于"取消"），保证同一请求至多有一个活跃询问。
pub async fn register_approval(
    session_id: &str,
    request_id: &str,
) -> oneshot::Receiver<PermissionDecision> {
    let (tx, rx) = oneshot::channel::<PermissionDecision>();
    let key = approval_key(session_id, request_id);
    let mut approvals = PENDING_APPROVALS.write().await;
    approvals.insert(key, PendingApproval { tx });
    rx
}

/// 前端决策回传：取出 Sender 并发送决策。返回 false 表示未找到对应询问（已被超时清理或取消）。
pub async fn resolve_approval(
    session_id: &str,
    request_id: &str,
    decision: PermissionDecision,
) -> bool {
    let key = approval_key(session_id, request_id);
    let mut approvals = PENDING_APPROVALS.write().await;
    match approvals.remove(&key) {
        Some(pending) => pending.tx.send(decision).is_ok(),
        None => false,
    }
}

/// 取消并清理指定 (session, request) 的待处理询问（其 Receiver 收到 None，调用方按取消处理）。
pub async fn cancel_approval(session_id: &str, request_id: &str) {
    let key = approval_key(session_id, request_id);
    let mut approvals = PENDING_APPROVALS.write().await;
    approvals.remove(&key);
}

/// 清理指定会话下所有待处理权限询问（会话中止时调用）。
pub async fn cancel_session_approvals(session_id: &str) {
    let prefix = format!("{}::", session_id);
    let mut approvals = PENDING_APPROVALS.write().await;
    approvals.retain(|key, _| !key.starts_with(&prefix));
}

/// 等待前端决策，带固定超时兜底。超时或被取消时返回 None（调用方应转为 Cancelled）。
pub async fn await_approval(
    session_id: &str,
    request_id: &str,
) -> Option<PermissionDecision> {
    let rx = register_approval(session_id, request_id).await;
    match tokio::time::timeout(PERMISSION_WAIT_TIMEOUT, rx).await {
        Ok(Ok(decision)) => Some(decision),
        _ => {
            // 超时或 Sender 被 drop：清理可能残留的注册项
            cancel_approval(session_id, request_id).await;
            None
        }
    }
}

/// 把 ACP `PermissionOption` 列表转换为可序列化的前端视图（option_id / name / kind）。
pub fn to_permission_option_views(
    options: &[agent_client_protocol::schema::PermissionOption],
) -> Vec<PermissionOptionView> {
    options
        .iter()
        .map(|o| PermissionOptionView {
            option_id: o.option_id.to_string(),
            name: o.name.clone(),
            kind: format!("{:?}", o.kind),
        })
        .collect()
}

/// 导出当前可见的视图类型别名，便于 types 模块复用
#[allow(dead_code)]
pub type PermissionOptions = Vec<PermissionOptionView>;
