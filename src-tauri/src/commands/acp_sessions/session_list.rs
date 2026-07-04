//! ACP `session/list` 调用。
//!
//! 通过短连接发送 `ListSessionsRequest`，支持可选 `cwd` 过滤，
//! 返回 `AcpSessionListResult`（含去重后的 project_paths）。

use std::collections::BTreeSet;
use std::time::Duration;

use agent_client_protocol::schema::ListSessionsRequest;
use agent_client_protocol::{Agent, Client};

use super::query_service::{create_agent, log_info};
use super::types::{AcpSessionInfo, AcpSessionListResult};

/// 调用 `session/list` 获取会话列表。
///
/// # 参数
/// - `agent_cmd`：原始命令（如 `"opencode"`），会经 `resolve_acp_command` 展开
/// - `cwd`：可选的工作目录过滤（绝对路径）
pub(super) async fn list_sessions(
    agent_cmd: &str,
    cwd: Option<&str>,
) -> Result<AcpSessionListResult, String> {
    let agent = create_agent(agent_cmd)?;
    let cwd_filter = cwd.map(|c| c.to_string());

    log_info!(
        "session/list | command={} | cwd={}",
        agent_cmd,
        cwd_filter.as_deref().unwrap_or("-")
    );

    let probe = async {
        Client
            .builder()
            .connect_with(agent, async |connection| {
                let mut request = ListSessionsRequest::new();

                if let Some(ref cwd_str) = cwd_filter {
                    request = request.cwd(std::path::PathBuf::from(cwd_str));
                }

                let response = connection
                    .send_request_to(Agent, request)
                    .block_task()
                    .await?;

                // 将 SessionInfo 映射为 AcpSessionInfo
                let sessions: Vec<AcpSessionInfo> = response
                    .sessions
                    .iter()
                    .map(|s| AcpSessionInfo {
                        session_id: s.session_id.to_string(),
                        cwd: s.cwd.to_string_lossy().to_string(),
                        title: s.title.clone(),
                        updated_at: s.updated_at.clone(),
                        message_count: None,
                    })
                    .collect();

                // 去重聚合 cwd 作为 project_paths
                let project_paths: Vec<String> = {
                    let mut seen: BTreeSet<String> = BTreeSet::new();
                    let mut paths: Vec<String> = Vec::new();
                    for s in &sessions {
                        if seen.insert(s.cwd.clone()) {
                            paths.push(s.cwd.clone());
                        }
                    }
                    paths
                };

                Ok(AcpSessionListResult {
                    sessions,
                    next_cursor: response.next_cursor.clone(),
                    project_paths,
                })
            })
            .await
            .map_err(|e| format!("session/list 失败: {}", e))
    };

    let result: AcpSessionListResult = tokio::time::timeout(
        Duration::from_secs(60),
        probe,
    )
    .await
    .map_err(|_| "session/list 超时（60s）".to_string())??;

    log_info!(
        "session/list completed | count={} | projects={}",
        result.sessions.len(),
        result.project_paths.len()
    );

    Ok(result)
}