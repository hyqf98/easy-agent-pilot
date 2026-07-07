//! 任务 mapper。
//!
//! 对应 `commands/task.rs` 的 DB 操作。SQL 模板见 `sql/task.html`。
//! 动态更新统一用 `<set>+<if>`，彻底取代旧 `UpdateSqlBuilder` 的 push/bind 顺序耦合。
//! 批量 IN 操作用 `<foreach>`（清理已删任务引用）。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。含 `<set>/<if>/<foreach>`
//! 的动态 mapper 暂保留宏（标注 TODO）。

use rbatis::executor::Executor;
use serde::Serialize;

use crate::models::{
    IntColumnRow, SingleColumnRow, SplitSessionRow, TaskDependencyRow, TaskRuntimeBindingRow,
    TaskRow,
};

/// 插入任务的参数结构（字段名与 `sql/task.html#insert_task` 的 `#{xxx}` 对应）。
///
/// 所有可空列统一用 `Option<&str>` / `Option<i64>` 传递；JSON 列以序列化后的字符串传入。
#[derive(Clone, Debug, Serialize)]
pub struct TaskInsert<'a> {
    pub id: &'a str,
    pub project_id: &'a str,
    pub plan_id: &'a str,
    pub parent_id: Option<&'a str>,
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub status: &'a str,
    pub priority: &'a str,
    pub assignee: Option<&'a str>,
    pub expert_id: Option<&'a str>,
    pub agent_id: Option<&'a str>,
    pub model_id: Option<&'a str>,
    pub session_id: Option<&'a str>,
    pub cli_session_provider: Option<&'a str>,
    pub progress_file: Option<&'a str>,
    pub dependencies: Option<rbs::Value>,
    pub task_order: i64,
    pub retry_count: i64,
    pub max_retries: i64,
    pub error_message: Option<&'a str>,
    pub implementation_steps: Option<rbs::Value>,
    pub test_steps: Option<rbs::Value>,
    pub acceptance_criteria: Option<rbs::Value>,
    pub memory_library_ids: Option<rbs::Value>,
    pub created_at: &'a str,
    pub updated_at: &'a str,
}

/// 动态更新任务的参数结构。
///
/// 用 `has_xxx: bool` 标记字段是否参与更新（true 才进入 SET 子句），
/// 对应旧代码的 `UpdateField::Missing`（不更新）与 `Value/Null`（更新）二分。
/// `order` 列用 `order_value` 以避开 Rust 关键字；`has_order` 控制是否更新。
/// 所有可空列的值用 `Option<String>` 传递（Value→Some，Null→None）。
#[derive(Clone, Debug, Serialize)]
pub struct TaskUpdate {
    pub id: String,
    pub updated_at: String,
    // 控制位
    pub has_title: bool,
    pub has_description: bool,
    pub has_status: bool,
    pub has_priority: bool,
    pub has_assignee: bool,
    pub has_expert_id: bool,
    pub has_agent_id: bool,
    pub has_model_id: bool,
    pub has_session_id: bool,
    pub has_cli_session_provider: bool,
    pub has_progress_file: bool,
    pub has_dependencies: bool,
    pub has_order: bool,
    pub has_retry_count: bool,
    pub has_max_retries: bool,
    pub has_error_message: bool,
    pub has_implementation_steps: bool,
    pub has_test_steps: bool,
    pub has_acceptance_criteria: bool,
    pub has_memory_library_ids: bool,
    pub has_block_reason: bool,
    pub has_input_request: bool,
    pub has_input_response: bool,
    // 值（字符串类列）
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
    pub dependencies: Option<rbs::Value>,
    pub order_value: Option<i64>,
    pub retry_count: Option<i64>,
    pub max_retries: Option<i64>,
    pub error_message: Option<String>,
    pub implementation_steps: Option<rbs::Value>,
    pub test_steps: Option<rbs::Value>,
    pub acceptance_criteria: Option<rbs::Value>,
    pub memory_library_ids: Option<rbs::Value>,
    pub block_reason: Option<String>,
    pub input_request: Option<rbs::Value>,
    pub input_response: Option<rbs::Value>,
}

// ===================== 查询 =====================

#[html_sql("sql/task.html")]
pub async fn get_task_by_id(rb: &dyn Executor, id: &str) -> Vec<TaskRow> {
    impled!()
}

#[html_sql("sql/task.html")]
pub async fn list_tasks_by_plan(rb: &dyn Executor, plan_id: &str) -> Vec<TaskRow> {
    impled!()
}

#[html_sql("sql/task.html")]
pub async fn list_project_unplanned_tasks(rb: &dyn Executor, project_id: &str) -> Vec<TaskRow> {
    impled!()
}

#[html_sql("sql/task.html")]
pub async fn list_subtasks_by_parent(rb: &dyn Executor, parent_id: &str) -> Vec<TaskRow> {
    impled!()
}

#[html_sql("sql/task.html")]
pub async fn get_task_by_session_id(rb: &dyn Executor, session_id: &str) -> Vec<TaskRow> {
    impled!()
}

#[html_sql("sql/task.html")]
pub async fn get_plan_id_of_task(rb: &dyn Executor, id: &str) -> Vec<SingleColumnRow> {
    impled!()
}

#[html_sql("sql/task.html")]
pub async fn get_project_id_of_plan(rb: &dyn Executor, plan_id: &str) -> Vec<SingleColumnRow> {
    impled!()
}

#[html_sql("sql/task.html")]
pub async fn get_max_task_order_of_plan(rb: &dyn Executor, plan_id: &str) -> Vec<IntColumnRow> {
    impled!()
}

/// 递归收集任务子树 id（含自身），返回 value 单列。
#[html_sql("sql/task.html")]
pub async fn collect_task_subtree_ids(rb: &dyn Executor, id: &str) -> Vec<SingleColumnRow> {
    impled!()
}

// ===================== 写入 =====================

pub async fn insert_task(
    rb: &dyn Executor,
    row: &TaskInsert<'_>,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into tasks (id, project_id, plan_id, parent_id, title, description, status, priority, assignee, expert_id, agent_id, model_id, session_id, cli_session_provider, progress_file, dependencies, task_order, retry_count, max_retries, error_message, implementation_steps, test_steps, acceptance_criteria, memory_library_ids, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.to_string()),
            rbs::Value::String(row.project_id.to_string()),
            rbs::Value::String(row.plan_id.to_string()),
            row.parent_id
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.title.to_string()),
            row.description
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.status.to_string()),
            rbs::Value::String(row.priority.to_string()),
            row.assignee
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            row.expert_id
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            row.agent_id
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            row.model_id
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            row.session_id
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            row.cli_session_provider
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            row.progress_file
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            row.dependencies.clone().unwrap_or(rbs::Value::Null),
            rbs::Value::I64(row.task_order),
            rbs::Value::I64(row.retry_count),
            rbs::Value::I64(row.max_retries),
            row.error_message
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            row.implementation_steps.clone().unwrap_or(rbs::Value::Null),
            row.test_steps.clone().unwrap_or(rbs::Value::Null),
            row.acceptance_criteria.clone().unwrap_or(rbs::Value::Null),
            row.memory_library_ids.clone().unwrap_or(rbs::Value::Null),
            rbs::Value::String(row.created_at.to_string()),
            rbs::Value::String(row.updated_at.to_string()),
        ],
    )
    .await
}

pub async fn touch_plan_updated_at(
    rb: &dyn Executor,
    plan_id: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update plans set updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(plan_id.to_string()),
        ],
    )
    .await
}

/// 动态更新任务：仅更新 has_xxx=true 的字段。
// 手动构建 SET + rb.exec，绕过 #[html_sql] 宏对 JSON 列参数的解析问题。
pub async fn update_task(
    rb: &dyn Executor,
    update: &TaskUpdate,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let mut sets: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params: Vec<rbs::Value> = vec![rbs::Value::String(update.updated_at.clone())];

    // 三态字符串字段
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
    // 三态 JSON 列字段（Option<rbs::Value>）
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
    // 三态 i64 字段
    macro_rules! push_i64 {
        ($col:expr, $has:ident, $val:ident) => {
            if update.$has {
                sets.push(format!("{} = ?", $col));
                params.push(update.$val.map(rbs::Value::I64).unwrap_or(rbs::Value::Null));
            }
        };
    }

    push_str!("title", has_title, title);
    push_str!("description", has_description, description);
    push_str!("status", has_status, status);
    push_str!("priority", has_priority, priority);
    push_str!("assignee", has_assignee, assignee);
    push_str!("expert_id", has_expert_id, expert_id);
    push_str!("agent_id", has_agent_id, agent_id);
    push_str!("model_id", has_model_id, model_id);
    push_str!("session_id", has_session_id, session_id);
    push_str!("cli_session_provider", has_cli_session_provider, cli_session_provider);
    push_str!("progress_file", has_progress_file, progress_file);
    push_json!("dependencies", has_dependencies, dependencies);
    push_i64!("task_order", has_order, order_value);
    push_i64!("retry_count", has_retry_count, retry_count);
    push_i64!("max_retries", has_max_retries, max_retries);
    push_str!("error_message", has_error_message, error_message);
    push_json!("implementation_steps", has_implementation_steps, implementation_steps);
    push_json!("test_steps", has_test_steps, test_steps);
    push_json!("acceptance_criteria", has_acceptance_criteria, acceptance_criteria);
    push_json!("memory_library_ids", has_memory_library_ids, memory_library_ids);
    push_str!("block_reason", has_block_reason, block_reason);
    push_json!("input_request", has_input_request, input_request);
    push_json!("input_response", has_input_response, input_response);

    let sql = format!("update tasks set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(update.id.clone()));
    rb.exec(&sql, params).await
}

pub async fn retry_task(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update tasks set status = 'pending', retry_count = 0, error_message = null, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

pub async fn batch_update_status(
    rb: &dyn Executor,
    plan_id: &str,
    status: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update tasks set status = ?, updated_at = ? where plan_id = ? and status = 'pending'";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(status.to_string()),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(plan_id.to_string()),
        ],
    )
    .await
}

pub async fn stop_task(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update tasks set status = 'pending', updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

pub async fn reorder_one_task(
    rb: &dyn Executor,
    id: &str,
    order_value: i64,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update tasks set task_order = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::I64(order_value),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

pub async fn delete_task_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from tasks where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

// ===================== 删除引用清理（事务内 foreach） =====================

/// 清理已删任务引用：删除 agent_cli_usage_records。
// 手动构建 IN 列表，绕过 #[html_sql] foreach 宏。
pub async fn delete_agent_cli_usage_for_tasks(
    rb: &dyn Executor,
    task_ids: &[String],
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    if task_ids.is_empty() {
        return Ok(rbatis::rbdc::db::ExecResult::default());
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

/// 清理已删任务引用：置空 plans.current_task_id。
// 手动构建 IN 列表，绕过 #[html_sql] foreach 宏。
pub async fn nullify_plan_current_task_for_tasks(
    rb: &dyn Executor,
    task_ids: &[String],
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    if task_ids.is_empty() {
        return Ok(rbatis::rbdc::db::ExecResult::default());
    }
    let placeholders = vec!["?"; task_ids.len()].join(", ");
    let sql = format!(
        "update plans set current_task_id = null, updated_at = ? where current_task_id in ({})",
        placeholders
    );
    let mut params: Vec<rbs::Value> = vec![rbs::Value::String(updated_at.to_string())];
    params.extend(task_ids.iter().map(|id| rbs::Value::String(id.clone())));
    rb.exec(&sql, params).await
}

#[html_sql("sql/task.html")]
pub async fn list_plan_dependencies(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<TaskDependencyRow> {
    impled!()
}

pub async fn update_task_dependencies(
    rb: &dyn Executor,
    id: &str,
    dependencies: rbs::Value,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update tasks set dependencies = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            dependencies,
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

// ===================== task_memory_libraries =====================

#[html_sql("sql/task.html")]
pub async fn list_task_memory_library_ids(
    rb: &dyn Executor,
    task_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

pub async fn delete_task_memory_libraries(
    rb: &dyn Executor,
    task_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from task_memory_libraries where task_id = ?";
    rb.exec(sql, vec![rbs::Value::String(task_id.to_string())])
        .await
}

pub async fn insert_task_memory_library(
    rb: &dyn Executor,
    task_id: &str,
    library_id: &str,
    created_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into task_memory_libraries (task_id, library_id, created_at) values (?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(task_id.to_string()),
            rbs::Value::String(library_id.to_string()),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

// ===================== task_runtime_bindings =====================

#[html_sql("sql/task.html")]
pub async fn get_task_runtime_binding(
    rb: &dyn Executor,
    task_id: &str,
    runtime_key: &str,
) -> Vec<TaskRuntimeBindingRow> {
    impled!()
}

pub async fn upsert_task_runtime_binding(
    rb: &dyn Executor,
    task_id: &str,
    runtime_key: &str,
    external_session_id: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into task_runtime_bindings (task_id, runtime_key, external_session_id, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(task_id, runtime_key) do update set external_session_id = excluded.external_session_id, updated_at = excluded.updated_at";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(task_id.to_string()),
            rbs::Value::String(runtime_key.to_string()),
            rbs::Value::String(external_session_id.to_string()),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

pub async fn delete_task_runtime_binding(
    rb: &dyn Executor,
    task_id: &str,
    runtime_key: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from task_runtime_bindings where task_id = ? and runtime_key = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(task_id.to_string()),
            rbs::Value::String(runtime_key.to_string()),
        ],
    )
    .await
}

// ===================== task_split_sessions =====================

#[html_sql("sql/task.html")]
pub async fn get_split_session_by_plan(rb: &dyn Executor, plan_id: &str) -> Vec<SplitSessionRow> {
    impled!()
}

#[html_sql("sql/task.html")]
pub async fn get_split_session_id_by_plan(
    rb: &dyn Executor,
    plan_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

pub async fn insert_split_session(
    rb: &dyn Executor,
    id: &str,
    plan_id: &str,
    status: &str,
    raw_content: Option<&str>,
    parsed_output: Option<rbs::Value>,
    parse_error: Option<&str>,
    granularity: i64,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into task_split_sessions (id, plan_id, status, raw_content, parsed_output, parse_error, granularity, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(plan_id.to_string()),
            rbs::Value::String(status.to_string()),
            raw_content
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            parsed_output.unwrap_or(rbs::Value::Null),
            parse_error
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(granularity),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

pub async fn update_split_session(
    rb: &dyn Executor,
    id: &str,
    status: &str,
    raw_content: Option<&str>,
    parsed_output: Option<rbs::Value>,
    parse_error: Option<&str>,
    granularity: i64,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update task_split_sessions set status = ?, raw_content = ?, parsed_output = ?, parse_error = ?, granularity = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(status.to_string()),
            raw_content
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            parsed_output.unwrap_or(rbs::Value::Null),
            parse_error
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(granularity),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

pub async fn delete_split_session(
    rb: &dyn Executor,
    plan_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from task_split_sessions where plan_id = ?";
    rb.exec(sql, vec![rbs::Value::String(plan_id.to_string())])
        .await
}
