use serde::{Deserialize, Serialize};

use crate::db;
use crate::mappers::app_state as app_state_mapper;
use crate::models::AppStateRow;

/// 应用状态键值
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateEntry {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

impl From<AppStateRow> for AppStateEntry {
    fn from(row: AppStateRow) -> Self {
        Self {
            key: row.key.unwrap_or_default(),
            value: row.value.unwrap_or_default(),
            updated_at: row.updated_at.unwrap_or_default(),
        }
    }
}

/// 获取应用状态值
#[tauri::command]
pub async fn get_app_state(key: String) -> Result<Option<String>, String> {
    Ok(app_state_mapper::get_app_state(db::rb(), &key).await)
}

/// 设置应用状态值
#[tauri::command]
pub async fn set_app_state(key: String, value: String) -> Result<(), String> {
    app_state_mapper::set_app_state(db::rb(), &key, &value)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 批量获取应用状态
#[tauri::command]
pub async fn get_app_states(keys: Vec<String>) -> Result<Vec<AppStateEntry>, String> {
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let rows = app_state_mapper::get_app_states(db::rb(), &keys).await;
    Ok(rows.into_iter().map(AppStateEntry::from).collect())
}
