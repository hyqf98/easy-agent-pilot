//! ACP Agent Plan 快照查询 mapper。
//!
//! 对应 `commands/agent_plan.rs` 的 DB 操作。SQL 模板见 `sql/agent_plan.html`。
//!
//! 注意：静态写入类 mapper 改用 `rb.exec` 裸执行，避免 `#[html_sql]` 宏导致
//! SQLite 连接持有不释放 → 写锁 → 后续命令死锁超时。

use rbatis::executor::Executor;
use rbatis::rbdc::db::ExecResult;
use serde::Serialize;

use crate::models::AgentPlanSnapshotRow;

/// 查询某会话的全部 Agent Plan 快照，按更新时间升序返回。
#[html_sql("sql/agent_plan.html")]
pub async fn list_agent_plans(rb: &dyn Executor, session_id: &str) -> Vec<AgentPlanSnapshotRow> {
    impled!()
}

/// 会话执行期 UPSERT Agent Plan 快照的参数结构。
///
/// 被 `commands/conversation/strategies/acp.rs` 调用：同一回合内 Agent 可能多次
/// 下发 Plan（全量替换语义），以 (session_id, request_id) 唯一键做 UPSERT，终态覆盖。
#[derive(Clone, Debug, Serialize)]
pub struct AgentPlanSnapshotUpsert {
    pub id: String,
    pub session_id: String,
    pub request_id: String,
    pub plan_json: String,
    pub created_at: String,
    pub updated_at: String,
    pub seq: i64,
}

/// 会话执行期 UPSERT Agent Plan 快照（ACP/CLI 策略写路径）。
pub async fn upsert_agent_plan_snapshot(
    rb: &dyn Executor,
    row: &AgentPlanSnapshotUpsert,
) -> Result<ExecResult, rbatis::Error> {
    let sql = "insert into agent_plan_snapshots (id, session_id, request_id, plan_json, created_at, updated_at, seq) values (?, ?, ?, ?, ?, ?, ?) on conflict(session_id, request_id) do update set plan_json = excluded.plan_json, updated_at = excluded.updated_at, seq = excluded.seq";
    rb.exec(
        sql,
        vec![
            rbs::Value::String(row.id.clone()),
            rbs::Value::String(row.session_id.clone()),
            rbs::Value::String(row.request_id.clone()),
            rbs::Value::String(row.plan_json.clone()),
            rbs::Value::String(row.created_at.clone()),
            rbs::Value::String(row.updated_at.clone()),
            rbs::Value::I64(row.seq),
        ],
    )
    .await
}
