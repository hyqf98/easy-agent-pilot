//! SOLO mapper。
//!
//! 对应 `commands/solo.rs` 的 DB 操作。SQL 模板见 `sql/solo.html`。
//! 动态更新（solo_runs/solo_steps）统一用 `<set>+<if>`（has_xxx 标记控制是否参与更新），
//! 取代旧 `UpdateSqlBuilder` 的 push/bind 顺序耦合。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::{
    SoloLogRow, SoloRunRow, SoloRuntimeBindingRow, SoloStepRow,
};

/// 插入 SOLO 运行的参数结构（字段名与 `sql/solo.html#insert_solo_run` 的 `#{xxx}` 对应）。
///
/// 整数列（max_dispatch_depth）用 `i64` 传递（rbdc-sqlite INTEGER 编码）。
#[derive(Clone, Debug, Serialize)]
pub struct SoloRunInsert {
    pub id: String,
    pub project_id: String,
    pub execution_path: String,
    pub name: String,
    pub requirement: String,
    pub goal: String,
    pub memory_library_ids_json: rbs::Value,
    pub participant_expert_ids_json: Option<rbs::Value>,
    pub coordinator_expert_id: Option<String>,
    pub coordinator_agent_id: Option<String>,
    pub coordinator_model_id: Option<String>,
    pub max_dispatch_depth: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 动态更新 SOLO 运行的参数结构。
///
/// 用 `has_xxx: bool` 标记字段是否参与更新（true 才进入 SET 子句），
/// 对应旧 `UpdateField::Missing`（不更新）与 `Value/Null`（更新）二分。
/// 所有可空列的值用 `Option<String>` / `Option<i64>` 传递（Value→Some，Null→None）。
#[derive(Clone, Debug, Serialize)]
pub struct SoloRunUpdate {
    pub id: String,
    pub updated_at: String,
    // 控制位
    pub has_execution_path: bool,
    pub has_name: bool,
    pub has_requirement: bool,
    pub has_goal: bool,
    pub has_memory_library_ids_json: bool,
    pub has_participant_expert_ids_json: bool,
    pub has_coordinator_expert_id: bool,
    pub has_coordinator_agent_id: bool,
    pub has_coordinator_model_id: bool,
    pub has_max_dispatch_depth: bool,
    pub has_current_depth: bool,
    pub has_current_step_id: bool,
    pub has_status: bool,
    pub has_execution_status: bool,
    pub has_last_error: bool,
    pub has_input_request_json: bool,
    pub has_input_response_json: bool,
    pub has_started_at: bool,
    pub has_completed_at: bool,
    pub has_stopped_at: bool,
    // 值
    pub execution_path: Option<String>,
    pub name: Option<String>,
    pub requirement: Option<String>,
    pub goal: Option<String>,
    pub memory_library_ids_json: Option<rbs::Value>,
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
    pub input_request_json: Option<rbs::Value>,
    pub input_response_json: Option<rbs::Value>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub stopped_at: Option<String>,
}

/// 插入 SOLO 步骤的参数结构。
#[derive(Clone, Debug, Serialize)]
pub struct SoloStepInsert {
    pub id: String,
    pub run_id: String,
    pub step_ref: String,
    pub parent_step_ref: Option<String>,
    pub depth: i64,
    pub title: String,
    pub description: Option<String>,
    pub execution_prompt: Option<String>,
    pub selected_expert_id: Option<String>,
    pub status: String,
    pub summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
}

/// 动态更新 SOLO 步骤的参数结构（同 SoloRunUpdate 的 has_xxx 模式）。
#[derive(Clone, Debug, Serialize)]
pub struct SoloStepUpdate {
    pub id: String,
    pub updated_at: String,
    // 控制位
    pub has_parent_step_ref: bool,
    pub has_depth: bool,
    pub has_title: bool,
    pub has_description: bool,
    pub has_execution_prompt: bool,
    pub has_selected_expert_id: bool,
    pub has_status: bool,
    pub has_summary: bool,
    pub has_result_summary: bool,
    pub has_result_files_json: bool,
    pub has_fail_reason: bool,
    pub has_started_at: bool,
    pub has_completed_at: bool,
    // 值
    pub parent_step_ref: Option<String>,
    pub depth: Option<i64>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub execution_prompt: Option<String>,
    pub selected_expert_id: Option<String>,
    pub status: Option<String>,
    pub summary: Option<String>,
    pub result_summary: Option<String>,
    pub result_files_json: Option<rbs::Value>,
    pub fail_reason: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

// ===================== solo_runs 查询 =====================

#[html_sql("sql/solo.html")]
pub async fn list_solo_runs(rb: &dyn Executor, project_id: &str) -> Vec<SoloRunRow> {
    impled!()
}

#[html_sql("sql/solo.html")]
pub async fn get_solo_run_by_id(rb: &dyn Executor, id: &str) -> Vec<SoloRunRow> {
    impled!()
}

// ===================== solo_runs 写入 =====================

pub async fn insert_solo_run(
    rb: &dyn Executor,
    row: &SoloRunInsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into solo_runs (id, project_id, execution_path, name, requirement, goal, memory_library_ids_json, participant_expert_ids_json, coordinator_expert_id, coordinator_agent_id, coordinator_model_id, max_dispatch_depth, current_depth, current_step_id, status, execution_status, last_error, input_request_json, input_response_json, created_at, updated_at, started_at, completed_at, stopped_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, 'draft', 'idle', null, null, null, ?, ?, null, null, null)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.project_id.clone()),
            rbs::Value::String(row.execution_path.clone()),
            rbs::Value::String(row.name.clone()),
            rbs::Value::String(row.requirement.clone()),
            rbs::Value::String(row.goal.clone()),
            row.memory_library_ids_json.clone(),
            row.participant_expert_ids_json
                .clone()
                .unwrap_or(rbs::Value::Null),
            row.coordinator_expert_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.coordinator_agent_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.coordinator_model_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(row.max_dispatch_depth),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
        ],
    )
    .await
}

/// 动态更新 SOLO 运行（手动构建 SET + rb.exec）。
pub async fn update_solo_run(
    rb: &dyn Executor,
    update: &SoloRunUpdate,
) -> Result<ExecResult, rbatis::Error> {
    let mut sets: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params: Vec<rbs::Value> = vec![rbs::Value::String(update.updated_at.clone())];

    macro_rules! push_str {
        ($col:expr, $has:ident, $val:ident) => {
            if update.$has {
                sets.push(format!("{} = ?", $col));
                match &update.$val {
                    Some(v) => params.push(rbs::Value::String(v.clone())),
                    None => params.push(rbs::Value::Null),
                }
            }
        };
    }
    macro_rules! push_json {
        ($col:expr, $has:ident, $val:ident) => {
            if update.$has {
                sets.push(format!("{} = ?", $col));
                match &update.$val {
                    Some(v) => params.push(v.clone()),
                    None => params.push(rbs::Value::Null),
                }
            }
        };
    }
    macro_rules! push_i64 {
        ($col:expr, $has:ident, $val:ident) => {
            if update.$has {
                sets.push(format!("{} = ?", $col));
                params.push(update.$val.map(rbs::Value::I64).unwrap_or(rbs::Value::Null));
            }
        };
    }

    push_str!("execution_path", has_execution_path, execution_path);
    push_str!("name", has_name, name);
    push_str!("requirement", has_requirement, requirement);
    push_str!("goal", has_goal, goal);
    push_json!("memory_library_ids_json", has_memory_library_ids_json, memory_library_ids_json);
    push_json!("participant_expert_ids_json", has_participant_expert_ids_json, participant_expert_ids_json);
    push_str!("coordinator_expert_id", has_coordinator_expert_id, coordinator_expert_id);
    push_str!("coordinator_agent_id", has_coordinator_agent_id, coordinator_agent_id);
    push_str!("coordinator_model_id", has_coordinator_model_id, coordinator_model_id);
    push_i64!("max_dispatch_depth", has_max_dispatch_depth, max_dispatch_depth);
    push_i64!("current_depth", has_current_depth, current_depth);
    push_str!("current_step_id", has_current_step_id, current_step_id);
    push_str!("status", has_status, status);
    push_str!("execution_status", has_execution_status, execution_status);
    push_str!("last_error", has_last_error, last_error);
    push_json!("input_request_json", has_input_request_json, input_request_json);
    push_json!("input_response_json", has_input_response_json, input_response_json);
    push_str!("started_at", has_started_at, started_at);
    push_str!("completed_at", has_completed_at, completed_at);
    push_str!("stopped_at", has_stopped_at, stopped_at);

    let sql = format!("update solo_runs set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(update.id.clone()));
    rb.exec(&sql, params).await
}

pub async fn delete_solo_run_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from solo_runs where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 创建/更新步骤后刷新运行 current_step_id/current_depth（MAX 语义）。
pub async fn touch_solo_run_on_step(
    rb: &dyn Executor,
    run_id: &str,
    step_id: &str,
    depth: i64,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update solo_runs set updated_at = ?, current_step_id = ?, current_depth = max(current_depth, ?) where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(step_id.to_string()),
            rbs::Value::I64(depth),
            rbs::Value::String(run_id.to_string()),
        ],
    )
    .await
}

/// 记录日志后刷新运行 updated_at。
pub async fn touch_solo_run_on_log(
    rb: &dyn Executor,
    run_id: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update solo_runs set updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(run_id.to_string()),
        ],
    )
    .await
}

// ===================== solo_steps =====================

#[html_sql("sql/solo.html")]
pub async fn list_solo_steps(rb: &dyn Executor, run_id: &str) -> Vec<SoloStepRow> {
    impled!()
}

#[html_sql("sql/solo.html")]
pub async fn get_solo_step_by_id(rb: &dyn Executor, id: &str) -> Vec<SoloStepRow> {
    impled!()
}

pub async fn insert_solo_step(
    rb: &dyn Executor,
    row: &SoloStepInsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into solo_steps (id, run_id, step_ref, parent_step_ref, depth, title, description, execution_prompt, selected_expert_id, status, summary, result_summary, result_files_json, fail_reason, created_at, updated_at, started_at, completed_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, null, ?, ?, ?, null)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.run_id.clone()),
            rbs::Value::String(row.step_ref.clone()),
            row.parent_step_ref
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(row.depth),
            rbs::Value::String(row.title.clone()),
            row.description
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.execution_prompt
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            row.selected_expert_id
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.status.clone()),
            row.summary
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
            row.started_at
                .clone()
                .map(rbs::Value::String)
                .unwrap_or(rbs::Value::Null),
        ],
    )
    .await
}

/// 动态更新 SOLO 步骤（手动构建 SET + rb.exec）。
pub async fn update_solo_step(
    rb: &dyn Executor,
    update: &SoloStepUpdate,
) -> Result<ExecResult, rbatis::Error> {
    let mut sets: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params: Vec<rbs::Value> = vec![rbs::Value::String(update.updated_at.clone())];

    macro_rules! push_str {
        ($col:expr, $has:ident, $val:ident) => {
            if update.$has {
                sets.push(format!("{} = ?", $col));
                match &update.$val {
                    Some(v) => params.push(rbs::Value::String(v.clone())),
                    None => params.push(rbs::Value::Null),
                }
            }
        };
    }
    macro_rules! push_json {
        ($col:expr, $has:ident, $val:ident) => {
            if update.$has {
                sets.push(format!("{} = ?", $col));
                match &update.$val {
                    Some(v) => params.push(v.clone()),
                    None => params.push(rbs::Value::Null),
                }
            }
        };
    }
    macro_rules! push_i64 {
        ($col:expr, $has:ident, $val:ident) => {
            if update.$has {
                sets.push(format!("{} = ?", $col));
                params.push(update.$val.map(rbs::Value::I64).unwrap_or(rbs::Value::Null));
            }
        };
    }

    push_str!("parent_step_ref", has_parent_step_ref, parent_step_ref);
    push_i64!("depth", has_depth, depth);
    push_str!("title", has_title, title);
    push_str!("description", has_description, description);
    push_str!("execution_prompt", has_execution_prompt, execution_prompt);
    push_str!("selected_expert_id", has_selected_expert_id, selected_expert_id);
    push_str!("status", has_status, status);
    push_str!("summary", has_summary, summary);
    push_str!("result_summary", has_result_summary, result_summary);
    push_json!("result_files_json", has_result_files_json, result_files_json);
    push_str!("fail_reason", has_fail_reason, fail_reason);
    push_str!("started_at", has_started_at, started_at);
    push_str!("completed_at", has_completed_at, completed_at);

    let sql = format!("update solo_steps set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(update.id.clone()));
    rb.exec(&sql, params).await
}

// ===================== solo_logs =====================

pub async fn insert_solo_log(
    rb: &dyn Executor,
    id: &str,
    run_id: &str,
    step_id: Option<&str>,
    scope: &str,
    log_type: &str,
    content: &str,
    metadata: Option<rbs::Value>,
    created_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into solo_logs (id, run_id, step_id, scope, log_type, content, metadata, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(run_id.to_string()),
            step_id
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(scope.to_string()),
            rbs::Value::String(log_type.to_string()),
            rbs::Value::String(content.to_string()),
            metadata.unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

pub async fn update_solo_log(
    rb: &dyn Executor,
    id: &str,
    content: &str,
    metadata: Option<rbs::Value>,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update solo_logs set content = ?, metadata = ? where id = ?";
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

#[html_sql("sql/solo.html")]
pub async fn list_solo_logs(
    rb: &dyn Executor,
    run_id: &str,
    step_id: Option<&str>,
) -> Vec<SoloLogRow> {
    impled!()
}

// ===================== solo_run_memory_libraries =====================

pub async fn delete_solo_run_memory_libraries(
    rb: &dyn Executor,
    run_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from solo_run_memory_libraries where run_id = ?";
    rb.exec(sql, vec![rbs::Value::String(run_id.to_string())])
        .await
}

pub async fn insert_solo_run_memory_library(
    rb: &dyn Executor,
    run_id: &str,
    library_id: &str,
    created_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into solo_run_memory_libraries (run_id, library_id, created_at) values (?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(run_id.to_string()),
            rbs::Value::String(library_id.to_string()),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

// ===================== solo_runtime_bindings =====================

#[html_sql("sql/solo.html")]
pub async fn get_solo_runtime_binding(
    rb: &dyn Executor,
    run_id: &str,
    runtime_key: &str,
) -> Vec<SoloRuntimeBindingRow> {
    impled!()
}

pub async fn upsert_solo_runtime_binding(
    rb: &dyn Executor,
    run_id: &str,
    runtime_key: &str,
    external_session_id: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into solo_runtime_bindings (run_id, runtime_key, external_session_id, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(run_id, runtime_key) do update set external_session_id = excluded.external_session_id, updated_at = excluded.updated_at";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(run_id.to_string()),
            rbs::Value::String(runtime_key.to_string()),
            rbs::Value::String(external_session_id.to_string()),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

pub async fn delete_solo_runtime_binding(
    rb: &dyn Executor,
    run_id: &str,
    runtime_key: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from solo_runtime_bindings where run_id = ? and runtime_key = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(run_id.to_string()),
            rbs::Value::String(runtime_key.to_string()),
        ],
    )
    .await
}

// ===================== clear_solo_run_progress（事务内） =====================

pub async fn clear_solo_logs(
    rb: &dyn Executor,
    run_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from solo_logs where run_id = ?";
    rb.exec(sql, vec![rbs::Value::String(run_id.to_string())])
        .await
}

pub async fn clear_solo_steps(
    rb: &dyn Executor,
    run_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from solo_steps where run_id = ?";
    rb.exec(sql, vec![rbs::Value::String(run_id.to_string())])
        .await
}

pub async fn clear_solo_runtime_bindings(
    rb: &dyn Executor,
    run_id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from solo_runtime_bindings where run_id = ?";
    rb.exec(sql, vec![rbs::Value::String(run_id.to_string())])
        .await
}

pub async fn reset_solo_run_progress(
    rb: &dyn Executor,
    run_id: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update solo_runs set current_depth = 0, current_step_id = null, status = 'draft', execution_status = 'idle', last_error = null, input_request_json = null, input_response_json = null, started_at = null, completed_at = null, stopped_at = null, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(run_id.to_string()),
        ],
    )
    .await
}
