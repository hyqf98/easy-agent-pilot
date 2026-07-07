//! Plan（计划）mapper。
//!
//! 对应 `commands/plan.rs` 的 DB 操作。SQL 模板见 `sql/plan.html`。
//! 动态更新统一用 `<set>+<if>`，彻底取代旧 `format!` + 手动 `?N` 绑参的顺序耦合。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{PlanMemoryLibraryRow, PlanRow, PlanTaskIdRow};

/// 动态更新计划的参数结构（字段名与 `sql/plan.html` 模板中的 `#{update.xxx}` 对应）。
///
/// 三态语义：`UpdateField::Value(v)` → `*_present=true` + `Some(v)`；
/// `UpdateField::Null` → `*_present=true` + `None`（rbdc-sqlite 写成 SQL NULL）；
/// `UpdateField::Missing` → `*_present=false`（模板 `<if>` 跳过该列）。
/// 整数列（granularity / max_retry_count）在 SQLite 中存为 INTEGER，这里用 `Option<i64>`。
#[derive(Clone, Debug, Serialize)]
pub struct PlanUpdate {
    pub id: String,
    pub updated_at: String,
    pub name: Option<String>,
    pub name_present: bool,
    pub description: Option<String>,
    pub description_present: bool,
    pub execution_overview: Option<String>,
    pub execution_overview_present: bool,
    pub execution_overview_updated_at: Option<String>,
    pub execution_overview_updated_at_present: bool,
    pub split_mode: Option<String>,
    pub split_mode_present: bool,
    pub split_expert_id: Option<String>,
    pub split_expert_id_present: bool,
    pub split_agent_id: Option<String>,
    pub split_agent_id_present: bool,
    pub split_model_id: Option<String>,
    pub split_model_id_present: bool,
    pub status: Option<String>,
    pub status_present: bool,
    pub agent_team: Option<String>,
    pub agent_team_present: bool,
    pub granularity: Option<i64>,
    pub granularity_present: bool,
    pub max_retry_count: Option<i64>,
    pub max_retry_count_present: bool,
    pub execution_status: Option<String>,
    pub execution_status_present: bool,
    pub current_task_id: Option<String>,
    pub current_task_id_present: bool,
    pub scheduled_at: Option<String>,
    pub scheduled_at_present: bool,
    pub schedule_status: Option<String>,
    pub schedule_status_present: bool,
}

/// `Option<&str>` → `rbs::Value`（Some→String，None→Null）。
fn opt_str(s: Option<&str>) -> rbs::Value {
    match s {
        Some(v) => rbs::Value::String(v.to_string()),
        None => rbs::Value::Null,
    }
}

/// 列出指定项目的全部计划。
#[html_sql("sql/plan.html")]
pub async fn list_plans(rb: &dyn Executor, project_id: &str) -> Vec<PlanRow> {
    impled!()
}

/// 按 id 查询单个计划。
#[html_sql("sql/plan.html")]
pub async fn get_plan_by_id(rb: &dyn Executor, id: &str) -> Vec<PlanRow> {
    impled!()
}

/// 查询所有待执行的定时计划。
#[html_sql("sql/plan.html")]
pub async fn list_scheduled_plans(rb: &dyn Executor) -> Vec<PlanRow> {
    impled!()
}

/// 插入新计划（事务内）。
#[allow(clippy::too_many_arguments)]
pub async fn insert_plan(
    rb: &dyn Executor,
    id: &str,
    project_id: &str,
    name: &str,
    description: Option<&str>,
    split_mode: &str,
    split_expert_id: Option<&str>,
    split_agent_id: Option<&str>,
    split_model_id: Option<&str>,
    status: &str,
    agent_team: Option<&str>,
    granularity: i64,
    max_retry_count: i64,
    execution_status: &str,
    current_task_id: Option<&str>,
    execution_overview: Option<&str>,
    execution_overview_updated_at: Option<&str>,
    scheduled_at: Option<&str>,
    schedule_status: Option<&str>,
    created_at: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into plans (id, project_id, name, description, split_mode, split_expert_id, split_agent_id, split_model_id, status, agent_team, granularity, max_retry_count, execution_status, current_task_id, execution_overview, execution_overview_updated_at, scheduled_at, schedule_status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(project_id.to_string()),
            rbs::Value::String(name.to_string()),
            opt_str(description),
            rbs::Value::String(split_mode.to_string()),
            opt_str(split_expert_id),
            opt_str(split_agent_id),
            opt_str(split_model_id),
            rbs::Value::String(status.to_string()),
            opt_str(agent_team),
            rbs::Value::I64(granularity),
            rbs::Value::I64(max_retry_count),
            rbs::Value::String(execution_status.to_string()),
            opt_str(current_task_id),
            opt_str(execution_overview),
            opt_str(execution_overview_updated_at),
            opt_str(scheduled_at),
            opt_str(schedule_status),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 动态更新计划（<set>+<if>）。
// 动态更新计划：手动构建 SET + rb.exec，绕过 #[html_sql] 宏对 JSON 列参数的解析问题。
pub async fn update_plan(rb: &dyn Executor, update: &PlanUpdate) -> Result<ExecResult, rbatis::Error> {
    let mut sets: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params: Vec<rbs::Value> = vec![rbs::Value::String(update.updated_at.clone())];

    // 三态字符串字段
    macro_rules! push_str {
        ($col:expr, $present:ident, $val:ident) => {
            if update.$present {
                sets.push(format!("{} = ?", $col));
                match &update.$val {
                    Some(v) => params.push(rbs::Value::String(v.clone())),
                    None => params.push(rbs::Value::Null),
                }
            }
        };
    }
    push_str!("name", name_present, name);
    push_str!("description", description_present, description);
    push_str!("execution_overview", execution_overview_present, execution_overview);
    push_str!("execution_overview_updated_at", execution_overview_updated_at_present, execution_overview_updated_at);
    push_str!("split_mode", split_mode_present, split_mode);
    push_str!("split_expert_id", split_expert_id_present, split_expert_id);
    push_str!("split_agent_id", split_agent_id_present, split_agent_id);
    push_str!("split_model_id", split_model_id_present, split_model_id);
    push_str!("status", status_present, status);
    push_str!("agent_team", agent_team_present, agent_team);
    push_str!("execution_status", execution_status_present, execution_status);
    push_str!("current_task_id", current_task_id_present, current_task_id);
    push_str!("scheduled_at", scheduled_at_present, scheduled_at);
    push_str!("schedule_status", schedule_status_present, schedule_status);

    // i64 字段
    if update.granularity_present {
        sets.push("granularity = ?".to_string());
        params.push(update.granularity.map(rbs::Value::I64).unwrap_or(rbs::Value::Null));
    }
    if update.max_retry_count_present {
        sets.push("max_retry_count = ?".to_string());
        params.push(update.max_retry_count.map(rbs::Value::I64).unwrap_or(rbs::Value::Null));
    }

    let sql = format!("update plans set {} where id = ?", sets.join(", "));
    // WHERE 的 id 参数放最后
    params.push(rbs::Value::String(update.id.clone()));
    rb.exec(&sql, params).await
}

/// 取消计划定时。
pub async fn cancel_plan_schedule(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update plans set schedule_status = 'cancelled', scheduled_at = null, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

// ==================== plan_memory_libraries ====================

/// 查询计划关联的记忆库 id 列表。
#[html_sql("sql/plan.html")]
pub async fn list_plan_memory_library_ids(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<PlanMemoryLibraryRow> {
    impled!()
}

/// 删除计划关联的全部记忆库（事务内）。
pub async fn delete_plan_memory_libraries(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from plan_memory_libraries where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}

/// 插入一条计划-记忆库关联（事务内）。
pub async fn insert_plan_memory_library(
    rb: &dyn Executor,
    plan_id: &str,
    library_id: &str,
    created_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into plan_memory_libraries (plan_id, library_id, created_at) values (?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(plan_id.to_string()),
            rbs::Value::String(library_id.to_string()),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

// ==================== 关联清理（删除计划事务内） ====================

/// 查询计划关联的任务 id 列表。
#[html_sql("sql/plan.html")]
pub async fn list_plan_task_ids(rb: &dyn Executor, plan_id: &str) -> Vec<PlanTaskIdRow> {
    impled!()
}

pub async fn delete_plan_split_logs(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from plan_split_logs where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}

pub async fn delete_task_split_sessions(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from task_split_sessions where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}

pub async fn delete_task_execution_results(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from task_execution_results where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}

/// 按 task_id 批量删除任务执行日志（手动构建 IN 列表）。
pub async fn delete_task_execution_logs_by_ids(
    rb: &dyn Executor,
    task_ids: &Vec<String>,
) -> Result<ExecResult, rbatis::Error> {
    if task_ids.is_empty() {
        return Ok(ExecResult::default());
    }
    let placeholders = vec!["?"; task_ids.len()].join(", ");
    let sql = format!(
        "delete from task_execution_logs where task_id in ({})",
        placeholders
    );
    let params: Vec<rbs::Value> = task_ids
        .iter()
        .map(|id| rbs::Value::String(id.clone()))
        .collect();
    rb.exec(&sql, params).await
}

/// 按 task_id 批量删除 CLI 用量记录（手动构建 IN 列表）。
pub async fn delete_agent_cli_usage_records_by_ids(
    rb: &dyn Executor,
    task_ids: &Vec<String>,
) -> Result<ExecResult, rbatis::Error> {
    if task_ids.is_empty() {
        return Ok(ExecResult::default());
    }
    let placeholders = vec!["?"; task_ids.len()].join(", ");
    let sql = format!(
        "delete from agent_cli_usage_records where task_id in ({})",
        placeholders
    );
    let params: Vec<rbs::Value> = task_ids
        .iter()
        .map(|id| rbs::Value::String(id.clone()))
        .collect();
    rb.exec(&sql, params).await
}

/// 删除计划本体（事务内）。
pub async fn delete_plan_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from plans where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 刷新项目 updated_at（创建计划事务内）。
pub async fn touch_project_updated_at(
    rb: &dyn Executor,
    project_id: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update projects set updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(project_id.to_string()),
        ],
    )
    .await
}
