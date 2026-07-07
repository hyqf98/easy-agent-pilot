//! ProviderProfile（CLI Provider 配置）mapper。
//!
//! 对应 `commands/provider_profile.rs` 的 DB 操作。SQL 模板见 `sql/provider_profile.html`。
//! 动态更新统一用 `<set>+<if>`，彻底取代旧 `UpdateSqlBuilder` + `bind_optional` 的顺序耦合。
//! 仅覆盖数据库 CRUD；CLI 配置文件读写（settings.json / config.toml / opencode.json）保留在命令层。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::ProviderProfileRow;

/// 列出全部 Provider 配置。
#[html_sql("sql/provider_profile.html")]
pub async fn list_provider_profiles(rb: &dyn Executor) -> Vec<ProviderProfileRow> {
    impled!()
}

/// 按 cli_type 列出 Provider 配置。
#[html_sql("sql/provider_profile.html")]
pub async fn list_provider_profiles_by_cli_type(
    rb: &dyn Executor,
    cli_type: &str,
) -> Vec<ProviderProfileRow> {
    impled!()
}

/// 按 id 查询单个 Provider 配置。
#[html_sql("sql/provider_profile.html")]
pub async fn get_provider_profile_by_id(
    rb: &dyn Executor,
    id: &str,
) -> Vec<ProviderProfileRow> {
    impled!()
}

/// 查询指定 cli_type 当前激活的 Provider 配置。
#[html_sql("sql/provider_profile.html")]
pub async fn get_active_provider_profile(
    rb: &dyn Executor,
    cli_type: &str,
) -> Vec<ProviderProfileRow> {
    impled!()
}

/// 插入新 Provider 配置（is_active 固定 0）。
#[allow(clippy::too_many_arguments)]
pub async fn insert_provider_profile(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    cli_type: &str,
    api_key: Option<&str>,
    base_url: Option<&str>,
    provider_name: Option<&str>,
    main_model: Option<&str>,
    reasoning_model: Option<&str>,
    haiku_model: Option<&str>,
    sonnet_default: Option<&str>,
    opus_default: Option<&str>,
    codex_model: Option<&str>,
    opencode_provider_models: Option<rbs::Value>,
    opencode_provider_npm: Option<&str>,
    created_at: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into provider_profiles (id, name, cli_type, is_active, api_key, base_url, provider_name, main_model, reasoning_model, haiku_model, sonnet_default, opus_default, codex_model, opencode_provider_models, opencode_provider_npm, created_at, updated_at) values (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(name.to_string()),
            rbs::Value::String(cli_type.to_string()),
            api_key
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            base_url
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            provider_name
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            main_model
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            reasoning_model
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            haiku_model
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            sonnet_default
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            opus_default
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            codex_model
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            opencode_provider_models.unwrap_or(rbs::Value::Null),
            opencode_provider_npm
                .map(|v| rbs::Value::String(v.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 动态更新 Provider 配置（手动构建 SET + rb.exec）。
#[allow(clippy::too_many_arguments)]
pub async fn update_provider_profile(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
    name: Option<&str>,
    api_key: Option<&str>,
    base_url: Option<&str>,
    provider_name: Option<&str>,
    main_model: Option<&str>,
    reasoning_model: Option<&str>,
    haiku_model: Option<&str>,
    sonnet_default: Option<&str>,
    opus_default: Option<&str>,
    codex_model: Option<&str>,
    opencode_provider_models: Option<rbs::Value>,
    opencode_provider_npm: Option<&str>,
) -> Result<ExecResult, rbatis::Error> {
    let mut sets: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params: Vec<rbs::Value> = vec![rbs::Value::String(updated_at.to_string())];

    macro_rules! push_str {
        ($col:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?", $col));
                params.push(rbs::Value::String(v.to_string()));
            }
        };
    }
    macro_rules! push_json {
        ($col:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?", $col));
                params.push(v.clone());
            }
        };
    }

    push_str!("name", name);
    push_str!("api_key", api_key);
    push_str!("base_url", base_url);
    push_str!("provider_name", provider_name);
    push_str!("main_model", main_model);
    push_str!("reasoning_model", reasoning_model);
    push_str!("haiku_model", haiku_model);
    push_str!("sonnet_default", sonnet_default);
    push_str!("opus_default", opus_default);
    push_str!("codex_model", codex_model);
    push_json!("opencode_provider_models", opencode_provider_models);
    push_str!("opencode_provider_npm", opencode_provider_npm);

    let sql = format!("update provider_profiles set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(id.to_string()));
    rb.exec(&sql, params).await
}

/// 删除 Provider 配置。
pub async fn delete_provider_profile(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from provider_profiles where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

// ==================== 切换激活配置（事务内） ====================

/// 将同类型其他配置置为非激活。
pub async fn deactivate_provider_profiles_by_cli_type(
    rb: &dyn Executor,
    cli_type: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update provider_profiles set is_active = 0 where cli_type = ?";
    rb.exec(sql, vec![rbs::Value::String(cli_type.to_string())])
        .await
}

/// 激活指定配置。
pub async fn activate_provider_profile(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "update provider_profiles set is_active = 1, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}
