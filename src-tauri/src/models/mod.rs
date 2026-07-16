//! RBatis 实体模型层。
//!
//! 与前端 TS 类型一一对应（后端 `#[serde(rename_all = "camelCase")]`）。
//! 字段用 `Option<T>` 以适配 rbatis 的行映射（NULL 列 → None）。
//!
//! 阶段 0 为空占位；阶段 1+ 按业务模块逐步添加实体。

use serde::{Deserialize, Serialize};

/// 把 `rbs::Value`（可能是 Array/Map/String/Null 等）转回 JSON 字符串。
///
/// rbdc-sqlite 在 decode TEXT 列时，若内容是合法 JSON（如 `["a","b"]` 或
/// `{"x":1}`），会自动解析成 `rbs::Value::Array` / `rbs::Value::Map`，
/// 导致无法直接映射到 `Option<String>`。把对应 Row 字段声明为
/// `Option<rbs::Value>`，再用此辅助函数在命令层转回 JSON 文本。
///
/// - `String(s)`：直接返回原始字符串（保留入库时的原样，不二次转义）。
/// - `Array/Map/Bool/I32/I64/...`：用 `serde_json::to_string` 序列化为 JSON 文本。
/// - `Null` 或 `None`：返回 `"null"`。
pub fn value_to_json_string(v: Option<rbs::Value>) -> String {
    match v {
        None | Some(rbs::Value::Null) => "null".to_string(),
        Some(rbs::Value::String(s)) => s,
        Some(other) => serde_json::to_string(&other).unwrap_or_else(|_| "null".to_string()),
    }
}

/// 同 [`value_to_json_string`]，但 NULL 列保持 `None`（用于 `Option<String>` 字段）。
pub fn value_to_json_string_opt(v: Option<rbs::Value>) -> Option<String> {
    match v {
        None | Some(rbs::Value::Null) => None,
        Some(rbs::Value::String(s)) => Some(s),
        Some(other) => Some(serde_json::to_string(&other).unwrap_or_else(|_| "null".to_string())),
    }
}

/// `project_access_log` 表的行映射结构（仅 select 单列时使用）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProjectAccessRow {
    pub project_id: Option<String>,
}

/// `sessions` 表的行映射结构。
///
/// 字段全部使用 `Option<T>` 以适配 rbatis 行映射（NULL 列 → None）。
/// 布尔列（pinned/plan_mode）在 SQLite 中存为 INTEGER，这里映射为 `Option<i64>`，
/// 在命令层转换为 `bool`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionRow {
    pub id: Option<String>,
    pub project_id: Option<String>,
    pub name: Option<String>,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_type: Option<String>,
    pub cli_session_id: Option<String>,
    pub cli_session_provider: Option<String>,
    pub status: Option<String>,
    pub pinned: Option<i64>,
    pub last_message: Option<String>,
    pub error_message: Option<String>,
    pub message_count: Option<i64>,
    pub plan_mode: Option<i64>,
    pub source: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `session_runtime_bindings` 表的行映射结构。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionRuntimeBindingRow {
    pub session_id: Option<String>,
    pub runtime_key: Option<String>,
    pub external_session_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `file_change_traces` 表的行映射结构。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeTraceRow {
    pub id: Option<String>,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
    pub tool_call_id: Option<String>,
    pub file_path: Option<String>,
    pub relative_path: Option<String>,
    pub change_type: Option<String>,
    pub before_content: Option<String>,
    pub after_content: Option<String>,
    pub status: Option<String>,
    pub created_at: Option<String>,
}

/// 单列查询辅助结构（如 `SELECT p.path ...`、`SELECT pinned ...`）。
///
/// `value` 声明为 `Option<rbs::Value>`：rbdc-sqlite 在 decode TEXT 列时，
/// 若内容是合法 JSON（如 `["a","b"]` 或 `{"x":1}`），会自动解析成
/// `rbs::Value::Array` / `rbs::Value::Map`，无法直接映射到 `Option<String>`；
/// 同时也能避免查询返回 0 行时 `invalid length 0` 的反序列化错误。
/// 命令层用 [`value_to_json_string_opt`] 还原为 `Option<String>`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SingleColumnRow {
    pub value: Option<rbs::Value>,
}

/// 单列 JSON TEXT 查询辅助结构（如 `SELECT config ...`）。
///
/// 与 [`SingleColumnRow`] 的区别：`value` 声明为 `Option<rbs::Value>`，用于
/// 读取会被 rbdc-sqlite 自动解析为 Array/Map 的 JSON TEXT 单列。
/// 命令层用 [`value_to_json_string_opt`] 还原为 `Option<String>`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JsonColumnRow {
    pub value: Option<rbs::Value>,
}

/// 整型单列查询辅助结构（如 `SELECT COALESCE(pinned, 0)`）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IntColumnRow {
    pub value: Option<i64>,
}

/// `app_state` 表的行映射结构（key/value + 时间戳）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppStateRow {
    pub key: Option<String>,
    pub value: Option<String>,
    pub updated_at: Option<i64>,
}

/// `app_settings` 表的行映射结构（key/value 两列查询）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppSettingRow {
    pub key: Option<String>,
    pub value: Option<rbs::Value>,
}

/// `window_session_locks` 表的行映射结构（查 window_label 单列时使用）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WindowSessionLockRow {
    pub window_label: Option<String>,
}

/// `agent_plan_snapshots` 表的行映射结构。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentPlanSnapshotRow {
    pub id: Option<String>,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
    /// JSON TEXT 列：rbdc-sqlite 会按内容智能解析，故声明为 `rbs::Value`。
    pub plan_json: Option<rbs::Value>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub seq: Option<i64>,
}

// ============================================================================
// Agent 模块（agents / agent_mcp_configs / agent_skills_configs /
// agent_plugins_configs / agent_models）行映射结构。
//
// 字段统一使用 `Option<T>`：字符串列 `Option<String>`，整数列 `Option<i64>`
// （rbdc-sqlite 把 INTEGER 解码为 i64；布尔语义由命令层 `!= 0` 还原），
// 浮点列 `Option<f64>`。命令层负责把这些 Row 转成对外的强类型 DTO。
// 单列标量读取（provider / ACP 命令）复用上面的 `SingleColumnRow`。
// ============================================================================

/// `agents` 表行映射。`type` 列在 SQL 中以 `type as agent_type` 取别名以匹配字段名。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentRow {
    pub id: Option<String>,
    pub name: Option<String>,
    pub agent_type: Option<String>,
    pub provider: Option<String>,
    pub cli_path: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model_id: Option<String>,
    pub custom_model_enabled: Option<i64>,
    pub mode: Option<String>,
    pub model: Option<String>,
    pub status: Option<String>,
    pub test_message: Option<String>,
    pub tested_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub acp_command: Option<String>,
}

/// `agent_mcp_configs` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentMcpConfigRow {
    pub id: Option<String>,
    pub agent_id: Option<String>,
    pub name: Option<String>,
    pub transport_type: Option<String>,
    pub command: Option<String>,
    /// JSON TEXT 列。
    pub args: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub env: Option<rbs::Value>,
    pub url: Option<String>,
    /// JSON TEXT 列。
    pub headers: Option<rbs::Value>,
    pub scope: Option<String>,
    pub enabled: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `agent_skills_configs` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentSkillsConfigRow {
    pub id: Option<String>,
    pub agent_id: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub skill_path: Option<String>,
    pub scripts_path: Option<String>,
    pub references_path: Option<String>,
    pub assets_path: Option<String>,
    pub enabled: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `agent_plugins_configs` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentPluginsConfigRow {
    pub id: Option<String>,
    pub agent_id: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub plugin_path: Option<String>,
    pub enabled: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `agent_models` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentModelRow {
    pub id: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub display_name: Option<String>,
    pub is_builtin: Option<i64>,
    pub is_default: Option<i64>,
    pub sort_order: Option<i64>,
    pub enabled: Option<i64>,
    pub context_window: Option<i64>,
    pub input_cost_per_million_usd: Option<f64>,
    pub output_cost_per_million_usd: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// ============================================================================
// Plan 模块（plans / plan_memory_libraries）行映射结构。
// ============================================================================

/// `plans` 表行映射。
///
/// 布尔/整数列在 SQLite 中存为 INTEGER，映射为 `Option<i64>`；
/// 命令层负责转 `i32`/`String` 等对外类型。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanRow {
    pub id: Option<String>,
    pub project_id: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    /// JSON TEXT 列。
    pub execution_overview: Option<rbs::Value>,
    pub execution_overview_updated_at: Option<String>,
    pub split_mode: Option<String>,
    pub status: Option<String>,
    /// JSON TEXT 列。
    pub agent_team: Option<rbs::Value>,
    pub split_expert_id: Option<String>,
    pub split_agent_id: Option<String>,
    pub split_model_id: Option<String>,
    pub granularity: Option<i64>,
    pub max_retry_count: Option<i64>,
    pub execution_status: Option<String>,
    pub current_task_id: Option<String>,
    pub scheduled_at: Option<String>,
    pub schedule_status: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `plan_memory_libraries` 表行映射（仅查 library_id 单列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanMemoryLibraryRow {
    pub library_id: Option<String>,
}

/// `tasks` 表行映射（仅查 plan 关联任务 id 单列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanTaskIdRow {
    pub id: Option<String>,
}

// ============================================================================
// SubAgent 模块（sub_agents / 引用计数）行映射结构。
// ============================================================================

/// `sub_agents` 表行映射。
///
/// 布尔列（is_builtin / is_enabled / is_system）存为 INTEGER，映射为 `Option<i64>`；
/// 命令层转 `bool`。JSON 数组列（tags / recommended_scenes / tools /
/// disallowed_tools）以文本存取，命令层做 serde_json 反序列化。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubAgentRow {
    pub id: Option<String>,
    pub builtin_code: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub prompt: Option<String>,
    pub category: Option<String>,
    /// JSON TEXT 列。
    pub tags: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub recommended_scenes: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub tools: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub disallowed_tools: Option<rbs::Value>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub max_turns: Option<i64>,
    pub is_builtin: Option<i64>,
    pub is_enabled: Option<i64>,
    pub is_system: Option<i64>,
    pub sort_order: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// 引用计数查询辅助结构（plans/tasks/sessions 三列 COUNT）。
#[allow(dead_code)]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubAgentReferenceCountRow {
    pub plans: Option<i64>,
    pub tasks: Option<i64>,
    pub sessions: Option<i64>,
}

// ============================================================================
// ProviderProfile 模块（provider_profiles）行映射结构。
// ============================================================================

/// `provider_profiles` 表行映射。
///
/// `is_active` 在 SQLite 中存为 INTEGER，映射为 `Option<i64>`，
/// 命令层转 `bool`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProviderProfileRow {
    pub id: Option<String>,
    pub name: Option<String>,
    pub cli_type: Option<String>,
    pub is_active: Option<i64>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub provider_name: Option<String>,
    pub main_model: Option<String>,
    pub reasoning_model: Option<String>,
    pub haiku_model: Option<String>,
    pub sonnet_default: Option<String>,
    pub opus_default: Option<String>,
    pub codex_model: Option<String>,
    /// JSON TEXT 列。
    pub opencode_provider_models: Option<rbs::Value>,
    pub opencode_provider_npm: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// ============================================================================
// 记忆库仓库（memory_repos / memory_repo_sources）行映射结构。
// 布尔列（internal_tools_enabled / enabled）存为 INTEGER，映射为 Option<i64>，
// 命令层用 `unwrap_or(0) != 0` 还原为 bool。
// ============================================================================

/// `memory_repos` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryRepoRow {
    pub id: Option<String>,
    pub name: Option<String>,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub repo_path: Option<String>,
    pub format: Option<String>,
    pub system_prompt: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub internal_tools_enabled: Option<i64>,
    pub enabled: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `memory_repo_sources` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryRepoSourceRow {
    pub id: Option<String>,
    pub repo_id: Option<String>,
    pub source_type: Option<String>,
    /// JSON TEXT 列。
    pub config: Option<rbs::Value>,
    pub enabled: Option<i64>,
    pub created_at: Option<String>,
}

// ============================================================================
// 记忆库定时任务（memory_jobs / memory_job_runs）行映射结构。
// ============================================================================

/// `memory_jobs` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryJobRow {
    pub id: Option<String>,
    pub repo_id: Option<String>,
    pub name: Option<String>,
    pub instruction: Option<String>,
    pub cron: Option<String>,
    pub next_run_at: Option<String>,
    pub schedule_status: Option<String>,
    pub last_run_at: Option<String>,
    pub last_run_status: Option<String>,
    pub last_run_summary: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `memory_job_runs` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryJobRunRow {
    pub id: Option<String>,
    pub job_id: Option<String>,
    pub repo_id: Option<String>,
    pub status: Option<String>,
    pub summary: Option<String>,
    /// JSON TEXT 列。
    pub files_changed: Option<rbs::Value>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

// ============================================================================
// CLI 路径配置（cli_paths）行映射结构。
// ============================================================================

/// `cli_paths` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CliPathRow {
    pub id: Option<String>,
    pub name: Option<String>,
    pub path: Option<String>,
    pub version: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// ============================================================================
// Task / Task Execution 模块（tasks / task_runtime_bindings /
// task_split_sessions / task_execution_logs / task_execution_results）行映射。
//
// 字段统一使用 `Option<T>`：字符串列 `Option<String>`，整数列 `Option<i64>`
// （rbdc-sqlite 把 INTEGER 解码为 i64）。命令层负责把这些 Row 转成对外的强类型 DTO。
// ============================================================================

/// `tasks` 表完整行映射。
///
/// 覆盖 tasks 表全部列（含 last_result_* / task_order / retry_count 等），
/// SQL 模板中按此顺序 select；命令层据此构造 `Task` DTO。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskRow {
    pub id: Option<String>,
    pub project_id: Option<String>,
    pub plan_id: Option<String>,
    pub parent_id: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assignee: Option<String>,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub session_id: Option<String>,
    pub cli_session_provider: Option<String>,
    pub progress_file: Option<String>,
    /// JSON TEXT 列。
    pub dependencies: Option<rbs::Value>,
    pub task_order: Option<i64>,
    pub retry_count: Option<i64>,
    pub max_retries: Option<i64>,
    pub error_message: Option<String>,
    /// JSON TEXT 列。
    pub implementation_steps: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub test_steps: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub acceptance_criteria: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub memory_library_ids: Option<rbs::Value>,
    pub block_reason: Option<String>,
    /// JSON TEXT 列。
    pub input_request: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub input_response: Option<rbs::Value>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `task_runtime_bindings` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskRuntimeBindingRow {
    pub task_id: Option<String>,
    pub runtime_key: Option<String>,
    pub external_session_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `task_split_sessions` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SplitSessionRow {
    pub id: Option<String>,
    pub plan_id: Option<String>,
    pub status: Option<String>,
    pub raw_content: Option<String>,
    /// JSON TEXT 列。
    pub parsed_output: Option<rbs::Value>,
    pub parse_error: Option<String>,
    pub granularity: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `task_execution_logs` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskExecutionLogRow {
    pub id: Option<String>,
    pub task_id: Option<String>,
    pub log_type: Option<String>,
    pub content: Option<String>,
    /// JSON TEXT 列。
    pub metadata: Option<rbs::Value>,
    pub created_at: Option<String>,
}

/// `task_execution_results` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskExecutionResultRow {
    pub id: Option<String>,
    pub task_id: Option<String>,
    pub plan_id: Option<String>,
    pub task_title_snapshot: Option<String>,
    pub task_description_snapshot: Option<String>,
    pub result_status: Option<String>,
    pub result_summary: Option<String>,
    /// JSON TEXT 列。
    pub result_files: Option<rbs::Value>,
    pub fail_reason: Option<String>,
    pub created_at: Option<String>,
}

/// 计划执行进度行映射（tasks 表的子集列，list_plan_execution_progress 用）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanExecutionTaskRow {
    pub id: Option<String>,
    pub title: Option<String>,
    pub status: Option<String>,
    pub task_order: Option<i64>,
    pub expert_id: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub last_result_status: Option<String>,
    pub last_result_summary: Option<String>,
    /// JSON TEXT 列。
    pub last_result_files: Option<rbs::Value>,
    pub last_fail_reason: Option<String>,
    pub last_result_at: Option<String>,
    pub updated_at: Option<String>,
}

/// 计划执行概览行映射（build_plan_execution_overview 用，tasks 表子集）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskOverviewRow {
    pub title: Option<String>,
    pub last_result_status: Option<String>,
    pub last_result_summary: Option<String>,
    /// JSON TEXT 列。
    pub last_result_files: Option<rbs::Value>,
    pub last_fail_reason: Option<String>,
}

/// 任务依赖行映射（cleanup_deleted_task_references 读 (id, dependencies)）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskDependencyRow {
    pub id: Option<String>,
    /// JSON TEXT 列。
    pub dependencies: Option<rbs::Value>,
}

/// plans 表执行概览行映射（list_plan_execution_progress 读存储概览）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanExecutionOverviewRow {
    /// JSON TEXT 列。
    pub execution_overview: Option<rbs::Value>,
    pub execution_overview_updated_at: Option<String>,
}

/// 旧表 `memory_libraries` 行映射（迁移专用：id, name, description, content_md）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LegacyMemoryLibraryRow {
    pub id: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub content_md: Option<String>,
}

// ============================================================================
// SOLO 模块（solo_runs / solo_steps / solo_logs / solo_runtime_bindings）行映射。
//
// 字段统一使用 `Option<T>`：字符串列 `Option<String>`，整数列 `Option<i64>`
// （rbdc-sqlite 把 INTEGER 解码为 i64；命令层转 i32）。JSON 列以序列化后的
// TEXT 存取，命令层做 serde_json。SQL 模板中按此列顺序 select。
// ============================================================================

/// `solo_runs` 表完整行映射（24 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SoloRunRow {
    pub id: Option<String>,
    pub project_id: Option<String>,
    pub execution_path: Option<String>,
    pub name: Option<String>,
    pub requirement: Option<String>,
    pub goal: Option<String>,
    /// JSON TEXT 列。
    pub memory_library_ids_json: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub participant_expert_ids_json: Option<rbs::Value>,
    pub coordinator_expert_id: Option<String>,
    pub coordinator_agent_id: Option<String>,
    pub coordinator_model_id: Option<String>,
    pub max_dispatch_depth: Option<i64>,
    pub current_depth: Option<i64>,
    pub current_step_id: Option<String>,
    pub status: Option<String>,
    pub execution_status: Option<String>,
    pub last_error: Option<String>,
    /// JSON TEXT 列。
    pub input_request_json: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub input_response_json: Option<rbs::Value>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub stopped_at: Option<String>,
}

/// `solo_steps` 表完整行映射（18 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SoloStepRow {
    pub id: Option<String>,
    pub run_id: Option<String>,
    pub step_ref: Option<String>,
    pub parent_step_ref: Option<String>,
    pub depth: Option<i64>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub execution_prompt: Option<String>,
    pub selected_expert_id: Option<String>,
    pub status: Option<String>,
    pub summary: Option<String>,
    pub result_summary: Option<String>,
    /// JSON TEXT 列。
    pub result_files_json: Option<rbs::Value>,
    pub fail_reason: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

/// `solo_logs` 表完整行映射（8 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SoloLogRow {
    pub id: Option<String>,
    pub run_id: Option<String>,
    pub step_id: Option<String>,
    pub scope: Option<String>,
    pub log_type: Option<String>,
    pub content: Option<String>,
    /// JSON TEXT 列。
    pub metadata: Option<rbs::Value>,
    pub created_at: Option<String>,
}

/// `solo_runtime_bindings` 表行映射（5 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SoloRuntimeBindingRow {
    pub run_id: Option<String>,
    pub runtime_key: Option<String>,
    pub external_session_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// ============================================================================
// MCP 模块（mcp_servers）行映射。
//
// `enabled`/`tool_count` 在 SQLite 中存为 INTEGER，映射为 `Option<i64>`，
// 命令层用 `unwrap_or(0) != 0` 还原为 bool。SQL 模板按列顺序 select。
// ============================================================================

/// `mcp_servers` 表完整行映射（15 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpServerRow {
    pub id: Option<String>,
    pub name: Option<String>,
    pub server_type: Option<String>,
    pub command: Option<String>,
    /// JSON TEXT 列。
    pub args: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub env: Option<rbs::Value>,
    pub url: Option<String>,
    /// JSON TEXT 列。
    pub headers: Option<rbs::Value>,
    pub enabled: Option<i64>,
    pub test_status: Option<String>,
    pub test_message: Option<String>,
    pub tool_count: Option<i64>,
    pub tested_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// MCP 运行时配置行映射（load_runtime_server_config 查 7 列子集）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpRuntimeConfigRow {
    pub name: Option<String>,
    pub server_type: Option<String>,
    pub command: Option<String>,
    /// JSON TEXT 列。
    pub args: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub env: Option<rbs::Value>,
    pub url: Option<String>,
    /// JSON TEXT 列。
    pub headers: Option<rbs::Value>,
}

/// MCP 服务器 (server_type, name) 行映射（删除/更新时读旧配置用）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpServerNameTypeRow {
    pub server_type: Option<String>,
    pub name: Option<String>,
}

// ============================================================================
// 记忆模块（memory_libraries / raw_memory_records / memory_merge_runs /
// memory_library_chunks / session_memory_reference_history）行映射结构。
//
// 字段统一使用 `Option<T>` 以适配 rbatis 行映射（NULL 列 → None）。
// JSON 列（source_record_ids）以 TEXT 存取，命令层用 serde_json 解析。
// ============================================================================

/// `memory_libraries` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryLibraryRow {
    pub id: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub content_md: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `raw_memory_records` 行映射（含 sessions/projects 的 name 关联，共 10 列）。
///
/// select 列顺序固定为：
/// `r.id, r.session_id, s.name, r.project_id, p.name, r.message_id,`
/// `r.content, r.source_role, r.created_at, r.updated_at`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RawMemoryRecordRow {
    pub id: Option<String>,
    pub session_id: Option<String>,
    pub session_name: Option<String>,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub message_id: Option<String>,
    pub content: Option<rbs::Value>,
    pub source_role: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `memory_merge_runs` 表行映射。`source_record_ids` 以 JSON TEXT 存储。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryMergeRunRow {
    pub id: Option<String>,
    pub library_id: Option<String>,
    /// JSON TEXT 列。
    pub source_record_ids: Option<rbs::Value>,
    pub source_record_count: Option<i64>,
    pub previous_content_md: Option<String>,
    pub merged_content_md: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub created_at: Option<String>,
}

/// `memory_library_chunks` 行映射（搜索建议用，5 列子集）。
///
/// select 列顺序：`c.id, c.chunk_text, l.id, l.name, l.updated_at`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryLibraryChunkSearchRow {
    pub id: Option<String>,
    pub chunk_text: Option<String>,
    pub library_id: Option<String>,
    pub library_name: Option<String>,
    pub library_updated_at: Option<String>,
}

/// `raw_memory_records` 行映射（搜索建议用，7 列子集）。
///
/// select 列顺序：`r.id, r.content, r.session_id, s.name, r.project_id, p.name, r.created_at`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RawMemorySearchRow {
    pub id: Option<String>,
    pub content: Option<rbs::Value>,
    pub session_id: Option<String>,
    pub session_name: Option<String>,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub created_at: Option<String>,
}

/// `agent_cli_usage_records` 表完整行映射（22 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCliUsageRow {
    pub execution_id: Option<String>,
    pub execution_mode: Option<String>,
    pub provider: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name_snapshot: Option<String>,
    pub model_id: Option<String>,
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    pub task_id: Option<String>,
    pub message_id: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub cache_read_input_tokens: Option<i64>,
    pub cache_creation_input_tokens: Option<i64>,
    pub call_count: Option<i64>,
    pub estimated_input_cost_usd: Option<f64>,
    pub estimated_output_cost_usd: Option<f64>,
    pub estimated_total_cost_usd: Option<f64>,
    pub pricing_status: Option<String>,
    pub pricing_version: Option<String>,
    pub occurred_at: Option<String>,
    pub created_at: Option<String>,
}

/// CLI 用量汇总（单行 SUM 聚合）行映射。10 列均为 COALESCE 聚合结果。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UsageSummaryRow {
    pub total_calls: Option<i64>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
    pub cache_creation_tokens: Option<i64>,
    pub estimated_input_cost_usd: Option<f64>,
    pub estimated_output_cost_usd: Option<f64>,
    pub estimated_total_cost_usd: Option<f64>,
    pub unpriced_calls: Option<i64>,
}

/// CLI 用量时间趋势单点（按 bucket 分组聚合）行映射。10 列。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UsageTimelineRow {
    pub bucket: Option<String>,
    pub call_count: Option<i64>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
    pub cache_creation_tokens: Option<i64>,
    pub estimated_input_cost_usd: Option<f64>,
    pub estimated_output_cost_usd: Option<f64>,
    pub estimated_total_cost_usd: Option<f64>,
}

/// CLI 用量维度明细行（按 dimension 聚合）行映射。9 列。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UsageBreakdownRow {
    pub dimension_id: Option<String>,
    pub dimension_label: Option<String>,
    pub provider: Option<String>,
    pub call_count: Option<i64>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub estimated_total_cost_usd: Option<f64>,
    pub unpriced_calls: Option<i64>,
}

/// CLI 用量堆叠图单点（bucket × dimension 聚合）行映射。9 列。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UsageStackedRow {
    pub bucket: Option<String>,
    pub dimension_id: Option<String>,
    pub dimension_label: Option<String>,
    pub provider: Option<String>,
    pub call_count: Option<i64>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub estimated_total_cost_usd: Option<f64>,
}

/// 会话级用量汇总（query_session_usage_summary）行映射。6 列。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionUsageRow {
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub cache_read_input_tokens: Option<i64>,
    pub cache_creation_input_tokens: Option<i64>,
    pub call_count: Option<i64>,
}

/// 可疑 Claude 历史记录行映射（修复用，3 列子集）。
///
/// select 列顺序：`execution_id, input_tokens, output_tokens`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SuspiciousHistoryRow {
    pub execution_id: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
}

/// agent_models 价格行映射（fetch_user_model_pricing 用，2 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentModelPricingRow {
    pub input_cost_per_million_usd: Option<f64>,
    pub output_cost_per_million_usd: Option<f64>,
}

/// 参照存在性检查行映射（reference_exists，单列别名 value）。
#[allow(dead_code)]
pub type ReferenceExistsRow = IntColumnRow;

// ============================================================================
// Project 模块（projects 表 + LEFT JOIN sessions 计数）行映射结构。
// ============================================================================

/// `projects` 表行映射（含 LEFT JOIN sessions 聚合的 session_count）。
///
/// `session_count` 在 SQL 中以 `COALESCE(s.session_count, 0)` 取别名，
/// 映射为 `Option<i64>`，命令层转 `i32`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProjectRow {
    pub id: Option<String>,
    pub name: Option<String>,
    pub path: Option<String>,
    pub description: Option<String>,
    pub session_count: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// ============================================================================
// PlanSplit 模块（task_split_sessions 完整行 + plan_split_logs）行映射结构。
//
// task_split_sessions 的 `parsed_output` 列在业务 DTO 中对应 `result_json`；
// 整数列（granularity / current_form_index）映射为 `Option<i64>`。
// ============================================================================

/// `task_split_sessions` 表完整行映射（计划拆分会话，20 列）。
///
/// 覆盖建表 + ALTER 追加的全部列。`parsed_output` 列在命令层映射为
/// `PlanSplitSession.result_json`。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanSplitSessionRow {
    pub id: Option<String>,
    pub plan_id: Option<String>,
    pub status: Option<String>,
    pub execution_session_id: Option<String>,
    pub raw_content: Option<String>,
    /// JSON TEXT 列。
    pub parsed_output: Option<rbs::Value>,
    pub parse_error: Option<String>,
    pub error_message: Option<String>,
    pub granularity: Option<i64>,
    pub task_count_mode: Option<String>,
    /// JSON TEXT 列。
    pub llm_messages_json: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub messages_json: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub execution_request_json: Option<rbs::Value>,
    /// JSON TEXT 列。
    pub form_queue_json: Option<rbs::Value>,
    pub current_form_index: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub stopped_at: Option<String>,
}

/// `plan_split_logs` 表行映射。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlanSplitLogRow {
    pub id: Option<String>,
    pub plan_id: Option<String>,
    pub session_id: Option<String>,
    pub log_type: Option<String>,
    pub content: Option<String>,
    /// JSON TEXT 列。
    pub metadata: Option<rbs::Value>,
    pub created_at: Option<String>,
}

// ============================================================================
// Unattended 模块（unattended_channels / unattended_channel_accounts /
// unattended_threads / unattended_events）行映射结构。
//
// 字段统一使用 `Option<T>`：字符串列 `Option<String>`，整数列 `Option<i64>`
// （rbdc-sqlite 把 INTEGER 解码为 i64；布尔列 enabled / allow_all_senders
// 由命令层 `!= 0` 还原为 bool）。SQL 模板按列顺序 select。
// ============================================================================

/// `unattended_channels` 表行映射（12 列）。
///
/// `enabled` / `allow_all_senders` 存为 INTEGER，映射为 `Option<i64>`，
/// 命令层用 `unwrap_or(0) != 0` 还原为 bool。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnattendedChannelRow {
    pub id: Option<String>,
    pub channel_type: Option<String>,
    pub name: Option<String>,
    pub enabled: Option<i64>,
    pub default_project_id: Option<String>,
    pub default_agent_id: Option<String>,
    pub default_model_id: Option<String>,
    pub reply_style: Option<String>,
    pub allow_all_senders: Option<i64>,
    pub future_auth_mode: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `unattended_channel_accounts` 表行映射（13 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnattendedAccountRow {
    pub id: Option<String>,
    pub channel_id: Option<String>,
    pub account_id: Option<String>,
    pub user_id: Option<String>,
    pub base_url: Option<String>,
    pub bot_token: Option<String>,
    pub sync_cursor: Option<String>,
    pub login_status: Option<String>,
    pub runtime_status: Option<String>,
    pub last_connected_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `unattended_threads` 表行映射（14 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnattendedThreadRow {
    pub id: Option<String>,
    pub channel_account_id: Option<String>,
    pub peer_id: Option<String>,
    pub peer_name_snapshot: Option<String>,
    pub session_id: Option<String>,
    pub active_project_id: Option<String>,
    pub active_agent_id: Option<String>,
    pub active_model_id: Option<String>,
    pub last_context_token: Option<String>,
    pub last_plan_id: Option<String>,
    pub last_task_id: Option<String>,
    pub last_message_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `unattended_events` 表行映射（10 列）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnattendedEventRow {
    pub id: Option<String>,
    pub channel_account_id: Option<String>,
    pub thread_id: Option<String>,
    pub direction: Option<String>,
    pub event_type: Option<String>,
    pub status: Option<String>,
    pub summary: Option<String>,
    /// JSON TEXT 列。
    pub payload_json: Option<rbs::Value>,
    pub correlation_id: Option<String>,
    pub created_at: Option<String>,
}
