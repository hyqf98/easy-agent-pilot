//! 自重入入口：当应用以 `--mcp-stdio [--repo <id>]` 启动时，不启动 GUI，而是作为
//! stdio MCP server 运行（由 ACP 会话的 `mcp_servers` 以子进程拉起）。
//!
//! ACP 的 stdio MCP server 由父进程（被 spawn 的 CLI）作为子进程启动，本进程的
//! stdin/stdout 即是与 CLI 之间的 JSON-RPC 通道。

use rmcp::serve_server;

use super::server::MemoryRepoMcpServer;

/// 检查 argv 是否要求以 MCP server 模式运行。若是，启动后 **阻塞至连接关闭并退出进程**。
///
/// 用法：在 `main()`/`run()` 启动 Tauri **之前**调用。返回 `Ok(true)` 表示已处理（调用方应退出）。
pub async fn try_run_as_mcp_server(argv: &[String]) -> Result<bool, String> {
    let Some(mcp_idx) = argv.iter().position(|arg| arg == "--mcp-stdio") else {
        return Ok(false);
    };

    // 解析 --repo <id>
    let repo_id = argv
        .get(mcp_idx + 1)
        .filter(|v| *v == "--repo")
        .and_then(|_| argv.get(mcp_idx + 2))
        .cloned()
        .unwrap_or_default();

    let server = MemoryRepoMcpServer::new(repo_id);
    let transport = (tokio::io::stdin(), tokio::io::stdout());
    let running = serve_server(server, transport)
        .await
        .map_err(|e| format!("启动 MCP server 失败: {e}"))?;

    // 阻塞等待连接关闭（CLI 退出时 stdin 关闭，服务循环终止）
    let _ = running.waiting().await;

    Ok(true)
}
