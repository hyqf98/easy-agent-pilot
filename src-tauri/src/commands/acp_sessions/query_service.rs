//! ACP 短连接生命周期管理与能力探测。
//!
//! 每次查询操作遵循：启动 agent → `connect_with` 自动 initialize → 执行业务 → 断开。
//! 提供核心能力探测函数 `probe_capabilities`。
//!
//! 注意：session/list 和 session/load 的连接逻辑直接在各自模块中实现，
//! 因为 `connect_with` 闭包需要 `'static` 约束，通用辅助函数不利于移动局部变量。

use std::str::FromStr;
use std::time::Duration;

use agent_client_protocol::schema::{InitializeRequest, ProtocolVersion};
use agent_client_protocol::{Agent, Client};
use agent_client_protocol_tokio::AcpAgent;

use crate::commands::conversation::strategies::resolve_acp_command;

use super::types::AcpCapabilities;

/// 日志宏（与 acp.rs 保持一致的模式）
macro_rules! log_info {
    ($($arg:tt)*) => {
        crate::logging::write_log("INFO", "acp_sessions", &format!($($arg)*));
    };
}
pub(super) use log_info;

macro_rules! log_error {
    ($($arg:tt)*) => {
        crate::logging::write_log("ERROR", "acp_sessions", &format!($($arg)*));
    };
}
pub(super) use log_error;

/// 默认工作目录（当调用方未提供时使用）
pub(super) fn default_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "/tmp".to_string())
}

/// 创建 AcpAgent 实例。
pub(super) fn create_agent(agent_cmd: &str) -> Result<AcpAgent, String> {
    let resolved = resolve_acp_command(agent_cmd);
    log_info!("ACP short connection | command={}", resolved);
    AcpAgent::from_str(&resolved).map_err(|e| format!("ACP 命令解析失败: {}", e))
}

/// 探测 Agent 的会话能力。
///
/// 手动发送 `initialize` 请求以获取响应中的
/// `agentCapabilities.sessionCapabilities`，映射为 `AcpCapabilities`。
///
/// 注意：`connect_with` 内部已自动完成一次 initialize，但其响应被消费。
/// 这里再发一次 `initialize` 拿到原始响应。
pub(super) async fn probe_capabilities(agent_cmd: &str) -> Result<AcpCapabilities, String> {
    let agent = create_agent(agent_cmd)?;
    log_info!("Probing ACP capabilities | command={}", agent_cmd);

    let probe = async {
        Client
            .builder()
            .connect_with(agent, async |connection| {
                let init_response: agent_client_protocol::schema::InitializeResponse =
                    connection
                        .send_request_to(
                            Agent,
                            InitializeRequest::new(ProtocolVersion::LATEST),
                        )
                        .block_task()
                        .await?;

                let caps = &init_response.agent_capabilities;

                // sessionCapabilities.list 为 Option<SessionListCapabilities>，
                // Some 表示支持，None 表示不支持
                let supports_list = caps.session_capabilities.list.is_some();

                // loadSession 是 AgentCapabilities 的 bool 字段
                let supports_load = caps.load_session;

                // close / resume / fork 需要启用对应的 unstable feature 才存在。
                // 当前 Cargo.toml 只启用 unstable_session_usage + unstable_session_model，
                // 所以 close / resume 字段在编译期不存在，恒返回 false。
                // session/delete 不在当前协议版本中（0.11），恒为 false。
                let supports_close = false;
                let supports_resume = false;
                let supports_delete = false;

                Ok::<_, agent_client_protocol::Error>(AcpCapabilities {
                    supports_list,
                    supports_load,
                    supports_delete,
                    supports_close,
                    supports_resume,
                })
            })
            .await
            .map_err(|e| format!("ACP 能力探测连接失败: {}", e))
    };

    let result = tokio::time::timeout(Duration::from_secs(30), probe)
        .await
        .map_err(|_| "ACP 能力探测超时（30s）".to_string())??;

    log_info!(
        "ACP capabilities probed | list={} load={} delete={} close={} resume={}",
        result.supports_list,
        result.supports_load,
        result.supports_delete,
        result.supports_close,
        result.supports_resume
    );

    Ok(result)
}