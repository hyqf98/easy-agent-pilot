use anyhow::Result;
use serde::{Deserialize, Serialize};
use rusqlite::Connection;

/// 任务状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Blocked,
    Cancelled,
}

/// 任务优先级
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
}

/// 任务数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub plan_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub session_id: Option<String>,
    pub progress_file: Option<String>,
    pub dependencies: Option<Vec<String>>,
    pub order: i32,
    pub retry_count: i32,
    pub max_retries: i32,
    pub error_message: Option<String>,
    pub implementation_steps: Option<Vec<String>>,
    pub test_steps: Option<Vec<String>>,
    pub acceptance_criteria: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}

/// Rust 后端返回的结构（snake_case）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustTask {
    pub id: String,
    pub plan_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub session_id: Option<String>,
    pub progress_file: Option<String>,
    pub dependencies: Option<String>, // JSON 字符串
    pub task_order: i32,
    pub retry_count: i32,
    pub max_retries: i32,
    pub error_message: Option<String>,
    pub implementation_steps: Option<String>, // JSON 字符串
    pub test_steps: Option<String>, // JSON 字符串
    pub acceptance_criteria: Option<String>, // JSON 字符串
    pub created_at: String,
    pub updated_at: String,
}

/// 创建任务输入
#[derive(Debug, Deserialize)]
pub struct CreateTaskInput {
    pub plan_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub assignee: Option<String>,
    pub dependencies: Option<Vec<String>>,
    pub order: Option<i32>,
    pub max_retries: Option<i32>,
    pub implementation_steps: Option<Vec<String>>,
    pub test_steps: Option<Vec<String>>,
    pub acceptance_criteria: Option<Vec<String>>,
}

/// 更新任务输入
#[derive(Debug, Deserialize)]
pub struct UpdateTaskInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assignee: Option<String>,
    pub session_id: Option<String>,
    pub progress_file: Option<String>,
    pub dependencies: Option<Vec<String>>,
    pub order: Option<i32>,
    pub retry_count: Option<i32>,
    pub max_retries: Option<i32>,
    pub error_message: Option<String>,
    pub implementation_steps: Option<Vec<String>>,
    pub test_steps: Option<Vec<String>>,
    pub acceptance_criteria: Option<Vec<String>>,
}

/// 批量更新任务顺序输入
#[derive(Debug, Deserialize)]
pub struct ReorderTasksInput {
    pub task_orders: Vec<TaskOrderItem>,
}

#[derive(Debug, Deserialize)]
pub struct TaskOrderItem {
    pub id: String,
    pub order: i32,
}

/// 获取数据库路径
fn get_db_path() -> Result<std::path::PathBuf> {
    let persistence_dir = super::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}

/// 将 RustTask 转换为 Task
fn transform_task(rust_task: RustTask) -> Task {
    let dependencies = rust_task.dependencies.and_then(|s| {
        serde_json::from_str(&s).ok()
    });
    let implementation_steps = rust_task.implementation_steps.and_then(|s| {
        serde_json::from_str(&s).ok()
    });
    let test_steps = rust_task.test_steps.and_then(|s| {
        serde_json::from_str(&s).ok()
    });
    let acceptance_criteria = rust_task.acceptance_criteria.and_then(|s| {
        serde_json::from_str(&s).ok()
    });

    Task {
        id: rust_task.id,
        plan_id: rust_task.plan_id,
        parent_id: rust_task.parent_id,
        title: rust_task.title,
        description: rust_task.description,
        status: rust_task.status,
        priority: rust_task.priority,
        assignee: rust_task.assignee,
        session_id: rust_task.session_id,
        progress_file: rust_task.progress_file,
        dependencies,
        order: rust_task.task_order,
        retry_count: rust_task.retry_count,
        max_retries: rust_task.max_retries,
        error_message: rust_task.error_message,
        implementation_steps,
        test_steps,
        acceptance_criteria,
        created_at: rust_task.created_at,
        updated_at: rust_task.updated_at,
    }
}

/// 获取指定计划的所有任务
#[tauri::command]
pub fn list_tasks(plan_id: String) -> Result<Vec<Task>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, plan_id, parent_id, title, description, status, priority,
                   assignee, session_id, progress_file, dependencies, task_order,
                   retry_count, max_retries, error_message,
                   implementation_steps, test_steps, acceptance_criteria,
                   created_at, updated_at
            FROM tasks
            WHERE plan_id = ?1
            ORDER BY task_order ASC, created_at ASC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let tasks = stmt
        .query_map([&plan_id], |row| {
            Ok(RustTask {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                parent_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                assignee: row.get(7)?,
                session_id: row.get(8)?,
                progress_file: row.get(9)?,
                dependencies: row.get(10)?,
                task_order: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                error_message: row.get(14)?,
                implementation_steps: row.get(15)?,
                test_steps: row.get(16)?,
                acceptance_criteria: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(transform_task)
        .collect();

    Ok(tasks)
}

/// 获取单个任务
#[tauri::command]
pub fn get_task(id: String) -> Result<Task, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let rust_task = conn
        .query_row(
            r#"
            SELECT id, plan_id, parent_id, title, description, status, priority,
                   assignee, session_id, progress_file, dependencies, task_order,
                   retry_count, max_retries, error_message,
                   implementation_steps, test_steps, acceptance_criteria,
                   created_at, updated_at
            FROM tasks
            WHERE id = ?1
            "#,
            [&id],
            |row| {
                Ok(RustTask {
                    id: row.get(0)?,
                    plan_id: row.get(1)?,
                    parent_id: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    status: row.get(5)?,
                    priority: row.get(6)?,
                    assignee: row.get(7)?,
                    session_id: row.get(8)?,
                    progress_file: row.get(9)?,
                    dependencies: row.get(10)?,
                    task_order: row.get(11)?,
                    retry_count: row.get(12)?,
                    max_retries: row.get(13)?,
                    error_message: row.get(14)?,
                    implementation_steps: row.get(15)?,
                    test_steps: row.get(16)?,
                    acceptance_criteria: row.get(17)?,
                    created_at: row.get(18)?,
                    updated_at: row.get(19)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(transform_task(rust_task))
}

/// 创建新任务
#[tauri::command]
pub fn create_task(input: CreateTaskInput) -> Result<Task, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = "pending".to_string();
    let priority = input.priority.unwrap_or_else(|| "medium".to_string());
    let dependencies_json = input.dependencies.as_ref().map(|d| {
        serde_json::to_string(d).unwrap_or_else(|_| "[]".to_string())
    });
    let max_retries = input.max_retries.unwrap_or(3);
    let implementation_steps_json = input.implementation_steps.as_ref().map(|s| {
        serde_json::to_string(s).unwrap_or_else(|_| "[]".to_string())
    });
    let test_steps_json = input.test_steps.as_ref().map(|s| {
        serde_json::to_string(s).unwrap_or_else(|_| "[]".to_string())
    });
    let acceptance_criteria_json = input.acceptance_criteria.as_ref().map(|s| {
        serde_json::to_string(s).unwrap_or_else(|_| "[]".to_string())
    });

    // 如果没有指定顺序，获取当前最大顺序 + 1
    let task_order = match input.order {
        Some(order) => order,
        None => {
            let max_order: i32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(task_order), -1) FROM tasks WHERE plan_id = ?1",
                    [&input.plan_id],
                    |row| row.get(0),
                )
                .unwrap_or(-1);
            max_order + 1
        }
    };

    conn.execute(
        "INSERT INTO tasks (id, plan_id, parent_id, title, description, status, priority,
         assignee, session_id, progress_file, dependencies, task_order,
         retry_count, max_retries, error_message,
         implementation_steps, test_steps, acceptance_criteria,
         created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        rusqlite::params![
            &id,
            &input.plan_id,
            &input.parent_id,
            &input.title,
            &input.description,
            &status,
            &priority,
            &input.assignee,
            &None::<String>, // session_id
            &None::<String>, // progress_file
            &dependencies_json,
            &task_order,
            0, // retry_count
            &max_retries,
            &None::<String>, // error_message
            &implementation_steps_json,
            &test_steps_json,
            &acceptance_criteria_json,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    // 更新计划的 updated_at 时间
    conn.execute(
        "UPDATE plans SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &input.plan_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(Task {
        id,
        plan_id: input.plan_id,
        parent_id: input.parent_id,
        title: input.title,
        description: input.description,
        status,
        priority,
        assignee: input.assignee,
        session_id: None,
        progress_file: None,
        dependencies: input.dependencies,
        order: task_order,
        retry_count: 0,
        max_retries,
        error_message: None,
        implementation_steps: input.implementation_steps,
        test_steps: input.test_steps,
        acceptance_criteria: input.acceptance_criteria,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新任务
#[tauri::command]
pub fn update_task(id: String, input: UpdateTaskInput) -> Result<Task, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // 构建动态更新语句
    let mut updates: Vec<String> = vec!["updated_at = ?1".to_string()];
    let mut param_index = 2;

    if input.title.is_some() {
        updates.push(format!("title = ?{}", param_index));
        param_index += 1;
    }
    if input.description.is_some() {
        updates.push(format!("description = ?{}", param_index));
        param_index += 1;
    }
    if input.status.is_some() {
        updates.push(format!("status = ?{}", param_index));
        param_index += 1;
    }
    if input.priority.is_some() {
        updates.push(format!("priority = ?{}", param_index));
        param_index += 1;
    }
    if input.assignee.is_some() {
        updates.push(format!("assignee = ?{}", param_index));
        param_index += 1;
    }
    if input.session_id.is_some() {
        updates.push(format!("session_id = ?{}", param_index));
        param_index += 1;
    }
    if input.progress_file.is_some() {
        updates.push(format!("progress_file = ?{}", param_index));
        param_index += 1;
    }
    if input.dependencies.is_some() {
        updates.push(format!("dependencies = ?{}", param_index));
        param_index += 1;
    }
    if input.order.is_some() {
        updates.push(format!("task_order = ?{}", param_index));
        param_index += 1;
    }
    if input.retry_count.is_some() {
        updates.push(format!("retry_count = ?{}", param_index));
        param_index += 1;
    }
    if input.max_retries.is_some() {
        updates.push(format!("max_retries = ?{}", param_index));
        param_index += 1;
    }
    if input.error_message.is_some() {
        updates.push(format!("error_message = ?{}", param_index));
        param_index += 1;
    }
    if input.implementation_steps.is_some() {
        updates.push(format!("implementation_steps = ?{}", param_index));
        param_index += 1;
    }
    if input.test_steps.is_some() {
        updates.push(format!("test_steps = ?{}", param_index));
        param_index += 1;
    }
    if input.acceptance_criteria.is_some() {
        updates.push(format!("acceptance_criteria = ?{}", param_index));
        param_index += 1;
    }

    let sql = format!(
        "UPDATE tasks SET {} WHERE id = ?{}",
        updates.join(", "),
        param_index
    );

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    // 绑定参数
    let mut param_count = 1;
    stmt.raw_bind_parameter(param_count, &now).map_err(|e| e.to_string())?;
    param_count += 1;

    if let Some(ref title) = input.title {
        stmt.raw_bind_parameter(param_count, title).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref description) = input.description {
        stmt.raw_bind_parameter(param_count, description).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref status) = input.status {
        stmt.raw_bind_parameter(param_count, status).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref priority) = input.priority {
        stmt.raw_bind_parameter(param_count, priority).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref assignee) = input.assignee {
        stmt.raw_bind_parameter(param_count, assignee).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref session_id) = input.session_id {
        stmt.raw_bind_parameter(param_count, session_id).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref progress_file) = input.progress_file {
        stmt.raw_bind_parameter(param_count, progress_file).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref dependencies) = input.dependencies {
        let json = serde_json::to_string(dependencies).unwrap_or_else(|_| "[]".to_string());
        stmt.raw_bind_parameter(param_count, json).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(order) = input.order {
        stmt.raw_bind_parameter(param_count, order).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(retry_count) = input.retry_count {
        stmt.raw_bind_parameter(param_count, retry_count).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(max_retries) = input.max_retries {
        stmt.raw_bind_parameter(param_count, max_retries).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref error_message) = input.error_message {
        stmt.raw_bind_parameter(param_count, error_message).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref implementation_steps) = input.implementation_steps {
        let json = serde_json::to_string(implementation_steps).unwrap_or_else(|_| "[]".to_string());
        stmt.raw_bind_parameter(param_count, json).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref test_steps) = input.test_steps {
        let json = serde_json::to_string(test_steps).unwrap_or_else(|_| "[]".to_string());
        stmt.raw_bind_parameter(param_count, json).map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref acceptance_criteria) = input.acceptance_criteria {
        let json = serde_json::to_string(acceptance_criteria).unwrap_or_else(|_| "[]".to_string());
        stmt.raw_bind_parameter(param_count, json).map_err(|e| e.to_string())?;
        param_count += 1;
    }

    stmt.raw_bind_parameter(param_count, &id).map_err(|e| e.to_string())?;
    stmt.raw_execute().map_err(|e| e.to_string())?;

    // 更新计划的 updated_at 时间
    let plan_id: String = conn
        .query_row("SELECT plan_id FROM tasks WHERE id = ?1", [&id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE plans SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &plan_id],
    )
    .map_err(|e| e.to_string())?;

    // 获取更新后的任务
    let rust_task = conn
        .query_row(
            r#"
            SELECT id, plan_id, parent_id, title, description, status, priority,
                   assignee, session_id, progress_file, dependencies, task_order,
                   retry_count, max_retries, error_message,
                   implementation_steps, test_steps, acceptance_criteria,
                   created_at, updated_at
            FROM tasks
            WHERE id = ?1
            "#,
            [&id],
            |row| {
                Ok(RustTask {
                    id: row.get(0)?,
                    plan_id: row.get(1)?,
                    parent_id: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    status: row.get(5)?,
                    priority: row.get(6)?,
                    assignee: row.get(7)?,
                    session_id: row.get(8)?,
                    progress_file: row.get(9)?,
                    dependencies: row.get(10)?,
                    task_order: row.get(11)?,
                    retry_count: row.get(12)?,
                    max_retries: row.get(13)?,
                    error_message: row.get(14)?,
                    implementation_steps: row.get(15)?,
                    test_steps: row.get(16)?,
                    acceptance_criteria: row.get(17)?,
                    created_at: row.get(18)?,
                    updated_at: row.get(19)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(transform_task(rust_task))
}

/// 批量更新任务顺序
#[tauri::command]
pub fn reorder_tasks(input: ReorderTasksInput) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for item in input.task_orders {
        tx.execute(
            "UPDATE tasks SET task_order = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![item.order, &now, &item.id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

/// 删除任务
#[tauri::command]
pub fn delete_task(id: String) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM tasks WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取任务的子任务
#[tauri::command]
pub fn list_subtasks(parent_id: String) -> Result<Vec<Task>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, plan_id, parent_id, title, description, status, priority,
                   assignee, session_id, progress_file, dependencies, task_order,
                   retry_count, max_retries, error_message,
                   implementation_steps, test_steps, acceptance_criteria,
                   created_at, updated_at
            FROM tasks
            WHERE parent_id = ?1
            ORDER BY task_order ASC, created_at ASC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let tasks = stmt
        .query_map([&parent_id], |row| {
            Ok(RustTask {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                parent_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                assignee: row.get(7)?,
                session_id: row.get(8)?,
                progress_file: row.get(9)?,
                dependencies: row.get(10)?,
                task_order: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                error_message: row.get(14)?,
                implementation_steps: row.get(15)?,
                test_steps: row.get(16)?,
                acceptance_criteria: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(transform_task)
        .collect();

    Ok(tasks)
}

/// 重试任务 - 重置重试计数并恢复pending状态
#[tauri::command]
pub fn retry_task(id: String) -> Result<Task, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE tasks SET status = 'pending', retry_count = 0, error_message = NULL, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &id],
    )
    .map_err(|e| e.to_string())?;

    // 获取更新后的任务
    let rust_task = conn
        .query_row(
            r#"
            SELECT id, plan_id, parent_id, title, description, status, priority,
                   assignee, session_id, progress_file, dependencies, task_order,
                   retry_count, max_retries, error_message,
                   implementation_steps, test_steps, acceptance_criteria,
                   created_at, updated_at
            FROM tasks
            WHERE id = ?1
            "#,
            [&id],
            |row| {
                Ok(RustTask {
                    id: row.get(0)?,
                    plan_id: row.get(1)?,
                    parent_id: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    status: row.get(5)?,
                    priority: row.get(6)?,
                    assignee: row.get(7)?,
                    session_id: row.get(8)?,
                    progress_file: row.get(9)?,
                    dependencies: row.get(10)?,
                    task_order: row.get(11)?,
                    retry_count: row.get(12)?,
                    max_retries: row.get(13)?,
                    error_message: row.get(14)?,
                    implementation_steps: row.get(15)?,
                    test_steps: row.get(16)?,
                    acceptance_criteria: row.get(17)?,
                    created_at: row.get(18)?,
                    updated_at: row.get(19)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(transform_task(rust_task))
}

/// 批量更新任务状态
#[tauri::command]
pub fn batch_update_status(plan_id: String, status: String) -> Result<Vec<Task>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // 只更新 pending 状态的任务
    conn.execute(
        "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE plan_id = ?3 AND status = 'pending'",
        rusqlite::params![&status, &now, &plan_id],
    )
    .map_err(|e| e.to_string())?;

    // 获取更新后的任务列表
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, plan_id, parent_id, title, description, status, priority,
                   assignee, session_id, progress_file, dependencies, task_order,
                   retry_count, max_retries, error_message,
                   implementation_steps, test_steps, acceptance_criteria,
                   created_at, updated_at
            FROM tasks
            WHERE plan_id = ?1
            ORDER BY task_order ASC, created_at ASC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let tasks = stmt
        .query_map([&plan_id], |row| {
            Ok(RustTask {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                parent_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                assignee: row.get(7)?,
                session_id: row.get(8)?,
                progress_file: row.get(9)?,
                dependencies: row.get(10)?,
                task_order: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                error_message: row.get(14)?,
                implementation_steps: row.get(15)?,
                test_steps: row.get(16)?,
                acceptance_criteria: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(transform_task)
        .collect();

    Ok(tasks)
}

/// 停止任务执行
#[tauri::command]
pub fn stop_task(id: String) -> Result<Task, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // 将任务状态改为 pending，保留当前重试计数
    conn.execute(
        "UPDATE tasks SET status = 'pending', updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &id],
    )
    .map_err(|e| e.to_string())?;

    // 获取更新后的任务
    let rust_task = conn
        .query_row(
            r#"
            SELECT id, plan_id, parent_id, title, description, status, priority,
                   assignee, session_id, progress_file, dependencies, task_order,
                   retry_count, max_retries, error_message,
                   implementation_steps, test_steps, acceptance_criteria,
                   created_at, updated_at
            FROM tasks
            WHERE id = ?1
            "#,
            [&id],
            |row| {
                Ok(RustTask {
                    id: row.get(0)?,
                    plan_id: row.get(1)?,
                    parent_id: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    status: row.get(5)?,
                    priority: row.get(6)?,
                    assignee: row.get(7)?,
                    session_id: row.get(8)?,
                    progress_file: row.get(9)?,
                    dependencies: row.get(10)?,
                    task_order: row.get(11)?,
                    retry_count: row.get(12)?,
                    max_retries: row.get(13)?,
                    error_message: row.get(14)?,
                    implementation_steps: row.get(15)?,
                    test_steps: row.get(16)?,
                    acceptance_criteria: row.get(17)?,
                    created_at: row.get(18)?,
                    updated_at: row.get(19)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(transform_task(rust_task))
}

/// 根据会话 ID 查找关联的任务和计划
#[tauri::command]
pub fn get_task_by_session_id(session_id: String) -> Result<Option<Task>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let result = conn.query_row(
        r#"
        SELECT id, plan_id, parent_id, title, description, status, priority,
               assignee, session_id, progress_file, dependencies, task_order,
               retry_count, max_retries, error_message,
               implementation_steps, test_steps, acceptance_criteria,
               created_at, updated_at
        FROM tasks
        WHERE session_id = ?1
        LIMIT 1
        "#,
        [&session_id],
        |row| {
            Ok(RustTask {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                parent_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                assignee: row.get(7)?,
                session_id: row.get(8)?,
                progress_file: row.get(9)?,
                dependencies: row.get(10)?,
                task_order: row.get(11)?,
                retry_count: row.get(12)?,
                max_retries: row.get(13)?,
                error_message: row.get(14)?,
                implementation_steps: row.get(15)?,
                test_steps: row.get(16)?,
                acceptance_criteria: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
            })
        },
    );

    match result {
        Ok(rust_task) => Ok(Some(transform_task(rust_task))),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 批量创建任务（从拆分结果）
#[tauri::command]
pub fn batch_create_tasks(plan_id: String, tasks: Vec<CreateTaskInput>) -> Result<Vec<Task>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    // 获取当前最大顺序
    let mut max_order: i32 = tx
        .query_row(
            "SELECT COALESCE(MAX(task_order), -1) FROM tasks WHERE plan_id = ?1",
            [&plan_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    let mut created_tasks = Vec::new();

    for task_input in tasks {
        let id = uuid::Uuid::new_v4().to_string();
        let status = "pending".to_string();
        let priority = task_input.priority.clone().unwrap_or_else(|| "medium".to_string());
        let dependencies_json = task_input.dependencies.as_ref().map(|d| {
            serde_json::to_string(d).unwrap_or_else(|_| "[]".to_string())
        });
        let max_retries = task_input.max_retries.unwrap_or(3);
        let implementation_steps_json = task_input.implementation_steps.as_ref().map(|s| {
            serde_json::to_string(s).unwrap_or_else(|_| "[]".to_string())
        });
        let test_steps_json = task_input.test_steps.as_ref().map(|s| {
            serde_json::to_string(s).unwrap_or_else(|_| "[]".to_string())
        });
        let acceptance_criteria_json = task_input.acceptance_criteria.as_ref().map(|s| {
            serde_json::to_string(s).unwrap_or_else(|_| "[]".to_string())
        });

        max_order += 1;
        let task_order = task_input.order.unwrap_or(max_order);

        tx.execute(
            "INSERT INTO tasks (id, plan_id, parent_id, title, description, status, priority,
             assignee, session_id, progress_file, dependencies, task_order,
             retry_count, max_retries, error_message,
             implementation_steps, test_steps, acceptance_criteria,
             created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            rusqlite::params![
                &id,
                &plan_id,
                &task_input.parent_id,
                &task_input.title,
                &task_input.description,
                &status,
                &priority,
                &task_input.assignee,
                &None::<String>, // session_id
                &None::<String>, // progress_file
                &dependencies_json,
                &task_order,
                0, // retry_count
                &max_retries,
                &None::<String>, // error_message
                &implementation_steps_json,
                &test_steps_json,
                &acceptance_criteria_json,
                &now,
                &now
            ],
        )
        .map_err(|e| e.to_string())?;

        created_tasks.push(Task {
            id,
            plan_id: plan_id.clone(),
            parent_id: task_input.parent_id,
            title: task_input.title,
            description: task_input.description,
            status,
            priority,
            assignee: task_input.assignee,
            session_id: None,
            progress_file: None,
            dependencies: task_input.dependencies,
            order: task_order,
            retry_count: 0,
            max_retries,
            error_message: None,
            implementation_steps: task_input.implementation_steps,
            test_steps: task_input.test_steps,
            acceptance_criteria: task_input.acceptance_criteria,
            created_at: now.clone(),
            updated_at: now.clone(),
        });
    }

    // 更新计划的 updated_at 时间
    tx.execute(
        "UPDATE plans SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &plan_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(created_tasks)
}
