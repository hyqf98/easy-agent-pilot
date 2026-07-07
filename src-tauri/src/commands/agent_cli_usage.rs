use rbatis::executor::Executor;
use serde::{Deserialize, Serialize};

use super::provider_profile;
use super::support::now_rfc3339;
use crate::db;
use crate::mappers::agent_cli_usage as usage_mapper;
use crate::mappers::agent_cli_usage::{AgentCliUsageUpsert, RepairHistoryRecord};
use crate::models::{
    AgentCliUsageRow, AgentModelPricingRow, SessionUsageRow, SuspiciousHistoryRow, UsageBreakdownRow,
    UsageStackedRow, UsageSummaryRow, UsageTimelineRow,
};

const PRICING_VERSION: &str = "2026-03-25";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 记录 CLI 用量所需的输入参数。
///
/// 包含一次执行的上下文快照、所属 Provider/模型，以及输入输出 token 统计。
pub struct RecordAgentCliUsageInput {
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
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cache_read_input_tokens: Option<i64>,
    pub cache_creation_input_tokens: Option<i64>,
    pub occurred_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 单条 CLI 用量事实记录。
///
/// 用于落库存储和导出，保留定价快照与执行维度信息。
pub struct AgentCliUsageRecord {
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
    pub call_count: i64,
    pub estimated_input_cost_usd: Option<f64>,
    pub estimated_output_cost_usd: Option<f64>,
    pub estimated_total_cost_usd: Option<f64>,
    pub pricing_status: String,
    pub pricing_version: String,
    pub occurred_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 查询 CLI 用量统计面板的筛选参数。
///
/// 支持时间范围、时间粒度、统计维度与 Provider 过滤。
pub struct QueryAgentCliUsageStatsInput {
    pub start_at: Option<String>,
    pub end_at: Option<String>,
    pub granularity: String,
    pub dimension: String,
    pub provider_filter: Option<String>,
    pub model_keyword: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 查询结果的总览汇总。
pub struct AgentCliUsageSummary {
    pub total_calls: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_creation_tokens: i64,
    pub estimated_input_cost_usd: f64,
    pub estimated_output_cost_usd: f64,
    pub estimated_total_cost_usd: f64,
    pub unpriced_calls: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 单个会话的累计用量汇总（输入/输出/缓存 token 与调用次数）。
///
/// 用于消息输入框上下文进度环浮层展示会话级累计用量。
pub struct SessionUsageSummary {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_input_tokens: i64,
    pub cache_creation_input_tokens: i64,
    pub total_tokens: i64,
    pub call_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 时间趋势图中的单个聚合点。
pub struct AgentCliUsageTimelinePoint {
    pub bucket: String,
    pub label: String,
    pub call_count: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_creation_tokens: i64,
    pub estimated_input_cost_usd: f64,
    pub estimated_output_cost_usd: f64,
    pub estimated_total_cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 按 Agent 或模型聚合后的明细行。
pub struct AgentCliUsageBreakdownRow {
    pub dimension_id: String,
    pub label: String,
    pub provider: String,
    pub call_count: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub estimated_total_cost_usd: f64,
    pub unpriced_calls: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 堆叠图使用的时间桶分布点。
pub struct AgentCliUsageStackedPoint {
    pub bucket: String,
    pub label: String,
    pub dimension_id: String,
    pub dimension_label: String,
    pub provider: String,
    pub call_count: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub estimated_total_cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 查询返回的元信息。
///
/// 主要用于前端展示当前筛选条件和价格快照版本。
pub struct AgentCliUsageMeta {
    pub start_at: Option<String>,
    pub end_at: Option<String>,
    pub granularity: String,
    pub dimension: String,
    pub provider_filter: String,
    pub model_keyword: Option<String>,
    pub pricing_version: String,
    pub cost_partial: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// CLI 用量统计查询的完整响应。
pub struct AgentCliUsageStatsResponse {
    pub summary: AgentCliUsageSummary,
    pub timeline: Vec<AgentCliUsageTimelinePoint>,
    pub breakdown: Vec<AgentCliUsageBreakdownRow>,
    pub stacked_timeline: Vec<AgentCliUsageStackedPoint>,
    pub meta: AgentCliUsageMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// CLI 用量历史修复结果。
///
/// 用于反馈本次是否命中自动纠偏条件，以及实际修复了多少条历史记录。
pub struct RepairAgentCliUsageHistoryResult {
    pub provider: String,
    pub target_model_id: Option<String>,
    pub updated_count: i64,
    pub skipped_reason: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct ModelPricing {
    input_per_million_usd: f64,
    output_per_million_usd: f64,
}

struct PricingEstimate {
    estimated_input_cost_usd: Option<f64>,
    estimated_output_cost_usd: Option<f64>,
    estimated_total_cost_usd: Option<f64>,
    pricing_status: String,
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let normalized = item.trim().to_string();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    })
}

fn normalize_provider(value: &str) -> String {
    let normalized = value.trim().to_lowercase();
    match normalized.as_str() {
        "codex" => "codex".to_string(),
        "opencode" => "opencode".to_string(),
        _ => "claude".to_string(),
    }
}

fn normalize_granularity(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "year" => "year".to_string(),
        "month" => "month".to_string(),
        _ => "day".to_string(),
    }
}

fn normalize_dimension(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "model" => "model".to_string(),
        _ => "agent".to_string(),
    }
}

fn normalize_provider_filter(value: Option<String>) -> String {
    match value
        .unwrap_or_else(|| "all".to_string())
        .trim()
        .to_lowercase()
        .as_str()
    {
        "claude" => "claude".to_string(),
        "codex" => "codex".to_string(),
        "opencode" => "opencode".to_string(),
        _ => "all".to_string(),
    }
}

fn normalize_model_id(model_id: Option<&str>) -> Option<String> {
    model_id.and_then(|value| {
        let normalized = value.trim().to_lowercase();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    })
}

fn is_builtin_claude_model(model_id: &str) -> bool {
    let normalized = model_id.trim().to_lowercase();
    normalized.starts_with("claude")
        || normalized.contains("opus")
        || normalized.contains("sonnet")
        || normalized.contains("haiku")
}

fn suspicious_claude_history_models() -> &'static [&'static str] {
    &[
        "claude-haiku-4-5",
        "claude-haiku4-5",
        "claude-haiku-4.5",
        "haiku-4.5",
        "haiku-4-5",
        "haiku",
    ]
}

fn resolve_model_pricing(provider: &str, model_id: Option<&str>) -> Option<ModelPricing> {
    let normalized_provider = normalize_provider(provider);
    let normalized_model = normalize_model_id(model_id);
    let model = normalized_model.as_deref()?;

    if normalized_provider == "codex" {
        if model.starts_with("gpt-5.4") {
            return Some(ModelPricing {
                input_per_million_usd: 2.5,
                output_per_million_usd: 15.0,
            });
        }

        return match model {
            "gpt-5-codex" => Some(ModelPricing {
                input_per_million_usd: 1.25,
                output_per_million_usd: 10.0,
            }),
            "gpt-5.3-codex" => Some(ModelPricing {
                input_per_million_usd: 4.0,
                output_per_million_usd: 16.0,
            }),
            "gpt-5.2-codex" | "gpt-5.2" => Some(ModelPricing {
                input_per_million_usd: 1.75,
                output_per_million_usd: 14.0,
            }),
            "gpt-5.1-codex" | "gpt-5.1" | "gpt-5" => Some(ModelPricing {
                input_per_million_usd: 1.25,
                output_per_million_usd: 10.0,
            }),
            _ => None,
        };
    }

    if model.contains("opus") {
        return Some(ModelPricing {
            input_per_million_usd: 15.0,
            output_per_million_usd: 75.0,
        });
    }

    if model.contains("sonnet") {
        return Some(ModelPricing {
            input_per_million_usd: 3.0,
            output_per_million_usd: 15.0,
        });
    }

    if model.contains("haiku") {
        return Some(ModelPricing {
            input_per_million_usd: 0.8,
            output_per_million_usd: 4.0,
        });
    }

    None
}

/// 估算单次调用的费用。
///
/// `user_pricing` 为用户在模型管理里自定义的价格（优先使用）；
/// 为 `None` 时回退到内置价目表 `resolve_model_pricing`。
fn estimate_pricing(
    provider: &str,
    model_id: Option<&str>,
    input_tokens: i64,
    output_tokens: i64,
    user_pricing: Option<ModelPricing>,
) -> PricingEstimate {
    if input_tokens == 0 && output_tokens == 0 {
        return PricingEstimate {
            estimated_input_cost_usd: None,
            estimated_output_cost_usd: None,
            estimated_total_cost_usd: None,
            pricing_status: "missing_usage".to_string(),
        };
    }

    let pricing = user_pricing.or_else(|| resolve_model_pricing(provider, model_id));
    let Some(pricing) = pricing else {
        return PricingEstimate {
            estimated_input_cost_usd: None,
            estimated_output_cost_usd: None,
            estimated_total_cost_usd: None,
            pricing_status: "unmapped".to_string(),
        };
    };

    let input_cost = (input_tokens as f64 / 1_000_000_f64) * pricing.input_per_million_usd;
    let output_cost = (output_tokens as f64 / 1_000_000_f64) * pricing.output_per_million_usd;

    PricingEstimate {
        estimated_input_cost_usd: Some(input_cost),
        estimated_output_cost_usd: Some(output_cost),
        estimated_total_cost_usd: Some(input_cost + output_cost),
        pricing_status: "estimated".to_string(),
    }
}

/// 查询用户在模型管理中为指定 model_id 配置的价格。
///
/// 命中且输入/输出单价均存在时返回；否则返回 `None`（由内置价目表兜底）。
/// 匹配忽略大小写，任意 agent 下配置的同名模型均可命中。
async fn fetch_user_model_pricing(
    rb: &dyn Executor,
    model_id: Option<&str>,
) -> Option<ModelPricing> {
    let model_id = normalize_model_id(model_id)?;
    let row: AgentModelPricingRow = match usage_mapper::fetch_user_model_pricing(rb, &model_id).await {
        Ok(rows) if !rows.is_empty() => rows.into_iter().next().unwrap(),
        _ => return None,
    };
    match (row.input_cost_per_million_usd, row.output_cost_per_million_usd) {
        (Some(input), Some(output)) => Some(ModelPricing {
            input_per_million_usd: input,
            output_per_million_usd: output,
        }),
        _ => None,
    }
}

/// 检查某个 agents/projects/sessions/tasks 的 id 是否存在。
///
/// `table` 为命令层硬编码的表名（非用户输入），通过 ${} 原文注入。
async fn reference_exists(rb: &dyn Executor, table: &str, id: &str) -> Result<bool, String> {
    let row = usage_mapper::reference_exists(rb, table, id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.into_iter().next().map(|r| r.value.unwrap_or(0)).unwrap_or(0) > 0)
}

/// 规整外键 id：去空白 + 校验存在性；不存在则返回 None。
async fn normalize_reference_id(
    rb: &dyn Executor,
    table: &str,
    value: Option<String>,
) -> Result<Option<String>, String> {
    let normalized = normalize_optional_text(value);
    let Some(id) = normalized else {
        return Ok(None);
    };

    if reference_exists(rb, table, &id).await? {
        Ok(Some(id))
    } else {
        Ok(None)
    }
}

/// 按 granularity 派生时间桶表达式（${} 原文注入用，受控枚举值）。
fn bucket_expr(granularity: &str) -> &'static str {
    match granularity {
        "year" => "strftime('%Y', datetime(occurred_at, 'localtime'))",
        "month" => "strftime('%Y-%m', datetime(occurred_at, 'localtime'))",
        _ => "strftime('%Y-%m-%d', datetime(occurred_at, 'localtime'))",
    }
}

/// 按 dimension 派生 (dimension_id_expr, dimension_label_expr)。
fn dimension_exprs(dimension: &str, include_provider_prefix: bool) -> (&'static str, &'static str) {
    if dimension == "model" {
        if include_provider_prefix {
            (
                "COALESCE(NULLIF(model_id, ''), '__default_model__')",
                "CASE\
                    WHEN model_id IS NULL OR trim(model_id) = '' THEN provider || ' / Default model'\
                    ELSE provider || ' / ' || model_id\
                 END",
            )
        } else {
            (
                "COALESCE(NULLIF(model_id, ''), '__default_model__')",
                "COALESCE(NULLIF(model_id, ''), 'Default model')",
            )
        }
    } else {
        (
            "COALESCE(NULLIF(agent_id, ''), '__unknown_agent__')",
            "COALESCE(NULLIF(agent_name_snapshot, ''), NULLIF(agent_id, ''), 'Unknown agent')",
        )
    }
}

/// 按 dimension 派生 breakdown 排序表达式。
fn breakdown_order_expr(dimension: &str) -> &'static str {
    if dimension == "model" {
        "SUM(estimated_total_cost_usd) DESC, SUM(total_tokens) DESC, dimension_label ASC"
    } else {
        "SUM(total_tokens) DESC, SUM(estimated_total_cost_usd) DESC, dimension_label ASC"
    }
}

/// 把 AgentCliUsageRow（23 列完整行）转成对外 DTO。
fn map_usage_row(row: AgentCliUsageRow) -> Result<AgentCliUsageRecord, String> {
    Ok(AgentCliUsageRecord {
        execution_id: row.execution_id.ok_or("execution_id 缺失")?,
        execution_mode: row.execution_mode.ok_or("execution_mode 缺失")?,
        provider: row.provider.ok_or("provider 缺失")?,
        agent_id: row.agent_id,
        agent_name_snapshot: row.agent_name_snapshot,
        model_id: row.model_id,
        project_id: row.project_id,
        session_id: row.session_id,
        task_id: row.task_id,
        message_id: row.message_id,
        input_tokens: row.input_tokens.unwrap_or(0),
        output_tokens: row.output_tokens.unwrap_or(0),
        total_tokens: row.total_tokens.unwrap_or(0),
        call_count: row.call_count.unwrap_or(1),
        estimated_input_cost_usd: row.estimated_input_cost_usd,
        estimated_output_cost_usd: row.estimated_output_cost_usd,
        estimated_total_cost_usd: row.estimated_total_cost_usd,
        pricing_status: row
            .pricing_status
            .unwrap_or_else(|| "missing_usage".to_string()),
        pricing_version: row.pricing_version.unwrap_or_default(),
        occurred_at: row.occurred_at.ok_or("occurred_at 缺失")?,
        created_at: row.created_at.ok_or("created_at 缺失")?,
    })
}

async fn repair_claude_usage_history(
    rb: &dyn Executor,
) -> Result<RepairAgentCliUsageHistoryResult, String> {
    let current_profile = provider_profile::read_current_cli_config("claude".to_string())?;
    let Some(target_model_id) = normalize_optional_text(current_profile.main_model.clone()) else {
        return Ok(RepairAgentCliUsageHistoryResult {
            provider: "claude".to_string(),
            target_model_id: None,
            updated_count: 0,
            skipped_reason: Some("missing_current_model".to_string()),
        });
    };

    if is_builtin_claude_model(&target_model_id) {
        return Ok(RepairAgentCliUsageHistoryResult {
            provider: "claude".to_string(),
            target_model_id: Some(target_model_id),
            updated_count: 0,
            skipped_reason: Some("current_model_is_builtin".to_string()),
        });
    }

    let suspicious_models: Vec<String> =
        suspicious_claude_history_models().iter().map(|s| s.to_string()).collect();
    let count_row = usage_mapper::count_suspicious_claude_history(rb, &suspicious_models)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or("count 查询失败")?;
    let suspicious_count = count_row.value.unwrap_or(0);

    if suspicious_count == 0 {
        return Ok(RepairAgentCliUsageHistoryResult {
            provider: "claude".to_string(),
            target_model_id: Some(target_model_id),
            updated_count: 0,
            skipped_reason: Some("no_suspicious_history".to_string()),
        });
    }

    let repair_rows: Vec<SuspiciousHistoryRow> =
        usage_mapper::list_suspicious_claude_history(rb, &suspicious_models)
            .await
            .map_err(|e| e.to_string())?;

    let mut updated_count = 0_i64;
    for row in repair_rows {
        let Some(execution_id) = row.execution_id else { continue };
        let input_tokens = row.input_tokens.unwrap_or(0);
        let output_tokens = row.output_tokens.unwrap_or(0);
        let pricing = estimate_pricing(
            "claude",
            Some(target_model_id.as_str()),
            input_tokens,
            output_tokens,
            None,
        );

        let rec = RepairHistoryRecord {
            execution_id: execution_id.clone(),
            model_id: target_model_id.clone(),
            estimated_input_cost_usd: pricing.estimated_input_cost_usd,
            estimated_output_cost_usd: pricing.estimated_output_cost_usd,
            estimated_total_cost_usd: pricing.estimated_total_cost_usd,
            pricing_status: pricing.pricing_status,
            pricing_version: PRICING_VERSION.to_string(),
        };
        usage_mapper::repair_one_history_record(rb, &rec)
            .await
            .map_err(|e| e.to_string())?;
        updated_count += 1;
    }

    Ok(RepairAgentCliUsageHistoryResult {
        provider: "claude".to_string(),
        target_model_id: Some(target_model_id),
        updated_count,
        skipped_reason: None,
    })
}

/// 记录一次 CLI 用量统计。
///
/// 用途：在 CLI 主执行链路完成后异步落库，用于设置页图表和汇总统计。
/// 主要参数：包含执行上下文、Agent/模型快照以及输入输出 token。
/// 返回值：返回已写入或已更新的统计记录。
/// 关键副作用：写入本地 SQLite 统计表；同一 execution_id 会执行幂等更新。
#[tauri::command]
pub async fn record_agent_cli_usage(
    input: RecordAgentCliUsageInput,
) -> Result<AgentCliUsageRecord, String> {
    let rb = db::rb();
    let now = now_rfc3339();
    let RecordAgentCliUsageInput {
        execution_id,
        execution_mode,
        provider,
        agent_id,
        agent_name_snapshot,
        model_id,
        project_id,
        session_id,
        task_id,
        message_id,
        input_tokens,
        output_tokens,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        occurred_at,
    } = input;
    let occurred_at = normalize_optional_text(occurred_at).unwrap_or_else(|| now.clone());
    let provider = normalize_provider(&provider);
    let input_tokens = input_tokens.unwrap_or(0).max(0);
    let output_tokens = output_tokens.unwrap_or(0).max(0);
    let total_tokens = input_tokens + output_tokens;
    let cache_read_input_tokens = cache_read_input_tokens.unwrap_or(0).max(0);
    let cache_creation_input_tokens = cache_creation_input_tokens.unwrap_or(0).max(0);
    let model_id = normalize_optional_text(model_id);
    let agent_id = normalize_reference_id(rb, "agents", agent_id).await?;
    let project_id = normalize_reference_id(rb, "projects", project_id).await?;
    let session_id = normalize_reference_id(rb, "sessions", session_id).await?;
    let task_id = normalize_reference_id(rb, "tasks", task_id).await?;
    let message_id = normalize_optional_text(message_id);
    let agent_name_snapshot = normalize_optional_text(agent_name_snapshot);
    let user_pricing = fetch_user_model_pricing(rb, model_id.as_deref()).await;
    let pricing = estimate_pricing(
        &provider,
        model_id.as_deref(),
        input_tokens,
        output_tokens,
        user_pricing,
    );

    let row = AgentCliUsageUpsert {
        execution_id: execution_id.clone(),
        execution_mode,
        provider,
        agent_id,
        agent_name_snapshot,
        model_id,
        project_id,
        session_id,
        task_id,
        message_id,
        input_tokens,
        output_tokens,
        total_tokens,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        call_count: 1,
        estimated_input_cost_usd: pricing.estimated_input_cost_usd,
        estimated_output_cost_usd: pricing.estimated_output_cost_usd,
        estimated_total_cost_usd: pricing.estimated_total_cost_usd,
        pricing_status: pricing.pricing_status,
        pricing_version: PRICING_VERSION.to_string(),
        occurred_at,
        created_at: now,
    };
    usage_mapper::upsert_agent_cli_usage(rb, &row)
        .await
        .map_err(|e| e.to_string())?;

    let read_row = usage_mapper::get_agent_cli_usage_by_execution_id(rb, &execution_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or("写入后回读失败")?;
    map_usage_row(read_row)
}

/// 查询 CLI 用量统计聚合结果。
///
/// 用途：为设置页统计面板提供时间范围、粒度和维度聚合后的图表数据。
/// 主要参数：开始/结束时间、年/月/日粒度、Agent/模型维度、Provider 过滤器。
/// 返回值：返回汇总、趋势、分组明细和图表堆叠序列。
/// 关键副作用：无，仅执行只读查询。
#[tauri::command]
pub async fn query_agent_cli_usage_stats(
    input: QueryAgentCliUsageStatsInput,
) -> Result<AgentCliUsageStatsResponse, String> {
    let rb = db::rb();
    let granularity = normalize_granularity(&input.granularity);
    let dimension = normalize_dimension(&input.dimension);
    let provider_filter = normalize_provider_filter(input.provider_filter.clone());

    // 规整筛选参数（Option 化：None 表示该条件不参与 where）。
    let start_at = normalize_optional_text(input.start_at.clone());
    let end_at = normalize_optional_text(input.end_at.clone());
    let provider_opt = if provider_filter == "all" {
        None
    } else {
        Some(provider_filter.as_str())
    };
    let model_keyword = normalize_optional_text(input.model_keyword.clone()).map(|kw| {
        // 模板里是 lower(coalesce(model_id,'')) like #{model_keyword}，故传已小写的 %kw%。
        format!("%{}%", kw.to_lowercase())
    });

    let bucket = bucket_expr(&granularity);
    let (dim_id_expr, dim_label_expr) =
        dimension_exprs(&dimension, provider_filter == "all" && dimension == "model");
    let order_expr = breakdown_order_expr(&dimension);

    // 汇总（单行）。
    let summary_row: UsageSummaryRow = usage_mapper::query_usage_summary(
        rb,
        start_at.as_deref(),
        end_at.as_deref(),
        provider_opt,
        model_keyword.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .next()
    .ok_or("summary 查询失败")?;
    let summary = AgentCliUsageSummary {
        total_calls: summary_row.total_calls.unwrap_or(0),
        input_tokens: summary_row.input_tokens.unwrap_or(0),
        output_tokens: summary_row.output_tokens.unwrap_or(0),
        total_tokens: summary_row.total_tokens.unwrap_or(0),
        cache_read_tokens: summary_row.cache_read_tokens.unwrap_or(0),
        cache_creation_tokens: summary_row.cache_creation_tokens.unwrap_or(0),
        estimated_input_cost_usd: summary_row.estimated_input_cost_usd.unwrap_or(0.0),
        estimated_output_cost_usd: summary_row.estimated_output_cost_usd.unwrap_or(0.0),
        estimated_total_cost_usd: summary_row.estimated_total_cost_usd.unwrap_or(0.0),
        unpriced_calls: summary_row.unpriced_calls.unwrap_or(0),
    };

    // 时间趋势。
    let timeline_rows: Vec<UsageTimelineRow> = usage_mapper::query_usage_timeline(
        rb,
        bucket,
        start_at.as_deref(),
        end_at.as_deref(),
        provider_opt,
        model_keyword.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;
    let timeline = timeline_rows
        .into_iter()
        .map(|row| AgentCliUsageTimelinePoint {
            label: row.bucket.clone().unwrap_or_default(),
            bucket: row.bucket.unwrap_or_default(),
            call_count: row.call_count.unwrap_or(0),
            input_tokens: row.input_tokens.unwrap_or(0),
            output_tokens: row.output_tokens.unwrap_or(0),
            total_tokens: row.total_tokens.unwrap_or(0),
            cache_read_tokens: row.cache_read_tokens.unwrap_or(0),
            cache_creation_tokens: row.cache_creation_tokens.unwrap_or(0),
            estimated_input_cost_usd: row.estimated_input_cost_usd.unwrap_or(0.0),
            estimated_output_cost_usd: row.estimated_output_cost_usd.unwrap_or(0.0),
            estimated_total_cost_usd: row.estimated_total_cost_usd.unwrap_or(0.0),
        })
        .collect();

    // 维度明细。
    let breakdown_rows: Vec<UsageBreakdownRow> = usage_mapper::query_usage_breakdown(
        rb,
        dim_id_expr,
        dim_label_expr,
        order_expr,
        start_at.as_deref(),
        end_at.as_deref(),
        provider_opt,
        model_keyword.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;
    let breakdown = breakdown_rows
        .into_iter()
        .map(|row| AgentCliUsageBreakdownRow {
            dimension_id: row.dimension_id.unwrap_or_default(),
            label: row.dimension_label.unwrap_or_default(),
            provider: row.provider.unwrap_or_default(),
            call_count: row.call_count.unwrap_or(0),
            input_tokens: row.input_tokens.unwrap_or(0),
            output_tokens: row.output_tokens.unwrap_or(0),
            total_tokens: row.total_tokens.unwrap_or(0),
            estimated_total_cost_usd: row.estimated_total_cost_usd.unwrap_or(0.0),
            unpriced_calls: row.unpriced_calls.unwrap_or(0),
        })
        .collect();

    // 堆叠图。
    let stacked_rows: Vec<UsageStackedRow> = usage_mapper::query_usage_stacked(
        rb,
        bucket,
        dim_id_expr,
        dim_label_expr,
        start_at.as_deref(),
        end_at.as_deref(),
        provider_opt,
        model_keyword.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;
    let stacked_timeline = stacked_rows
        .into_iter()
        .map(|row| AgentCliUsageStackedPoint {
            label: row.bucket.clone().unwrap_or_default(),
            bucket: row.bucket.unwrap_or_default(),
            dimension_id: row.dimension_id.unwrap_or_default(),
            dimension_label: row.dimension_label.unwrap_or_default(),
            provider: row.provider.unwrap_or_default(),
            call_count: row.call_count.unwrap_or(0),
            input_tokens: row.input_tokens.unwrap_or(0),
            output_tokens: row.output_tokens.unwrap_or(0),
            total_tokens: row.total_tokens.unwrap_or(0),
            estimated_total_cost_usd: row.estimated_total_cost_usd.unwrap_or(0.0),
        })
        .collect();

    let cost_partial = summary.unpriced_calls > 0;

    Ok(AgentCliUsageStatsResponse {
        summary,
        timeline,
        breakdown,
        stacked_timeline,
        meta: AgentCliUsageMeta {
            start_at: normalize_optional_text(input.start_at),
            end_at: normalize_optional_text(input.end_at),
            granularity,
            dimension,
            provider_filter,
            model_keyword: normalize_optional_text(input.model_keyword),
            pricing_version: PRICING_VERSION.to_string(),
            cost_partial,
        },
    })
}

/// 自动修复 CLI 用量历史中的错误模型归属。
///
/// 用途：在统计页加载前，纠偏旧版本把 Claude 兼容源请求错误写成 Haiku 的历史记录。
/// 主要参数：可选 Provider；当前仅对 `claude` 生效。
/// 返回值：返回目标模型、修复数量和跳过原因。
/// 关键副作用：可能更新本地 SQLite 中的 `agent_cli_usage_records` 历史数据。
#[tauri::command]
pub async fn repair_agent_cli_usage_history(
    provider: Option<String>,
) -> Result<RepairAgentCliUsageHistoryResult, String> {
    let normalized_provider = normalize_provider_filter(provider);

    if normalized_provider != "all" && normalized_provider != "claude" {
        return Ok(RepairAgentCliUsageHistoryResult {
            provider: normalized_provider,
            target_model_id: None,
            updated_count: 0,
            skipped_reason: Some("provider_not_supported".to_string()),
        });
    }

    repair_claude_usage_history(db::rb()).await
}

/// 查询单个会话的累计用量汇总（输入/输出/缓存 token 与调用次数）。
///
/// 用途：为消息输入框上下文进度环浮层提供会话级累计用量指标。
/// 关键副作用：无，仅执行只读查询。
#[tauri::command]
pub async fn query_session_usage_summary(
    session_id: String,
) -> Result<SessionUsageSummary, String> {
    let row: SessionUsageRow = usage_mapper::query_session_usage_summary(db::rb(), &session_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or("会话用量查询失败")?;
    Ok(SessionUsageSummary {
        input_tokens: row.input_tokens.unwrap_or(0),
        output_tokens: row.output_tokens.unwrap_or(0),
        cache_read_input_tokens: row.cache_read_input_tokens.unwrap_or(0),
        cache_creation_input_tokens: row.cache_creation_input_tokens.unwrap_or(0),
        total_tokens: row.total_tokens.unwrap_or(0),
        call_count: row.call_count.unwrap_or(0),
    })
}

#[cfg(test)]
mod tests {
    use super::{estimate_pricing, resolve_model_pricing};

    #[test]
    fn resolves_gpt_5_4_pricing() {
        let pricing = resolve_model_pricing("codex", Some("gpt-5.4")).unwrap();
        assert_eq!(pricing.input_per_million_usd, 2.5);
        assert_eq!(pricing.output_per_million_usd, 15.0);
    }

    #[test]
    fn resolves_gpt_5_codex_pricing() {
        let pricing = resolve_model_pricing("codex", Some("gpt-5-codex")).unwrap();
        assert_eq!(pricing.input_per_million_usd, 1.25);
        assert_eq!(pricing.output_per_million_usd, 10.0);
    }

    #[test]
    fn resolves_known_codex_pricing() {
        let pricing = resolve_model_pricing("codex", Some("gpt-5.3-codex")).unwrap();
        assert_eq!(pricing.input_per_million_usd, 4.0);
        assert_eq!(pricing.output_per_million_usd, 16.0);
    }

    #[test]
    fn marks_unknown_models_as_unmapped() {
        let pricing = estimate_pricing("claude", Some("claude-unknown"), 1000, 1000, None);
        assert_eq!(pricing.pricing_status, "unmapped");
        assert!(pricing.estimated_total_cost_usd.is_none());
    }
}
