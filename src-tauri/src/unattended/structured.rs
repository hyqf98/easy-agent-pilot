use crate::commands::{plan, project, task, task_execution};

use super::repository;
use super::types::{
    ProcessUnattendedStructuredIntentAction, ProcessUnattendedStructuredIntentInput,
    ProcessUnattendedStructuredIntentResult, UpdateUnattendedThreadContextInput,
};

fn normalized(value: &str) -> String {
    value.trim().to_lowercase()
}

fn contains_case_insensitive(haystack: &str, needle: &str) -> bool {
    if needle.trim().is_empty() {
        return false;
    }
    normalized(haystack).contains(&normalized(needle))
}

fn compact_text(value: &str, fallback: &str) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn summarize_task_status(status: &str) -> &str {
    match status {
        "pending" => "待办",
        "in_progress" => "进行中",
        "completed" => "已完成",
        "blocked" => "阻塞",
        "failed" => "失败",
        "cancelled" => "已取消",
        _ => status,
    }
}

fn summarize_task_priority(priority: &str) -> &str {
    match priority {
        "high" => "高",
        "medium" => "中",
        "low" => "低",
        _ => priority,
    }
}

fn resolve_project_from_hint(
    hint: Option<&str>,
    projects: &[project::Project],
) -> Option<project::Project> {
    let hint = hint.map(normalized)?;
    if hint.is_empty() {
        return None;
    }

    projects
        .iter()
        .find(|item| hint.contains(&normalized(&item.name)))
        .or_else(|| {
            projects
                .iter()
                .find(|item| hint.contains(&normalized(&item.id)))
        })
        .or_else(|| {
            projects
                .iter()
                .find(|item| hint.contains(&normalized(&item.path)))
        })
        .cloned()
}

fn resolve_plan_by_hint(
    hint: Option<&str>,
    plans: &[plan::Plan],
    last_plan_id: Option<&str>,
) -> Option<plan::Plan> {
    if let Some(hint_value) = hint.map(normalized).filter(|value| !value.is_empty()) {
        if let Some(matched) = plans
            .iter()
            .find(|item| hint_value.contains(&normalized(&item.name)))
            .or_else(|| {
                plans
                    .iter()
                    .find(|item| hint_value.contains(&normalized(&item.id)))
            })
        {
            return Some(matched.clone());
        }
    }

    if let Some(last_plan_id) = last_plan_id {
        if let Some(matched) = plans.iter().find(|item| item.id == last_plan_id) {
            return Some(matched.clone());
        }
    }

    plans
        .iter()
        .find(|item| {
            item.status == "executing" || item.execution_status.as_deref() == Some("running")
        })
        .cloned()
        .or_else(|| plans.first().cloned())
}

fn resolve_task_by_hint(
    hint: Option<&str>,
    tasks: &[task::Task],
    last_task_id: Option<&str>,
) -> Option<task::Task> {
    if let Some(hint_value) = hint.map(normalized).filter(|value| !value.is_empty()) {
        if let Some(matched) = tasks
            .iter()
            .find(|item| hint_value.contains(&normalized(&item.title)))
            .or_else(|| {
                tasks
                    .iter()
                    .find(|item| hint_value.contains(&normalized(&item.id)))
            })
        {
            return Some(matched.clone());
        }
    }

    if let Some(last_task_id) = last_task_id {
        if let Some(matched) = tasks.iter().find(|item| item.id == last_task_id) {
            return Some(matched.clone());
        }
    }

    tasks
        .iter()
        .find(|item| item.status == "in_progress")
        .cloned()
        .or_else(|| tasks.first().cloned())
}

fn extract_task_title_from_raw_text(raw_text: &str) -> Option<String> {
    let normalized = raw_text
        .replace('，', " ")
        .replace('。', " ")
        .replace('：', " ")
        .replace(':', " ");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return None;
    }

    let prefixes = [
        "请帮我创建",
        "帮我创建",
        "请创建",
        "创建",
        "新建",
        "新增",
        "加一个",
        "加个",
    ];

    let mut title = trimmed.to_string();
    for prefix in prefixes {
        if title.starts_with(prefix) {
            title = title.trim_start_matches(prefix).trim().to_string();
        }
    }

    title = title.trim_start_matches("任务").trim().to_string();
    if title.len() >= 2 {
        Some(title)
    } else {
        None
    }
}

fn extract_task_updates_from_raw_text(raw_text: &str) -> task::UpdateTaskInput {
    let normalized = raw_text.trim();
    let lowered = normalized.to_lowercase();

    let status = if normalized.contains("已完成")
        || normalized.contains("完成")
        || lowered.contains("completed")
    {
        task::UpdateField::Value("completed".to_string())
    } else if normalized.contains("进行中")
        || normalized.contains("执行中")
        || lowered.contains("in progress")
    {
        task::UpdateField::Value("in_progress".to_string())
    } else if normalized.contains("待办") || lowered.contains("pending") {
        task::UpdateField::Value("pending".to_string())
    } else if normalized.contains("阻塞") || lowered.contains("blocked") {
        task::UpdateField::Value("blocked".to_string())
    } else if normalized.contains("失败") || lowered.contains("failed") {
        task::UpdateField::Value("failed".to_string())
    } else if normalized.contains("取消")
        || lowered.contains("cancelled")
        || lowered.contains("canceled")
    {
        task::UpdateField::Value("cancelled".to_string())
    } else {
        task::UpdateField::Missing
    };

    let priority = if normalized.contains("高优先级")
        || normalized.contains("优先级高")
        || lowered.contains("high priority")
    {
        task::UpdateField::Value("high".to_string())
    } else if normalized.contains("低优先级")
        || normalized.contains("优先级低")
        || lowered.contains("low priority")
    {
        task::UpdateField::Value("low".to_string())
    } else if normalized.contains("中优先级")
        || normalized.contains("优先级中")
        || lowered.contains("medium priority")
    {
        task::UpdateField::Value("medium".to_string())
    } else {
        task::UpdateField::Missing
    };

    let title = if let Some(index) = normalized.find("改成") {
        let value = normalized[index + "改成".len()..].trim();
        if !value.is_empty() && contains_case_insensitive(normalized, "标题") {
            task::UpdateField::Value(value.to_string())
        } else {
            task::UpdateField::Missing
        }
    } else {
        task::UpdateField::Missing
    };

    let description = if let Some(index) = normalized.find("描述改成") {
        let value = normalized[index + "描述改成".len()..].trim();
        if !value.is_empty() {
            task::UpdateField::Value(value.to_string())
        } else {
            task::UpdateField::Missing
        }
    } else if let Some(index) = normalized.find("说明改成") {
        let value = normalized[index + "说明改成".len()..].trim();
        if !value.is_empty() {
            task::UpdateField::Value(value.to_string())
        } else {
            task::UpdateField::Missing
        }
    } else {
        task::UpdateField::Missing
    };

    task::UpdateTaskInput {
        title,
        description,
        status,
        priority,
        assignee: task::UpdateField::Missing,
        expert_id: task::UpdateField::Missing,
        agent_id: task::UpdateField::Missing,
        model_id: task::UpdateField::Missing,
        session_id: task::UpdateField::Missing,
        cli_session_provider: task::UpdateField::Missing,
        progress_file: task::UpdateField::Missing,
        dependencies: task::UpdateField::Missing,
        order: task::UpdateField::Missing,
        retry_count: task::UpdateField::Missing,
        max_retries: task::UpdateField::Missing,
        error_message: task::UpdateField::Missing,
        implementation_steps: task::UpdateField::Missing,
        test_steps: task::UpdateField::Missing,
        acceptance_criteria: task::UpdateField::Missing,
        memory_library_ids: task::UpdateField::Missing,
        block_reason: task::UpdateField::Missing,
        input_request: task::UpdateField::Missing,
        input_response: task::UpdateField::Missing,
    }
}

fn has_task_updates(input: &task::UpdateTaskInput) -> bool {
    !matches!(input.title, task::UpdateField::Missing)
        || !matches!(input.description, task::UpdateField::Missing)
        || !matches!(input.status, task::UpdateField::Missing)
        || !matches!(input.priority, task::UpdateField::Missing)
}

fn build_project_summary(projects: &[project::Project], active_project_id: Option<&str>) -> String {
    if projects.is_empty() {
        return "当前工作区还没有导入项目。".to_string();
    }

    let mut lines = vec![format!("当前工作区共导入 {} 个项目：", projects.len())];
    for project in projects.iter().take(8) {
        let active_label = if active_project_id == Some(project.id.as_str()) {
            "（当前线程项目）"
        } else {
            ""
        };
        lines.push(format!(
            "- {}{}：{}",
            project.name, active_label, project.path
        ));
    }
    lines.join("\n")
}

fn build_follow_up_action(
    action_type: &str,
    plan_id: Option<String>,
    task_id: Option<String>,
) -> Option<ProcessUnattendedStructuredIntentAction> {
    Some(ProcessUnattendedStructuredIntentAction {
        action_type: action_type.to_string(),
        plan_id,
        task_id,
    })
}

fn task_is_waiting_input(task: &task::Task) -> bool {
    task.status == "blocked" && task.block_reason.as_deref() == Some("waiting_input")
}

fn unmet_dependency_titles(task: &task::Task, tasks: &[task::Task]) -> Vec<String> {
    let Some(dependencies) = task.dependencies.as_ref() else {
        return Vec::new();
    };

    dependencies
        .iter()
        .filter_map(|dependency_id| {
            let dependency = tasks.iter().find(|item| item.id == *dependency_id)?;
            if dependency.status == "completed" {
                None
            } else {
                Some(dependency.title.clone())
            }
        })
        .collect()
}

fn find_startable_plan_task(tasks: &[task::Task]) -> Option<task::Task> {
    tasks
        .iter()
        .find(|item| item.status == "in_progress" && !task_is_waiting_input(item))
        .cloned()
        .or_else(|| {
            tasks
                .iter()
                .find(|item| {
                    item.status == "pending"
                        && !task_is_waiting_input(item)
                        && unmet_dependency_titles(item, tasks).is_empty()
                })
                .cloned()
        })
}

fn build_plan_summary(plans: &[plan::Plan]) -> String {
    if plans.is_empty() {
        return "当前项目下还没有计划。".to_string();
    }

    let mut lines = vec![format!("当前项目共有 {} 个计划：", plans.len())];
    for item in plans.iter().take(8) {
        let execution = item
            .execution_status
            .as_deref()
            .map(|value| format!(" / {}", value))
            .unwrap_or_default();
        lines.push(format!("- {}：{}{}", item.name, item.status, execution));
    }
    lines.join("\n")
}

fn build_task_summary(plan: &plan::Plan, tasks: &[task::Task]) -> String {
    if tasks.is_empty() {
        return format!("计划“{}”还没有任务。", plan.name);
    }

    let mut lines = vec![format!("计划“{}”任务概览：", plan.name)];
    for item in tasks.iter().take(8) {
        let extra = item
            .error_message
            .as_ref()
            .map(|value| format!(" / {}", compact_text(value, "")))
            .unwrap_or_default();
        lines.push(format!("- {}：{}{}", item.title, item.status, extra));
    }
    lines.join("\n")
}

fn update_thread_context(
    thread_id: &str,
    active_project_id: Option<String>,
    last_plan_id: Option<String>,
    last_task_id: Option<String>,
) -> Result<(), String> {
    // repository 已迁移到 rbatis async；本函数为同步入口，用 block_on 桥接。
    tauri::async_runtime::block_on(repository::update_thread_context(
        thread_id,
        UpdateUnattendedThreadContextInput {
            session_id: None,
            active_project_id,
            active_agent_id: None,
            active_model_id: None,
            last_context_token: None,
            last_plan_id,
            last_task_id,
        },
    ))?;
    Ok(())
}

pub fn process_structured_intent(
    input: ProcessUnattendedStructuredIntentInput,
) -> Result<ProcessUnattendedStructuredIntentResult, String> {
    // repository / project 模块已迁移到 rbatis async；本函数为同步入口，用 block_on 桥接。
    let thread = tauri::async_runtime::block_on(repository::get_thread(&input.thread_id))?;
    let account =
        tauri::async_runtime::block_on(repository::get_account(&thread.channel_account_id))?;
    let channel =
        tauri::async_runtime::block_on(repository::get_channel(&account.channel_id))?;

    let projects = tauri::async_runtime::block_on(project::list_projects())?;
    let project_hint = input.project_hint.as_deref().unwrap_or(&input.raw_text);

    match input.intent_type.as_str() {
        "list_projects" => {
            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply: build_project_summary(&projects, thread.active_project_id.as_deref()),
                active_project_id: thread.active_project_id,
                active_plan_id: thread.last_plan_id,
                active_task_id: thread.last_task_id,
                follow_up_action: None,
            });
        }
        "switch_project" => {
            let target_project = resolve_project_from_hint(Some(project_hint), &projects)
                .ok_or_else(|| "没有匹配到要切换的项目，请在话里带上项目名称。".to_string())?;

            update_thread_context(&thread.id, Some(target_project.id.clone()), None, None)?;

            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply: format!(
                    "后续将默认使用项目“{}”处理这个微信线程。",
                    target_project.name
                ),
                active_project_id: Some(target_project.id),
                active_plan_id: thread.last_plan_id,
                active_task_id: thread.last_task_id,
                follow_up_action: None,
            });
        }
        _ => {}
    }

    let active_project = thread
        .active_project_id
        .as_ref()
        .and_then(|project_id| projects.iter().find(|item| item.id == *project_id))
        .cloned()
        .or_else(|| {
            channel
                .default_project_id
                .as_ref()
                .and_then(|project_id| projects.iter().find(|item| item.id == *project_id))
                .cloned()
        })
        .or_else(|| projects.first().cloned())
        .ok_or_else(|| {
            "当前还没有可用项目，请先在软件里创建项目，或在微信里发送“切换到项目 xxx”。".to_string()
        })?;

    let project_id = active_project.id.clone();
    // plan 模块已迁移到 rbatis async；本函数为同步入口，用 block_on 桥接。
    let project_plans =
        tauri::async_runtime::block_on(plan::list_plans(project_id.clone()))?;

    match input.intent_type.as_str() {
        "create_plan" => {
            let plan_name = compact_text(
                input.plan_name.as_deref().unwrap_or(&input.raw_text),
                "新建计划",
            );
            let created_plan = tauri::async_runtime::block_on(plan::create_plan(plan::CreatePlanInput {
                project_id: project_id.clone(),
                name: plan_name.clone(),
                description: Some(input.raw_text.clone()),
                memory_library_ids: Vec::new(),
                split_mode: Some("ai".to_string()),
                split_expert_id: None,
                split_agent_id: thread
                    .active_agent_id
                    .clone()
                    .or(channel.default_agent_id.clone()),
                split_model_id: thread
                    .active_model_id
                    .clone()
                    .or(channel.default_model_id.clone()),
                agent_team: None,
                granularity: Some(20),
                max_retry_count: Some(3),
                scheduled_at: None,
            }))?;

            update_thread_context(
                &thread.id,
                Some(project_id.clone()),
                Some(created_plan.id.clone()),
                None,
            )?;

            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply: format!("计划“{}”已创建完成。", created_plan.name),
                active_project_id: Some(project_id),
                active_plan_id: Some(created_plan.id),
                active_task_id: None,
                follow_up_action: None,
            });
        }
        "query_plan_progress" => {
            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply: build_plan_summary(&project_plans),
                active_project_id: Some(project_id),
                active_plan_id: thread.last_plan_id,
                active_task_id: thread.last_task_id,
                follow_up_action: None,
            });
        }
        "query_execution" => {
            let executing_plans = project_plans
                .iter()
                .filter(|item| {
                    item.status == "executing"
                        || item.execution_status.as_deref() == Some("running")
                })
                .cloned()
                .collect::<Vec<_>>();

            if executing_plans.is_empty() {
                return Ok(ProcessUnattendedStructuredIntentResult {
                    handled: true,
                    reply: "当前没有正在执行的计划。".to_string(),
                    active_project_id: Some(project_id),
                    active_plan_id: thread.last_plan_id,
                    active_task_id: thread.last_task_id,
                    follow_up_action: None,
                });
            }

            let mut lines = vec!["当前执行进度：".to_string()];
            for item in executing_plans.iter().take(4) {
                let progress = tauri::async_runtime::block_on(
                    task_execution::list_plan_execution_progress(item.id.clone()),
                )?;
                lines.push(format!(
                    "- {}：总任务 {}，待办 {}，进行中 {}，完成 {}，失败 {}",
                    item.name,
                    progress.total_tasks,
                    progress.pending_count,
                    progress.in_progress_count,
                    progress.completed_count,
                    progress.failed_count
                ));
            }

            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply: lines.join("\n"),
                active_project_id: Some(project_id),
                active_plan_id: thread.last_plan_id,
                active_task_id: thread.last_task_id,
                follow_up_action: None,
            });
        }
        "query_task_status" => {
            let plan_hint = input
                .plan_name
                .as_deref()
                .or(input.target_name.as_deref())
                .or(Some(input.raw_text.as_str()));
            let target_plan =
                resolve_plan_by_hint(plan_hint, &project_plans, thread.last_plan_id.as_deref())
                    .ok_or_else(|| "当前项目下还没有计划任务。".to_string())?;
            let plan_tasks = tauri::async_runtime::block_on(task::list_tasks(target_plan.id.clone()))?;

            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply: build_task_summary(&target_plan, &plan_tasks),
                active_project_id: Some(project_id),
                active_plan_id: Some(target_plan.id),
                active_task_id: thread.last_task_id,
                follow_up_action: None,
            });
        }
        "create_task" => {
            let target_plan = resolve_plan_by_hint(
                input
                    .plan_name
                    .as_deref()
                    .or(input.target_name.as_deref())
                    .or(Some(input.raw_text.as_str())),
                &project_plans,
                thread.last_plan_id.as_deref(),
            )
            .ok_or_else(|| "当前项目下还没有可承载任务的计划，请先创建计划。".to_string())?;

            let title = extract_task_title_from_raw_text(
                input.task_hint.as_deref().unwrap_or(&input.raw_text),
            )
            .ok_or_else(|| {
                format!(
                    "要创建任务的话，请至少告诉我任务标题。当前可用计划是“{}”。",
                    target_plan.name
                )
            })?;

            let created_task = tauri::async_runtime::block_on(task::create_task(task::CreateTaskInput {
                plan_id: target_plan.id.clone(),
                parent_id: None,
                title,
                description: Some(input.raw_text.clone()),
                priority: None,
                assignee: None,
                expert_id: None,
                agent_id: thread
                    .active_agent_id
                    .clone()
                    .or(channel.default_agent_id.clone()),
                model_id: thread
                    .active_model_id
                    .clone()
                    .or(channel.default_model_id.clone()),
                dependencies: None,
                order: None,
                max_retries: Some(3),
                implementation_steps: None,
                test_steps: None,
                acceptance_criteria: None,
                memory_library_ids: None,
            }))?;

            update_thread_context(
                &thread.id,
                Some(project_id.clone()),
                Some(target_plan.id.clone()),
                Some(created_task.id.clone()),
            )?;

            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply: format!(
                    "已在计划“{}”下创建任务“{}”，优先级 {}。",
                    target_plan.name,
                    created_task.title,
                    summarize_task_priority(&created_task.priority)
                ),
                active_project_id: Some(project_id),
                active_plan_id: Some(target_plan.id),
                active_task_id: Some(created_task.id),
                follow_up_action: None,
            });
        }
        "update_task" | "stop_task" => {
            let ordered_plans = {
                let mut plans = project_plans.clone();
                plans.sort_by_key(|item| {
                    let mut score = 0;
                    if Some(item.id.as_str()) == thread.last_plan_id.as_deref() {
                        score -= 100;
                    }
                    if item.status == "executing"
                        || item.execution_status.as_deref() == Some("running")
                    {
                        score -= 50;
                    }
                    score
                });
                plans
            };

            let task_hint = input
                .task_hint
                .as_deref()
                .or(input.target_name.as_deref())
                .or(Some(input.raw_text.as_str()));
            let mut matched_plan: Option<plan::Plan> = None;
            let mut matched_task: Option<task::Task> = None;

            for candidate_plan in ordered_plans.into_iter().take(6) {
                let plan_tasks = tauri::async_runtime::block_on(task::list_tasks(candidate_plan.id.clone()))?;
                if let Some(candidate_task) =
                    resolve_task_by_hint(task_hint, &plan_tasks, thread.last_task_id.as_deref())
                {
                    matched_plan = Some(candidate_plan);
                    matched_task = Some(candidate_task);
                    break;
                }
            }

            let target_plan = matched_plan
                .ok_or_else(|| "没有匹配到对应任务，请在消息里带上任务标题。".to_string())?;
            let target_task = matched_task
                .ok_or_else(|| "没有匹配到对应任务，请在消息里带上任务标题。".to_string())?;

            let updated_task = if input.intent_type == "stop_task" {
                tauri::async_runtime::block_on(task::stop_task(target_task.id.clone()))?
            } else {
                let updates = extract_task_updates_from_raw_text(&input.raw_text);
                if !has_task_updates(&updates) {
                    return Ok(ProcessUnattendedStructuredIntentResult {
                        handled: true,
                        reply: format!(
                            "我已经定位到任务“{}”，但还缺少明确的修改内容，请补充要改的标题、状态、优先级或说明。",
                            target_task.title
                        ),
                        active_project_id: Some(project_id),
                        active_plan_id: Some(target_plan.id),
                        active_task_id: Some(target_task.id),
                        follow_up_action: None,
                    });
                }
                tauri::async_runtime::block_on(task::update_task(target_task.id.clone(), updates))?
            };

            update_thread_context(
                &thread.id,
                Some(project_id.clone()),
                Some(target_plan.id.clone()),
                Some(updated_task.id.clone()),
            )?;

            let reply = if input.intent_type == "stop_task" {
                format!(
                    "任务“{}”已停止，当前状态为 {}。",
                    updated_task.title,
                    summarize_task_status(&updated_task.status)
                )
            } else {
                format!(
                    "任务“{}”已更新，当前状态为 {}，优先级 {}。",
                    updated_task.title,
                    summarize_task_status(&updated_task.status),
                    summarize_task_priority(&updated_task.priority)
                )
            };

            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply,
                active_project_id: Some(project_id),
                active_plan_id: Some(target_plan.id),
                active_task_id: Some(updated_task.id),
                follow_up_action: None,
            });
        }
        "start_task" => {
            let ordered_plans = {
                let mut plans = project_plans.clone();
                plans.sort_by_key(|item| {
                    let mut score = 0;
                    if Some(item.id.as_str()) == thread.last_plan_id.as_deref() {
                        score -= 100;
                    }
                    if item.status == "executing"
                        || item.execution_status.as_deref() == Some("running")
                    {
                        score -= 50;
                    }
                    score
                });
                plans
            };

            let task_hint = input
                .task_hint
                .as_deref()
                .or(input.target_name.as_deref())
                .or(Some(input.raw_text.as_str()));
            let mut matched_plan: Option<plan::Plan> = None;
            let mut matched_task: Option<task::Task> = None;
            let mut matched_plan_tasks: Vec<task::Task> = Vec::new();

            for candidate_plan in ordered_plans.into_iter().take(6) {
                let plan_tasks = tauri::async_runtime::block_on(task::list_tasks(candidate_plan.id.clone()))?;
                if let Some(candidate_task) =
                    resolve_task_by_hint(task_hint, &plan_tasks, thread.last_task_id.as_deref())
                {
                    matched_plan = Some(candidate_plan);
                    matched_task = Some(candidate_task);
                    matched_plan_tasks = plan_tasks;
                    break;
                }
            }

            let target_plan = matched_plan
                .ok_or_else(|| "没有匹配到对应任务，请在消息里带上任务标题。".to_string())?;
            let target_task = matched_task
                .ok_or_else(|| "没有匹配到对应任务，请在消息里带上任务标题。".to_string())?;

            update_thread_context(
                &thread.id,
                Some(project_id.clone()),
                Some(target_plan.id.clone()),
                Some(target_task.id.clone()),
            )?;

            if target_task.status == "completed" {
                return Ok(ProcessUnattendedStructuredIntentResult {
                    handled: true,
                    reply: format!("任务“{}”已经完成，不需要再次启动。", target_task.title),
                    active_project_id: Some(project_id),
                    active_plan_id: Some(target_plan.id),
                    active_task_id: Some(target_task.id),
                    follow_up_action: None,
                });
            }

            if target_task.status == "cancelled" {
                return Ok(ProcessUnattendedStructuredIntentResult {
                    handled: true,
                    reply: format!(
                        "任务“{}”当前已取消，如需重新执行，请先将状态改回待办。",
                        target_task.title
                    ),
                    active_project_id: Some(project_id),
                    active_plan_id: Some(target_plan.id),
                    active_task_id: Some(target_task.id),
                    follow_up_action: None,
                });
            }

            if task_is_waiting_input(&target_task) {
                return Ok(ProcessUnattendedStructuredIntentResult {
                    handled: true,
                    reply: format!(
                        "任务“{}”正在等待补充输入，当前不能直接启动。",
                        target_task.title
                    ),
                    active_project_id: Some(project_id),
                    active_plan_id: Some(target_plan.id),
                    active_task_id: Some(target_task.id),
                    follow_up_action: None,
                });
            }

            let unmet_dependencies = unmet_dependency_titles(&target_task, &matched_plan_tasks);
            if !unmet_dependencies.is_empty() {
                return Ok(ProcessUnattendedStructuredIntentResult {
                    handled: true,
                    reply: format!(
                        "任务“{}”暂时还不能启动，依赖任务尚未完成：{}。",
                        target_task.title,
                        unmet_dependencies.join("、")
                    ),
                    active_project_id: Some(project_id),
                    active_plan_id: Some(target_plan.id),
                    active_task_id: Some(target_task.id),
                    follow_up_action: None,
                });
            }

            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply: format!(
                    "任务“{}”已加入执行流程，稍后会回写最新进度。",
                    target_task.title
                ),
                active_project_id: Some(project_id),
                active_plan_id: Some(target_plan.id.clone()),
                active_task_id: Some(target_task.id.clone()),
                follow_up_action: build_follow_up_action(
                    "start_task_execution",
                    Some(target_plan.id),
                    Some(target_task.id),
                ),
            });
        }
        "start_plan" | "pause_plan" | "resume_plan" => {
            let target_plan = resolve_plan_by_hint(
                input
                    .target_name
                    .as_deref()
                    .or(Some(input.raw_text.as_str())),
                &project_plans,
                thread.last_plan_id.as_deref(),
            )
            .ok_or_else(|| "没有找到对应的计划，请在对话里带上计划名称。".to_string())?;

            update_thread_context(
                &thread.id,
                Some(project_id.clone()),
                Some(target_plan.id.clone()),
                None,
            )?;

            if input.intent_type == "start_plan" {
                let plan_tasks = tauri::async_runtime::block_on(task::list_tasks(target_plan.id.clone()))?;
                if plan_tasks.is_empty() {
                    return Ok(ProcessUnattendedStructuredIntentResult {
                        handled: true,
                        reply: format!(
                            "计划“{}”下还没有任务，暂时无法开始执行。",
                            target_plan.name
                        ),
                        active_project_id: Some(project_id),
                        active_plan_id: Some(target_plan.id),
                        active_task_id: thread.last_task_id,
                        follow_up_action: None,
                    });
                }

                let Some(startable_task) = find_startable_plan_task(&plan_tasks) else {
                    let waiting_input_task =
                        plan_tasks.iter().find(|item| task_is_waiting_input(item));
                    let reply = if let Some(task) = waiting_input_task {
                        format!(
                            "计划“{}”当前卡在任务“{}”等待补充输入，暂时无法自动继续执行。",
                            target_plan.name, task.title
                        )
                    } else {
                        "当前计划没有可立即开始的任务，请先检查依赖关系或任务状态。".to_string()
                    };

                    return Ok(ProcessUnattendedStructuredIntentResult {
                        handled: true,
                        reply,
                        active_project_id: Some(project_id),
                        active_plan_id: Some(target_plan.id),
                        active_task_id: thread.last_task_id,
                        follow_up_action: None,
                    });
                };

                return Ok(ProcessUnattendedStructuredIntentResult {
                    handled: true,
                    reply: format!(
                        "计划“{}”已进入执行流程，先从任务“{}”开始。",
                        target_plan.name, startable_task.title
                    ),
                    active_project_id: Some(project_id),
                    active_plan_id: Some(target_plan.id.clone()),
                    active_task_id: Some(startable_task.id.clone()),
                    follow_up_action: build_follow_up_action(
                        "start_plan_execution",
                        Some(target_plan.id),
                        Some(startable_task.id),
                    ),
                });
            }

            let (reply, follow_up_action) = match input.intent_type.as_str() {
                "pause_plan" => (
                    format!("计划“{}”已暂停。", target_plan.name),
                    build_follow_up_action(
                        "pause_plan_execution",
                        Some(target_plan.id.clone()),
                        None,
                    ),
                ),
                "resume_plan" => (
                    format!("计划“{}”已恢复执行。", target_plan.name),
                    build_follow_up_action(
                        "resume_plan_execution",
                        Some(target_plan.id.clone()),
                        None,
                    ),
                ),
                _ => unreachable!(),
            };

            return Ok(ProcessUnattendedStructuredIntentResult {
                handled: true,
                reply,
                active_project_id: Some(project_id),
                active_plan_id: Some(target_plan.id),
                active_task_id: thread.last_task_id,
                follow_up_action,
            });
        }
        _ => {}
    }

    Ok(ProcessUnattendedStructuredIntentResult {
        handled: false,
        reply: String::new(),
        active_project_id: Some(project_id),
        active_plan_id: thread.last_plan_id,
        active_task_id: thread.last_task_id,
        follow_up_action: None,
    })
}
