//! 记忆库定时任务（Memory Job）命令层。
//!
//! 与 Plan 调度体系解耦：独立 `memory_jobs` 表 + `memory_scheduler` 定时器。
//! 到期任务 emit `memory:job-trigger{jobId}`，前端接管执行（复用 MemoryRepoRunner），
//! 执行完回写 `done/error` + `last_run_*` 并重算 `next_run_at`。

use chrono::{Datelike, DateTime, Duration, Utc};
use rusqlite::{params};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use super::support::{now_rfc3339, open_db_connection};

// ==================== 数据结构 ====================

/// 记忆库定时任务。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryJob {
    pub id: String,
    pub repo_id: String,
    pub name: String,
    pub instruction: String,
    /// 调度表达式。v1 支持 `daily:HH:MM` / `weekly:W-HH:MM`（W=0..6）或留空（一次性 next_run_at）。
    pub cron: Option<String>,
    /// 下次执行时间（ISO-8601）。
    pub next_run_at: Option<String>,
    pub schedule_status: String,
    pub last_run_at: Option<String>,
    pub last_run_status: Option<String>,
    pub last_run_summary: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 任务运行记录。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryJobRun {
    pub id: String,
    pub job_id: String,
    pub repo_id: String,
    pub status: String,
    pub summary: Option<String>,
    pub files_changed: Option<String>,
    pub started_at: String,
    pub finished_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemoryJobInput {
    pub repo_id: String,
    pub name: String,
    pub instruction: String,
    pub cron: Option<String>,
    pub next_run_at: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemoryJobInput {
    pub name: Option<String>,
    pub instruction: Option<String>,
    pub cron: Option<String>,
    pub next_run_at: Option<String>,
    pub schedule_status: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
}

/// 运行结果回写（前端执行完调用）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordJobRunInput {
    pub job_id: String,
    pub status: String,
    pub summary: Option<String>,
    pub files_changed: Option<Vec<String>>,
}

// ==================== 私有辅助 ====================

fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn normalize_required_string(value: String, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{} 不能为空", field));
    }
    Ok(trimmed.to_string())
}

fn map_memory_job(row: &rusqlite::Row) -> rusqlite::Result<MemoryJob> {
    Ok(MemoryJob {
        id: row.get(0)?,
        repo_id: row.get(1)?,
        name: row.get(2)?,
        instruction: row.get(3)?,
        cron: row.get(4)?,
        next_run_at: row.get(5)?,
        schedule_status: row.get(6)?,
        last_run_at: row.get(7)?,
        last_run_status: row.get(8)?,
        last_run_summary: row.get(9)?,
        agent_id: row.get(10)?,
        model_id: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

const MEMORY_JOB_SELECT_SQL: &str = r#"
    SELECT id, repo_id, name, instruction, cron, next_run_at, schedule_status,
           last_run_at, last_run_status, last_run_summary, agent_id, model_id,
           created_at, updated_at
    FROM memory_jobs
"#;

fn map_job_run(row: &rusqlite::Row) -> rusqlite::Result<MemoryJobRun> {
    Ok(MemoryJobRun {
        id: row.get(0)?,
        job_id: row.get(1)?,
        repo_id: row.get(2)?,
        status: row.get(3)?,
        summary: row.get(4)?,
        files_changed: row.get(5)?,
        started_at: row.get(6)?,
        finished_at: row.get(7)?,
    })
}

/// 根据 cron 计算下一次执行时间（v1：daily/weekly；无 cron 则返回 None）。
///
/// - `daily:HH:MM` → 明天的 HH:MM（UTC）
/// - `weekly:W-HH:MM`（W=0..6）→ 下一个该星期的 HH:MM（UTC）
/// - 其它 → None（一次性任务由 next_run_at 驱动）
pub fn compute_next_run(cron: Option<&str>, from: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let raw = cron?.trim();
    if raw.is_empty() {
        return None;
    }

    if let Some(rest) = raw.strip_prefix("daily:") {
        let (h, m) = parse_hhmm(rest)?;
        return Some(next_daily(from, h, m));
    }

    if let Some(rest) = raw.strip_prefix("weekly:") {
        let (weekday, hhmm) = rest.split_once('-')?;
        let w: u32 = weekday.trim().parse().ok()?;
        if w > 6 {
            return None;
        }
        let (h, m) = parse_hhmm(hhmm)?;
        return Some(next_weekly(from, w, h, m));
    }

    None
}

fn parse_hhmm(value: &str) -> Option<(u32, u32)> {
    let (h, m) = value.trim().split_once(':')?;
    let h: u32 = h.trim().parse().ok()?;
    let m: u32 = m.trim().parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some((h, m))
}

fn next_daily(from: DateTime<Utc>, h: u32, m: u32) -> DateTime<Utc> {
    let today_target = from
        .date_naive()
        .and_hms_opt(h, m, 0)
        .map(|t| DateTime::<Utc>::from_naive_utc_and_offset(t, Utc))
        .unwrap_or(from);
    if today_target > from {
        today_target
    } else {
        today_target + Duration::days(1)
    }
}

fn next_weekly(from: DateTime<Utc>, target_weekday: u32, h: u32, m: u32) -> DateTime<Utc> {
    let mut candidate = next_daily(from, h, m);
    let target = target_weekday % 7;
    for _ in 0..7 {
        let wd = candidate.weekday().num_days_from_monday();
        if wd == target {
            return candidate;
        }
        candidate += Duration::days(1);
    }
    candidate
}

// ==================== 命令 ====================

/// 列出仓库下的全部定时任务。
#[tauri::command]
pub fn list_memory_jobs(repo_id: String) -> Result<Vec<MemoryJob>, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let sql = format!("{} WHERE repo_id = ?1 ORDER BY created_at ASC", MEMORY_JOB_SELECT_SQL);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let jobs = stmt
        .query_map(params![&repo_id], map_memory_job)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(jobs)
}

/// 创建定时任务。无 next_run_at 时按 cron 计算。
#[tauri::command]
pub fn create_memory_job(input: CreateMemoryJobInput) -> Result<MemoryJob, String> {
    let name = normalize_required_string(input.name, "任务名称")?;
    let instruction = normalize_required_string(input.instruction, "任务指令")?;
    let now = now_rfc3339();
    let id = generate_id();

    let next_run_at = input
        .next_run_at
        .or_else(|| {
            compute_next_run(input.cron.as_deref(), Utc::now()).map(|dt| dt.to_rfc3339())
        });

    let schedule_status = if next_run_at.is_some() {
        "scheduled".to_string()
    } else {
        "none".to_string()
    };

    let conn = open_db_connection().map_err(|e| e.to_string())?;
    conn.execute(
        r#"
        INSERT INTO memory_jobs
            (id, repo_id, name, instruction, cron, next_run_at, schedule_status,
             last_run_at, last_run_status, last_run_summary, agent_id, model_id,
             created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, NULL, ?8, ?9, ?10, ?10)
        "#,
        params![
            &id,
            &input.repo_id,
            &name,
            &instruction,
            input.cron,
            &next_run_at,
            &schedule_status,
            input.agent_id,
            input.model_id,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    let sql = format!("{} WHERE id = ?1", MEMORY_JOB_SELECT_SQL);
    conn.query_row(&sql, params![&id], map_memory_job)
        .map_err(|e| e.to_string())
}

/// 更新定时任务。
#[tauri::command]
pub fn update_memory_job(id: String, input: UpdateMemoryJobInput) -> Result<MemoryJob, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let sql_get = format!("{} WHERE id = ?1", MEMORY_JOB_SELECT_SQL);
    let existing: MemoryJob = conn
        .query_row(&sql_get, params![&id], map_memory_job)
        .map_err(|e| e.to_string())?;

    let now = now_rfc3339();
    let cron_changed = input.cron.is_some();
    let status_changed_to_scheduled = input.schedule_status.as_deref() == Some("scheduled");
    let name = input.name.map(|v| normalize_required_string(v, "任务名称").unwrap_or(existing.name.clone())).unwrap_or(existing.name);
    let instruction = input.instruction.map(|v| normalize_required_string(v, "任务指令").unwrap_or(existing.instruction.clone())).unwrap_or(existing.instruction);
    let cron = input.cron.clone().or(existing.cron.clone());
    let schedule_status = input.schedule_status.unwrap_or(existing.schedule_status.clone());

    // next_run_at：显式覆盖优先；否则 cron/状态变更时按 cron 重算；否则沿用原值。
    let next_run_at = if let Some(explicit) = input.next_run_at.clone() {
        Some(explicit)
    } else if cron_changed || status_changed_to_scheduled {
        if schedule_status == "scheduled" {
            compute_next_run(cron.as_deref(), Utc::now()).map(|dt| dt.to_rfc3339())
        } else {
            None
        }
    } else {
        existing.next_run_at.clone()
    };

    let agent_id = input.agent_id.or(existing.agent_id);
    let model_id = input.model_id.or(existing.model_id);

    conn.execute(
        r#"
        UPDATE memory_jobs
        SET name = ?1, instruction = ?2, cron = ?3, next_run_at = ?4,
            schedule_status = ?5, agent_id = ?6, model_id = ?7, updated_at = ?8
        WHERE id = ?9
        "#,
        params![&name, &instruction, &cron, &next_run_at, &schedule_status, agent_id, model_id, &now, &id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(&sql_get, params![&id], map_memory_job)
        .map_err(|e| e.to_string())
}

/// 删除定时任务。
#[tauri::command]
pub fn delete_memory_job(id: String) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM memory_jobs WHERE id = ?1", params![&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 立即触发任务（置 triggered + emit memory:job-trigger）。前端监听后执行。
#[tauri::command]
pub fn trigger_memory_job(
    app: tauri::AppHandle,
    id: String,
) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    conn.execute(
        "UPDATE memory_jobs SET schedule_status = 'triggered', updated_at = ?1 WHERE id = ?2",
        params![&now, &id],
    )
    .map_err(|e| e.to_string())?;

    app.emit("memory:job-trigger", &id)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 列出任务的运行历史。
#[tauri::command]
pub fn list_memory_job_runs(job_id: String) -> Result<Vec<MemoryJobRun>, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, job_id, repo_id, status, summary, files_changed, started_at, finished_at
             FROM memory_job_runs WHERE job_id = ?1 ORDER BY started_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let runs = stmt
        .query_map(params![&job_id], map_job_run)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(runs)
}

/// 记录一次运行结果（前端执行完调用）并重算 next_run_at。
#[tauri::command]
pub fn record_memory_job_run(input: RecordJobRunInput) -> Result<MemoryJobRun, String> {
    let mut conn = open_db_connection().map_err(|e| e.to_string())?;
    let now = now_rfc3339();
    let run_id = generate_id();

    // 取任务的 repo_id / cron
    let sql_get = format!("{} WHERE id = ?1", MEMORY_JOB_SELECT_SQL);
    let (repo_id, cron): (String, Option<String>) = conn
        .query_row(&sql_get, params![&input.job_id], |row| {
            Ok((row.get(1)?, row.get(4)?))
        })
        .map_err(|e| e.to_string())?;

    let files_changed_json = input
        .files_changed
        .as_ref()
        .map(|files| serde_json::to_string(files).unwrap_or_else(|_| "[]".to_string()));

    let started_at = now.clone();
    let finished_at = now.clone();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"
        INSERT INTO memory_job_runs
            (id, job_id, repo_id, status, summary, files_changed, started_at, finished_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#,
        params![&run_id, &input.job_id, &repo_id, &input.status, input.summary, &files_changed_json, &started_at, &finished_at],
    )
    .map_err(|e| e.to_string())?;

    let next_run_at = compute_next_run(cron.as_deref(), Utc::now()).map(|dt| dt.to_rfc3339());
    let new_status = if next_run_at.is_some() { "scheduled" } else { "done" };
    tx.execute(
        r#"
        UPDATE memory_jobs
        SET last_run_at = ?1, last_run_status = ?2, last_run_summary = ?3,
            next_run_at = ?4, schedule_status = ?5, updated_at = ?6
        WHERE id = ?7
        "#,
        params![&now, &input.status, &input.summary, &next_run_at, new_status, &now, &input.job_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, job_id, repo_id, status, summary, files_changed, started_at, finished_at
         FROM memory_job_runs WHERE id = ?1",
        params![&run_id],
        map_job_run,
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn daily_cron_computes_next_day() {
        let now = Utc.with_ymd_and_hms(2026, 6, 27, 10, 0, 0).unwrap();
        let next = compute_next_run(Some("daily:00:00"), now).unwrap();
        assert_eq!(next.format("%H:%M").to_string(), "00:00");
        assert!(next > now);
    }

    #[test]
    fn daily_cron_today_not_yet_passed_returns_today() {
        let now = Utc.with_ymd_and_hms(2026, 6, 27, 8, 0, 0).unwrap();
        let next = compute_next_run(Some("daily:23:30"), now).unwrap();
        assert_eq!(next.format("%Y-%m-%d %H:%M").to_string(), "2026-06-27 23:30");
    }

    #[test]
    fn empty_cron_returns_none() {
        let now = Utc::now();
        assert!(compute_next_run(None, now).is_none());
        assert!(compute_next_run(Some(""), now).is_none());
    }

    #[test]
    fn invalid_hhmm_returns_none() {
        let now = Utc::now();
        assert!(compute_next_run(Some("daily:25:00"), now).is_none());
        assert!(compute_next_run(Some("daily:10:99"), now).is_none());
    }

    #[test]
    fn weekly_cron_finds_target_weekday() {
        // 2026-06-27 是周六（weekday from monday = 5）。目标周一（0）应为 2026-06-29。
        let now = Utc.with_ymd_and_hms(2026, 6, 27, 12, 0, 0).unwrap();
        let next = compute_next_run(Some("weekly:0-09:00"), now).unwrap();
        assert_eq!(next.format("%Y-%m-%d %H:%M").to_string(), "2026-06-29 09:00");
    }
}
