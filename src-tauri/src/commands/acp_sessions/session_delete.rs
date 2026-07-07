//! ACP session/delete 本地回退删除。
//!
//! ACP 协议 0.11 版本中没有 `session/delete` 方法（`sessionCapabilities` 不含 delete）。
//! 当需要删除会话时，直接通过本地文件系统 / SQLite 执行：
//!
//! - **opencode**：DELETE FROM part/message/session WHERE id = session_id（SQLite）
//! - **claude**：删除 `~/.claude/projects/<hash>/<session_id>.jsonl`
//! - **codex**：遍历 `~/.codex/sessions` 匹配 `session_meta.id` → 删文件
//!
//! # 外部库说明
//!
//! 此处操作的是 opencode 自有的**外部**数据库
//! `~/.local/share/opencode/opencode.db`，而非本应用的 SQLite 文件。全局
//! `db::rb()`（rbatis 单例）只指向应用库，无法复用到此路径；因此为每次删除
//! 创建一个短命 `RBatis` 实例 link 到外部库，执行完级联删除即丢弃。

use std::path::PathBuf;

use rbatis::rbatis::RBatis;
use rbdc_sqlite::driver::SqliteDriver;

use super::query_service::{log_error, log_info};

/// opencode 数据目录：`~/.local/share/opencode`
fn opencode_data_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".local").join("share").join("opencode"))
}

/// opencode 数据库路径：`~/.local/share/opencode/opencode.db`
fn opencode_db_path() -> Option<PathBuf> {
    opencode_data_dir().map(|d| d.join("opencode.db"))
}

/// 删除 opencode 会话（通过 SQLite 级联删除 part/message/session）。
///
/// 参考 `scan.rs::delete_opencode_session` 的逻辑。
async fn delete_opencode_session(session_id: &str) -> Result<(), String> {
    let db_path = opencode_db_path()
        .filter(|p| p.exists())
        .ok_or_else(|| "无法找到 OpenCode 数据库".to_string())?;

    // 为外部库创建短命 RBatis 实例（不复用全局应用库连接池）
    let rb = RBatis::new();
    rb.link(SqliteDriver {}, &format!("sqlite://{}", db_path.display()))
        .await
        .map_err(|e| format!("无法打开 OpenCode 数据库: {}", e))?;

    let sid = rbs::Value::String(session_id.to_string());
    rb.exec(
        "DELETE FROM part WHERE session_id = ?",
        vec![sid.clone()],
    )
    .await
    .map_err(|e| format!("删除会话 part 失败: {}", e))?;

    rb.exec(
        "DELETE FROM message WHERE session_id = ?",
        vec![sid.clone()],
    )
    .await
    .map_err(|e| format!("删除会话 message 失败: {}", e))?;

    rb.exec("DELETE FROM session WHERE id = ?", vec![sid])
        .await
        .map_err(|e| format!("删除会话记录失败: {}", e))?;

    Ok(())
}

/// 删除 claude 会话文件。
///
/// Claude Code 会话存储在 `~/.claude/projects/<project_hash>/<session_id>.jsonl`。
/// 遍历 `~/.claude/projects/` 下所有子目录查找匹配 `session_id` 的 `.jsonl` 文件。
fn delete_claude_session(session_id: &str) -> Result<(), String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "无法确定用户主目录".to_string())?;
    let projects_dir = home.join(".claude").join("projects");

    if !projects_dir.exists() {
        return Err("Claude projects 目录不存在".to_string());
    }

    let target_file = format!("{}.jsonl", session_id);
    let mut deleted = false;

    for entry in std::fs::read_dir(&projects_dir)
        .map_err(|e| format!("读取 projects 目录失败: {}", e))?
    {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let dir_path = entry.path();

        if dir_path.is_dir() {
            let session_file = dir_path.join(&target_file);
            if session_file.exists() {
                std::fs::remove_file(&session_file)
                    .map_err(|e| format!("删除文件失败: {}", e))?;
                deleted = true;
                log_info!("Deleted claude session file: {}", session_file.display());
            }
        }
    }

    if !deleted {
        return Err(format!(
            "未找到 Claude 会话文件: {}",
            target_file
        ));
    }

    Ok(())
}

/// 删除 codex 会话文件。
///
/// Codex 会话存储在 `~/.codex/sessions/` 下的 `.jsonl` 文件中，
/// 每个文件内含 `session_meta.id` 字段标识会话 ID。
/// 遍历所有文件，读取首行 JSON 匹配 `session_meta.id == session_id`。
fn delete_codex_session(session_id: &str) -> Result<(), String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "无法确定用户主目录".to_string())?;
    let sessions_dir = home.join(".codex").join("sessions");

    if !sessions_dir.exists() {
        return Err("Codex sessions 目录不存在".to_string());
    }

    let mut jsonl_files = Vec::new();
    collect_jsonl_files(&sessions_dir, &mut jsonl_files);

    let mut deleted = false;

    for file_path in &jsonl_files {
        if let Ok(content) = std::fs::read_to_string(file_path) {
            // 检查文件中是否包含目标 session_id
            if content.contains(&format!("\"id\":\"{}\"", session_id))
                || content.contains(&format!("\"id\": \"{}\"", session_id))
            {
                if std::fs::remove_file(file_path).is_ok() {
                    deleted = true;
                    log_info!("Deleted codex session file: {}", file_path.display());
                }
            }
        }
    }

    if !deleted {
        return Err(format!("未找到 Codex 会话: {}", session_id));
    }

    Ok(())
}

/// 递归收集目录下所有 `.jsonl` 文件。
fn collect_jsonl_files(dir: &std::path::Path, files: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_jsonl_files(&path, files);
            } else if path
                .extension()
                .is_some_and(|ext| ext == "jsonl")
            {
                files.push(path);
            }
        }
    }
}

/// 根据 CLI 名称删除会话（本地回退方案）。
///
/// # 参数
/// - `cli_name`：CLI 名称（`"opencode"` / `"claude"` / `"codex"`）
/// - `session_id`：会话 ID
pub(super) async fn delete_session_locally(
    cli_name: &str,
    session_id: &str,
) -> Result<(), String> {
    log_info!(
        "Deleting session locally | cli={} | session_id={}",
        cli_name,
        session_id
    );

    let result = match cli_name.to_lowercase().as_str() {
        "opencode" => delete_opencode_session(session_id).await,
        "claude" => delete_claude_session(session_id),
        "codex" => delete_codex_session(session_id),
        other => Err(format!(
            "不支持的 CLI 类型: {}（支持 opencode/claude/codex）",
            other
        )),
    };

    if let Err(ref e) = result {
        log_error!("Session deletion failed | cli={} | error={}", cli_name, e);
    }

    result
}