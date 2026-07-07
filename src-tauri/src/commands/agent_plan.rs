//! ACP Agent Plan 快照查询命令。
//!
//! 配合 `message_recorder` 写入的 `agent_plan_snapshots` 表，提供按会话查询
//! Agent 流式下发的计划（Todo）全量快照，供前端右侧计划面板 hydrate 展示。
//!
//! ACP 协议的 `SessionUpdate::Plan` 是「全量替换」语义：每次更新即整份计划，
//! 同一回合内多次更新通过 `UNIQUE(session_id, request_id)` UPSERT 为终态。
//! 因此一个会话的历史计划按 `request_id`（用户回合）分组，每个回合保留一份。

use serde::{Deserialize, Serialize};

use crate::db;
use crate::mappers::agent_plan as agent_plan_mapper;
use crate::models::{value_to_json_string, AgentPlanSnapshotRow};

/// ACP Agent Plan 快照行（前端视图）。
///
/// `plan_json` 为 ACP `Plan` 结构的序列化 JSON，前端解析为
/// `{ entries: [{ content, priority, status }] }`。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlanSnapshot {
    pub id: String,
    pub session_id: String,
    pub request_id: String,
    pub plan_json: String,
    pub created_at: String,
    pub updated_at: String,
    pub seq: i64,
}

impl From<AgentPlanSnapshotRow> for AgentPlanSnapshot {
    fn from(row: AgentPlanSnapshotRow) -> Self {
        Self {
            id: row.id.unwrap_or_default(),
            session_id: row.session_id.unwrap_or_default(),
            request_id: row.request_id.unwrap_or_default(),
            plan_json: value_to_json_string(row.plan_json),
            created_at: row.created_at.unwrap_or_default(),
            updated_at: row.updated_at.unwrap_or_default(),
            seq: row.seq.unwrap_or_default(),
        }
    }
}

/// 查询某会话的全部 Agent Plan 快照，按更新时间升序返回。
///
/// 每个用户回合（request_id）保留一份终态计划；前端取最新一条展示，
/// 或按 request_id 分组提供历史回看。
#[tauri::command]
pub async fn list_agent_plans(session_id: String) -> Result<Vec<AgentPlanSnapshot>, String> {
    let rows = agent_plan_mapper::list_agent_plans(db::rb(), &session_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(AgentPlanSnapshot::from).collect())
}
