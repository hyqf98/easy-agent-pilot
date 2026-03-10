use anyhow::Result;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;

pub fn open_market_db_connection() -> Result<Connection, String> {
    let persistence_dir = crate::commands::get_persistence_dir_path().map_err(|e| e.to_string())?;
    let db_path = persistence_dir.join("data").join("easy-agent.db");
    Connection::open(&db_path).map_err(|e| e.to_string())
}

pub fn build_market_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Easy-Agent-Pilot/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

pub async fn read_market_source_payload(
    client: &reqwest::Client,
    url_or_path: &str,
    default_file_name: &str,
) -> Result<String, String> {
    let trimmed = url_or_path.trim();
    if trimmed.is_empty() {
        return Err("Market source path is empty".to_string());
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let response = client
            .get(trimmed)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP error: {}", response.status()));
        }

        return response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e));
    }

    let local_path = resolve_local_source_path(trimmed, default_file_name)?;
    fs::read_to_string(&local_path)
        .map_err(|e| format!("Failed to read market source {}: {}", local_path.display(), e))
}

fn resolve_local_source_path(url_or_path: &str, default_file_name: &str) -> Result<PathBuf, String> {
    let expanded = if url_or_path == "~" {
        dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?
    } else if let Some(relative) = url_or_path.strip_prefix("~/") {
        dirs::home_dir()
            .ok_or_else(|| "Cannot determine home directory".to_string())?
            .join(relative)
    } else {
        PathBuf::from(url_or_path)
    };

    if expanded.is_dir() {
        return Ok(expanded.join(default_file_name));
    }

    Ok(expanded)
}
