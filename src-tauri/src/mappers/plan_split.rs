//! 计划拆分 mapper。
//!
//! 对应 `commands/plan_split.rs` 的 DB 操作。SQL 模板见 `sql/plan_split.html`。
//! task_split_sessions（20 列）与 plan_split_logs（7 列）的 CRUD 全部在此。
//!
//! 所有函数首参均为 `&dyn Executor`，因此命令层既可传入 `db::rb()`，
//! 也可传入事务执行器。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{PlanSplitLogRow, PlanSplitSessionRow, SingleColumnRow};

/// 插入/更新拆分会话的参数结构（字段名与 `sql/plan_split.html` 的 `#{session.xxx}` 对应）。
///
/// `parsed_output` 列在命令层映射为 `PlanSplitSession.result_json`。
/// 整数列（granularity / current_form_index）用 `i64` / `Option<i64>` 传递。
#[derive(Clone, Debug, Serialize)]
pub struct PlanSplitSessionUpsert {
    pub id: String,
    pub plan_id: String,
    pub status: String,
    pub execution_session_id: Option<String>,
    pub raw_content: Option<String>,
    pub parsed_output: Option<rbs::Value>,
    pub parse_error: Option<String>,
    pub error_message: Option<String>,
    pub granularity: i64,
    pub task_count_mode: String,
    pub llm_messages_json: Option<rbs::Value>,
    pub messages_json: Option<rbs::Value>,
    pub execution_request_json: Option<rbs::Value>,
    pub form_queue_json: Option<rbs::Value>,
    pub current_form_index: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub stopped_at: Option<String>,
}

// ===================== task_split_sessions 查询 =====================

/// 按 plan_id 查询拆分会话（完整行）。
#[html_sql("sql/plan_split.html")]
pub async fn get_plan_split_session_by_plan(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<PlanSplitSessionRow> {
    impled!()
}

/// 按 plan_id 查询拆分会话 id（判断是否已存在）。
#[html_sql("sql/plan_split.html")]
pub async fn get_plan_split_session_id_by_plan(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

// ===================== task_split_sessions 写入 =====================

/// 插入拆分会话（完整行）。
pub async fn insert_plan_split_session(
    rb: &dyn Executor,
    session: &PlanSplitSessionUpsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into task_split_sessions (id, plan_id, status, execution_session_id, raw_content, parsed_output, parse_error, error_message, granularity, task_count_mode, llm_messages_json, messages_json, execution_request_json, form_queue_json, current_form_index, created_at, updated_at, started_at, completed_at, stopped_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(session.id.clone()),
            rbs::Value::String(session.plan_id.clone()),
            rbs::Value::String(session.status.clone()),
            session
                .execution_session_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session
                .raw_content
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session.parsed_output.clone().unwrap_or(rbs::Value::Null),
            session
                .parse_error
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session
                .error_message
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(session.granularity),
            rbs::Value::String(session.task_count_mode.clone()),
            session
                .llm_messages_json
                .clone()
                .unwrap_or(rbs::Value::Null),
            session.messages_json.clone().unwrap_or(rbs::Value::Null),
            session
                .execution_request_json
                .clone()
                .unwrap_or(rbs::Value::Null),
            session
                .form_queue_json
                .clone()
                .unwrap_or(rbs::Value::Null),
            session
                .current_form_index
                .map(rbs::Value::I64)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(session.created_at.clone()),
            rbs::Value::String(session.updated_at.clone()),
            session
                .started_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session
                .completed_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session
                .stopped_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
        ],
    )
    .await
}

/// 更新拆分会话（按 id）。
pub async fn update_plan_split_session(
    rb: &dyn Executor,
    session: &PlanSplitSessionUpsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update task_split_sessions set status = ?, execution_session_id = ?, raw_content = ?, parsed_output = ?, parse_error = ?, error_message = ?, granularity = ?, task_count_mode = ?, llm_messages_json = ?, messages_json = ?, execution_request_json = ?, form_queue_json = ?, current_form_index = ?, updated_at = ?, started_at = ?, completed_at = ?, stopped_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(session.status.clone()),
            session
                .execution_session_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session
                .raw_content
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session.parsed_output.clone().unwrap_or(rbs::Value::Null),
            session
                .parse_error
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session
                .error_message
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(session.granularity),
            rbs::Value::String(session.task_count_mode.clone()),
            session
                .llm_messages_json
                .clone()
                .unwrap_or(rbs::Value::Null),
            session.messages_json.clone().unwrap_or(rbs::Value::Null),
            session
                .execution_request_json
                .clone()
                .unwrap_or(rbs::Value::Null),
            session
                .form_queue_json
                .clone()
                .unwrap_or(rbs::Value::Null),
            session
                .current_form_index
                .map(rbs::Value::I64)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(session.updated_at.clone()),
            session
                .started_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session
                .completed_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            session
                .stopped_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(session.id.clone()),
        ],
    )
    .await
}

/// 按 plan_id 删除拆分会话。
pub async fn delete_task_split_session_by_plan(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from task_split_sessions where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}

// ===================== plan_split_logs 查询 =====================

/// 按 plan_id 列出全部日志。
#[html_sql("sql/plan_split.html")]
pub async fn list_plan_split_logs_by_plan(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<PlanSplitLogRow> {
    impled!()
}

/// 按 plan_id 列出最近 N 条日志（子查询 DESC LIMIT 后再 ASC 排序）。
#[html_sql("sql/plan_split.html")]
pub async fn list_recent_plan_split_logs(
    rb: &dyn Executor,
    plan_id: &str,
    limit: i64,
) -> Vec<PlanSplitLogRow> {
    impled!()
}

/// 按 session_id 查询 content 类型日志的 content 单列。
#[html_sql("sql/plan_split.html")]
pub async fn list_content_logs_by_session(
    rb: &dyn Executor,
    session_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 按 session_id 查询结构化输出相关日志。
#[html_sql("sql/plan_split.html")]
pub async fn list_structured_output_logs_by_session(
    rb: &dyn Executor,
    session_id: &str,
) -> Vec<PlanSplitLogRow> {
    impled!()
}

/// 按 plan_id 查询日志 id 列表（用于按时间戳过滤后删除）。
#[html_sql("sql/plan_split.html")]
pub async fn list_plan_split_log_ids_by_plan(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

// ===================== plan_split_logs 写入 =====================

/// 插入拆分日志。
pub async fn insert_plan_split_log(
    rb: &dyn Executor,
    id: &str,
    plan_id: &str,
    session_id: &str,
    log_type: &str,
    content: &str,
    metadata: Option<rbs::Value>,
    created_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into plan_split_logs (id, plan_id, session_id, log_type, content, metadata, created_at) values (?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(plan_id.to_string()),
            rbs::Value::String(session_id.to_string()),
            rbs::Value::String(log_type.to_string()),
            rbs::Value::String(content.to_string()),
            metadata.unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

/// 更新拆分日志内容与元数据（按 id）。
pub async fn update_plan_split_log(
    rb: &dyn Executor,
    id: &str,
    content: &str,
    metadata: Option<rbs::Value>,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update plan_split_logs set content = ?, metadata = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(content.to_string()),
            metadata.unwrap_or(rbs::Value::Null),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 按 id 删除单条日志。
pub async fn delete_plan_split_log_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from plan_split_logs where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 按 plan_id + session_id 删除日志。
pub async fn delete_plan_split_logs_by_plan_and_session(
    rb: &dyn Executor,
    plan_id: &str,
    session_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from plan_split_logs where plan_id = ? and session_id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(plan_id.to_string()),
            rbs::Value::String(session_id.to_string()),
        ],
    )
    .await
}

/// 按 plan_id 删除全部日志。
pub async fn delete_plan_split_logs_by_plan(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from plan_split_logs where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}

/// 按 id 批量删除日志（手动构建 IN 列表）。
pub async fn delete_plan_split_logs_by_ids(
    rb: &dyn Executor,
    ids: &Vec<String>,
) -> Result<ExecResult, rbatis::Error> {
    if ids.is_empty() {
        return Ok(ExecResult::default());
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!("delete from plan_split_logs where id in ({})", placeholders);
    let params: Vec<rbs::Value> = ids.iter().map(|id| rbs::Value::String(id.clone())).collect();
    rb.exec(&sql, params).await
}
