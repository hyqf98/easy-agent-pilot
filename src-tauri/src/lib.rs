mod commands;
mod database;
mod db;
mod logging;
mod mappers;
mod mcp_server;
mod models;
mod scheduler;
mod unattended;

// rbatis 宏（#[html_sql]、#[py_sql]、crud!、impled!）需要 macro_use 才能在 crate 内任意模块使用
#[macro_use]
extern crate rbatis;

fn log_bootstrap_error(tag: &str, message: &str) {
    eprintln!("{}: {}", tag, message);
    crate::logging::write_log("ERROR", "bootstrap", &format!("{}: {}", tag, message));
}

/// 以 stdio MCP server 模式运行（自重入入口）。
///
/// 当应用以 `--mcp-stdio [--repo <id>]` 启动时由 `main.rs` 调用：不启动 GUI，
/// 而是作为 ACP 会话的内置 MCP server 子进程，暴露对话历史查询工具。返回时进程应退出。
pub async fn run_mcp_server(argv: &[String]) -> Result<(), String> {
    mcp_server::try_run_as_mcp_server(argv).await?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = logging::init_runtime_logging() {
        eprintln!("Failed to initialize runtime logging: {}", error);
    }

    // 初始化日志，只显示 error 级别的日志
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::ERROR)
        .init();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin({
            let mut updater = tauri_plugin_updater::Builder::new();
            #[cfg(target_os = "macos")]
            {
                updater = updater.target("darwin-universal");
            }
            updater.build()
        });

    // MCP Bridge 插件仅在调试模式下启用
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(
            tauri_plugin_mcp_bridge::Builder::new()
                .bind_address("127.0.0.1")
                .base_port(9223)
                .build(),
        );
    }

    builder
        .manage(unattended::runtime::UnattendedRuntimeState::default())
        .manage(commands::terminal::TerminalState::default())
        .setup(|app| {
            if let Err(e) = commands::init_persistence_dirs() {
                log_bootstrap_error("Persistence", &format!("Failed to initialize persistence directories: {}", e));
            }

            // 初始化数据库（schema + 迁移）。init_database 内部会调用 db::init_db 初始化 RBatis 连接池。
            // 顺序：先建表/迁移，再让业务命令可用。
            if let Err(e) = tauri::async_runtime::block_on(database::init_database()) {
                log_bootstrap_error("Database", &format!("Failed to initialize database: {}", e));
            }

            // 初始化策略注册表
            tauri::async_runtime::block_on(commands::conversation::init_registry());

            // 安装内置桌面宠物资源（幂等：缺则从安装包复制，已存在则跳过）。
            if let Err(e) = commands::desktop_pet::ensure_builtin_pets_installed(&app.handle()) {
                log_bootstrap_error("DesktopPet", &format!("Failed to install builtin pets: {}", e));
            }

            // 恢复待执行的定时计划和无人值守监听，必须挂在 Tauri 常驻运行时上。
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                scheduler::restore_scheduled_plans(&app_handle).await;
                scheduler::memory_scheduler::restore_memory_jobs(&app_handle).await;
                if let Err(error) = unattended::runtime::restore_runtime(&app_handle).await {
                    log_bootstrap_error("Unattended", &format!("Failed to restore unattended runtime: {}", error));
                }

                // 启动后台调度器（需要在 Tokio 运行时上下文中）
                scheduler::start_scheduler(app_handle.clone());
                scheduler::memory_scheduler::start_memory_scheduler(app_handle);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_persistence_dir,
            commands::check_database_exists,
            commands::migrate_persistence_path,
            commands::cli::detect_cli_tools,
            commands::cli::list_cli_paths,
            commands::cli::add_cli_path,
            commands::cli::update_cli_path,
            commands::cli::delete_cli_path,
            commands::cli::check_cli_paths_migration_needed,
            commands::cli::get_pending_migration_count,
            commands::cli::migrate_cli_paths_to_agents,
            commands::cli_installer::detect_package_managers,
            commands::cli_installer::get_cli_install_options,
            commands::cli_installer::install_cli,
            commands::cli_installer::check_cli_update,
            commands::cli_installer::upgrade_cli,
            commands::cli_installer::cancel_install,
            commands::mcp::list_mcp_servers,
            commands::mcp::add_mcp_server,
            commands::mcp::update_mcp_server,
            commands::mcp::delete_mcp_server,
            commands::mcp::toggle_mcp_server,
            commands::mcp::test_mcp_connection,
            commands::mcp::list_mcp_tools,
            commands::mcp::call_mcp_tool,
            commands::mcp::list_mcp_tools_by_config,
            commands::mcp::call_mcp_tool_by_config,
            commands::install::create_install_session,
            commands::install::record_create_file,
            commands::install::record_create_dir,
            commands::install::record_modify_file,
            commands::install::record_delete_file,
            commands::install::rollback_install,
            commands::install::complete_install,
            commands::install::get_install_session_status,
            commands::install::cancel_install_session,
            commands::install::list_pending_install_sessions,
            commands::install::list_all_install_sessions,
            commands::install::cleanup_install_session,
            commands::project::list_projects,
            commands::project::create_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::project::clear_project_runtime_data,
            commands::project::validate_project_path,
            commands::project::list_project_files,
            commands::project::load_directory_children,
            commands::project::list_all_project_files_flat,
            commands::project::search_file_mentions,
            commands::project::warm_project_file_index,
            commands::project::create_entry,
            commands::project::rename_file,
            commands::project::delete_file,
            commands::project::batch_delete_files,
            commands::project::move_file,
            commands::git::get_project_git_branch,
            commands::file_editor::read_project_file,
            commands::file_editor::write_project_file,
            commands::file_editor::write_binary_file,
            commands::file_editor::read_binary_file,
            commands::file_editor::detect_file_language,
            commands::file_change::list_file_change_traces,
            commands::file_change::update_file_change_status,
            commands::file_change::rollback_file_change,
            commands::agent_plan::list_agent_plans,
            commands::session::list_sessions,
            commands::session::create_session,
            commands::session::update_session,
            commands::session::delete_session,
            commands::session::toggle_session_pin,
            commands::session::get_session_runtime_binding,
            commands::session::upsert_session_runtime_binding,
            commands::session::delete_session_runtime_binding,
            commands::message::upload_session_images,
            commands::message::resolve_uploaded_image_preview,
            commands::message::delete_uploaded_image,
            commands::terminal::create_terminal_session,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_change_directory,
            commands::terminal::close_terminal_session,
            commands::mini_panel::ensure_mini_panel_state,
            commands::mini_panel::set_mini_panel_working_directory,
            commands::mini_panel::get_mini_panel_default_shortcut,
            commands::mini_panel::suggest_mini_panel_directories,
            commands::mini_panel::register_mini_panel_windows_shortcut,
            commands::mini_panel::unregister_mini_panel_windows_shortcut,
            commands::mini_panel::capture_mini_panel_native_shortcut_once,
            commands::mini_panel::show_mini_panel,
            commands::mini_panel::hide_mini_panel,
            commands::mini_panel::toggle_mini_panel,
            commands::desktop_pet::search_codex_pets,
            commands::desktop_pet::get_codex_pet_detail,
            commands::desktop_pet::download_codex_pet,
            commands::desktop_pet::list_local_pets,
            commands::desktop_pet::delete_local_pet,
            commands::desktop_pet::get_pet_spritesheet_path,
            commands::desktop_pet::show_pet_window,
            commands::desktop_pet::hide_pet_window,
            commands::desktop_pet::toggle_pet_window,
            commands::desktop_pet::set_pet_always_on_top,
            commands::agent::list_agents,
            commands::agent::create_agent,
            commands::agent::update_agent,
            commands::agent::delete_agent,
            commands::agent::test_agent_connection,
            commands::sub_agent::seed_builtin_sub_agents,
            commands::sub_agent::list_sub_agents,
            commands::sub_agent::list_user_sub_agents,
            commands::sub_agent::list_disk_sub_agents,
            commands::sub_agent::create_sub_agent,
            commands::sub_agent::update_sub_agent,
            commands::sub_agent::count_sub_agent_references,
            commands::sub_agent::delete_sub_agent,
            commands::sub_agent::sync_sub_agent_files,
            commands::sub_agent::clear_sub_agent_files,
            commands::agent_cli_usage::record_agent_cli_usage,
            commands::agent_cli_usage::query_agent_cli_usage_stats,
            commands::agent_cli_usage::query_session_usage_summary,
            commands::agent_cli_usage::repair_agent_cli_usage_history,
            commands::agent_config::list_agent_mcp_configs,
            commands::agent_config::create_agent_mcp_config,
            commands::agent_config::update_agent_mcp_config,
            commands::agent_config::delete_agent_mcp_config,
            commands::agent_config::list_agent_skills_configs,
            commands::agent_config::create_agent_skills_config,
            commands::agent_config::update_agent_skills_config,
            commands::agent_config::delete_agent_skills_config,
            commands::agent_config::list_agent_plugins_configs,
            commands::agent_config::create_agent_plugins_config,
            commands::agent_config::update_agent_plugins_config,
            commands::agent_config::delete_agent_plugins_config,
            commands::agent_config::list_agent_models,
            commands::agent_config::create_agent_model,
            commands::agent_config::update_agent_model,
            commands::agent_config::delete_agent_model,
            commands::agent_config::sync_agent_models,
            commands::settings::get_app_setting,
            commands::settings::get_all_app_settings,
            commands::settings::resolve_app_update_proxy,
            commands::settings::save_app_setting,
            commands::settings::save_app_settings,
            commands::settings::delete_app_setting,
            commands::settings::clear_app_settings,
            commands::runtime_log::get_runtime_log_summary_command,
            commands::runtime_log::list_runtime_log_files_command,
            commands::runtime_log::read_runtime_log_file_command,
            commands::runtime_log::clear_runtime_log_files_command,
            commands::runtime_log::write_runtime_log_command,
            commands::runtime_log::read_crash_log_command,
            commands::runtime_log::write_crash_log_command,
            commands::runtime_log::clear_crash_log_command,
            commands::scan::scan_cli_config,
            commands::acp_sessions::list_acp_sessions,
            commands::acp_sessions::read_acp_session_history,
            commands::acp_sessions::delete_session_by_id,
            commands::acp_sessions::probe_acp_session_capabilities,
            commands::cli_config::get_cli_config_paths,
            commands::cli_config::read_default_cli_config_file,
            commands::cli_config::write_default_cli_config_file,
            commands::cli_config::format_default_cli_config_content,
            commands::cli_config::read_cli_config,
            commands::cli_config::update_cli_mcp_config,
            commands::cli_config::delete_cli_mcp_config,
            commands::cli_config::sync_cli_items,
            commands::cli_config::open_config_file,
            commands::cli_config::get_cli_capabilities,
            commands::provider_profile::list_provider_profiles,
            commands::provider_profile::get_provider_profile,
            commands::provider_profile::create_provider_profile,
            commands::provider_profile::update_provider_profile,
            commands::provider_profile::delete_provider_profile,
            commands::provider_profile::get_active_provider_profile,
            commands::provider_profile::switch_provider_profile,
            commands::provider_profile::update_current_cli_config,
            commands::provider_profile::read_current_cli_config,
            commands::provider_profile::read_cli_connection_info,
            commands::provider_profile::read_all_cli_connections,
            commands::provider_profile::read_opencode_auth_providers,
            commands::provider_profile::list_opencode_models,
            commands::provider_profile::read_opencode_provider_api_key,
            commands::skill_plugin::list_skill_all_files,
            commands::skill_plugin::create_cli_skill_scaffold,
            commands::skill_plugin::get_plugin_details,
            commands::skill_plugin::scan_plugin_slash_commands,
            commands::skill_plugin::delete_skill_directory,
            commands::skill_plugin::delete_plugin_directory,
            commands::skill_plugin::read_file_content,
            commands::skill_plugin::write_file_content,
            commands::skill_plugin::list_directory_files,
            commands::conversation::executor::execute_agent,
            commands::conversation::executor::is_execution_session_active,
            commands::conversation::abort_agent_execution,
            commands::conversation::clear_session_abort_flag,
            commands::conversation::respond_permission,
            commands::conversation::running_tasks::list_running_executions,
            commands::conversation::running_tasks::force_abort_execution,
            commands::plan::list_plans,
            commands::plan::get_plan,
            commands::plan::create_plan,
            commands::plan::update_plan,
            commands::plan::delete_plan,
            commands::plan::list_scheduled_plans,
            commands::plan::cancel_plan_schedule,
            commands::plan_split::get_plan_split_session,
            commands::plan_split::list_plan_split_logs,
            commands::plan_split::list_recent_plan_split_logs,
            commands::plan_split::create_plan_split_log,
            commands::plan_split::update_plan_split_log,
            commands::plan_split::start_plan_split,
            commands::plan_split::resume_plan_split,
            commands::plan_split::update_plan_split_result,
            commands::plan_split::submit_plan_split_form,
            commands::plan_split::stop_plan_split,
            commands::plan_split::reset_plan_split_turn_for_restart,
            commands::plan_split::clear_plan_split_session,
            commands::task::list_tasks,
            commands::task::list_project_unplanned_tasks,
            commands::task::get_task,
            commands::task::get_task_by_session_id,
            commands::task::get_task_runtime_binding,
            commands::task::create_task,
            commands::task::update_task,
            commands::task::delete_task,
            commands::task::upsert_task_runtime_binding,
            commands::task::delete_task_runtime_binding,
            commands::task::reorder_tasks,
            commands::task::list_subtasks,
            commands::task::retry_task,
            commands::task::batch_update_status,
            commands::task::stop_task,
            commands::task::batch_create_tasks,
            commands::task::save_split_session,
            commands::task::get_split_session,
            commands::task::delete_split_session,
            commands::task_execution::create_task_execution_log,
            commands::task_execution::update_task_execution_log,
            commands::task_execution::list_task_execution_logs,
            commands::task_execution::clear_task_execution_logs,
            commands::task_execution::get_task_execution_log_stats,
            commands::task_execution::save_task_execution_result,
            commands::task_execution::list_recent_plan_results,
            commands::task_execution::list_plan_execution_progress,
            commands::task_execution::clear_plan_execution_results,
            commands::solo::list_solo_runs,
            commands::solo::get_solo_run,
            commands::solo::create_solo_run,
            commands::solo::update_solo_run,
            commands::solo::delete_solo_run,
            commands::solo::list_solo_steps,
            commands::solo::create_solo_step,
            commands::solo::update_solo_step,
            commands::solo::create_solo_log,
            commands::solo::update_solo_log,
            commands::solo::list_solo_logs,
            commands::solo::clear_solo_run_progress,
            commands::solo::get_solo_runtime_binding,
            commands::solo::upsert_solo_runtime_binding,
            commands::solo::delete_solo_runtime_binding,
            commands::unattended::list_unattended_channels,
            commands::unattended::create_unattended_channel,
            commands::unattended::update_unattended_channel,
            commands::unattended::delete_unattended_channel,
            commands::unattended::list_unattended_channel_accounts,
            commands::unattended::start_unattended_weixin_login,
            commands::unattended::get_unattended_weixin_login_status,
            commands::unattended::logout_unattended_account,
            commands::unattended::start_unattended_runtime,
            commands::unattended::stop_unattended_runtime,
            commands::unattended::list_unattended_runtime_status,
            commands::unattended::list_unattended_threads,
            commands::unattended::update_unattended_thread_context,
            commands::unattended::list_unattended_events,
            commands::unattended::record_unattended_event,
            commands::unattended::send_unattended_text,
            commands::unattended::process_unattended_structured_intent,
            commands::memory::list_memory_libraries,
            commands::memory::get_memory_library,
            commands::memory::create_memory_library,
            commands::memory::update_memory_library,
            commands::memory::delete_memory_library,
            commands::memory::list_raw_memory_records,
            commands::memory::create_raw_memory_record,
            commands::memory::update_raw_memory_record,
            commands::memory::delete_raw_memory_record,
            commands::memory::batch_delete_raw_memory_records,
            commands::memory::capture_user_message,
            commands::memory::search_memory_suggestions,
            commands::memory::record_session_memory_references,
            commands::memory::list_memory_merge_runs,
            commands::memory::merge_raw_memories_into_library,
            commands::memory_repo::list_memory_repos,
            commands::memory_repo::get_memory_repo,
            commands::memory_repo::create_memory_repo,
            commands::memory_repo::update_memory_repo,
            commands::memory_repo::delete_memory_repo,
            commands::memory_repo::scan_memory_repo_files,
            commands::memory_repo::list_memory_repo_sources,
            commands::memory_repo::upsert_memory_repo_source,
            commands::memory_repo::migrate_legacy_memory_libraries,
            commands::memory_repo::export_memory_repo,
            commands::memory_job::list_memory_jobs,
            commands::memory_job::create_memory_job,
            commands::memory_job::update_memory_job,
            commands::memory_job::delete_memory_job,
            commands::memory_job::trigger_memory_job,
            commands::memory_job::list_memory_job_runs,
            commands::memory_job::record_memory_job_run,
            commands::app_state::get_app_state,
            commands::app_state::set_app_state,
            commands::app_state::get_app_states,
            commands::project_access::record_project_access,
            commands::project_access::get_recent_projects,
            commands::project_access::delete_project_access_log,
            commands::window::open_project_in_new_window,
            commands::window::get_window_context,
            commands::window::lock_session,
            commands::window::release_session,
            commands::window::is_session_locked,
            commands::window::release_window_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
