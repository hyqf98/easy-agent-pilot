use std::collections::HashMap;
#[cfg(target_os = "macos")]
use std::process::Command;

use super::support::now_rfc3339;
use crate::db;
use crate::logging::write_log;
use crate::mappers::settings as settings_mapper;
use crate::models::AppSettingRow;

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
pub async fn get_app_setting(key: String) -> Result<Option<String>, String> {
    let row = settings_mapper::get_app_setting(db::rb(), &key)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row
        .into_iter()
        .next()
        .map(|r| crate::models::value_to_json_string(r.value)))
}

/// 获取所有设置
#[tauri::command]
pub async fn get_all_app_settings() -> Result<HashMap<String, String>, String> {
    let rows = settings_mapper::get_all_app_settings(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| match (row.key, row.value) {
            (Some(k), Some(v)) => Some((k, crate::models::value_to_json_string(Some(v)))),
            _ => None,
        })
        .collect::<HashMap<_, _>>()
        .into_iter()
        .collect())
}

/// 保存单个设置
#[tauri::command]
pub async fn save_app_setting(key: String, value: String) -> Result<(), String> {
    let updated_at = now_rfc3339();
    settings_mapper::save_app_setting(db::rb(), &key, &value, &updated_at)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 批量保存设置（事务：全部成功或全部回滚）
#[tauri::command]
pub async fn save_app_settings(settings: HashMap<String, String>) -> Result<(), String> {
    let updated_at = now_rfc3339();
    // 开启事务；任何错误路径下 tx drop 会自动回滚（deferred rollback）
    let mut tx = db::rb()
        .acquire_begin()
        .await
        .map_err(|e| e.to_string())?;
    for (key, value) in settings {
        settings_mapper::save_app_setting(&mut tx, &key, &value, &updated_at)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除单个设置
#[tauri::command]
pub async fn delete_app_setting(key: String) -> Result<(), String> {
    settings_mapper::delete_app_setting(db::rb(), &key)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 清除所有设置
#[tauri::command]
pub async fn clear_app_settings() -> Result<(), String> {
    settings_mapper::clear_app_settings(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
