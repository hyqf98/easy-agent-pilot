use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::db;
use crate::mappers::window as window_mapper;

/// 窗口上下文信息
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowContext {
    pub label: String,
    pub project_id: Option<String>,
    pub window_type: String,
}
/// 在新窗口中打开项目
#[tauri::command]
pub async fn open_project_in_new_window(
    app: AppHandle,
    project_id: String,
) -> Result<String, String> {
    let short_id = if project_id.len() > 8 { &project_id[..8] } else { &project_id };
    let window_label = format!("project-{}", short_id);
    // 检查窗口是否已存在
    if app.get_webview_window(&window_label).is_some() {
        // 聚焦已存在的窗口
        if let Some(window) = app.get_webview_window(&window_label) {
            window.set_focus().map_err(|e| e.to_string())?;
        }
        return Ok(window_label);
    }
    // 创建新窗口
    let _window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App(format!("/?project={}", project_id).into()),
    )
    .title("Easy Agent Pilot")
    .inner_size(1200.0, 800.0)
    .min_inner_size(1000.0, 600.0)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(window_label)
}
/// 获取当前窗口上下文
#[tauri::command]
pub fn get_window_context(window: tauri::Window) -> WindowContext {
    let label = window.label().to_string();

    // 从窗口标签解析项目 ID（格式：project-{project_id}）
    let project_id = label
        .strip_prefix("project-")
        .map(|stripped| stripped.to_string());

    let window_type = if label == crate::commands::mini_panel::MINI_PANEL_WINDOW_LABEL {
        "mini-panel".to_string()
    } else if label == crate::commands::desktop_pet::PET_WINDOW_LABEL {
        "pet".to_string()
    } else if label.starts_with("project-") {
        "project".to_string()
    } else {
        "main".to_string()
    };

    WindowContext {
        label,
        project_id,
        window_type,
    }
}
/// 锁定会话到窗口
#[tauri::command]
pub async fn lock_session(session_id: String, window_label: String) -> Result<(), String> {
    window_mapper::lock_session(db::rb(), &session_id, &window_label)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
/// 释放会话锁定
#[tauri::command]
pub async fn release_session(session_id: String) -> Result<(), String> {
    window_mapper::release_session(db::rb(), &session_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
/// 检查会话是否被锁定
#[tauri::command]
pub async fn is_session_locked(session_id: String) -> Result<Option<String>, String> {
    let row = window_mapper::is_session_locked(db::rb(), &session_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.into_iter().next().and_then(|r| r.window_label))
}
/// 释放窗口的所有会话锁定
#[tauri::command]
pub async fn release_window_sessions(window_label: String) -> Result<(), String> {
    window_mapper::release_window_sessions(db::rb(), &window_label)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
