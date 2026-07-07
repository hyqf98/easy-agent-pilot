//! SubAgent（子代理）mapper。
//!
//! 对应 `commands/sub_agent.rs` 的 DB 操作。SQL 模板见 `sql/sub_agent.html`。
//! 动态更新统一用 `<set>+<if>`，彻底取代旧 `UpdateSqlBuilder` + `bind_optional*` 的顺序耦合。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。
//!
//! 废弃说明：insert_sub_agent / insert_builtin_sub_agent / update_builtin_sub_agent
//! 已由 commands/sub_agent.rs 用 rb.exec 裸 SQL 覆盖，mapper 函数不再被调用，已删除。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;

use crate::models::SubAgentRow;

/// 查询全部子代理（内置在前，再按 sort_order、updated_at）。
#[html_sql("sql/sub_agent.html")]
pub async fn list_sub_agents(rb: &dyn Executor) -> Vec<SubAgentRow> {
    impled!()
}

/// 仅查询用户自建子代理（is_system = 0）。
#[html_sql("sql/sub_agent.html")]
pub async fn list_user_sub_agents(rb: &dyn Executor) -> Vec<SubAgentRow> {
    impled!()
}

/// 按 id 查询单个子代理。
#[html_sql("sql/sub_agent.html")]
pub async fn get_sub_agent_by_id(rb: &dyn Executor, id: &str) -> Vec<SubAgentRow> {
    impled!()
}

/// 按 builtin_code 查询单个子代理（种子更新判定用）。
#[html_sql("sql/sub_agent.html")]
pub async fn get_sub_agent_by_builtin_code(
    rb: &dyn Executor,
    builtin_code: &str,
) -> Vec<SubAgentRow> {
    impled!()
}

/// 动态更新用户子代理（手动构建 SET + rb.exec）。
#[allow(clippy::too_many_arguments)]
pub async fn update_sub_agent(
    rb: &dyn Executor,
    id: &str,
    updated_at: &str,
    name: Option<&str>,
    description: Option<&str>,
    prompt: Option<&str>,
    category: Option<&str>,
    tags: Option<rbs::Value>,
    recommended_scenes: Option<rbs::Value>,
    tools: Option<rbs::Value>,
    disallowed_tools: Option<rbs::Value>,
    model: Option<&str>,
    permission_mode: Option<&str>,
    max_turns: Option<i64>,
    is_enabled: Option<i64>,
    sort_order: Option<i64>,
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
    push_str!("prompt", prompt);
    push_str!("category", category);
    push_json!("tags", tags);
    push_json!("recommended_scenes", recommended_scenes);
    push_json!("tools", tools);
    push_json!("disallowed_tools", disallowed_tools);
    push_str!("model", model);
    push_str!("permission_mode", permission_mode);
    push_i64!("max_turns", max_turns);
    push_i64!("is_enabled", is_enabled);
    push_i64!("sort_order", sort_order);

    let sql = format!("update sub_agents set {} where id = ?", sets.join(", "));
    params.push(rbs::Value::String(id.to_string()));
    rb.exec(&sql, params).await
}

/// 删除子代理。
pub async fn delete_sub_agent(
    rb: &dyn Executor,
    id: &str,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "delete from sub_agents where id = ?";
    rb.exec(sql, vec![rbs::Value::String(id.to_string())])
        .await
}

// ==================== 引用计数 ====================

/// COUNT 查询：plans 表引用数。用 rb.query 手动解析，绕过 #[html_sql] 对 count 结果的解码差异。
pub async fn count_plan_refs(rb: &dyn Executor, sub_agent_id: &str) -> i64 {
    count_refs(rb, "select count(*) as c from plans where split_expert_id = ?", sub_agent_id).await
}

pub async fn count_task_refs(rb: &dyn Executor, sub_agent_id: &str) -> i64 {
    count_refs(rb, "select count(*) as c from tasks where expert_id = ?", sub_agent_id).await
}

pub async fn count_session_refs(rb: &dyn Executor, sub_agent_id: &str) -> i64 {
    count_refs(rb, "select count(*) as c from sessions where expert_id = ?", sub_agent_id).await
}

/// 通用 COUNT 解析：rb.query → Value::Array → 首行 Map → 首列 i64。
async fn count_refs(rb: &dyn Executor, sql: &str, id: &str) -> i64 {
    let value = rb
        .query(sql, vec![rbs::Value::String(id.to_string())])
        .await
        .unwrap_or(rbs::Value::Null);
    if let rbs::Value::Array(rows) = &value {
        if let Some(first_row) = rows.first() {
            if let rbs::Value::Map(m) = first_row {
                if let Some((_, v)) = m.0.iter().next() {
                    return crate::commands::support::value_to_i64(v);
                }
            }
        }
    }
    0
}
