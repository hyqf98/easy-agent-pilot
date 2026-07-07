//! 自重入入口：当应用以 `--mcp-stdio [--repo <id>]` 启动时，不启动 GUI，而是作为
//! stdio MCP server 运行（由 ACP 会话的 `mcp_servers` 以子进程拉起）。
//!
//! ACP 的 stdio MCP server 由父进程（被 spawn 的 CLI）作为子进程启动，本进程的
//! stdin/stdout 即是与 CLI 之间的 JSON-RPC 通道。
//!
//! 注意：本进程与主 GUI 进程相互独立，不复用其 RBatis 单例。因此在启动 server 前
//! 需自行初始化 RBatis（`db::init_db`），否则 `db::rb()` 会 panic。

use rmcp::serve_server;

use super::server::MemoryRepoMcpServer;
use crate::db;

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

    // 本进程独立于主 GUI 进程，需初始化 RBatis（指向同一 SQLite 文件）。
    // 已初始化则跳过（幂等），保证测试或重复调用不会报错。
    if !db::is_initialized() {
        let db_path = crate::commands::support::get_db_path()
            .map_err(|e| format!("获取数据库路径失败: {e}"))?;
        db::init_db(&db_path.to_string_lossy())
            .map_err(|e| format!("初始化 RBatis 失败: {e}"))?;
    }

    let server = MemoryRepoMcpServer::new(repo_id);
    let transport = (tokio::io::stdin(), tokio::io::stdout());
    let running = serve_server(server, transport)
        .await
        .map_err(|e| format!("启动 MCP server 失败: {e}"))?;

    // 阻塞等待连接关闭（CLI 退出时 stdin 关闭，服务循环终止）
    let _ = running.waiting().await;

    Ok(true)
}
