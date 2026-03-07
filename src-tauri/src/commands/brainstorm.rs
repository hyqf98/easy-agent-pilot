use anyhow::Result;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionBrainstormState {
    pub session_id: String,
    pub mode: String,
    pub context: serde_json::Value,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionBrainstormTodo {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub order: i32,
    pub source_message_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BrainstormTodoOp {
    pub op: String,
    pub id: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub order: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApplyBrainstormTodoOpsResult {
    pub changed_count: i32,
    pub todos: Vec<SessionBrainstormTodo>,
}

fn get_db_path() -> Result<std::path::PathBuf> {
    let persistence_dir = super::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}

fn is_valid_mode(mode: &str) -> bool {
    matches!(mode, "normal" | "brainstorm")
}

fn is_valid_todo_status(status: &str) -> bool {
    matches!(status, "pending" | "in_progress" | "completed" | "blocked")
}

fn ensure_state_row(conn: &Connection, session_id: &str) -> Result<(), String> {
    let exists: i32 = conn
        .query_row(
            "SELECT COUNT(1) FROM sessions WHERE id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if exists == 0 {
        return Err("会话不存在".to_string());
    }

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO session_brainstorm_state (session_id, mode, context_json, updated_at) VALUES (?1, 'normal', '{}', ?2)",
        rusqlite::params![session_id, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn parse_context_json(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).unwrap_or_else(|_| serde_json::json!({}))
}

fn get_state(conn: &Connection, session_id: &str) -> Result<SessionBrainstormState, String> {
    let row = conn
        .query_row(
            "SELECT session_id, mode, context_json, updated_at FROM session_brainstorm_state WHERE session_id = ?1",
            [session_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((session_id, mode, context_json, updated_at)) = row {
        return Ok(SessionBrainstormState {
            session_id,
            mode,
            context: parse_context_json(&context_json),
            updated_at,
        });
    }

    Ok(SessionBrainstormState {
        session_id: session_id.to_string(),
        mode: "normal".to_string(),
        context: serde_json::json!({}),
        updated_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn list_todos(conn: &Connection, session_id: &str) -> Result<Vec<SessionBrainstormTodo>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, session_id, title, description, status, task_order, source_message_id, created_at, updated_at
            FROM session_brainstorm_todos
            WHERE session_id = ?1
            ORDER BY task_order ASC, created_at ASC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([session_id], |row| {
            Ok(SessionBrainstormTodo {
                id: row.get(0)?,
                session_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                status: row.get(4)?,
                order: row.get(5)?,
                source_message_id: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_session_brainstorm_state(session_id: String) -> Result<SessionBrainstormState, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    ensure_state_row(&conn, &session_id)?;
    get_state(&conn, &session_id)
}

#[tauri::command]
pub fn set_session_brainstorm_mode(
    session_id: String,
    mode: String,
) -> Result<SessionBrainstormState, String> {
    if !is_valid_mode(&mode) {
        return Err("无效的 brainstorm 模式".to_string());
    }

    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    ensure_state_row(&conn, &session_id)?;

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE session_brainstorm_state SET mode = ?1, updated_at = ?2 WHERE session_id = ?3",
        rusqlite::params![mode, now, session_id],
    )
    .map_err(|e| e.to_string())?;

    get_state(&conn, &session_id)
}

#[tauri::command]
pub fn set_session_brainstorm_context(
    session_id: String,
    context: serde_json::Value,
) -> Result<SessionBrainstormState, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    ensure_state_row(&conn, &session_id)?;

    let normalized_context = if context.is_object() {
        context
    } else {
        serde_json::json!({})
    };

    let context_json = serde_json::to_string(&normalized_context).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE session_brainstorm_state SET context_json = ?1, updated_at = ?2 WHERE session_id = ?3",
        rusqlite::params![context_json, now, session_id],
    )
    .map_err(|e| e.to_string())?;

    get_state(&conn, &session_id)
}

#[tauri::command]
pub fn list_session_brainstorm_todos(session_id: String) -> Result<Vec<SessionBrainstormTodo>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    ensure_state_row(&conn, &session_id)?;
    list_todos(&conn, &session_id)
}

#[tauri::command]
pub fn apply_session_brainstorm_todo_ops(
    session_id: String,
    ops: Vec<BrainstormTodoOp>,
    source_message_id: Option<String>,
) -> Result<ApplyBrainstormTodoOpsResult, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| e.to_string())?;

    ensure_state_row(&conn, &session_id)?;

    if ops.is_empty() {
        return Ok(ApplyBrainstormTodoOpsResult {
            changed_count: 0,
            todos: list_todos(&conn, &session_id)?,
        });
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut changed_count = 0;

    for op in ops {
        match op.op.as_str() {
            "add" => {
                let title = op
                    .title
                    .as_ref()
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .ok_or_else(|| "todo add 操作缺少 title".to_string())?;

                let status = op.status.unwrap_or_else(|| "pending".to_string());
                if !is_valid_todo_status(&status) {
                    return Err("todo add 操作包含无效 status".to_string());
                }

                let id = op.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                let order = if let Some(order) = op.order {
                    order
                } else {
                    let max_order: i32 = tx
                        .query_row(
                            "SELECT COALESCE(MAX(task_order), -1) FROM session_brainstorm_todos WHERE session_id = ?1",
                            [&session_id],
                            |row| row.get(0),
                        )
                        .map_err(|e| e.to_string())?;
                    max_order + 1
                };

                tx.execute(
                    "INSERT INTO session_brainstorm_todos (id, session_id, title, description, status, task_order, source_message_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    rusqlite::params![id, session_id, title, op.description, status, order, source_message_id, now, now],
                )
                .map_err(|e| e.to_string())?;
                changed_count += 1;
            }
            "update" => {
                let todo_id = op.id.ok_or_else(|| "todo update 操作缺少 id".to_string())?;

                let existing = tx
                    .query_row(
                        "SELECT title, description, status, task_order FROM session_brainstorm_todos WHERE id = ?1 AND session_id = ?2",
                        rusqlite::params![todo_id, session_id],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, Option<String>>(1)?,
                                row.get::<_, String>(2)?,
                                row.get::<_, i32>(3)?,
                            ))
                        },
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;

                let (old_title, old_description, old_status, old_order) =
                    existing.ok_or_else(|| "todo update 目标不存在".to_string())?;

                let new_title = op
                    .title
                    .as_ref()
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or(old_title);
                let new_description = if op.description.is_some() {
                    op.description
                } else {
                    old_description
                };
                let new_status = op.status.unwrap_or(old_status);
                let new_order = op.order.unwrap_or(old_order);

                if !is_valid_todo_status(&new_status) {
                    return Err("todo update 操作包含无效 status".to_string());
                }

                tx.execute(
                    "UPDATE session_brainstorm_todos SET title = ?1, description = ?2, status = ?3, task_order = ?4, updated_at = ?5 WHERE id = ?6 AND session_id = ?7",
                    rusqlite::params![new_title, new_description, new_status, new_order, now, todo_id, session_id],
                )
                .map_err(|e| e.to_string())?;
                changed_count += 1;
            }
            "complete" => {
                let todo_id = op.id.ok_or_else(|| "todo complete 操作缺少 id".to_string())?;
                tx.execute(
                    "UPDATE session_brainstorm_todos SET status = 'completed', updated_at = ?1 WHERE id = ?2 AND session_id = ?3",
                    rusqlite::params![now, todo_id, session_id],
                )
                .map_err(|e| e.to_string())?;
                changed_count += 1;
            }
            "remove" => {
                let todo_id = op.id.ok_or_else(|| "todo remove 操作缺少 id".to_string())?;
                tx.execute(
                    "DELETE FROM session_brainstorm_todos WHERE id = ?1 AND session_id = ?2",
                    rusqlite::params![todo_id, session_id],
                )
                .map_err(|e| e.to_string())?;
                changed_count += 1;
            }
            "reorder" => {
                let todo_id = op.id.ok_or_else(|| "todo reorder 操作缺少 id".to_string())?;
                let order = op.order.ok_or_else(|| "todo reorder 操作缺少 order".to_string())?;
                tx.execute(
                    "UPDATE session_brainstorm_todos SET task_order = ?1, updated_at = ?2 WHERE id = ?3 AND session_id = ?4",
                    rusqlite::params![order, now, todo_id, session_id],
                )
                .map_err(|e| e.to_string())?;
                changed_count += 1;
            }
            _ => {
                return Err(format!("不支持的 todo 操作: {}", op.op));
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ApplyBrainstormTodoOpsResult {
        changed_count,
        todos: list_todos(&conn, &session_id)?,
    })
}
