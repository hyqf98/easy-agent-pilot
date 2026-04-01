use crate::logging::{
    clear_runtime_log_files, get_runtime_log_summary, list_runtime_log_files, write_log,
    read_runtime_log_file, RuntimeLogFileInfo, RuntimeLogReadResult, RuntimeLogSummary,
};

#[tauri::command]
pub fn get_runtime_log_summary_command() -> Result<RuntimeLogSummary, String> {
    get_runtime_log_summary().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_runtime_log_files_command() -> Result<Vec<RuntimeLogFileInfo>, String> {
    list_runtime_log_files().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_runtime_log_file_command(
    file_name: Option<String>,
    tail_lines: Option<usize>,
) -> Result<RuntimeLogReadResult, String> {
    read_runtime_log_file(file_name.as_deref(), tail_lines).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_runtime_log_files_command() -> Result<usize, String> {
    clear_runtime_log_files().map_err(|error| error.to_string())
}

/// 从前端补充写入一条运行时日志。
///
/// 主要用于记录前端已捕获但后端尚未落盘的异常，便于跨端链路排查。
#[tauri::command]
pub fn write_runtime_log_command(level: String, target: String, message: String) -> Result<(), String> {
    write_log(level.trim(), target.trim(), message.trim());
    Ok(())
}
