pub mod app_state;
pub mod cli;
pub mod cli_config;
pub mod conversation;
pub mod project_access;
pub mod mcp;
pub mod plan;
pub mod task;
pub mod marketplace;
pub mod mcp_market;
pub mod skills_market;
pub mod plugins_market;
pub mod install;
pub mod project;
pub mod session;
pub mod message;
pub mod agent;
pub mod agent_config;
pub mod data;
pub mod settings;
pub mod scan;
pub mod provider_profile;
pub mod skill_plugin;
pub mod window;

use std::fs;
use std::path::PathBuf;
use anyhow::Result;

/// 获取持久化目录路径
pub fn get_persistence_dir_path() -> Result<PathBuf> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
    Ok(home_dir.join(".easy-agent"))
}

/// 初始化持久化目录结构
pub fn init_persistence_dirs() -> Result<()> {
    let base_dir = get_persistence_dir_path()?;

    // 创建主目录
    fs::create_dir_all(&base_dir)?;

    // 创建子目录
    let sub_dirs = ["data", "logs", "cache"];
    for dir in sub_dirs {
        fs::create_dir_all(base_dir.join(dir))?;
    }

    println!("Persistence directories initialized at: {:?}", base_dir);
    Ok(())
}

/// 获取持久化目录路径 (Tauri 命令)
#[tauri::command]
pub fn get_persistence_dir() -> Result<String, String> {
    get_persistence_dir_path()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// 检查数据库是否存在 (Tauri 命令)
#[tauri::command]
pub fn check_database_exists() -> Result<bool, String> {
    let db_path = get_persistence_dir_path()
        .map(|p| p.join("data").join("easy-agent.db"))
        .map_err(|e| e.to_string())?;

    Ok(db_path.exists())
}
