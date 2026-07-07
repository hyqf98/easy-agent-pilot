//! Agent（智能体主表）mapper。
//!
//! 对应 `commands/agent.rs` 的 DB 操作。SQL 模板见 `sql/agent.html`。
//! 单列标量读取（provider / ACP 命令）复用 `models::SingleColumnRow`。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;

use crate::models::{AgentRow, SingleColumnRow};

/// 查询全部智能体（按更新时间倒序）。
#[html_sql("sql/agent.html")]
pub async fn list_agents(rb: &dyn Executor) -> Vec<AgentRow> {
    impled!()
}

/// 按 id 查询单个智能体。
#[html_sql("sql/agent.html")]
pub async fn get_agent_by_id(rb: &dyn Executor, id: &str) -> Vec<AgentRow> {
    impled!()
}

/// 新建智能体。
#[allow(clippy::too_many_arguments)]
pub async fn create_agent(
    rb: &dyn Executor,
    id: &str,
    name: &str,
    agent_type: &str,
    provider: Option<&str>,
    cli_path: Option<&str>,
    api_key: Option<&str>,
    base_url: Option<&str>,
    model_id: Option<&str>,
    custom_model_enabled: i64,
    mode: &str,
    model: Option<&str>,
    status: &str,
    acp_command: Option<&str>,
    created_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "insert into agents (id, name, type, provider, cli_path, api_key, base_url, model_id, custom_model_enabled, mode, model, status, acp_command, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(id.to_string()),
            rbs::Value::String(name.to_string()),
            rbs::Value::String(agent_type.to_string()),
            provider
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            cli_path
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            api_key
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            base_url
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            model_id
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::I64(custom_model_enabled),
            rbs::Value::String(mode.to_string()),
            model
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(status.to_string()),
            acp_command
                .map(|s| rbs::Value::String(s.to_string()))
                .unwrap_or(rbs::Value::Null),
            rbs::Value::String(created_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
        ],
    )
    .await
}

/// 动态更新智能体（手动构建 SET + rb.exec，仅更新 Some 字段，updated_at 始终更新）。
#[allow(clippy::too_many_arguments)]
pub async fn update_agent(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
    name: Option<&str>,
    agent_type: Option<&str>,
    provider: Option<&str>,
    cli_path: Option<&str>,
    api_key: Option<&str>,
    base_url: Option<&str>,
    model_id: Option<&str>,
    custom_model_enabled: Option<i64>,
    mode: Option<&str>,
    model: Option<&str>,
    status: Option<&str>,
    acp_command: Option<&str>,
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
    if let Some(v) = agent_type {
        sets.push("type = ?".to_string());
        params.push(rbs::Value::String(v.to_string()));
    }
    push_str!("provider", provider);
    push_str!("cli_path", cli_path);
    push_str!("api_key", api_key);
    push_str!("base_url", base_url);
    push_str!("model_id", model_id);
    push_i64!("custom_model_enabled", custom_model_enabled);
    push_str!("mode", mode);
    push_str!("model", model);
    push_str!("status", status);
    push_str!("acp_command", acp_command);

    let sql = format!("update agents set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(id.to_string()));
    rb.exec(&sql, params).await
}

/// 删除智能体。
pub async fn delete_agent(
    rb: &dyn Executor,
    id: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "delete from agents where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

/// 测试连接前置：置 status=testing。
pub async fn update_agent_status_testing(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update agents set status = 'testing', updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 测试连接后置：写回 status / test_message / tested_at。
pub async fn update_agent_test_result(
    rb: &dyn Executor,
    id: &str,
    status: &str,
    test_message: &str,
    tested_at: &str,
    updated_at: &str,
) -> Result<rbatis::rbdc::db::ExecResult, rbatis::Error> {
    let sql = "update agents set status = ?, test_message = ?, tested_at = ?, updated_at = ? where id = ?";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(status.to_string()),
            rbs::Value::String(test_message.to_string()),
            rbs::Value::String(tested_at.to_string()),
            rbs::Value::String(updated_at.to_string()),
            rbs::Value::String(id.to_string()),
        ],
    )
    .await
}

/// 读取智能体 provider（供 agent_config 判定 codex/opencode）。
#[html_sql("sql/agent.html")]
pub async fn select_agent_provider(rb: &dyn Executor, id: &str) -> Vec<SingleColumnRow> {
    impled!()
}

/// 读取 ACP 命令（acp_command 优先，回退 cli_path）。
#[html_sql("sql/agent.html")]
pub async fn select_agent_command(rb: &dyn Executor, id: &str) -> Vec<SingleColumnRow> {
    impled!()
}
