//! 计划（Plan）定时调度器。
//!
//! 每 60s 轮询 `plans`，对到期（`scheduled_at <= now`）且状态为 `scheduled` 的计划
//! 触发执行：置 `schedule_status=triggered / status=executing / execution_status=running`，
//! 并把该计划下 `pending` 任务批量置为 `in_progress`，最后 emit
//! `plan:scheduled-trigger{planId}` 由前端接管实际执行。
//!
//! 已迁移到 rbatis：通过 `db::rb()` 访问数据库，不再依赖 rusqlite。
//! 调度循环运行在 tokio 后台任务中，启动前会检查 RBatis 是否已初始化。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

use crate::commands::support::now_rfc3339;
use crate::db;
use crate::mappers::plan as plan_mapper;
use crate::mappers::scheduler as scheduler_mapper;
use crate::mappers::task as task_mapper;

static ACTIVE_TIMERS: Lazy<Arc<RwLock<HashMap<String, JoinHandle<()>>>>> =
    Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

/// 启动后台调度器循环。
pub fn start_scheduler(app_handle: AppHandle) {
    tokio::spawn(async move {
        loop {
            // 每 60 秒检查一次待执行计划
            tokio::time::sleep(Duration::from_secs(60)).await;

            if let Err(e) = check_and_trigger_scheduled_plans(&app_handle).await {
                eprintln!("Failed to check scheduled plans: {}", e);
            }
        }
    });
}

/// 恢复待执行的定时计划。
pub async fn restore_scheduled_plans(app_handle: &AppHandle) {
    if !db::is_initialized() {
        eprintln!("RBatis not initialized, skip restore scheduled plans");
        return;
    }

    // 查询所有待执行的定时计划（schedule_status=scheduled 且 scheduled_at 非空）
    let rows = match plan_mapper::list_scheduled_plans(db::rb()).await {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("Failed to list scheduled plans: {}", e);
            return;
        }
    };

    println!("Found {} scheduled plans to restore", rows.len());

    let now = Utc::now();

    for row in rows {
        let plan_id = match row.id {
            Some(value) => value,
            None => continue,
        };
        let scheduled_at_str = match row.scheduled_at {
            Some(value) => value,
            None => continue,
        };
        match scheduled_at_str.parse::<DateTime<Utc>>() {
            Ok(scheduled_at) => {
                if scheduled_at <= now {
                    // 时间已过，立即触发
                    println!("Triggering overdue plan: {}", plan_id);
                    if let Err(e) = trigger_plan_execution(app_handle, &plan_id).await {
                        eprintln!("Failed to trigger plan {}: {}", plan_id, e);
                    }
                } else {
                    // 注册定时器
                    register_plan_timer(app_handle.clone(), &plan_id, scheduled_at).await;
                }
            }
            Err(e) => {
                eprintln!("Failed to parse scheduled_at for plan {}: {}", plan_id, e);
            }
        }
    }
}

/// 检查并触发到期的定时计划。
async fn check_and_trigger_scheduled_plans(
    app_handle: &AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    if !db::is_initialized() {
        return Ok(());
    }

    let now = Utc::now();
    let now_str = now.to_rfc3339();

    let due_rows = scheduler_mapper::list_due_plan_ids(db::rb(), &now_str)
        .await
        .map_err(|e| e.to_string())?;
    let due_plans: Vec<String> = due_rows
        .into_iter()
        .filter_map(|item| crate::models::value_to_json_string_opt(item.value))
        .collect();

    for plan_id in due_plans {
        // 检查是否已有定时器在运行
        let timers = ACTIVE_TIMERS.read().await;
        if timers.contains_key(&plan_id) {
            continue;
        }
        drop(timers);

        println!("Triggering scheduled plan: {}", plan_id);
        trigger_plan_execution(app_handle, &plan_id).await?;
    }

    Ok(())
}

/// 注册单个计划定时器。
pub async fn register_plan_timer(
    app_handle: AppHandle,
    plan_id: &str,
    scheduled_at: DateTime<Utc>,
) {
    let now = Utc::now();
    let delay = scheduled_at - now;

    if delay.num_seconds() <= 0 {
        // 时间已过，立即触发
        println!("Plan {} is overdue, triggering immediately", plan_id);
        if let Err(e) = trigger_plan_execution(&app_handle, plan_id).await {
            eprintln!("Failed to trigger plan {}: {}", plan_id, e);
        }
        return;
    }

    let plan_id_owned = plan_id.to_string();
    let duration = Duration::from_secs(delay.num_seconds() as u64);

    println!(
        "Registering timer for plan {} to trigger in {} seconds",
        plan_id,
        delay.num_seconds()
    );

    let handle = tokio::spawn(async move {
        tokio::time::sleep(duration).await;

        println!("Timer triggered for plan {}", plan_id_owned);
        if let Err(e) = trigger_plan_execution(&app_handle, &plan_id_owned).await {
            eprintln!("Failed to trigger plan {}: {}", plan_id_owned, e);
        }

        // 从活动定时器中移除
        let mut timers = ACTIVE_TIMERS.write().await;
        timers.remove(&plan_id_owned);
    });

    // 存储定时器句柄
    let mut timers = ACTIVE_TIMERS.write().await;
    timers.insert(plan_id.to_string(), handle);
}

/// 触发计划执行：更新计划状态、批量推进 pending 任务、emit 事件。
async fn trigger_plan_execution(
    app_handle: &AppHandle,
    plan_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if !db::is_initialized() {
        return Err("RBatis not initialized".into());
    }

    let now = now_rfc3339();

    // 1. 更新计划状态为 executing
    scheduler_mapper::trigger_plan_status(db::rb(), plan_id, &now).await?;
    println!("Plan {} status updated to executing", plan_id);

    // 2. 将所有 pending 状态的任务更新为 in_progress
    task_mapper::batch_update_status(db::rb(), plan_id, "in_progress", &now).await?;
    println!("Updated pending tasks to in_progress for plan {}", plan_id);

    // 3. 发送事件通知前端
    app_handle.emit("plan:scheduled-trigger", plan_id)?;

    println!("Emitted plan:scheduled-trigger event for plan {}", plan_id);

    Ok(())
}
