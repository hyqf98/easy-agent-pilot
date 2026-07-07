//! 应用设置（app_settings）mapper。
//!
//! 对应 `commands/settings.rs` 的 DB 操作。SQL 模板见 `sql/settings.html`。
//!
//! 所有函数首参均为 `&dyn Executor`，因此命令层既可传入 `db::rb()`，
//! 也可传入事务执行器（`save_app_settings` 批量保存）。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::AppSettingRow;

/// 获取单个设置值（返回 Row，命令层用 value_to_json_string 转 value 字段）。
/// 用 Row 接收避免 rbdc-sqlite 把 JSON 文本 value 列自动解析成 Map/Array 导致 String 反序列化失败。
#[html_sql("sql/settings.html")]
pub async fn get_app_setting(rb: &dyn Executor, key: &str) -> Vec<AppSettingRow> {
    impled!()
}

/// 获取所有设置（key, value 两列）。
#[html_sql("sql/settings.html")]
pub async fn get_all_app_settings(rb: &dyn Executor) -> Vec<AppSettingRow> {
    impled!()
}

/// 保存单个设置（upsert）。可接收普通执行器或事务执行器。
pub async fn save_app_setting(
    rb: &dyn Executor,
    key: &str,
    value: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert or replace into app_settings (key, value, updated_at) values (?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(key.to_string()),
            rbs::Value::String(value.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 删除单个设置。
pub async fn delete_app_setting(
    rb: &dyn Executor,
    key: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from app_settings where key = ?";
    rb.exec(sql, vec![rbs::Value::String(key.to_string())])
        .await
}

/// 清除所有设置。
pub async fn clear_app_settings(rb: &dyn Executor) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from app_settings";
    rb.exec(sql, vec![]).await
}
