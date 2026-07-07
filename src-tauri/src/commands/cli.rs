use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

use crate::commands::cli_support::{
    configure_windows_std_command, find_cli_executable, get_cli_version,
};
use crate::db;
use crate::mappers::cli as cli_mapper;
use crate::models::CliPathRow;

/// CLI 工具信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliTool {
    pub name: String,
    pub command: String,
    pub version: Option<String>,
    pub status: CliStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CliStatus {
    Available,
    NotFound,
    Error,
}

/// 检测结果
#[derive(Debug, Serialize, Deserialize)]
pub struct DetectionResult {
    pub tools: Vec<CliTool>,
    pub total_found: usize,
}

/// CLI 路径配置（手动添加的）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliPathEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub version: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 获取不同操作系统的扫描路径
pub fn get_scan_paths_public() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    let home = dirs::home_dir();

    #[cfg(target_os = "macos")]
    {
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/usr/local/bin"));
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/opt/homebrew/bin"));
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/opt/homebrew/sbin"));
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/usr/bin"));
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/bin"));
        if let Some(h) = &home {
            push_scan_path(&mut paths, &mut seen, h.join(".local/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".npm-global/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".volta/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".nvm/current/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".bun/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".cargo/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".asdf/shims"));
            push_scan_path(&mut paths, &mut seen, h.join("Applications"));
        }
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/Applications"));
    }

    #[cfg(target_os = "linux")]
    {
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/usr/local/bin"));
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/usr/bin"));
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/usr/local/sbin"));
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/usr/sbin"));
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/bin"));
        if let Some(h) = &home {
            push_scan_path(&mut paths, &mut seen, h.join(".local/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".npm-global/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".volta/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".nvm/current/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".bun/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".cargo/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".asdf/shims"));
            push_scan_path(&mut paths, &mut seen, h.join(".local/share/pnpm"));
        }
        push_scan_path(&mut paths, &mut seen, PathBuf::from("/snap/bin"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(program_files) = std::env::var_os("ProgramFiles") {
            push_scan_path(
                &mut paths,
                &mut seen,
                PathBuf::from(program_files).join("nodejs"),
            );
        }
        if let Some(program_files_x86) = std::env::var_os("ProgramFiles(x86)") {
            push_scan_path(
                &mut paths,
                &mut seen,
                PathBuf::from(program_files_x86).join("nodejs"),
            );
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            push_scan_path(
                &mut paths,
                &mut seen,
                PathBuf::from(&local_app_data).join("npm"),
            );
            push_scan_path(
                &mut paths,
                &mut seen,
                PathBuf::from(&local_app_data).join("pnpm"),
            );
            push_scan_path(
                &mut paths,
                &mut seen,
                PathBuf::from(&local_app_data).join("Programs"),
            );
            push_scan_path(
                &mut paths,
                &mut seen,
                PathBuf::from(&local_app_data).join("Programs").join("nodejs"),
            );
        }
        if let Ok(app_data) = std::env::var("APPDATA") {
            push_scan_path(&mut paths, &mut seen, PathBuf::from(&app_data).join("npm"));
        }
        if let Some(h) = &home {
            push_scan_path(&mut paths, &mut seen, h.join(".local/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".bun/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".volta/bin"));
            push_scan_path(&mut paths, &mut seen, h.join(".cargo/bin"));
        }
    }

    append_npm_global_bin_paths(&mut paths, &mut seen);

    paths
}

fn push_scan_path(paths: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
    if path.as_os_str().is_empty() {
        return;
    }

    if seen.insert(path.clone()) {
        paths.push(path);
    }
}

fn append_npm_global_bin_paths(paths: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>) {
    for path in resolve_npm_global_bin_paths(paths) {
        push_scan_path(paths, seen, path);
    }
}

fn resolve_npm_global_bin_paths(base_paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    for env_name in ["npm_config_prefix", "NPM_CONFIG_PREFIX"] {
        let Some(prefix) = std::env::var_os(env_name) else {
            continue;
        };

        let path = npm_prefix_to_bin_dir(Path::new(&prefix));
        if seen.insert(path.clone()) {
            paths.push(path);
        }
    }

    if let Some(path) = resolve_npm_global_bin_path_via_command(base_paths) {
        if seen.insert(path.clone()) {
            paths.push(path);
        }
    }

    paths
}

fn resolve_npm_global_bin_path_via_command(_base_paths: &[PathBuf]) -> Option<PathBuf> {
    let mut command = Command::new("npm");
    configure_windows_std_command(&mut command);
    let output = command.args(["prefix", "-g"]).output().ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let prefix = stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?;

    Some(npm_prefix_to_bin_dir(Path::new(prefix)))
}

fn npm_prefix_to_bin_dir(prefix: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        prefix.to_path_buf()
    }

    #[cfg(not(target_os = "windows"))]
    {
        prefix.join("bin")
    }
}

/// 检测单个 CLI 工具
fn detect_cli(cli_name: &str) -> CliTool {
    let command = cli_name.to_string();
    let scan_paths = get_scan_paths_public();
    let executable = find_cli_executable(cli_name, &scan_paths);
    let version = executable
        .as_deref()
        .and_then(|path| get_cli_version(path));

    if executable.is_some() {
        return CliTool {
            name: cli_name.to_string(),
            command,
            version,
            status: CliStatus::Available,
        };
    }

    CliTool {
        name: cli_name.to_string(),
        command,
        version: None,
        status: CliStatus::NotFound,
    }
}

/// 检测所有 CLI 工具 (Tauri 命令，异步并行)
#[tauri::command]
pub async fn detect_cli_tools() -> Result<DetectionResult, String> {
    let cli_names = vec!["claude".to_string(), "codex".to_string(), "opencode".to_string()];

    let handles: Vec<_> = cli_names
        .into_iter()
        .map(|name| {
            tokio::task::spawn_blocking(move || detect_cli(&name))
        })
        .collect();

    let mut tools = Vec::with_capacity(handles.len());
    for handle in handles {
        let tool = handle
            .await
            .map_err(|e| format!("CLI 检测任务失败: {}", e))?;
        tools.push(tool);
    }

    let total_found = tools
        .iter()
        .filter(|t| t.status == CliStatus::Available)
        .count();

    Ok(DetectionResult { tools, total_found })
}

// ============== CLI 路径配置 CRUD ==============

/// 把 rbatis 行映射转换为对外的 CliPathEntry DTO。
fn path_row_to_entry(row: CliPathRow) -> Result<CliPathEntry, String> {
    Ok(CliPathEntry {
        id: row.id.ok_or("cli_paths.id 缺失")?,
        name: row.name.ok_or("cli_paths.name 缺失")?,
        path: row.path.ok_or("cli_paths.path 缺失")?,
        version: row.version,
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    })
}

/// 获取所有 CLI 路径配置 (Tauri 命令)
#[tauri::command]
pub async fn list_cli_paths() -> Result<Vec<CliPathEntry>, String> {
    let rows = cli_mapper::list_cli_paths(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(path_row_to_entry).collect()
}

/// 添加 CLI 路径配置 (Tauri 命令)
#[tauri::command]
pub async fn add_cli_path(name: String, path: String) -> Result<CliPathEntry, String> {
    // 验证路径并获取版本
    let cli_path = PathBuf::from(&path);
    let version = get_cli_version(&cli_path);

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    cli_mapper::insert_cli_path(
        db::rb(),
        &id,
        &name,
        &path,
        version.as_deref(),
        &now,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(CliPathEntry {
        id,
        name,
        path,
        version,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新 CLI 路径配置 (Tauri 命令)
#[tauri::command]
pub async fn update_cli_path(id: String, name: String, path: String) -> Result<CliPathEntry, String> {
    // 验证路径并获取版本
    let cli_path = PathBuf::from(&path);
    let version = get_cli_version(&cli_path);

    let now = Utc::now().to_rfc3339();

    cli_mapper::update_cli_path(
        db::rb(),
        &id,
        &name,
        &path,
        version.as_deref(),
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(CliPathEntry {
        id,
        name,
        path,
        version,
        created_at: String::new(), // 不需要返回原始创建时间
        updated_at: now,
    })
}

/// 删除 CLI 路径配置 (Tauri 命令)
#[tauri::command]
pub async fn delete_cli_path(id: String) -> Result<(), String> {
    cli_mapper::delete_cli_path(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============== CLI 路径迁移到智能体配置 ==============

/// 迁移状态键名
const MIGRATION_STATUS_KEY: &str = "cli_paths_migrated";

/// 迁移结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationResult {
    /// 是否成功
    pub success: bool,
    /// 迁移的 CLI 路径数量
    pub migrated_count: usize,
    /// 跳过的数量（已存在相同路径的智能体）
    pub skipped_count: usize,
    /// 迁移的智能体 ID 列表
    pub migrated_agent_ids: Vec<String>,
    /// 错误消息
    pub error_message: Option<String>,
}

/// 检查是否需要迁移（是否存在旧的 CLI 路径配置且未迁移过）
#[tauri::command]
pub async fn check_cli_paths_migration_needed() -> Result<bool, String> {
    // 检查是否已经迁移过
    let migrated = cli_mapper::get_migration_flag(db::rb(), MIGRATION_STATUS_KEY)
        .await
        .map_err(|e| e.to_string())?;

    if migrated.into_iter().next().is_some() {
        return Ok(false);
    }

    // 检查是否有 CLI 路径配置
    let count_row = cli_mapper::count_cli_paths(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    let count = count_row
        .into_iter()
        .next()
        .and_then(|r| r.value)
        .unwrap_or(0);

    Ok(count > 0)
}

/// 获取待迁移的 CLI 路径数量
#[tauri::command]
pub async fn get_pending_migration_count() -> Result<usize, String> {
    let count_row = cli_mapper::count_cli_paths(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    let count = count_row
        .into_iter()
        .next()
        .and_then(|r| r.value)
        .unwrap_or(0);

    Ok(count as usize)
}

/// 执行 CLI 路径迁移到智能体配置
#[tauri::command]
pub async fn migrate_cli_paths_to_agents() -> Result<MigrationResult, String> {
    // 检查是否已经迁移过
    let migrated = cli_mapper::get_migration_flag(db::rb(), MIGRATION_STATUS_KEY)
        .await
        .map_err(|e| e.to_string())?;

    if migrated.into_iter().next().is_some() {
        return Ok(MigrationResult {
            success: true,
            migrated_count: 0,
            skipped_count: 0,
            migrated_agent_ids: Vec::new(),
            error_message: Some("已经完成迁移".to_string()),
        });
    }

    // 获取所有 CLI 路径配置
    let cli_paths = cli_mapper::list_all_cli_paths(db::rb())
        .await
        .map_err(|e| e.to_string())?;

    let mut migrated_count = 0;
    let mut skipped_count = 0;
    let mut migrated_agent_ids = Vec::new();
    let now = Utc::now().to_rfc3339();

    for cli_path in cli_paths {
        let path = match cli_path.path {
            Some(p) => p,
            None => continue,
        };
        let name = cli_path.name.unwrap_or_default();

        // 检查是否已存在相同路径的智能体
        let existing = cli_mapper::find_agent_id_by_cli_path(db::rb(), &path)
            .await
            .map_err(|e| e.to_string())?;

        if !existing.is_empty() {
            skipped_count += 1;
            continue;
        }

        // 从路径推断提供商
        let provider = infer_provider_from_path(&path);

        // 创建新的智能体配置
        let agent_id = Uuid::new_v4().to_string();
        let agent_name = name.clone();

        cli_mapper::insert_agent_for_migration(
            db::rb(),
            &agent_id,
            &agent_name,
            provider.as_deref(),
            &path,
            &now,
            &now,
        )
        .await
        .map_err(|e| e.to_string())?;

        migrated_count += 1;
        migrated_agent_ids.push(agent_id);
    }

    // 标记迁移完成
    cli_mapper::upsert_migration_flag(db::rb(), MIGRATION_STATUS_KEY, "true", &now)
        .await
        .map_err(|e| e.to_string())?;

    Ok(MigrationResult {
        success: true,
        migrated_count,
        skipped_count,
        migrated_agent_ids,
        error_message: None,
    })
}

/// 从 CLI 路径推断提供商
fn infer_provider_from_path(path: &str) -> Option<String> {
    let path_lower = path.to_lowercase();

    if path_lower.contains("claude") {
        Some("claude".to_string())
    } else if path_lower.contains("codex") {
        Some("codex".to_string())
    } else {
        // 默认为 claude
        Some("claude".to_string())
    }
}
