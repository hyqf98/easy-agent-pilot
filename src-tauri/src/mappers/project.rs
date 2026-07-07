//! 项目 mapper。
//!
//! 对应 `commands/project.rs` 的 DB 操作。SQL 模板见 `sql/project.html`。
//! 文件系统操作（文件树、@ 文件引用）不走 DB，仍在命令层同步处理。
//!
//! 所有函数首参均为 `&dyn Executor`，因此命令层既可传入 `db::rb()`，
//! 也可传入事务执行器（create/update/delete project 事务内）。
//!
//! 注意：写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;

use crate::models::{IntColumnRow, ProjectRow, SingleColumnRow};

// ===================== 查询 =====================

/// 列出全部项目（含会话计数，按 updated_at 倒序）。
#[html_sql("sql/project.html")]
pub async fn list_projects_with_session_count(rb: &dyn Executor) -> Vec<ProjectRow> {
    impled!()
}

/// 查询项目关联的记忆库 id 列表。
#[html_sql("sql/project.html")]
pub async fn list_project_memory_library_ids(
    rb: &dyn Executor,
    project_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 查询项目的会话数。
#[html_sql("sql/project.html")]
pub async fn get_project_session_count(
    rb: &dyn Executor,
    project_id: &str,
) -> Vec<IntColumnRow> {
    impled!()
}

/// 查询项目的 created_at。
#[html_sql("sql/project.html")]
pub async fn get_project_created_at(rb: &dyn Executor, id: &str) -> Vec<SingleColumnRow> {
    impled!()
}

/// 查询项目关联的会话 id 列表。
#[html_sql("sql/project.html")]
pub async fn list_session_ids_by_project(
    rb: &dyn Executor,
    project_id: &str,
) -> Vec<SingleColumnRow> {
    impled!()
}

/// 统计项目关联的计划数。
#[html_sql("sql/project.html")]
pub async fn count_plans_by_project(rb: &dyn Executor, project_id: &str) -> Vec<IntColumnRow> {
    impled!()
}

/// 统计项目关联的任务数。
#[html_sql("sql/project.html")]
pub async fn count_tasks_by_project(rb: &dyn Executor, project_id: &str) -> Vec<IntColumnRow> {
    impled!()
}

/// 统计项目关联的 plan_split_logs 数。
#[html_sql("sql/project.html")]
pub async fn count_plan_split_logs_by_project(
    rb: &dyn Executor,
    project_id: &str,
) -> Vec<IntColumnRow> {
    impled!()
}

/// 统计项目关联的 task_split_sessions 数。
#[html_sql("sql/project.html")]
pub async fn count_task_split_sessions_by_project(
    rb: &dyn Executor,
    project_id: &str,
) -> Vec<IntColumnRow> {
    impled!()
}

/// 统计项目关联的 task_execution_results 数。
#[html_sql("sql/project.html")]
pub async fn count_execution_results_by_project(
    rb: &dyn Executor,
    project_id: &str,
) -> Vec<IntColumnRow> {
    impled!()
}

/// 统计项目关联的 task_execution_logs 数。
#[html_sql("sql/project.html")]
pub async fn count_execution_logs_by_project(
    rb: &dyn Executor,
    project_id: &str,
) -> Vec<IntColumnRow> {
    impled!()
}

// ===================== 写入（项目本体） =====================

/// 插入新项目（事务内）。
pub async fn insert_project(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    path: &str,
    description: Option<&str>,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into projects (id, name, path, description, created_at, updated_at) values (?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(name.to_string()),
            rbs::Value::String(path.to_string()),
            description
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 更新项目基本信息（事务内）。
pub async fn update_project_basic(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    path: &str,
    description: Option<&str>,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update projects set name = ?, path = ?, description = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(name.to_string()),
            rbs::Value::String(path.to_string()),
            description
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 删除项目本体。
pub async fn delete_project_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from projects where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 刷新项目 updated_at（事务内）。
pub async fn touch_project_updated_at(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update projects set updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

// ===================== 写入（记忆库关联） =====================

/// 清空项目的记忆库关联（事务内）。
pub async fn delete_project_memory_libraries(
    rb: &dyn Executor,
    project_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from project_memory_libraries where project_id = ?";
    rb.exec(sql, vec![rbs::Value::String(project_id.to_string())])
        .await
}

/// 插入一条项目-记忆库关联（事务内）。
pub async fn insert_project_memory_library(
    rb: &dyn Executor,
    project_id: &str,
    library_id: &str,
    created_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into project_memory_libraries (project_id, library_id, created_at) values (?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(project_id.to_string()),
            rbs::Value::String(library_id.to_string()),
            rbs::Value::String(created_at.to_string()),
        ],
    )
    .await
}

// ===================== 写入（clear_project_runtime_data 级联删除） =====================

/// 删除项目会话关联的窗口锁（事务内）。
pub async fn delete_window_locks_by_project_sessions(
    rb: &dyn Executor,
    project_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from window_session_locks where session_id in (select id from sessions where project_id = ?)";
    rb.exec(sql, vec![rbs::Value::String(project_id.to_string())])
        .await
}

/// 删除项目关联的会话（事务内）。
pub async fn delete_sessions_by_project(
    rb: &dyn Executor,
    project_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from sessions where project_id = ?";
    rb.exec(sql, vec![rbs::Value::String(project_id.to_string())])
        .await
}

/// 删除项目关联的任务（事务内）。
pub async fn delete_tasks_by_project(
    rb: &dyn Executor,
    project_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from tasks where project_id = ?";
    rb.exec(sql, vec![rbs::Value::String(project_id.to_string())])
        .await
}

/// 删除项目关联的计划（事务内）。
pub async fn delete_plans_by_project(
    rb: &dyn Executor,
    project_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from plans where project_id = ?";
    rb.exec(sql, vec![rbs::Value::String(project_id.to_string())])
        .await
}
