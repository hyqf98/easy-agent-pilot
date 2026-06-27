//! 文件变更追踪命令。
//!
//! 配合 `message_recorder` 写入的 `file_change_traces` 表，提供：
//! - 查询某会话（或某一回合）的文件变更列表，供前端 hydrate 展示。
//! - 标记变更状态（采纳 accepted）。
//! - 回滚变更（rolled_back）：新建文件删除、修改文件还原原始内容。
//!
//! ACP 协议下发的 `Diff.path` 是执行器视角的路径，可能是绝对路径也可能是
//! 相对路径；这里通过会话所属项目的 `path` 作为工作目录兜底解析为绝对路径。

use std::fs;
use std::path::PathBuf;

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::commands::fs_shared::expand_home_path;
use crate::commands::support::{now_rfc3339, open_db_connection};

/// 文件变更追踪行（前端视图）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeTrace {
    pub id: String,
    pub session_id: String,
    pub request_id: String,
    pub tool_call_id: String,
    pub file_path: String,
    pub relative_path: String,
    pub change_type: String,
    pub before_content: Option<String>,
    pub after_content: String,
    /// pending / accepted / rolled_back
    pub status: String,
    pub created_at: String,
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<FileChangeTrace> {
    Ok(FileChangeTrace {
        id: row.get(0)?,
        session_id: row.get(1)?,
        request_id: row.get(2)?,
        tool_call_id: row.get(3)?,
        file_path: row.get(4)?,
        relative_path: row.get(5)?,
        change_type: row.get(6)?,
        before_content: row.get(7)?,
        after_content: row.get(8)?,
        status: row.get(9)?,
        created_at: row.get(10)?,
    })
}

/// 查询文件变更列表。`request_id` 为 None 时返回整段会话的全部变更。
#[tauri::command]
pub fn list_file_change_traces(
    session_id: String,
    request_id: Option<String>,
) -> Result<Vec<FileChangeTrace>, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let mut stmt = if request_id.is_some() {
        conn.prepare(
            "SELECT id, session_id, request_id, tool_call_id, file_path, relative_path, \
             change_type, before_content, after_content, status, created_at \
             FROM file_change_traces WHERE session_id = ?1 AND request_id = ?2 \
             ORDER BY created_at ASC, seq ASC",
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.prepare(
            "SELECT id, session_id, request_id, tool_call_id, file_path, relative_path, \
             change_type, before_content, after_content, status, created_at \
             FROM file_change_traces WHERE session_id = ?1 \
             ORDER BY created_at ASC, seq ASC",
        )
        .map_err(|e| e.to_string())?
    };

    let rows = if let Some(req) = &request_id {
        stmt.query_map(params![&session_id, req], map_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    } else {
        stmt.query_map(params![&session_id], map_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    Ok(rows)
}

/// 更新变更状态（主要用于「采纳」标记 accepted）。
#[tauri::command]
pub fn update_file_change_status(
    trace_id: String,
    status: String,
) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE file_change_traces SET status = ?1 WHERE id = ?2",
        params![&status, &trace_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 读取会话所属项目的路径（工作目录），用于把相对路径解析为绝对路径。
fn session_project_path(session_id: &str) -> Result<Option<String>, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let project_path: Option<String> = conn
        .query_row(
            "SELECT p.path FROM sessions s JOIN projects p ON p.id = s.project_id \
             WHERE s.id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .ok();
    Ok(project_path)
}

/// 把 file_change_traces 中存储的路径解析为磁盘绝对路径。
/// 优先按绝对路径处理；若为相对路径，则拼接到会话项目目录下。
fn resolve_disk_path(file_path: &str, project_path: Option<&str>) -> PathBuf {
    let p = PathBuf::from(file_path);
    if p.is_absolute() {
        return p;
    }
    if let Some(cwd) = project_path {
        let cwd = expand_home_path(cwd).unwrap_or_else(|_| PathBuf::from(cwd));
        return cwd.join(&p);
    }
    p
}

/// 回滚单个文件变更。
///
/// - create：删除 AI 新建的文件；
/// - modify：把 before_content 写回磁盘；
/// - delete：把 before_content 写回磁盘（恢复被删除的文件）。
///
/// 回滚成功后将状态置为 `rolled_back`。before_content 缺失时返回错误
/// （无法还原原始内容）。
#[tauri::command]
pub fn rollback_file_change(trace_id: String) -> Result<FileChangeTrace, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let trace = conn
        .query_row(
            "SELECT id, session_id, request_id, tool_call_id, file_path, relative_path, \
             change_type, before_content, after_content, status, created_at \
             FROM file_change_traces WHERE id = ?1",
            params![&trace_id],
            map_row,
        )
        .map_err(|e| e.to_string())?;

    let project_path = session_project_path(&trace.session_id)?;
    let disk_path = resolve_disk_path(&trace.file_path, project_path.as_deref());

    match trace.change_type.as_str() {
        "create" => {
            // 新建文件直接删除（已不存在视为成功，幂等）
            if disk_path.exists() && disk_path.is_file() {
                fs::remove_file(&disk_path).map_err(|e| format!("删除文件失败: {}", e))?;
            }
        }
        "modify" | "delete" => {
            let before = trace
                .before_content
                .as_ref()
                .ok_or_else(|| "无法回滚：缺少原始内容".to_string())?;
            // 确保父目录存在（针对 delete 后目录可能被清理的极端情况）
            if let Some(parent) = disk_path.parent() {
                if !parent.as_os_str().is_empty() && !parent.exists() {
                    fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
                }
            }
            fs::write(&disk_path, before).map_err(|e| format!("回写文件失败: {}", e))?;
        }
        other => {
            return Err(format!("未知的变更类型: {}", other));
        }
    }

    let now = now_rfc3339();
    conn.execute(
        "UPDATE file_change_traces SET status = 'rolled_back' WHERE id = ?1",
        params![&trace_id],
    )
    .map_err(|e| e.to_string())?;
    let _ = now;

    Ok(FileChangeTrace {
        status: "rolled_back".to_string(),
        ..trace
    })
}
