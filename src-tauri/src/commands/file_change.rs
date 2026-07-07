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

use serde::{Deserialize, Serialize};

use crate::commands::fs_shared::expand_home_path;
use crate::db;
use crate::mappers::file_change as trace_mapper;
use crate::mappers::file_change::FileChangeTraceQuery;
use crate::models::FileChangeTraceRow;

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

/// 把 rbatis 行映射转换为对外的 FileChangeTrace DTO。
fn trace_row_to_trace(row: FileChangeTraceRow) -> Result<FileChangeTrace, String> {
    Ok(FileChangeTrace {
        id: row.id.ok_or("file_change_traces.id 缺失")?,
        session_id: row.session_id.ok_or("file_change_traces.session_id 缺失")?,
        request_id: row.request_id.ok_or("file_change_traces.request_id 缺失")?,
        tool_call_id: row.tool_call_id.ok_or("file_change_traces.tool_call_id 缺失")?,
        file_path: row.file_path.ok_or("file_change_traces.file_path 缺失")?,
        relative_path: row.relative_path.ok_or("file_change_traces.relative_path 缺失")?,
        change_type: row.change_type.ok_or("file_change_traces.change_type 缺失")?,
        before_content: row.before_content,
        after_content: row.after_content.ok_or("file_change_traces.after_content 缺失")?,
        status: row.status.ok_or("file_change_traces.status 缺失")?,
        created_at: row.created_at.ok_or("file_change_traces.created_at 缺失")?,
    })
}

/// 查询文件变更列表。`request_id` 为 None 时返回整段会话的全部变更。
#[tauri::command]
pub async fn list_file_change_traces(
    session_id: String,
    request_id: Option<String>,
) -> Result<Vec<FileChangeTrace>, String> {
    let query = FileChangeTraceQuery {
        session_id,
        request_id,
    };
    let rows = trace_mapper::list_file_change_traces(db::rb(), &query)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(trace_row_to_trace).collect()
}

/// 更新变更状态（主要用于「采纳」标记 accepted）。
#[tauri::command]
pub async fn update_file_change_status(trace_id: String, status: String) -> Result<(), String> {
    trace_mapper::update_file_change_status(db::rb(), &trace_id, &status)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 读取会话所属项目的路径（工作目录），用于把相对路径解析为绝对路径。
async fn session_project_path(session_id: &str) -> Result<Option<String>, String> {
    let row = trace_mapper::get_session_project_path(db::rb(), session_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row
        .into_iter()
        .next()
        .and_then(|r| crate::models::value_to_json_string_opt(r.value)))
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
pub async fn rollback_file_change(trace_id: String) -> Result<FileChangeTrace, String> {
    let row = trace_mapper::get_file_change_trace_by_id(db::rb(), &trace_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "文件变更记录不存在".to_string())?;
    let trace = trace_row_to_trace(row)?;

    let project_path = session_project_path(&trace.session_id).await?;
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

    trace_mapper::mark_file_change_rolled_back(db::rb(), &trace_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(FileChangeTrace {
        status: "rolled_back".to_string(),
        ..trace
    })
}
