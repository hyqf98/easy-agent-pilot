//! 记忆库定时任务（Memory Job）命令层。
//!
//! 与 Plan 调度体系解耦：独立 `memory_jobs` 表 + `memory_scheduler` 定时器。
//! 到期任务 emit `memory:job-trigger{jobId}`，前端接管执行（复用 MemoryRepoRunner），
//! 执行完回写 `done/error` + `last_run_*` 并重算 `next_run_at`。

use chrono::{Datelike, DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use super::support::now_rfc3339;
use crate::db;
use crate::mappers::memory_job as job_mapper;
use crate::mappers::memory_job::{MemoryJobInsert, MemoryJobUpdate};
use crate::models::{value_to_json_string_opt, MemoryJobRow};

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

/// 把 rbatis 行映射转换为对外的 MemoryJob DTO。
fn job_row_to_job(row: MemoryJobRow) -> Result<MemoryJob, String> {
    Ok(MemoryJob {
        id: row.id.ok_or("memory_jobs.id 缺失")?,
        repo_id: row.repo_id.ok_or("memory_jobs.repo_id 缺失")?,
        name: row.name.ok_or("memory_jobs.name 缺失")?,
        instruction: row.instruction.ok_or("memory_jobs.instruction 缺失")?,
        cron: row.cron,
        next_run_at: row.next_run_at,
        schedule_status: row.schedule_status.unwrap_or_else(|| "none".to_string()),
        last_run_at: row.last_run_at,
        last_run_status: row.last_run_status,
        last_run_summary: row.last_run_summary,
        agent_id: row.agent_id,
        model_id: row.model_id,
        created_at: row.created_at.ok_or("memory_jobs.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("memory_jobs.updated_at 缺失")?,
    })
}

/// 按 id 读取任务（内部复用）。
async fn fetch_job_by_id(id: &str) -> Result<MemoryJob, String> {
    let row = job_mapper::get_memory_job_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("任务不存在: {}", id))?;
    job_row_to_job(row)
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
pub async fn list_memory_jobs(repo_id: String) -> Result<Vec<MemoryJob>, String> {
    let rows = job_mapper::list_memory_jobs(db::rb(), &repo_id)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(job_row_to_job).collect()
}

/// 创建定时任务。无 next_run_at 时按 cron 计算。
#[tauri::command]
pub async fn create_memory_job(input: CreateMemoryJobInput) -> Result<MemoryJob, String> {
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

    let row = MemoryJobInsert {
        id: id.clone(),
        repo_id: input.repo_id.clone(),
        name,
        instruction,
        cron: input.cron,
        next_run_at,
        schedule_status: schedule_status.clone(),
        last_run_at: None,
        last_run_status: None,
        last_run_summary: None,
        agent_id: input.agent_id,
        model_id: input.model_id,
        created_at: now.clone(),
        updated_at: now,
    };
    job_mapper::insert_memory_job(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    fetch_job_by_id(&id).await
}

/// 更新定时任务。
#[tauri::command]
pub async fn update_memory_job(id: String, input: UpdateMemoryJobInput) -> Result<MemoryJob, String> {
    let existing = fetch_job_by_id(&id).await?;

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

    let update = MemoryJobUpdate {
        id: id.clone(),
        name,
        instruction,
        cron,
        next_run_at,
        schedule_status,
        agent_id,
        model_id,
        updated_at: now,
    };
    job_mapper::update_memory_job(db::rb(), &update)
        .await
        .map_err(|e| e.to_string())?;

    fetch_job_by_id(&id).await
}

/// 删除定时任务。
#[tauri::command]
pub async fn delete_memory_job(id: String) -> Result<(), String> {
    job_mapper::delete_memory_job(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 立即触发任务（置 triggered + emit memory:job-trigger）。前端监听后执行。
#[tauri::command]
pub async fn trigger_memory_job(
    app: tauri::AppHandle,
    id: String,
) -> Result<(), String> {
    let now = now_rfc3339();
    job_mapper::trigger_memory_job(db::rb(), &id, &now)
        .await
        .map_err(|e| e.to_string())?;

    app.emit("memory:job-trigger", &id)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 列出任务的运行历史。
#[tauri::command]
pub async fn list_memory_job_runs(job_id: String) -> Result<Vec<MemoryJobRun>, String> {
    let rows = job_mapper::list_memory_job_runs(db::rb(), &job_id)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter()
        .map(|r| {
            Ok(MemoryJobRun {
                id: r.id.ok_or("memory_job_runs.id 缺失")?,
                job_id: r.job_id.ok_or("memory_job_runs.job_id 缺失")?,
                repo_id: r.repo_id.ok_or("memory_job_runs.repo_id 缺失")?,
                status: r.status.ok_or("memory_job_runs.status 缺失")?,
                summary: r.summary,
                files_changed: value_to_json_string_opt(r.files_changed),
                started_at: r.started_at.ok_or("memory_job_runs.started_at 缺失")?,
                finished_at: r.finished_at.ok_or("memory_job_runs.finished_at 缺失")?,
            })
        })
        .collect()
}

/// 记录一次运行结果（前端执行完调用）并重算 next_run_at。
#[tauri::command]
pub async fn record_memory_job_run(input: RecordJobRunInput) -> Result<MemoryJobRun, String> {
    let now = now_rfc3339();
    let run_id = generate_id();

    // 取任务的 repo_id / cron
    let job = fetch_job_by_id(&input.job_id).await?;
    let repo_id = job.repo_id.clone();
    let cron = job.cron.clone();

    let files_changed_json = input
        .files_changed
        .as_ref()
        .map(|files| serde_json::to_string(files).unwrap_or_else(|_| "[]".to_string()));

    let started_at = now.clone();
    let finished_at = now.clone();

    // 事务：插入运行记录 + 回写任务状态（二者须原子）
    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    job_mapper::insert_memory_job_run(
        &tx,
        &run_id,
        &input.job_id,
        &repo_id,
        &input.status,
        input.summary.as_deref(),
        files_changed_json.map(rbs::Value::String),
        &started_at,
        &finished_at,
    )
    .await
    .map_err(|e| e.to_string())?;

    let next_run_at = compute_next_run(cron.as_deref(), Utc::now()).map(|dt| dt.to_rfc3339());
    let new_status = if next_run_at.is_some() { "scheduled" } else { "done" };
    job_mapper::apply_job_run_result(
        &tx,
        &input.job_id,
        &now,
        &input.status,
        input.summary.as_deref(),
        next_run_at.as_deref(),
        new_status,
        &now,
    )
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let row = job_mapper::get_memory_job_run_by_id(db::rb(), &run_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "运行记录写入后读取失败".to_string())?;
    Ok(MemoryJobRun {
        id: row.id.ok_or("memory_job_runs.id 缺失")?,
        job_id: row.job_id.ok_or("memory_job_runs.job_id 缺失")?,
        repo_id: row.repo_id.ok_or("memory_job_runs.repo_id 缺失")?,
        status: row.status.ok_or("memory_job_runs.status 缺失")?,
        summary: row.summary,
        files_changed: value_to_json_string_opt(row.files_changed),
        started_at: row.started_at.ok_or("memory_job_runs.started_at 缺失")?,
        finished_at: row.finished_at.ok_or("memory_job_runs.finished_at 缺失")?,
    })
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
