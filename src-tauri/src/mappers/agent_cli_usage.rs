//! CLI 用量统计 mapper。
//!
//! 对应 `commands/agent_cli_usage.rs` 的 DB 操作。SQL 模板见 `sql/agent_cli_usage.html`。
//!
//! 动态 SQL 说明：
//! - summary/timeline/breakdown/stacked 四类聚合查询的筛选条件由命令层规整后传入
//!   （start_at/end_at/provider/model_keyword），模板内用 <where>+<if> 拼接，
//!   替代原 rusqlite 的 build_where_clause。
//! - bucket/dimension/order 的 SQL 片段由命令层按 granularity/dimension 派生
//!   （受控枚举值），通过 ${...} 原文注入，故 mapper 参数为 &str。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{
    AgentCliUsageRow, AgentModelPricingRow, IntColumnRow, SessionUsageRow, SuspiciousHistoryRow,
    UsageBreakdownRow, UsageStackedRow, UsageSummaryRow, UsageTimelineRow,
};

/// upsert 用量记录的参数结构（字段名与 `sql/agent_cli_usage.html` 模板中的 `#{row.xxx}` 对应）。
#[derive(Clone, Debug, Serialize)]
pub struct AgentCliUsageUpsert {
    pub execution_id: String,
    pub execution_mode: String,
    pub provider: String,
    pub agent_id: Option<String>,
    pub agent_name_snapshot: Option<String>,
    pub model_id: Option<String>,
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    pub task_id: Option<String>,
    pub message_id: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub cache_read_input_tokens: i64,
    pub cache_creation_input_tokens: i64,
    pub call_count: i64,
    pub estimated_input_cost_usd: Option<f64>,
    pub estimated_output_cost_usd: Option<f64>,
    pub estimated_total_cost_usd: Option<f64>,
    pub pricing_status: String,
    pub pricing_version: String,
    pub occurred_at: String,
    pub created_at: String,
}

/// 修复历史记录的参数结构（修复单条）。
#[derive(Clone, Debug, Serialize)]
pub struct RepairHistoryRecord {
    pub execution_id: String,
    pub model_id: String,
    pub estimated_input_cost_usd: Option<f64>,
    pub estimated_output_cost_usd: Option<f64>,
    pub estimated_total_cost_usd: Option<f64>,
    pub pricing_status: String,
    pub pricing_version: String,
}

// =================== upsert + 回读 ===================

/// upsert 一条用量记录。
pub async fn upsert_agent_cli_usage(
    rb: &dyn Executor,
    row: &AgentCliUsageUpsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into agent_cli_usage_records (execution_id, execution_mode, provider, agent_id, agent_name_snapshot, model_id, project_id, session_id, task_id, message_id, input_tokens, output_tokens, total_tokens, cache_read_input_tokens, cache_creation_input_tokens, call_count, estimated_input_cost_usd, estimated_output_cost_usd, estimated_total_cost_usd, pricing_status, pricing_version, occurred_at, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(execution_id) do update set execution_mode = excluded.execution_mode, provider = excluded.provider, agent_id = excluded.agent_id, agent_name_snapshot = excluded.agent_name_snapshot, model_id = excluded.model_id, project_id = excluded.project_id, session_id = excluded.session_id, task_id = excluded.task_id, message_id = excluded.message_id, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, total_tokens = excluded.total_tokens, cache_read_input_tokens = excluded.cache_read_input_tokens, cache_creation_input_tokens = excluded.cache_creation_input_tokens, call_count = excluded.call_count, estimated_input_cost_usd = excluded.estimated_input_cost_usd, estimated_output_cost_usd = excluded.estimated_output_cost_usd, estimated_total_cost_usd = excluded.estimated_total_cost_usd, pricing_status = excluded.pricing_status, pricing_version = excluded.pricing_version, occurred_at = excluded.occurred_at";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.execution_id.clone()),
            rbs::Value::String(row.execution_mode.clone()),
            rbs::Value::String(row.provider.clone()),
            row.agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.agent_name_snapshot
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.project_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.session_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.task_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.message_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(row.input_tokens),
            rbs::Value::I64(row.output_tokens),
            rbs::Value::I64(row.total_tokens),
            rbs::Value::I64(row.cache_read_input_tokens),
            rbs::Value::I64(row.cache_creation_input_tokens),
            rbs::Value::I64(row.call_count),
            row.estimated_input_cost_usd
                .map(rbs::Value::F64)
                .unwrap_or(rbs::Value::Null),
            row.estimated_output_cost_usd
                .map(rbs::Value::F64)
                .unwrap_or(rbs::Value::Null),
            row.estimated_total_cost_usd
                .map(rbs::Value::F64)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.pricing_status.clone()),
            rbs::Value::String(row.pricing_version.clone()),
            rbs::Value::String(row.occurred_at.clone()),
            rbs::Value::String(row.created_at.clone()),
        ],
    )
    .await
}

/// 按 execution_id 回读单条记录。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn get_agent_cli_usage_by_execution_id(
    rb: &dyn Executor,
    execution_id: &str,
) -> Vec<AgentCliUsageRow> {
    impled!()
}

// =================== 聚合查询 ===================

/// 汇总（单行）。provider 为规整后的 claude/codex/opencode；model_keyword 已包 %...%。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn query_usage_summary(
    rb: &dyn Executor,
    start_at: Option<&str>,
    end_at: Option<&str>,
    provider: Option<&str>,
    model_keyword: Option<&str>,
) -> Vec<UsageSummaryRow> {
    impled!()
}

/// 时间趋势（多行）。${bucket_expr} 为时间桶表达式（命令层派生）。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn query_usage_timeline(
    rb: &dyn Executor,
    bucket_expr: &str,
    start_at: Option<&str>,
    end_at: Option<&str>,
    provider: Option<&str>,
    model_keyword: Option<&str>,
) -> Vec<UsageTimelineRow> {
    impled!()
}

/// 维度明细（多行）。${dimension_id_expr}/${dimension_label_expr}/${breakdown_order} 均为命令层派生。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn query_usage_breakdown(
    rb: &dyn Executor,
    dimension_id_expr: &str,
    dimension_label_expr: &str,
    breakdown_order: &str,
    start_at: Option<&str>,
    end_at: Option<&str>,
    provider: Option<&str>,
    model_keyword: Option<&str>,
) -> Vec<UsageBreakdownRow> {
    impled!()
}

/// 堆叠图（多行）。bucket/dimension 表达式由命令层派生。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn query_usage_stacked(
    rb: &dyn Executor,
    bucket_expr: &str,
    dimension_id_expr: &str,
    dimension_label_expr: &str,
    start_at: Option<&str>,
    end_at: Option<&str>,
    provider: Option<&str>,
    model_keyword: Option<&str>,
) -> Vec<UsageStackedRow> {
    impled!()
}

/// 会话级用量汇总（单行）。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn query_session_usage_summary(
    rb: &dyn Executor,
    session_id: &str,
) -> Vec<SessionUsageRow> {
    impled!()
}

// =================== 修复历史 ===================

/// 统计可疑 Claude 历史记录数。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn count_suspicious_claude_history(
    rb: &dyn Executor,
    models: &[String],
) -> Vec<IntColumnRow> {
    impled!()
}

/// 读取可疑历史记录（execution_id, input_tokens, output_tokens）。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn list_suspicious_claude_history(
    rb: &dyn Executor,
    models: &[String],
) -> Vec<SuspiciousHistoryRow> {
    impled!()
}

/// 修复单条历史记录。
pub async fn repair_one_history_record(
    rb: &dyn Executor,
    rec: &RepairHistoryRecord,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update agent_cli_usage_records set model_id = ?, estimated_input_cost_usd = ?, estimated_output_cost_usd = ?, estimated_total_cost_usd = ?, pricing_status = ?, pricing_version = ? where execution_id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(rec.model_id.clone()),
            rec.estimated_input_cost_usd
                .map(rbs::Value::F64)
                .unwrap_or(rbs::Value::Null),
            rec.estimated_output_cost_usd
                .map(rbs::Value::F64)
                .unwrap_or(rbs::Value::Null),
            rec.estimated_total_cost_usd
                .map(rbs::Value::F64)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(rec.pricing_status.clone()),
            rbs::Value::String(rec.pricing_version.clone()),
            rbs::Value::String(rec.execution_id.clone()),
        ],
    )
    .await
}

// =================== 参照校验 + 价格 ===================

/// 检查 ${table}（agents/projects/sessions/tasks）中 id 是否存在。
///
/// `${table}` 为命令层硬编码的表名（非用户输入），原文注入。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn reference_exists(
    rb: &dyn Executor,
    table: &str,
    id: &str,
) -> Vec<IntColumnRow> {
    impled!()
}

/// 查询用户自定义模型价格。
#[html_sql("sql/agent_cli_usage.html")]
pub async fn fetch_user_model_pricing(
    rb: &dyn Executor,
    model_id: &str,
) -> Vec<AgentModelPricingRow> {
    impled!()
}
