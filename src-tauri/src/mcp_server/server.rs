//! rmcp MCP server 定义：暴露 `query_conversation_history` 工具。
//!
//! 复用 rmcp 0.17 的声明式宏模式（`#[tool_router]` + `#[tool_handler]`），
//! 与 rmcp 官方 calculator 示例一致。工具内部走 `query` 模块的裁剪+查询。

use rmcp::{
    ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
};

use super::query::{clamp_params, load_repo_scope, run_query, QueryHistoryParams};

/// 工具入参 schema（暴露给 AI）。
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct QueryHistoryToolParams {
    /// 可选：限定项目。若仓库数据源配置了项目白名单，越界会被自动裁剪。
    #[schemars(description = "可选：限定项目 ID。若仓库配置了项目白名单，越界会自动裁剪。")]
    pub project_id: Option<String>,
    /// 可选：限定会话 ID。
    #[schemars(description = "可选：限定会话 ID。")]
    pub session_id: Option<String>,
    /// 可选：ISO-8601 起始时间（含），如 2026-06-27T00:00:00Z。
    #[schemars(description = "可选：ISO-8601 起始时间（含），例如 2026-06-27T00:00:00Z。")]
    pub since: Option<String>,
    /// 可选：ISO-8601 结束时间（含）。
    #[schemars(description = "可选：ISO-8601 结束时间（含）。")]
    pub until: Option<String>,
    /// 可选：消息角色过滤（user / assistant）。
    #[schemars(description = "可选：消息角色过滤，如 user / assistant。")]
    pub role: Option<String>,
    /// 可选：返回上限（仓库 maxLimit 与硬上限 2000 取较小值）。
    #[schemars(description = "可选：返回条数上限，默认 200，硬上限 2000。")]
    pub limit: Option<i64>,
}

/// 内置 MCP server。持有 `repo_id` 用于加载仓库数据源上界。
#[derive(Debug, Clone)]
pub struct MemoryRepoMcpServer {
    repo_id: String,
    tool_router: ToolRouter<Self>,
}

impl MemoryRepoMcpServer {
    /// 创建 server 实例。`repo_id` 决定工具查询的数据源范围。
    pub fn new(repo_id: String) -> Self {
        Self {
            repo_id,
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl MemoryRepoMcpServer {
    /// 查询本应用保存的对话历史（按项目/会话/时间范围/角色）。AI 可据此归纳记忆。
    #[tool(
        name = "query_conversation_history",
        description = "查询本应用（Easy Agent Pilot）保存的对话历史消息。可按项目、会话、时间范围、角色过滤。返回消息内容用于归纳/分析。"
    )]
    async fn query_conversation_history(
        &self,
        Parameters(params): Parameters<QueryHistoryToolParams>,
    ) -> String {
        let params = QueryHistoryParams {
            project_id: params.project_id,
            session_id: params.session_id,
            since: params.since,
            until: params.until,
            role: params.role,
            limit: params.limit,
        };

        // 1. 加载仓库数据源上界
        let scope = match load_repo_scope(&self.repo_id).await {
            Ok(scope) => scope,
            Err(e) => return format!("加载数据源范围失败: {e}"),
        };

        // 2. 裁剪入参
        let (effective, summary) = clamp_params(&params, &scope);

        // 3. 查询（messages 表已废弃，恒返回空）
        let messages = match run_query(&effective) {
            Ok(rows) => rows,
            Err(e) => return format!("查询失败: {e}"),
        };

        // 4. 序列化为易读 Markdown + 摘要
        let limit = summary.limit;
        let truncated = messages.len() as i64 >= limit;
        let body = messages
            .iter()
            .map(|m| {
                format!(
                    "- [{}] role=`{}` type=`{}` session=`{}` project=`{}`\n  {}",
                    m.created_at,
                    m.role,
                    m.message_type,
                    m.session_id,
                    m.project_id.as_deref().unwrap_or(""),
                    truncate_for_display(&m.content, 400)
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        format!(
            "## 对话历史查询结果\n\n- 时间范围: {} ~ {}\n- 项目白名单: {}\n- 返回: {} 条{} \n\n{body}",
            summary.since.as_deref().unwrap_or("(不限)"),
            summary.until.as_deref().unwrap_or("(不限)"),
            if summary.project_ids.is_empty() {
                "(不限)".to_string()
            } else {
                summary.project_ids.join(", ")
            },
            messages.len(),
            if truncated { "（已截断）" } else { "" }
        )
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for MemoryRepoMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some(
                "Easy Agent Pilot 内置记忆工具。调用 query_conversation_history 按时间范围查询本应用对话历史，用于归纳记忆。"
                    .into(),
            ),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

fn truncate_for_display(content: &str, limit: usize) -> String {
    let normalized: String = content.chars().collect();
    if normalized.chars().count() <= limit {
        return normalized.replace('\n', " ");
    }
    let head: String = normalized.chars().take(limit).collect();
    format!("{}...", head.replace('\n', " "))
}

// 引入 Deserialize（schemars 派生需要 serde::Deserialize 在作用域）
use serde::Deserialize;
