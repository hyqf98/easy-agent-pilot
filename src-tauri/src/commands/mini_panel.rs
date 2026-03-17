use anyhow::Result;
use rusqlite::OptionalExtension;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

use super::support::{now_rfc3339, open_db_connection, open_db_connection_with_foreign_keys};

pub const MINI_PANEL_WINDOW_LABEL: &str = "mini-panel";
pub const MINI_PANEL_PROJECT_ID_KEY: &str = "miniPanelProjectId";
pub const MINI_PANEL_SESSION_ID_KEY: &str = "miniPanelSessionId";
pub const MINI_PANEL_WORKING_DIRECTORY_KEY: &str = "miniPanelWorkingDirectory";

const MINI_PANEL_PROJECT_NAME: &str = "__EasyAgent Mini Panel__";
const MINI_PANEL_SESSION_NAME: &str = "Mini Panel";
const MINI_PANEL_PROJECT_DESCRIPTION: &str = "__ea_system_mini_panel__";
const MINI_PANEL_DEFAULT_AGENT_TYPE: &str = "claude";

#[cfg(target_os = "windows")]
const MINI_PANEL_DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+Space";

#[cfg(not(target_os = "windows"))]
const MINI_PANEL_DEFAULT_SHORTCUT: &str = "Alt+Space";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniPanelState {
    pub project_id: String,
    pub session_id: String,
    pub working_directory: String,
    pub default_shortcut: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniPanelDirectoryResult {
    pub working_directory: String,
}

fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
        [key, value, &now_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_setting(conn: &rusqlite::Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn home_directory() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())
}

fn mini_panel_project_path() -> Result<PathBuf, String> {
    let path = super::get_persistence_dir_path()
        .map_err(|e| e.to_string())?
        .join("data")
        .join("mini-panel-workspace");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

fn resolve_path_input(input: &str, current_directory: &Path) -> Result<PathBuf, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(current_directory.to_path_buf());
    }

    let candidate = if trimmed.starts_with('~') {
        let home = home_directory()?;
        let rest = trimmed[1..].strip_prefix('/').unwrap_or(&trimmed[1..]);
        home.join(rest)
    } else {
        let path = PathBuf::from(trimmed);
        if path.is_absolute() {
            path
        } else {
            current_directory.join(path)
        }
    };

    let resolved = candidate
        .canonicalize()
        .map_err(|e| format!("无法切换到路径: {}", e))?;

    if !resolved.is_dir() {
        return Err("路径存在但不是目录".to_string());
    }

    Ok(resolved)
}

fn project_exists(conn: &rusqlite::Connection, project_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM projects WHERE id = ?1 LIMIT 1",
        [project_id],
        |_row| Ok(()),
    )
    .optional()
    .map(|result| result.is_some())
    .map_err(|e| e.to_string())
}

fn session_exists(conn: &rusqlite::Connection, session_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM sessions WHERE id = ?1 LIMIT 1",
        [session_id],
        |_row| Ok(()),
    )
    .optional()
    .map(|result| result.is_some())
    .map_err(|e| e.to_string())
}

fn ensure_mini_panel_project(conn: &rusqlite::Connection) -> Result<String, String> {
    if let Some(project_id) = get_setting(conn, MINI_PANEL_PROJECT_ID_KEY)? {
        if project_exists(conn, &project_id)? {
            return Ok(project_id);
        }
    }

    let project_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let path = mini_panel_project_path()?;
    let path_str = path.to_string_lossy().to_string();

    conn.execute(
        "INSERT INTO projects (id, name, path, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            &project_id,
            MINI_PANEL_PROJECT_NAME,
            &path_str,
            MINI_PANEL_PROJECT_DESCRIPTION,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    set_setting(conn, MINI_PANEL_PROJECT_ID_KEY, &project_id)?;
    Ok(project_id)
}

fn ensure_mini_panel_session(
    conn: &rusqlite::Connection,
    project_id: &str,
) -> Result<String, String> {
    if let Some(session_id) = get_setting(conn, MINI_PANEL_SESSION_ID_KEY)? {
        if session_exists(conn, &session_id)? {
            return Ok(session_id);
        }
    }

    let session_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();

    conn.execute(
        "INSERT INTO sessions (id, project_id, name, agent_type, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'idle', ?5, ?6)",
        rusqlite::params![
            &session_id,
            project_id,
            MINI_PANEL_SESSION_NAME,
            MINI_PANEL_DEFAULT_AGENT_TYPE,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    set_setting(conn, MINI_PANEL_SESSION_ID_KEY, &session_id)?;
    Ok(session_id)
}

fn ensure_working_directory(conn: &rusqlite::Connection) -> Result<String, String> {
    let home = home_directory()?;
    let home_str = home.to_string_lossy().to_string();
    let stored = get_setting(conn, MINI_PANEL_WORKING_DIRECTORY_KEY)?;
    let next = stored
        .as_ref()
        .filter(|path| Path::new(path).is_dir())
        .cloned()
        .unwrap_or_else(|| home_str.clone());

    if stored.as_deref() != Some(next.as_str()) {
        set_setting(conn, MINI_PANEL_WORKING_DIRECTORY_KEY, &next)?;
    }

    Ok(next)
}

fn ensure_mini_panel_state_internal(conn: &rusqlite::Connection) -> Result<MiniPanelState, String> {
    let project_id = ensure_mini_panel_project(conn)?;
    let session_id = ensure_mini_panel_session(conn, &project_id)?;
    let working_directory = ensure_working_directory(conn)?;

    Ok(MiniPanelState {
        project_id,
        session_id,
        working_directory,
        default_shortcut: MINI_PANEL_DEFAULT_SHORTCUT.to_string(),
    })
}

fn ensure_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(MINI_PANEL_WINDOW_LABEL) {
        return Ok(window);
    }

    WebviewWindowBuilder::new(
        app,
        MINI_PANEL_WINDOW_LABEL,
        WebviewUrl::App("/mini-panel".into()),
    )
    .title("Easy Agent Mini Panel")
    .inner_size(920.0, 680.0)
    .min_inner_size(720.0, 520.0)
    .resizable(true)
    .visible(false)
    .always_on_top(true)
    .build()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ensure_mini_panel_state() -> Result<MiniPanelState, String> {
    let conn = open_db_connection_with_foreign_keys().map_err(|e| e.to_string())?;
    ensure_mini_panel_state_internal(&conn)
}

#[tauri::command]
pub fn set_mini_panel_working_directory(
    path: String,
    current_directory: Option<String>,
) -> Result<MiniPanelDirectoryResult, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let base = current_directory
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or(home_directory()?);
    let resolved = resolve_path_input(&path, &base)?;
    let resolved_str = resolved.to_string_lossy().to_string();

    set_setting(&conn, MINI_PANEL_WORKING_DIRECTORY_KEY, &resolved_str)?;

    Ok(MiniPanelDirectoryResult {
        working_directory: resolved_str,
    })
}

#[tauri::command]
pub fn get_mini_panel_default_shortcut() -> Result<String, String> {
    Ok(MINI_PANEL_DEFAULT_SHORTCUT.to_string())
}

#[tauri::command]
pub fn register_mini_panel_windows_shortcut(
    app: AppHandle,
    shortcut: String,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        super::mini_panel_windows_shortcut::register_shortcut(app, shortcut)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, shortcut);
        Err("WINDOWS_SHORTCUT_OVERRIDE_UNSUPPORTED".to_string())
    }
}

#[tauri::command]
pub fn unregister_mini_panel_windows_shortcut() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        super::mini_panel_windows_shortcut::unregister_shortcut()
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("WINDOWS_SHORTCUT_OVERRIDE_UNSUPPORTED".to_string())
    }
}

#[tauri::command]
pub fn show_mini_panel(app: AppHandle) -> Result<(), String> {
    let window = ensure_window(&app)?;
    window.center().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    window
        .emit("mini-panel:focus-input", true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn hide_mini_panel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(MINI_PANEL_WINDOW_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_mini_panel(app: AppHandle) -> Result<bool, String> {
    let window = ensure_window(&app)?;
    let visible = window.is_visible().map_err(|e| e.to_string())?;

    if visible {
        window.hide().map_err(|e| e.to_string())?;
        return Ok(false);
    }

    window.center().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    window
        .emit("mini-panel:focus-input", true)
        .map_err(|e| e.to_string())?;
    Ok(true)
}
