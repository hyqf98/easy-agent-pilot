//! 项目访问记录命令（阶段 1 试点：从 rusqlite 同步迁移到 rbatis async）。
//!
//! 对应 SQL 集中在 `sql/project_access.html`，mapper 在 `mappers/project_access.rs`。

use crate::db;
use crate::mappers::project_access;

/// 记录项目访问
#[tauri::command]
pub async fn record_project_access(project_id: String) -> Result<(), String> {
    // 用 rb.exec + ? 占位符直接执行（绕过 #[html_sql] 宏对 mapper 返回类型的处理）
    let sql = "INSERT INTO project_access_log (project_id, last_accessed_at, access_count) VALUES (?, strftime('%s','now'), 1) ON CONFLICT(project_id) DO UPDATE SET last_accessed_at = strftime('%s','now'), access_count = access_count + 1";
    db::rb()
        .exec(sql, vec![rbs::Value::String(project_id)])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取最近访问的项目
#[tauri::command]
pub async fn get_recent_projects(limit: i32) -> Result<Vec<String>, String> {
    let rows = project_access::get_recent_projects(db::rb(), limit as i64)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.project_id)
        .collect())
}

/// 删除项目访问记录
#[tauri::command]
pub async fn delete_project_access_log(project_id: String) -> Result<(), String> {
    project_access::delete_project_access_log(db::rb(), &project_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
