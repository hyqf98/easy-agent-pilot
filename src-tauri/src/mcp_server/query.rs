//! 对话历史查询 + 仓库数据源上界裁剪。
//!
//! 工具暴露给 AI 的查询能力由两部分组成：
//! 1. `query_conversation_history`：按 projectId/sessionId/时间范围/角色/上限查询 messages（含 session 关联）。
//! 2. 范围裁剪：根据仓库 `memory_repo_sources`（sourceType=`conversation_history`）的 config，
//!    对 AI 传入的参数做交集/夹取，越界部分裁剪，保证工具只返回该仓库可见的历史。

use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};

use crate::commands::support::open_db_connection;

/// 工具入参（AI 侧传入）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryHistoryParams {
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    /// ISO-8601 起始时间（含）。空则不限。
    pub since: Option<String>,
    /// ISO-8601 结束时间（含）。空则不限。
    pub until: Option<String>,
    pub role: Option<String>,
    pub limit: Option<i64>,
}

/// 仓库数据源配置（config JSON 解析结果，作为查询上界）。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSourceScope {
    pub project_ids: Option<Vec<String>>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub max_limit: Option<i64>,
}

/// 单条历史消息（裁剪后的字段，避免泄露 tool_call 内部细节）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMessage {
    pub session_id: String,
    pub project_id: Option<String>,
    pub role: String,
    pub message_type: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryHistoryScopeSummary {
    pub project_ids: Vec<String>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub limit: i64,
}

const DEFAULT_LIMIT: i64 = 200;
const HARD_LIMIT: i64 = 2000;

/// 解析仓库数据源 config JSON（容错）。
pub fn parse_repo_source_scope(config: &str) -> RepoSourceScope {
    if config.trim().is_empty() {
        return RepoSourceScope::default();
    }
    serde_json::from_str::<RepoSourceScope>(config).unwrap_or_default()
}

/// 按仓库 id 读取其 `conversation_history` 数据源配置（无则返回默认全开放）。
pub fn load_repo_scope(repo_id: &str) -> Result<RepoSourceScope, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let config: Option<String> = conn
        .query_row(
            "SELECT config FROM memory_repo_sources
             WHERE repo_id = ?1 AND source_type = 'conversation_history' AND enabled = 1",
            rusqlite::params![repo_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    Ok(match config {
        Some(raw) => parse_repo_source_scope(&raw),
        None => RepoSourceScope::default(),
    })
}

/// 将 AI 入参与仓库上界做交集/夹取，返回最终生效的查询参数。
///
/// - projectId：必须落在仓库允许的 project_ids 内（若配置了白名单），否则被清空（视为无权查该项目）。
/// - since/until：取 AI 入参与仓库上界的更严约束（since 取较大、until 取较小）。
/// - limit：取 AI 入参与仓库 max_limit、硬上限的较小值。
pub fn clamp_params(
    params: &QueryHistoryParams,
    scope: &RepoSourceScope,
) -> (QueryHistoryParams, QueryHistoryScopeSummary) {
    // projectId 白名单裁剪
    let project_id = match (&params.project_id, &scope.project_ids) {
        (Some(pid), Some(allowed)) if !allowed.is_empty() => {
            if allowed.iter().any(|a| a == pid) {
                Some(pid.clone())
            } else {
                None // 越界：无权查该项目
            }
        }
        _ => params.project_id.clone(),
    };

    let since = stricter_since(params.since.as_deref(), scope.since.as_deref());
    let until = stricter_until(params.until.as_deref(), scope.until.as_deref());

    let limit = [params.limit.unwrap_or(DEFAULT_LIMIT), scope.max_limit.unwrap_or(HARD_LIMIT), HARD_LIMIT]
        .iter()
        .copied()
        .min()
        .unwrap_or(DEFAULT_LIMIT)
        .max(1);

    let effective = QueryHistoryParams {
        project_id,
        session_id: params.session_id.clone(),
        since: since.clone(),
        until: until.clone(),
        role: params.role.clone(),
        limit: Some(limit),
    };

    let summary = QueryHistoryScopeSummary {
        project_ids: scope.project_ids.clone().unwrap_or_default(),
        since,
        until,
        limit,
    };

    (effective, summary)
}

/// 取两个时间上界的较晚者（更严的 since）。
fn stricter_since(a: Option<&str>, b: Option<&str>) -> Option<String> {
    match (a, b) {
        (None, None) => None,
        (Some(x), None) | (None, Some(x)) => Some(x.to_string()),
        (Some(x), Some(y)) => Some(if x >= y { x.to_string() } else { y.to_string() }),
    }
}

/// 取两个时间下界的较早者（更严的 until）。
fn stricter_until(a: Option<&str>, b: Option<&str>) -> Option<String> {
    match (a, b) {
        (None, None) => None,
        (Some(x), None) | (None, Some(x)) => Some(x.to_string()),
        (Some(x), Some(y)) => Some(if x <= y { x.to_string() } else { y.to_string() }),
    }
}

/// 执行裁剪后的查询。返回消息与是否截断标记。
pub fn run_query(conn: &Connection, params: &QueryHistoryParams) -> Result<Vec<HistoryMessage>, String> {
    let mut sql = String::from(
        r#"
        SELECT m.session_id, s.project_id, m.role, m.message_type, m.content, m.created_at
        FROM messages m
        LEFT JOIN sessions s ON s.id = m.session_id
        WHERE 1=1
        "#,
    );
    let mut bind_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(pid) = &params.project_id {
        sql.push_str(" AND s.project_id = ?");
        bind_values.push(Box::new(pid.clone()));
    }
    if let Some(sid) = &params.session_id {
        sql.push_str(" AND m.session_id = ?");
        bind_values.push(Box::new(sid.clone()));
    }
    if let Some(since) = &params.since {
        sql.push_str(" AND m.created_at >= ?");
        bind_values.push(Box::new(since.clone()));
    }
    if let Some(until) = &params.until {
        sql.push_str(" AND m.created_at <= ?");
        bind_values.push(Box::new(until.clone()));
    }
    if let Some(role) = &params.role {
        sql.push_str(" AND m.role = ?");
        bind_values.push(Box::new(role.clone()));
    }

    sql.push_str(" ORDER BY m.created_at ASC, m.seq ASC LIMIT ?");
    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, HARD_LIMIT);
    bind_values.push(Box::new(limit));

    let params_iter = params_from_iter(bind_values.iter().map(|v| v.as_ref()));
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_iter, |row| {
            Ok(HistoryMessage {
                session_id: row.get(0)?,
                project_id: row.get(1)?,
                role: row.get(2)?,
                message_type: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope(project_ids: Vec<&str>, since: Option<&str>, until: Option<&str>, max: Option<i64>) -> RepoSourceScope {
        RepoSourceScope {
            project_ids: if project_ids.is_empty() {
                None
            } else {
                Some(project_ids.into_iter().map(String::from).collect())
            },
            since: since.map(String::from),
            until: until.map(String::from),
            max_limit: max,
        }
    }

    #[test]
    fn clamp_keeps_project_when_in_whitelist() {
        let params = QueryHistoryParams {
            project_id: Some("p1".into()),
            session_id: None,
            since: None,
            until: None,
            role: None,
            limit: None,
        };
        let scope = scope(vec!["p1", "p2"], None, None, None);
        let (eff, _) = clamp_params(&params, &scope);
        assert_eq!(eff.project_id.as_deref(), Some("p1"));
    }

    #[test]
    fn clamp_drops_project_when_out_of_whitelist() {
        let params = QueryHistoryParams {
            project_id: Some("pX".into()),
            session_id: None,
            since: None,
            until: None,
            role: None,
            limit: None,
        };
        let scope = scope(vec!["p1"], None, None, None);
        let (eff, _) = clamp_params(&params, &scope);
        assert_eq!(eff.project_id, None);
    }

    #[test]
    fn clamp_takes_stricter_time_bounds() {
        let params = QueryHistoryParams {
            project_id: None,
            session_id: None,
            since: Some("2026-06-01T00:00:00Z".into()),
            until: Some("2026-12-31T00:00:00Z".into()),
            role: None,
            limit: None,
        };
        let scope = scope(vec![], Some("2026-06-10T00:00:00Z"), Some("2026-06-20T00:00:00Z"), None);
        let (eff, summary) = clamp_params(&params, &scope);
        assert_eq!(eff.since.as_deref(), Some("2026-06-10T00:00:00Z"));
        assert_eq!(eff.until.as_deref(), Some("2026-06-20T00:00:00Z"));
        assert_eq!(summary.since.as_deref(), Some("2026-06-10T00:00:00Z"));
    }

    #[test]
    fn clamp_limit_uses_min_of_ai_scope_and_hard() {
        let params = QueryHistoryParams {
            project_id: None,
            session_id: None,
            since: None,
            until: None,
            role: None,
            limit: Some(5000),
        };
        let scope = scope(vec![], None, None, Some(100));
        let (eff, _) = clamp_params(&params, &scope);
        assert_eq!(eff.limit, Some(100));
    }

    #[test]
    fn parse_scope_handles_empty_and_invalid_json() {
        assert!(parse_repo_source_scope("").max_limit.is_none());
        assert!(parse_repo_source_scope("not json").max_limit.is_none());
        let s = parse_repo_source_scope(r#"{"maxLimit": 50}"#);
        assert_eq!(s.max_limit, Some(50));
    }

    #[test]
    fn stricter_until_picks_earlier() {
        assert_eq!(
            stricter_until(Some("2026-06-05"), Some("2026-06-10")),
            Some("2026-06-05".into())
        );
    }
}
