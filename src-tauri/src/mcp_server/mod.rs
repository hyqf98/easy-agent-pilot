//! 记忆库内置 MCP server：通过 ACP `mcp_servers` 以 stdio 子进程注入，让被调度/归纳的
//! AI Agent 自主查询本应用的对话历史（按时间范围 / 项目），数据范围由仓库的
//! `memory_repo_sources` 配置做上界裁剪。
//!
//! 传输：以 `<app exe> --mcp-stdio --repo <repo_id>` 自重入启动一个 stdio MCP server
//! （见 `crate::mcp_server::entry::try_run_as_mcp_server`）。复用 rmcp 的 server 能力
//! （Cargo.toml 已启用 `server` + `transport-io` feature）。

pub mod entry;
mod query;
mod server;

pub use entry::try_run_as_mcp_server;
