use anyhow::Result;
use rusqlite::OptionalExtension;
use std::collections::HashMap;
#[cfg(target_os = "macos")]
use std::process::Command;

use super::support::{now_rfc3339, open_db_connection};
use crate::logging::write_log;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateProxyInfo {
    pub proxy: Option<String>,
    pub source: Option<String>,
}

fn normalize_proxy_value(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_matches('"').trim_end_matches('/');
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

fn resolve_env_proxy() -> Option<AppUpdateProxyInfo> {
    let candidates = [
        ("HTTPS_PROXY", "env:https_proxy"),
        ("https_proxy", "env:https_proxy"),
        ("ALL_PROXY", "env:all_proxy"),
        ("all_proxy", "env:all_proxy"),
        ("HTTP_PROXY", "env:http_proxy"),
        ("http_proxy", "env:http_proxy"),
    ];

    for (key, source) in candidates {
        let Ok(value) = std::env::var(key) else {
            continue;
        };
        let Some(proxy) = normalize_proxy_value(&value) else {
            continue;
        };
        return Some(AppUpdateProxyInfo {
            proxy: Some(proxy),
            source: Some(source.to_string()),
        });
    }

    None
}

#[cfg(target_os = "macos")]
fn parse_scutil_proxy_value(output: &str, key: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        let (current_key, value) = trimmed.split_once(':')?;
        if current_key.trim() != key {
            return None;
        }

        normalize_proxy_value(value)
    })
}

#[cfg(target_os = "macos")]
fn parse_scutil_proxy_port(output: &str, key: &str) -> Option<u16> {
    parse_scutil_proxy_value(output, key)?.parse::<u16>().ok()
}

#[cfg(target_os = "macos")]
fn proxy_enabled(output: &str, key: &str) -> bool {
    matches!(parse_scutil_proxy_value(output, key).as_deref(), Some("1"))
}

#[cfg(target_os = "macos")]
fn build_proxy_url(scheme: &str, host: &str, port: u16) -> String {
    format!("{scheme}://{host}:{port}")
}

#[cfg(target_os = "macos")]
fn resolve_macos_system_proxy() -> Option<AppUpdateProxyInfo> {
    let output = Command::new("scutil").arg("--proxy").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8(output.stdout).ok()?;

    if proxy_enabled(&text, "HTTPSEnable") {
        let host = parse_scutil_proxy_value(&text, "HTTPSProxy")?;
        let port = parse_scutil_proxy_port(&text, "HTTPSPort")?;
        return Some(AppUpdateProxyInfo {
            proxy: Some(build_proxy_url("http", &host, port)),
            source: Some("system:https".to_string()),
        });
    }

    if proxy_enabled(&text, "HTTPEnable") {
        let host = parse_scutil_proxy_value(&text, "HTTPProxy")?;
        let port = parse_scutil_proxy_port(&text, "HTTPPort")?;
        return Some(AppUpdateProxyInfo {
            proxy: Some(build_proxy_url("http", &host, port)),
            source: Some("system:http".to_string()),
        });
    }

    if proxy_enabled(&text, "SOCKSEnable") {
        let host = parse_scutil_proxy_value(&text, "SOCKSProxy")?;
        let port = parse_scutil_proxy_port(&text, "SOCKSPort")?;
        return Some(AppUpdateProxyInfo {
            proxy: Some(build_proxy_url("socks5", &host, port)),
            source: Some("system:socks".to_string()),
        });
    }

    None
}

fn resolve_app_update_proxy_internal() -> AppUpdateProxyInfo {
    if let Some(proxy) = resolve_env_proxy() {
        return proxy;
    }

    #[cfg(target_os = "macos")]
    if let Some(proxy) = resolve_macos_system_proxy() {
        return proxy;
    }

    AppUpdateProxyInfo {
        proxy: None,
        source: None,
    }
}

#[tauri::command]
pub fn resolve_app_update_proxy() -> Result<AppUpdateProxyInfo, String> {
    let resolved = resolve_app_update_proxy_internal();

    if let Some(proxy) = resolved.proxy.as_deref() {
        write_log(
            "INFO",
            "updater",
            &format!(
                "Resolved updater proxy from {}: {}",
                resolved.source.as_deref().unwrap_or("unknown"),
                proxy
            ),
        );
    } else {
        write_log("INFO", "updater", "No updater proxy resolved");
    }

    Ok(resolved)
}

/// 获取单个设置值
#[tauri::command]
pub fn get_app_setting(key: String) -> Result<Option<String>, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT value FROM app_settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([&key], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result)
}

/// 获取所有设置
#[tauri::command]
pub fn get_all_app_settings() -> Result<HashMap<String, String>, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| e.to_string())?;

    let settings = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<HashMap<String, String>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(settings)
}

/// 保存单个设置
#[tauri::command]
pub fn save_app_setting(key: String, value: String) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let updated_at = now_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
        [&key, &value, &updated_at],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 批量保存设置
#[tauri::command]
pub fn save_app_settings(settings: HashMap<String, String>) -> Result<(), String> {
    let mut conn = open_db_connection().map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let updated_at = now_rfc3339();

    for (key, value) in settings {
        tx.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            [&key, &value, &updated_at],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

/// 删除单个设置
#[tauri::command]
pub fn delete_app_setting(key: String) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM app_settings WHERE key = ?1", [&key])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 清除所有设置
#[tauri::command]
pub fn clear_app_settings() -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM app_settings", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}
