//! 应用状态（app_state）mapper。
//!
//! 对应 `commands/app_state.rs` 的 DB 操作。
//!
//! 注意：本 mapper 全部改用 `rb.query` + 手动 RBS 解析，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放（写锁/死锁），同时避免 rbatis 将 JSON 形态的 value
//! （如 `["a","b"]`）自动解析为 RBS 序列，从而破坏 `Option<String>` 反序列化。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use rbs::Value;

use crate::models::AppStateRow;

/// 把 rbs::Value（数值类型）解析为 i64。
fn value_to_i64(v: &Value) -> i64 {
    match v {
        Value::I32(x) => *x as i64,
        Value::I64(x) => *x,
        Value::U32(x) => *x as i64,
        Value::U64(x) => *x as i64,
        Value::Null => 0,
        _ => 0,
    }
}

/// 将单个 RBS 值还原为“原始字符串表示”。
///
/// - 普通字符串：原样返回
/// - JSON 形态（rbatis 把存储的 JSON 文本解析成了 Array/Map）：序列化回 JSON 文本，
///   保证读出的字符串与写入时一致
/// - 标量：转字符串
fn value_to_plain_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::I32(x) => x.to_string(),
        Value::I64(x) => x.to_string(),
        Value::U32(x) => x.to_string(),
        Value::U64(x) => x.to_string(),
        Value::F32(x) => x.to_string(),
        Value::F64(x) => x.to_string(),
        // JSON 形态：序列化回 JSON 文本
        Value::Array(_) | Value::Map(_) => serde_json::to_string(v).unwrap_or_default(),
        Value::Binary(_) => String::new(),
        Value::Ext(_, _) => String::new(),
    }
}

/// 从 `Value::Map`（rbs ValueMap）中按列名取出对应列的字符串值。
///
/// rbs::ValueMap 实现了 `Index<&str>`（缺失键返回 `&Value::Null`），
/// 因此可直接用 `map[column]` 索引。非 Map 输入返回 None。
fn map_get_string(map_value: &Value, column: &str) -> Option<String> {
    match map_value {
        Value::Map(map) => {
            let v = &map[column];
            match v {
                Value::Null => None,
                other => Some(value_to_plain_string(other)),
            }
        }
        _ => None,
    }
}

/// 从单行查询结果构造 `AppStateRow`。
fn row_to_app_state(row: &Value) -> Option<AppStateRow> {
    let Value::Map(map) = row else {
        return None
    };
    let key = match &map["key"] {
        Value::Null => None,
        v => Some(value_to_plain_string(v)),
    };
    let value = match &map["value"] {
        Value::Null => None,
        v => Some(value_to_plain_string(v)),
    };
    let updated_at = match &map["updated_at"] {
        Value::Null => None,
        v => Some(value_to_i64(v)),
    };
    Some(AppStateRow { key, value, updated_at })
}

/// 获取单个应用状态值。
pub async fn get_app_state(rb: &dyn Executor, key: &str) -> Option<String> {
    let sql = "select value from app_state where key = ?";
    let result = rb.query(sql, vec![Value::String(key.to_string())]).await.ok()?;
    let Value::Array(rows) = &result else {
        return None
    };
    rows.first().and_then(|row| match row {
        Value::Map(_) => map_get_string(row, "value"),
        _ => None,
    })
}

/// 设置应用状态值（upsert）。
pub async fn set_app_state(
    rb: &dyn Executor,
    key: &str,
    value: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert or replace into app_state (key, value, updated_at) values (?, ?, strftime('%s', 'now'))";
    rb.exec(
        sql,
        vec![
            Value::String(key.to_string()),
            Value::String(value.to_string()),
        ],
    )
    .await
}

/// 批量获取应用状态（IN 动态拼接）。
pub async fn get_app_states(rb: &dyn Executor, keys: &Vec<String>) -> Vec<AppStateRow> {
    if keys.is_empty() {
        return Vec::new();
    }
    let placeholders = vec!["?"; keys.len()].join(",");
    let sql = format!("select key, value, updated_at from app_state where key in ({placeholders})");
    let params: Vec<Value> = keys.iter().map(|k| Value::String(k.clone())).collect();
    let result = match rb.query(&sql, params).await {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    let Value::Array(rows) = &result else {
        return Vec::new();
    };

    rows.iter().filter_map(row_to_app_state).collect()
}
