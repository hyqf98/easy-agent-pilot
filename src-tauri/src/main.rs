// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 自重入：以 `--mcp-stdio [--repo <id>]` 启动时，作为 stdio MCP server 运行，不启动 GUI。
    // 这让 ACP 会话能用同一可执行文件作为内置 MCP server 子进程拉起（见 mcp_server 模块）。
    let argv: Vec<String> = std::env::args().collect();
    if argv.iter().any(|arg| arg == "--mcp-stdio") {
        let runtime =
            tokio::runtime::Runtime::new().expect("failed to create tokio runtime for MCP server");
        match runtime.block_on(easy_agent_pilot_lib::run_mcp_server(&argv)) {
            Ok(()) => return,
            Err(e) => {
                eprintln!("MCP server error: {}", e);
                std::process::exit(1);
            }
        }
    }

    easy_agent_pilot_lib::run()
}
