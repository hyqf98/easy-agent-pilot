use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

/// 终端面板的 PTY 会话输入参数。
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTerminalSessionInput {
    /// 终端列数。
    pub cols: u16,
    /// 终端行数。
    pub rows: u16,
    /// 初始工作目录。
    pub cwd: Option<String>,
    /// 自定义 shell，可选。
    pub shell: Option<String>,
}

/// 终端会话创建结果。
#[derive(Debug, Clone, Serialize)]
pub struct TerminalSessionInfo {
    /// 会话 ID。
    pub session_id: String,
    /// 当前使用的 shell。
    pub shell: String,
    /// 当前工作目录。
    pub cwd: Option<String>,
}

/// 终端输出事件负载。
#[derive(Debug, Clone, Serialize)]
pub struct TerminalDataEvent {
    /// 会话 ID。
    pub session_id: String,
    /// 终端输出内容。
    pub data: String,
}

/// 终端退出事件负载。
#[derive(Debug, Clone, Serialize)]
pub struct TerminalExitEvent {
    /// 会话 ID。
    pub session_id: String,
}

struct TerminalSession {
    shell: String,
    cwd: Mutex<Option<String>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
}

/// 全局终端状态，负责管理底部终端的 PTY 会话。
#[derive(Clone, Default)]
pub struct TerminalState {
    sessions: Arc<Mutex<HashMap<String, Arc<TerminalSession>>>>,
}

fn default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(shell) = std::env::var("EASY_AGENT_PILOT_SHELL") {
            let trimmed = shell.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        return "powershell.exe".to_string();
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "/bin/bash".to_string())
    }
}

fn build_change_directory_command(shell: &str, path: &str) -> String {
    let normalized_shell = shell.to_ascii_lowercase();

    if normalized_shell.contains("cmd.exe") || normalized_shell.ends_with("\\cmd") {
        let escaped = path.replace('"', "\"\"");
        return format!("cd /d \"{}\"\r", escaped);
    }

    if normalized_shell.contains("powershell") || normalized_shell.contains("pwsh") {
        let escaped = path.replace('\'', "''");
        return format!("Set-Location -LiteralPath '{}'\r", escaped);
    }

    let escaped = path.replace('\'', "'\"'\"'");
    format!("cd '{}'\r", escaped)
}

fn emit_terminal_data(app: &AppHandle, session_id: &str, data: String) {
    let _ = app.emit(
        "terminal:data",
        TerminalDataEvent {
            session_id: session_id.to_string(),
            data,
        },
    );
}

fn emit_terminal_exit(app: &AppHandle, session_id: &str) {
    let _ = app.emit(
        "terminal:exit",
        TerminalExitEvent {
            session_id: session_id.to_string(),
        },
    );
}

fn create_pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// 将 PTY 字节流按 UTF-8 边界增量解码，避免多字节字符跨 read 边界时被直接替换成乱码。
fn decode_terminal_output(pending: &mut Vec<u8>, chunk: &[u8]) -> String {
    pending.extend_from_slice(chunk);

    let mut decoded = String::new();

    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                decoded.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid_up_to = error.valid_up_to();
                if valid_up_to > 0 {
                    let valid_prefix = pending[..valid_up_to].to_vec();
                    decoded.push_str(String::from_utf8_lossy(&valid_prefix).as_ref());
                    pending.drain(..valid_up_to);
                    continue;
                }

                let Some(invalid_len) = error.error_len() else {
                    break;
                };

                let invalid_bytes = pending[..invalid_len].to_vec();
                decoded.push_str(String::from_utf8_lossy(&invalid_bytes).as_ref());
                pending.drain(..invalid_len);
            }
        }
    }

    decoded
}

/// 创建一个新的终端 PTY 会话，并开始向前端推送输出事件。
#[tauri::command]
pub fn create_terminal_session(
    app: AppHandle,
    state: State<'_, TerminalState>,
    input: CreateTerminalSessionInput,
) -> Result<TerminalSessionInfo, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(create_pty_size(input.cols.max(40), input.rows.max(12)))
        .map_err(|error| error.to_string())?;

    let shell = input
        .shell
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(default_shell);

    let mut command = CommandBuilder::new(shell.clone());
    if let Some(cwd) = input
        .cwd
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        command.cwd(cwd);
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;

    let session_id = Uuid::new_v4().to_string();
    let session = Arc::new(TerminalSession {
        shell: shell.clone(),
        cwd: Mutex::new(input.cwd.clone()),
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Mutex::new(child),
    });

    state
        .sessions
        .lock()
        .insert(session_id.clone(), Arc::clone(&session));

    let app_handle = app.clone();
    let sessions = Arc::clone(&state.sessions);
    let read_session_id = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        let mut pending_utf8 = Vec::new();

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let chunk = decode_terminal_output(&mut pending_utf8, &buffer[..size]);
                    if !chunk.is_empty() {
                        emit_terminal_data(&app_handle, &read_session_id, chunk);
                    }
                }
                Err(_) => break,
            }
        }

        if !pending_utf8.is_empty() {
            let remaining = String::from_utf8_lossy(&pending_utf8).to_string();
            if !remaining.is_empty() {
                emit_terminal_data(&app_handle, &read_session_id, remaining);
            }
        }

        sessions.lock().remove(&read_session_id);
        emit_terminal_exit(&app_handle, &read_session_id);
    });

    Ok(TerminalSessionInfo {
        session_id,
        shell,
        cwd: input.cwd,
    })
}

/// 向指定终端会话写入用户输入。
#[tauri::command]
pub fn terminal_write(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "Terminal session not found".to_string())?;

    let mut writer = session.writer.lock();
    writer
        .write_all(data.as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|error| error.to_string())
}

/// 调整终端会话的 PTY 尺寸，避免窗口缩放后换行错乱。
#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "Terminal session not found".to_string())?;

    let resize_result = session
        .master
        .lock()
        .resize(create_pty_size(cols.max(40), rows.max(12)))
        .map_err(|error| error.to_string());

    resize_result
}

/// 将指定终端会话切换到新的工作目录。
#[tauri::command]
pub fn terminal_change_directory(
    state: State<'_, TerminalState>,
    session_id: String,
    cwd: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "Terminal session not found".to_string())?;

    let command = build_change_directory_command(&session.shell, &cwd);
    {
        let mut writer = session.writer.lock();
        writer
            .write_all(command.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|error| error.to_string())?;
    }

    *session.cwd.lock() = Some(cwd);
    Ok(())
}

/// 关闭终端会话并释放 PTY 资源。
#[tauri::command]
pub fn close_terminal_session(
    app: AppHandle,
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let session = state.sessions.lock().remove(&session_id);
    let Some(session) = session else {
        return Ok(());
    };

    session
        .child
        .lock()
        .kill()
        .map_err(|error| error.to_string())?;
    emit_terminal_exit(&app, &session_id);
    Ok(())
}
