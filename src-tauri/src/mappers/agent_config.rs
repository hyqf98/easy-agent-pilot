//! Agent 子配置（MCP / Skills / Plugins / Models）mapper。
//!
//! 对应 `commands/agent_config.rs` 的 DB 操作。SQL 模板见 `sql/agent_config.html`。
//! 动态更新统一用 `<set>+<if>`，彻底取代旧 `UpdateSqlBuilder` 的 push/bind 顺序耦合。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。含 `<set>/<if>` 的动态
//! update 暂保留宏（标注 TODO）。

use rbatis::executor::Executor;

use crate::models::{
    AgentMcpConfigRow, AgentModelRow, AgentPluginsConfigRow, AgentSkillsConfigRow,
};

// ============================ MCP ============================

#[html_sql("sql/agent_config.html")]
pub async fn select_mcp_by_agent(rb: &dyn Executor, agent_id: &str) -> Vec<AgentMcpConfigRow> {
    impled!()
}

#[html_sql("sql/agent_config.html")]
pub async fn select_mcp_by_id(rb: &dyn Executor, id: &str) -> Vec<AgentMcpConfigRow> {
    impled!()
}

#[allow(clippy::too_many_arguments)]
pub async fn insert_mcp(
    rb: &dyn Executor,
    id: &str,
    agent_id: &str,
    name: &str,
    transport_type: &str,
    command: Option<&str>,
    args: Option<rbs::Value>,
    env: Option<rbs::Value>,
    url: Option<&str>,
    headers: Option<rbs::Value>,
    scope: &str,
    enabled: i64,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into agent_mcp_configs (id, agent_id, name, transport_type, command, args, env, url, headers, scope, enabled, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(agent_id.to_string()),
            rbs::Value::String(name.to_string()),
            rbs::Value::String(transport_type.to_string()),
            command
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            args.unwrap_or(rbs::Value::Null),
            env.unwrap_or(rbs::Value::Null),
            url.map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            headers.unwrap_or(rbs::Value::Null),
            rbs::Value::String(scope.to_string()),
            rbs::Value::I64(enabled),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 动态更新 MCP 配置（手动构建 SET + rb.exec）。
#[allow(clippy::too_many_arguments)]
pub async fn update_mcp(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
    name: Option<&str>,
    transport_type: Option<&str>,
    command: Option<&str>,
    args: Option<rbs::Value>,
    env: Option<rbs::Value>,
    url: Option<&str>,
    headers: Option<rbs::Value>,
    scope: Option<&str>,
    enabled: Option<i64>,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
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
    macro_rules! push_i64 {
        ($col:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?", $col));
                params.push(rbs::Value::I64(v));
            }
        };
    }

    push_str!("name", name);
    push_str!("transport_type", transport_type);
    push_str!("command", command);
    push_json!("args", args);
    push_json!("env", env);
    push_str!("url", url);
    push_json!("headers", headers);
    push_str!("scope", scope);
    push_i64!("enabled", enabled);

    let sql = format!("update agent_mcp_configs set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(id.to_string()));
    rb.exec(&sql, params).await
}

pub async fn delete_mcp(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from agent_mcp_configs where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

// =========================== Skills ==========================

#[html_sql("sql/agent_config.html")]
pub async fn select_skills_by_agent(
    rb: &dyn Executor,
    agent_id: &str,
) -> Vec<AgentSkillsConfigRow> {
    impled!()
}

#[html_sql("sql/agent_config.html")]
pub async fn select_skills_by_id(rb: &dyn Executor, id: &str) -> Vec<AgentSkillsConfigRow> {
    impled!()
}

#[allow(clippy::too_many_arguments)]
pub async fn insert_skills(
    rb: &dyn Executor,
    id: &str,
    agent_id: &str,
    name: &str,
    description: Option<&str>,
    skill_path: &str,
    scripts_path: Option<&str>,
    references_path: Option<&str>,
    assets_path: Option<&str>,
    enabled: i64,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into agent_skills_configs (id, agent_id, name, description, skill_path, scripts_path, references_path, assets_path, enabled, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(agent_id.to_string()),
            rbs::Value::String(name.to_string()),
            description
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(skill_path.to_string()),
            scripts_path
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            references_path
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            assets_path
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(enabled),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 动态更新 Skills 配置（手动构建 SET + rb.exec）。
#[allow(clippy::too_many_arguments)]
pub async fn update_skills(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
    name: Option<&str>,
    description: Option<&str>,
    skill_path: Option<&str>,
    scripts_path: Option<&str>,
    references_path: Option<&str>,
    assets_path: Option<&str>,
    enabled: Option<i64>,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
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
    macro_rules! push_i64 {
        ($col:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?", $col));
                params.push(rbs::Value::I64(v));
            }
        };
    }

    push_str!("name", name);
    push_str!("description", description);
    push_str!("skill_path", skill_path);
    push_str!("scripts_path", scripts_path);
    push_str!("references_path", references_path);
    push_str!("assets_path", assets_path);
    push_i64!("enabled", enabled);

    let sql = format!("update agent_skills_configs set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(id.to_string()));
    rb.exec(&sql, params).await
}

pub async fn delete_skills(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from agent_skills_configs where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

// ========================== Plugins =========================

#[html_sql("sql/agent_config.html")]
pub async fn select_plugins_by_agent(
    rb: &dyn Executor,
    agent_id: &str,
) -> Vec<AgentPluginsConfigRow> {
    impled!()
}

#[html_sql("sql/agent_config.html")]
pub async fn select_plugins_by_id(rb: &dyn Executor, id: &str) -> Vec<AgentPluginsConfigRow> {
    impled!()
}

pub async fn insert_plugins(
    rb: &dyn Executor,
    id: &str,
    agent_id: &str,
    name: &str,
    version: Option<&str>,
    description: Option<&str>,
    plugin_path: &str,
    enabled: i64,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into agent_plugins_configs (id, agent_id, name, version, description, plugin_path, enabled, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(agent_id.to_string()),
            rbs::Value::String(name.to_string()),
            version
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            description
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(plugin_path.to_string()),
            rbs::Value::I64(enabled),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 动态更新 Plugins 配置（手动构建 SET + rb.exec）。
pub async fn update_plugins(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
    name: Option<&str>,
    version: Option<&str>,
    description: Option<&str>,
    plugin_path: Option<&str>,
    enabled: Option<i64>,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
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
    macro_rules! push_i64 {
        ($col:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?", $col));
                params.push(rbs::Value::I64(v));
            }
        };
    }

    push_str!("name", name);
    push_str!("version", version);
    push_str!("description", description);
    push_str!("plugin_path", plugin_path);
    push_i64!("enabled", enabled);

    let sql = format!("update agent_plugins_configs set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(id.to_string()));
    rb.exec(&sql, params).await
}

pub async fn delete_plugins(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from agent_plugins_configs where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

// =========================== Models =========================

#[html_sql("sql/agent_config.html")]
pub async fn select_models_by_agent(rb: &dyn Executor, agent_id: &str) -> Vec<AgentModelRow> {
    impled!()
}

#[html_sql("sql/agent_config.html")]
pub async fn select_model_by_id(rb: &dyn Executor, id: &str) -> Vec<AgentModelRow> {
    impled!()
}

#[allow(clippy::too_many_arguments)]
pub async fn insert_model(
    rb: &dyn Executor,
    id: &str,
    agent_id: &str,
    model_id: &str,
    display_name: &str,
    is_builtin: i64,
    is_default: i64,
    sort_order: i64,
    enabled: i64,
    context_window: Option<i64>,
    input_cost_per_million_usd: Option<f64>,
    output_cost_per_million_usd: Option<f64>,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into agent_models (id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, input_cost_per_million_usd, output_cost_per_million_usd, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(agent_id.to_string()),
            rbs::Value::String(model_id.to_string()),
            rbs::Value::String(display_name.to_string()),
            rbs::Value::I64(is_builtin),
            rbs::Value::I64(is_default),
            rbs::Value::I64(sort_order),
            rbs::Value::I64(enabled),
            context_window.map(rbs::Value::I64).unwrap_or(rbs::Value::Null),
            input_cost_per_million_usd
                .map(rbs::Value::F64)
                .unwrap_or(rbs::Value::Null),
            output_cost_per_million_usd
                .map(rbs::Value::F64)
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 动态更新模型配置（手动构建 SET + rb.exec）。
#[allow(clippy::too_many_arguments)]
pub async fn update_model(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
    model_id: Option<&str>,
    display_name: Option<&str>,
    is_default: Option<i64>,
    sort_order: Option<i64>,
    enabled: Option<i64>,
    context_window: Option<i64>,
    input_cost_per_million_usd: Option<f64>,
    output_cost_per_million_usd: Option<f64>,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
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
    macro_rules! push_i64 {
        ($col:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?", $col));
                params.push(rbs::Value::I64(v));
            }
        };
    }
    macro_rules! push_f64 {
        ($col:expr, $val:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{} = ?", $col));
                params.push(rbs::Value::F64(v));
            }
        };
    }

    push_str!("model_id", model_id);
    push_str!("display_name", display_name);
    push_i64!("is_default", is_default);
    push_i64!("sort_order", sort_order);
    push_i64!("enabled", enabled);
    push_i64!("context_window", context_window);
    push_f64!("input_cost_per_million_usd", input_cost_per_million_usd);
    push_f64!("output_cost_per_million_usd", output_cost_per_million_usd);

    let sql = format!("update agent_models set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(id.to_string()));
    rb.exec(&sql, params).await
}

pub async fn delete_model(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from agent_models where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 清空某 agent 下的默认模型标记（设置新默认前调用）。
pub async fn clear_default_models(
    rb: &dyn Executor,
    agent_id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update agent_models set is_default = 0 where agent_id = ?";
    rb.exec(sql, vec![rbs::Value::String(agent_id.to_string())])
        .await
}

/// 模型同步事务专用：插入探测到的新模型（内置默认值固定）。
pub async fn insert_synced_model(
    rb: &dyn Executor,
    id: &str,
    agent_id: &str,
    model_id: &str,
    now: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into agent_models (id, agent_id, model_id, display_name, is_builtin, is_default, sort_order, enabled, context_window, input_cost_per_million_usd, output_cost_per_million_usd, created_at, updated_at) values (?, ?, ?, ?, 0, 0, 0, 1, 128000, NULL, NULL, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(agent_id.to_string()),
            rbs::Value::String(model_id.to_string()),
            rbs::Value::String(model_id.to_string()),
            rbs::Value::String(now.to_string()),
            rbs::Value::String(now.to_string()),
        ],
    )
    .await
}
