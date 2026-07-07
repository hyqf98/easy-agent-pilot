use anyhow::Result;

use crate::commands::support::{
    MEMORY_CHUNKS_FTS_TABLE_SQL, MEMORY_SEARCH_TRIGGERS_SQL, RAW_MEMORY_FTS_TABLE_SQL,
};
use crate::db;
use rbs::Value;

// ============================================================================
// rbatis 执行辅助函数
//
// schema 初始化/迁移阶段都是一次性 DDL/DML，没有 ORM 实体，统一走裸 SQL：
// - execute_raw：执行无返回的 SQL（DDL/DML，含分号分隔的多语句 batch）
// - query_count_i64：执行返回单行单列整型的查询（COUNT(*) / SELECT 1 ...）
// - table_has_column / table_exists 的 PRAGMA/sqlite_master 查询也用这些辅助。
//
// rbdc-sqlite 的 VirtualStatement 会按 ';' 切分，单次 exec() 即可执行多语句，
// 等价于 rusqlite 的 execute_batch。
// ============================================================================

/// 执行一条（或多条分号分隔的）SQL，不返回行数据。
///
/// 用于建表/建索引/ALTER/UPDATE 等 DDL/DML；对应原 `conn.execute(sql, [])`
/// 与 `conn.execute_batch(sql)`。
async fn execute_raw(sql: &str) -> Result<()> {
    db::rb().exec(sql, vec![]).await?;
    Ok(())
}

/// 执行返回单行单列整型的查询，解析第一行第一列的 i64 值。
///
/// 用于 COUNT(*) 等标量查询；对应原 `conn.query_row(sql, [], |row| row.get(0))`。
/// 无行返回时（空表等场景视 SQL 而定）返回 Ok(0)。
async fn query_count_i64(sql: &str) -> Result<i64> {
    let value = db::rb().query(sql, vec![]).await?;
    // 查询结果形如 Value::Array(rows)；取第一行，其内部为单元素 Map，取其 value。
    if let Value::Array(rows) = &value {
        if let Some(first_row) = rows.first() {
            if let Value::Map(m) = first_row {
                if let Some((_, v)) = m.into_iter().next() {
                    return Ok(value_to_i64(v));
                }
            }
        }
    }
    Ok(0)
}

/// 把 rbs::Value 转成 i64（兼容 I32/I64/U32/U64/Null 等）。
fn value_to_i64(v: &Value) -> i64 {
    match v {
        Value::I64(n) => *n,
        Value::I32(n) => *n as i64,
        Value::U32(n) => *n as i64,
        Value::U64(n) => *n as i64,
        Value::Null => 0,
        _ => 0,
    }
}

/// 数据库初始化 SQL 脚本
const INIT_SQL: &str = r#"
    -- 项目表
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

    -- 会话表
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        expert_id TEXT,
        agent_id TEXT,
        agent_type TEXT NOT NULL,
        cli_session_id TEXT,
        cli_session_provider TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);

    CREATE TABLE IF NOT EXISTS session_runtime_bindings (
        session_id TEXT NOT NULL,
        runtime_key TEXT NOT NULL,
        external_session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, runtime_key)
    );
    CREATE INDEX IF NOT EXISTS idx_session_runtime_bindings_runtime
        ON session_runtime_bindings(runtime_key, updated_at DESC);

    -- 消息表（已废弃：消息持久化已由 ACP session/load 替代，此表仅保留用于旧库兼容）
    -- messages 表已废弃：ACP 消息不再本地落库（由 session/load 重放历史）。
    -- 新库不再创建该表；旧库由 drop_legacy_messages_table 迁移 DROP。
    -- 智能体配置表
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'cli',
        api_key TEXT,
        base_url TEXT,
        model TEXT,
        cli_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- 子代理配置表（Sub-Agent，对齐 CLI 子代理 frontmatter）
    -- 子代理是纯 persona 层（prompt + 工具约束），不再绑定 ACP 执行载体；
    -- 执行器选择上移到会话/计划/SOLO 运行级别，子代理经 _meta.systemPrompt 自动注入给会话选定的执行器。
    CREATE TABLE IF NOT EXISTS sub_agents (
        id TEXT PRIMARY KEY,
        builtin_code TEXT UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        prompt TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'custom',
        tags TEXT NOT NULL DEFAULT '[]',
        recommended_scenes TEXT NOT NULL DEFAULT '[]',
        tools TEXT NOT NULL DEFAULT '[]',
        disallowed_tools TEXT NOT NULL DEFAULT '[]',
        model TEXT,
        permission_mode TEXT,
        max_turns INTEGER,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        is_system INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 100,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sub_agents_enabled_order ON sub_agents(is_enabled, sort_order, updated_at DESC);

    -- 文件变更追踪表（ACP Diff 捕获的文件修改前/后内容，用于差异审查与回滚）
    -- 一个工具调用对一个文件的多次更新通过唯一键 UPSERT 为终态。
    CREATE TABLE IF NOT EXISTS file_change_traces (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        change_type TEXT NOT NULL,
        before_content TEXT,
        after_content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        seq INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, tool_call_id, file_path)
    );
    CREATE INDEX IF NOT EXISTS idx_file_changes_session ON file_change_traces(session_id, request_id, created_at);

    -- ACP Agent Plan 快照表（Agent 流式下发的计划/Todo 全量快照）
    -- 一个回合内多次 Plan 更新（全量替换语义）通过唯一键 UPSERT 为终态。
    CREATE TABLE IF NOT EXISTS agent_plan_snapshots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        seq INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_plans_session ON agent_plan_snapshots(session_id, updated_at);

    -- MCP 服务器配置表
    CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        args TEXT,
        env TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        test_status TEXT,
        test_message TEXT,
        tool_count INTEGER,
        tested_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- Skills 配置表（从市场安装的 Skills）
    CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        skill_id TEXT,                      -- 市场 Skill ID
        name TEXT NOT NULL,
        description TEXT,
        file_name TEXT NOT NULL,            -- 文件名
        path TEXT NOT NULL,                 -- 完整路径
        source_market TEXT,                 -- 来源市场名称
        cli_type TEXT NOT NULL,             -- 目标 CLI (claude, cursor, aider, windsurf)
        scope TEXT NOT NULL DEFAULT 'global', -- 安装范围 (global, project)
        project_path TEXT,                  -- 项目路径（如果是 project scope）
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_skills_path ON skills(path);
    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

    -- 会话 MCP 关联表
    CREATE TABLE IF NOT EXISTS session_mcp (
        session_id TEXT NOT NULL,
        mcp_server_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (session_id, mcp_server_id)
    );

    -- 主题配置表
    CREATE TABLE IF NOT EXISTS themes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        colors_light TEXT NOT NULL,
        colors_dark TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- 应用设置表
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- CLI 路径配置表（手动配置）
    CREATE TABLE IF NOT EXISTS cli_paths (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        version TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cli_paths_name ON cli_paths(name);

    -- 已安装 MCP 测试结果表（存储 CLI 配置文件中的 MCP 测试结果）
    CREATE TABLE IF NOT EXISTS installed_mcp_test_results (
        id TEXT PRIMARY KEY,
        config_path TEXT NOT NULL,
        mcp_name TEXT NOT NULL,
        test_status TEXT NOT NULL,
        test_message TEXT,
        tool_count INTEGER,
        tested_at TEXT NOT NULL,
        UNIQUE(config_path, mcp_name)
    );
    CREATE INDEX IF NOT EXISTS idx_installed_mcp_test_results_lookup ON installed_mcp_test_results(config_path, mcp_name);

    -- MCP 安装历史表
    CREATE TABLE IF NOT EXISTS mcp_install_history (
        id TEXT PRIMARY KEY,
        mcp_id TEXT NOT NULL,
        mcp_name TEXT NOT NULL,
        cli_path TEXT NOT NULL,
        config_path TEXT NOT NULL,
        backup_path TEXT,
        scope TEXT NOT NULL DEFAULT 'global',
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TEXT NOT NULL,
        rolled_back_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_install_history_created ON mcp_install_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mcp_install_history_mcp ON mcp_install_history(mcp_name);

    -- SDK 智能体 MCP 配置表
    CREATE TABLE IF NOT EXISTS agent_mcp_configs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        transport_type TEXT NOT NULL DEFAULT 'stdio',
        command TEXT,
        args TEXT,
        env TEXT,
        url TEXT,
        headers TEXT,
        scope TEXT NOT NULL DEFAULT 'user',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_mcp_configs_agent ON agent_mcp_configs(agent_id);

    -- SDK 智能体 Skills 配置表
    CREATE TABLE IF NOT EXISTS agent_skills_configs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        skill_path TEXT NOT NULL,
        scripts_path TEXT,
        references_path TEXT,
        assets_path TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_skills_configs_agent ON agent_skills_configs(agent_id);

    -- SDK 智能体 Plugins 配置表
    CREATE TABLE IF NOT EXISTS agent_plugins_configs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT,
        description TEXT,
        plugin_path TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_plugins_configs_agent ON agent_plugins_configs(agent_id);

    -- Provider 配置表 (CC-Switch)
    CREATE TABLE IF NOT EXISTS provider_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cli_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        api_key TEXT,
        base_url TEXT,
        provider_name TEXT,
        main_model TEXT,
        reasoning_model TEXT,
        haiku_model TEXT,
        sonnet_default TEXT,
        opus_default TEXT,
        codex_model TEXT,
        opencode_provider_models TEXT,
        opencode_provider_npm TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_provider_profiles_cli_type ON provider_profiles(cli_type);
    CREATE INDEX IF NOT EXISTS idx_provider_profiles_is_active ON provider_profiles(is_active);

    -- 计划表 (Plan Mode)
    CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        execution_overview TEXT,
        execution_overview_updated_at TEXT,
        split_expert_id TEXT,
        split_agent_id TEXT,
        split_model_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        agent_team TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_id);
    CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
    CREATE TABLE IF NOT EXISTS plan_memory_libraries (
        plan_id TEXT NOT NULL,
        library_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (plan_id, library_id)
    );

    CREATE TABLE IF NOT EXISTS solo_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        execution_path TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        requirement TEXT NOT NULL,
        goal TEXT NOT NULL,
        memory_library_ids_json TEXT NOT NULL DEFAULT '[]',
        participant_expert_ids_json TEXT NOT NULL DEFAULT '[]',
        coordinator_expert_id TEXT,
        coordinator_agent_id TEXT,
        coordinator_model_id TEXT,
        max_dispatch_depth INTEGER NOT NULL DEFAULT 3,
        current_depth INTEGER NOT NULL DEFAULT 0,
        current_step_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        execution_status TEXT NOT NULL DEFAULT 'idle',
        last_error TEXT,
        input_request_json TEXT,
        input_response_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        stopped_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_solo_runs_project ON solo_runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_solo_runs_status ON solo_runs(status);
    CREATE TABLE IF NOT EXISTS solo_run_memory_libraries (
        run_id TEXT NOT NULL,
        library_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (run_id, library_id)
    );

    CREATE TABLE IF NOT EXISTS solo_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_ref TEXT NOT NULL,
        parent_step_ref TEXT,
        depth INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL,
        description TEXT,
        execution_prompt TEXT,
        selected_expert_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        summary TEXT,
        result_summary TEXT,
        result_files_json TEXT,
        fail_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_solo_steps_run ON solo_steps(run_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_solo_steps_status ON solo_steps(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_solo_steps_run_ref ON solo_steps(run_id, step_ref);

    CREATE TABLE IF NOT EXISTS solo_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_id TEXT,
        scope TEXT NOT NULL,
        log_type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_solo_logs_run ON solo_logs(run_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_solo_logs_step ON solo_logs(step_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS solo_runtime_bindings (
        run_id TEXT NOT NULL,
        runtime_key TEXT NOT NULL,
        external_session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (run_id, runtime_key)
    );
    CREATE INDEX IF NOT EXISTS idx_solo_runtime_bindings_runtime
        ON solo_runtime_bindings(runtime_key, updated_at DESC);

    -- 任务表 (Plan Mode)
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        plan_id TEXT NOT NULL,
        parent_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        assignee TEXT,
        expert_id TEXT,
        agent_id TEXT,
        model_id TEXT,
        session_id TEXT,
        cli_session_provider TEXT,
        progress_file TEXT,
        dependencies TEXT,
        task_order INTEGER NOT NULL DEFAULT 0,
        memory_library_ids TEXT,
        last_result_status TEXT,
        last_result_summary TEXT,
        last_result_files TEXT,
        last_fail_reason TEXT,
        last_result_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE TABLE IF NOT EXISTS task_memory_libraries (
        task_id TEXT NOT NULL,
        library_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, library_id)
    );

    CREATE TABLE IF NOT EXISTS task_runtime_bindings (
        task_id TEXT NOT NULL,
        runtime_key TEXT NOT NULL,
        external_session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (task_id, runtime_key)
    );
    CREATE INDEX IF NOT EXISTS idx_task_runtime_bindings_runtime
        ON task_runtime_bindings(runtime_key, updated_at DESC);

    -- 智能体模型配置表
    CREATE TABLE IF NOT EXISTS agent_models (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        is_builtin INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_models_agent ON agent_models(agent_id);

    -- 应用状态表（窗口状态恢复）
    CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- 项目访问记录表（最近项目列表）
    CREATE TABLE IF NOT EXISTS project_access_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL UNIQUE,
        last_accessed_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_project_access_log_time ON project_access_log(last_accessed_at DESC);

    -- 窗口会话锁定表（防止同会话多窗口）
    CREATE TABLE IF NOT EXISTS window_session_locks (
        session_id TEXT PRIMARY KEY,
        window_label TEXT NOT NULL,
        locked_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- 任务拆分会话表（存储AI原始输出和解析状态）
    CREATE TABLE IF NOT EXISTS task_split_sessions (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing',
        raw_content TEXT,
        parsed_output TEXT,
        parse_error TEXT,
        granularity INTEGER DEFAULT 20,
        task_count_mode TEXT NOT NULL DEFAULT 'min',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_split_sessions_plan ON task_split_sessions(plan_id);

    -- 任务执行日志表
    CREATE TABLE IF NOT EXISTS task_execution_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        log_type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_execution_logs_task ON task_execution_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_execution_logs_created ON task_execution_logs(created_at);

    -- Agent CLI 用量统计表
    CREATE TABLE IF NOT EXISTS agent_cli_usage_records (
        execution_id TEXT PRIMARY KEY,
        execution_mode TEXT NOT NULL,
        provider TEXT NOT NULL,
        agent_id TEXT,
        agent_name_snapshot TEXT,
        model_id TEXT,
        project_id TEXT,
        session_id TEXT,
        task_id TEXT,
        message_id TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
        call_count INTEGER NOT NULL DEFAULT 1,
        estimated_input_cost_usd REAL,
        estimated_output_cost_usd REAL,
        estimated_total_cost_usd REAL,
        pricing_status TEXT NOT NULL DEFAULT 'missing_usage',
        pricing_version TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_occurred ON agent_cli_usage_records(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_provider_time ON agent_cli_usage_records(provider, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_agent_time ON agent_cli_usage_records(agent_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_model_time ON agent_cli_usage_records(model_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_mode_time ON agent_cli_usage_records(execution_mode, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_session_time ON agent_cli_usage_records(session_id, occurred_at DESC);

    -- 部门表
    CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        description TEXT,
        manager_name TEXT,
        sort_order INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
    CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);

    -- 人员表
    CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        employee_no TEXT NOT NULL UNIQUE,
        department_id TEXT,
        position TEXT,
        phone TEXT,
        email TEXT,
        hire_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        avatar TEXT,
        remark TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
    CREATE INDEX IF NOT EXISTS idx_employees_employee_no ON employees(employee_no);
    CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
    CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

    -- 任务执行结果快照历史表
    CREATE TABLE IF NOT EXISTS task_execution_results (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        task_title_snapshot TEXT NOT NULL,
        task_description_snapshot TEXT,
        result_status TEXT NOT NULL,
        result_summary TEXT,
        result_files TEXT,
        fail_reason TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_execution_results_plan_created
        ON task_execution_results(plan_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_execution_results_task_created
        ON task_execution_results(task_id, created_at DESC);

    -- 无人值守渠道配置
    CREATE TABLE IF NOT EXISTS unattended_channels (
        id TEXT PRIMARY KEY,
        channel_type TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        default_project_id TEXT,
        default_agent_id TEXT,
        default_model_id TEXT,
        reply_style TEXT NOT NULL DEFAULT 'final_only',
        allow_all_senders INTEGER NOT NULL DEFAULT 1,
        future_auth_mode TEXT NOT NULL DEFAULT 'allow_all',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_unattended_channels_type ON unattended_channels(channel_type);
    CREATE INDEX IF NOT EXISTS idx_unattended_channels_enabled ON unattended_channels(enabled);

    -- 无人值守渠道账号
    CREATE TABLE IF NOT EXISTS unattended_channel_accounts (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        user_id TEXT,
        base_url TEXT NOT NULL,
        bot_token TEXT NOT NULL,
        sync_cursor TEXT,
        login_status TEXT NOT NULL DEFAULT 'connected',
        runtime_status TEXT NOT NULL DEFAULT 'idle',
        last_connected_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(channel_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_unattended_accounts_channel ON unattended_channel_accounts(channel_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_unattended_accounts_runtime ON unattended_channel_accounts(runtime_status);

    -- 无人值守远程线程
    CREATE TABLE IF NOT EXISTS unattended_threads (
        id TEXT PRIMARY KEY,
        channel_account_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        peer_name_snapshot TEXT,
        session_id TEXT,
        active_project_id TEXT,
        active_agent_id TEXT,
        active_model_id TEXT,
        last_context_token TEXT,
        last_plan_id TEXT,
        last_task_id TEXT,
        last_message_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(channel_account_id, peer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_unattended_threads_account ON unattended_threads(channel_account_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_unattended_threads_peer ON unattended_threads(peer_id);

    -- 无人值守审计日志
    CREATE TABLE IF NOT EXISTS unattended_events (
        id TEXT PRIMARY KEY,
        channel_account_id TEXT,
        thread_id TEXT,
        direction TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'success',
        summary TEXT,
        payload_json TEXT,
        correlation_id TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_unattended_events_account_created ON unattended_events(channel_account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_unattended_events_thread_created ON unattended_events(thread_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_unattended_events_type_created ON unattended_events(event_type, created_at DESC);

    -- 记忆分类表（用于 Skills 式层级展示）
    CREATE TABLE IF NOT EXISTS memory_categories (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        description TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_categories_parent ON memory_categories(parent_id);

    -- 用户记忆表
    CREATE TABLE IF NOT EXISTS user_memories (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        category_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        compressed_content TEXT,
        is_compressed INTEGER DEFAULT 0,
        source_type TEXT DEFAULT 'auto',
        source_message_ids TEXT,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_memories_session ON user_memories(session_id);
    CREATE INDEX IF NOT EXISTS idx_user_memories_category ON user_memories(category_id);
    CREATE INDEX IF NOT EXISTS idx_user_memories_source_type ON user_memories(source_type);

    -- 记忆压缩历史表
    CREATE TABLE IF NOT EXISTS memory_compressions (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        original_content TEXT NOT NULL,
        compressed_content TEXT NOT NULL,
        compression_ratio REAL,
        model_id TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_compressions_memory ON memory_compressions(memory_id);
"#;

/// messages 表已废弃：ACP 消息不再本地落库（由 ACP session/load 重放历史）。
///
/// 旧库可能仍存在 messages 表（及其索引），这里统一 DROP，保证新库与旧库
/// 都不再保留该表。历史数据已确认抛弃。
async fn drop_legacy_messages_table() -> Result<()> {
    execute_raw(
        r#"
        DROP INDEX IF EXISTS idx_messages_request;
        DROP INDEX IF EXISTS idx_messages_session_type;
        DROP INDEX IF EXISTS idx_messages_session_created;
        DROP TABLE IF EXISTS messages;
        "#,
    )
    .await?;
    Ok(())
}

async fn table_has_column(table_name: &str, column_name: &str) -> Result<bool> {
    // 使用 pragma_table_info 表值函数 + COUNT，把"列是否存在"变成标量查询，
    // 避免遍历 PRAGMA 多行结果（rbatis 标量解析更简单）。
    // table_name/column_name 来自代码常量，非用户输入，直接拼接是安全的。
    let sql = format!(
        "SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = '{}'",
        table_name, column_name
    );
    let count = query_count_i64(&sql).await?;
    Ok(count > 0)
}

/// 检测表是否存在（用于条件迁移）。
async fn table_exists(table_name: &str) -> Result<bool> {
    let sql = format!(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '{}'",
        table_name
    );
    let count = query_count_i64(&sql).await?;
    Ok(count > 0)
}

/// 将旧 `agent_experts`（专家团队）表迁移为 `sub_agents`（子代理）表。
///
/// 迁移策略（数据保留，结构重建）：
/// - `sub_agents` 不存在时按新结构建表；
/// - 旧 `agent_experts` 若存在，把 persona 相关列拷贝过来（丢弃 `runtime_agent_id` /
///   `default_model_id`，补默认值给新增的 `tools`/`disallowed_tools`/`model`/
///   `permission_mode`/`max_turns`），随后 DROP 旧表；
/// - 补建索引。
async fn migrate_agent_experts_to_sub_agents() -> Result<()> {
    let sub_agents_ready = table_has_column("sub_agents", "prompt").await?;
    if !sub_agents_ready {
        execute_raw(
            r#"
            CREATE TABLE IF NOT EXISTS sub_agents (
                id TEXT PRIMARY KEY,
                builtin_code TEXT UNIQUE,
                name TEXT NOT NULL,
                description TEXT,
                prompt TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'custom',
                tags TEXT NOT NULL DEFAULT '[]',
                recommended_scenes TEXT NOT NULL DEFAULT '[]',
                tools TEXT NOT NULL DEFAULT '[]',
                disallowed_tools TEXT NOT NULL DEFAULT '[]',
                model TEXT,
                permission_mode TEXT,
                max_turns INTEGER,
                is_builtin INTEGER NOT NULL DEFAULT 0,
                is_enabled INTEGER NOT NULL DEFAULT 1,
                is_system INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 100,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )
        .await?;
    }

    // 旧表存在则把 persona 数据迁移过来，再删除旧表。
    // runtime_agent_id / default_model_id 故意不迁移：执行器选择已上移到
    // session/plan/soloRun 实体列，子代理不再持有载体绑定。
    if table_exists("agent_experts").await? {
        println!("Migrating agent_experts -> sub_agents ...");
        execute_raw(
            r#"
            INSERT OR IGNORE INTO sub_agents (
                id, builtin_code, name, description, prompt,
                category, tags, recommended_scenes, tools, disallowed_tools,
                model, permission_mode, max_turns,
                is_builtin, is_enabled, sort_order, created_at, updated_at
            )
            SELECT
                id, builtin_code, name, description, prompt,
                category, tags, recommended_scenes, '[]', '[]',
                NULL, NULL, NULL,
                is_builtin, is_enabled, sort_order, created_at, updated_at
            FROM agent_experts;
            DROP TABLE agent_experts;
            "#,
        )
        .await?;
        println!("agent_experts migrated to sub_agents.");
    }

    execute_raw(
        "CREATE INDEX IF NOT EXISTS idx_sub_agents_enabled_order ON sub_agents(is_enabled, sort_order, updated_at DESC)",
    )
    .await?;
    Ok(())
}

/// 初始化数据库
pub async fn init_database() -> Result<()> {
    // 获取持久化目录
    let persistence_dir = crate::commands::get_persistence_dir_path()?;
    let db_path = persistence_dir.join("data").join("easy-agent.db");

    // 确保目录存在
    let db_dir = db_path.parent().ok_or_else(|| anyhow::anyhow!("invalid database path: no parent directory"))?;
    std::fs::create_dir_all(db_dir)?;

    println!("Database path: {:?}", db_path);

    // 初始化 rbatis 连接池（替代原 Connection::open）。
    // db::init_db 内部以 sqlite://<path> 初始化全局 RBatis 单例。
    let db_path_str = db_path
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("invalid database path: non-utf8"))?;
    db::init_db(db_path_str)?;

    // 启用 WAL 模式以支持并发读写，避免 "database is locked" 错误
    execute_raw("PRAGMA journal_mode = WAL").await?;
    // 启用外键约束（SQLite 默认不启用）
    execute_raw("PRAGMA foreign_keys = OFF").await?;

    // 执行初始化 SQL
    execute_raw(INIT_SQL).await?;

    // messages 表已废弃（ACP 消息由 session/load 重放历史，不再本地落库）。
    // 旧库若仍存在该表则 DROP，保证新旧库都不再保留。
    drop_legacy_messages_table().await?;

    // 执行迁移（忽略列已存在的错误）
    // SQLite 不支持 IF NOT EXISTS 用于 ALTER TABLE ADD COLUMN
    // 所以我们需要单独执行每条语句并忽略错误
    let migrations = [
        // 文件变更追踪表（新表，幂等创建；旧库补建）
        "CREATE INDEX IF NOT EXISTS idx_file_changes_session ON file_change_traces(session_id, request_id, created_at)",
        "ALTER TABLE mcp_servers ADD COLUMN test_status TEXT",
        "ALTER TABLE mcp_servers ADD COLUMN test_message TEXT",
        "ALTER TABLE mcp_servers ADD COLUMN tool_count INTEGER",
        "ALTER TABLE mcp_servers ADD COLUMN tested_at TEXT",
        "ALTER TABLE mcp_servers ADD COLUMN server_type TEXT DEFAULT 'stdio'",
        "ALTER TABLE mcp_servers ADD COLUMN url TEXT",
        "ALTER TABLE mcp_servers ADD COLUMN headers TEXT",
        // sessions 表添加 pinned / last_message 字段
        "ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN last_message TEXT",
        "ALTER TABLE sessions ADD COLUMN error_message TEXT",
        "ALTER TABLE sessions ADD COLUMN expert_id TEXT",
        "ALTER TABLE sessions ADD COLUMN agent_id TEXT",
        "ALTER TABLE sessions ADD COLUMN cli_session_id TEXT",
        "ALTER TABLE sessions ADD COLUMN cli_session_provider TEXT",
        "ALTER TABLE sessions ADD COLUMN plan_mode INTEGER DEFAULT 0",
        "ALTER TABLE unattended_channels ADD COLUMN default_model_id TEXT",
        "ALTER TABLE unattended_threads ADD COLUMN active_project_id TEXT",
        "ALTER TABLE provider_profiles ADD COLUMN opencode_provider_models TEXT",
        "ALTER TABLE provider_profiles ADD COLUMN opencode_provider_npm TEXT",
    ];

    for migration in migrations {
        // 忽略"列已存在"错误
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Migration warning: {}", e);
            }
        }
    }

    // agents 表添加测试相关字段
    let agent_migrations = [
        "ALTER TABLE agents ADD COLUMN status TEXT DEFAULT 'offline'",
        "ALTER TABLE agents ADD COLUMN test_message TEXT",
        "ALTER TABLE agents ADD COLUMN tested_at TEXT",
    ];

    for migration in agent_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Agent migration warning: {}", e);
            }
        }
    }

    // agents 表添加统一智能体模型字段
    // provider: 提供商 (claude/codex)
    // model_id: 模型ID
    // custom_model_enabled: 是否启用自定义模型
    let unified_agent_migrations = [
        "ALTER TABLE agents ADD COLUMN provider TEXT",
        "ALTER TABLE agents ADD COLUMN model_id TEXT",
        "ALTER TABLE agents ADD COLUMN custom_model_enabled INTEGER DEFAULT 0",
        // ACP 运行时命令：旧库（早于 acp_command 引入）补列，否则 list_agents 的 SELECT 会报错
        "ALTER TABLE agents ADD COLUMN acp_command TEXT",
    ];

    for migration in unified_agent_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Unified agent migration warning: {}", e);
            }
        }
    }

    if !table_has_column("solo_runs", "participant_expert_ids_json").await? {
        execute_raw(
            "ALTER TABLE solo_runs ADD COLUMN participant_expert_ids_json TEXT NOT NULL DEFAULT '[]'",
        )
        .await?;
    }

    if !table_has_column("solo_runs", "execution_path").await? {
        execute_raw(
            "ALTER TABLE solo_runs ADD COLUMN execution_path TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        execute_raw(
            "UPDATE solo_runs SET execution_path = COALESCE((SELECT path FROM projects WHERE projects.id = solo_runs.project_id), '') WHERE execution_path = ''",
        )
        .await?;
    }

    // themes 表统一加 updated_at（与其他配置表保持一致）
    if !table_has_column("themes", "updated_at").await? {
        execute_raw(
            "ALTER TABLE themes ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        // 用已有 created_at 回填，保证非空
        execute_raw("UPDATE themes SET updated_at = created_at WHERE updated_at = ''").await?;
    }

    // skills 表添加新字段（从市场安装的 skills）
    let skills_migrations = [
        "ALTER TABLE skills ADD COLUMN skill_id TEXT",
        "ALTER TABLE skills ADD COLUMN file_name TEXT",
        "ALTER TABLE skills ADD COLUMN source_market TEXT",
        "ALTER TABLE skills ADD COLUMN cli_type TEXT",
        "ALTER TABLE skills ADD COLUMN scope TEXT DEFAULT 'global'",
        "ALTER TABLE skills ADD COLUMN project_path TEXT",
        "ALTER TABLE skills ADD COLUMN disabled INTEGER DEFAULT 0",
    ];

    for migration in skills_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Skills migration warning: {}", e);
            }
        }
    }

    // 创建 skills 表的索引（如果不存在）
    let index_migrations = [
        "CREATE INDEX IF NOT EXISTS idx_skills_path ON skills(path)",
        "CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name)",
    ];

    for migration in index_migrations {
        if let Err(e) = execute_raw(migration).await {
            println!("Skills index migration warning: {}", e);
        }
    }

    // mcp_install_history 表迁移（如果表不存在则创建）
    let history_table_sql = r#"
        CREATE TABLE IF NOT EXISTS mcp_install_history (
            id TEXT PRIMARY KEY,
            mcp_id TEXT NOT NULL,
            mcp_name TEXT NOT NULL,
            cli_path TEXT NOT NULL,
            config_path TEXT NOT NULL,
            backup_path TEXT,
            scope TEXT NOT NULL DEFAULT 'global',
            status TEXT NOT NULL DEFAULT 'completed',
            created_at TEXT NOT NULL,
            rolled_back_at TEXT
        )
    "#;
    if let Err(e) = execute_raw(history_table_sql).await {
        println!("MCP install history table migration warning: {}", e);
    }

    // 创建索引
    let history_index_migrations = [
        "CREATE INDEX IF NOT EXISTS idx_mcp_install_history_created ON mcp_install_history(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_mcp_install_history_mcp ON mcp_install_history(mcp_name)",
    ];
    for migration in history_index_migrations {
        if let Err(e) = execute_raw(migration).await {
            println!("MCP install history index migration warning: {}", e);
        }
    }

    // messages 表已废弃并由 drop_legacy_messages_table 清理，
    // 无需再为旧结构补列/重建索引。

    // agent_models 表迁移（智能体模型配置表）
    let agent_models_table_sql = r#"
        CREATE TABLE IF NOT EXISTS agent_models (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            is_builtin INTEGER DEFAULT 0,
            is_default INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(agent_models_table_sql).await {
        println!("Agent models table migration warning: {}", e);
    }

    // 创建索引
    let agent_models_index_sql =
        "CREATE INDEX IF NOT EXISTS idx_agent_models_agent ON agent_models(agent_id)";
    if let Err(e) = execute_raw(agent_models_index_sql).await {
        println!("Agent models index migration warning: {}", e);
    }

    // agent_models 表添加 context_window / 输入费用 / 输出费用字段
    let agent_models_migrations = [
        "ALTER TABLE agent_models ADD COLUMN context_window INTEGER DEFAULT 128000",
        "ALTER TABLE agent_models ADD COLUMN input_cost_per_million_usd REAL",
        "ALTER TABLE agent_models ADD COLUMN output_cost_per_million_usd REAL",
    ];

    for migration in agent_models_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Agent models migration warning: {}", e);
            }
        }
    }

    // sub_agents 表添加 is_system 字段（系统级子代理，配置页隐藏）
    if let Err(e) = execute_raw(
        "ALTER TABLE sub_agents ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0",
    )
    .await
    {
        let err_str = e.to_string();
        if !err_str.contains("duplicate column name") {
            println!("Sub agents migration warning: {}", e);
        }
    }

    // plans 表添加新字段（任务拆分颗粒度、最大重试次数、执行状态、当前任务ID）
    let plans_migrations = [
        "ALTER TABLE plans ADD COLUMN granularity INTEGER DEFAULT 20",
        "ALTER TABLE plans ADD COLUMN max_retry_count INTEGER DEFAULT 3",
        "ALTER TABLE plans ADD COLUMN execution_status TEXT DEFAULT 'idle'",
        "ALTER TABLE plans ADD COLUMN current_task_id TEXT",
        "ALTER TABLE plans ADD COLUMN execution_overview TEXT",
        "ALTER TABLE plans ADD COLUMN execution_overview_updated_at TEXT",
        "ALTER TABLE plans ADD COLUMN split_agent_id TEXT",
        "ALTER TABLE plans ADD COLUMN split_model_id TEXT",
        "ALTER TABLE plans ADD COLUMN split_expert_id TEXT",
        "ALTER TABLE plans ADD COLUMN scheduled_at TEXT",
        "ALTER TABLE plans ADD COLUMN schedule_status TEXT DEFAULT 'none'",
        "ALTER TABLE plans ADD COLUMN split_mode TEXT DEFAULT 'ai'",
    ];

    for migration in plans_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Plans migration warning: {}", e);
            }
        }
    }

    let plan_memory_libraries_table_sql = r#"
        CREATE TABLE IF NOT EXISTS plan_memory_libraries (
            plan_id TEXT NOT NULL,
            library_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (plan_id, library_id)
        )
    "#;
    if let Err(e) = execute_raw(plan_memory_libraries_table_sql).await {
        println!("Plan memory libraries table migration warning: {}", e);
    }

    // tasks 表添加新字段（重试计数、最大重试、错误信息、实现步骤、测试步骤、验收标准）
    let tasks_migrations = [
        "ALTER TABLE tasks ADD COLUMN project_id TEXT",
        "ALTER TABLE tasks ADD COLUMN agent_id TEXT",
        "ALTER TABLE tasks ADD COLUMN model_id TEXT",
        "ALTER TABLE tasks ADD COLUMN expert_id TEXT",
        "ALTER TABLE tasks ADD COLUMN cli_session_provider TEXT",
        "ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 3",
        "ALTER TABLE tasks ADD COLUMN error_message TEXT",
        "ALTER TABLE tasks ADD COLUMN implementation_steps TEXT",
        "ALTER TABLE tasks ADD COLUMN test_steps TEXT",
        "ALTER TABLE tasks ADD COLUMN acceptance_criteria TEXT",
        "ALTER TABLE tasks ADD COLUMN memory_library_ids TEXT",
        "ALTER TABLE tasks ADD COLUMN last_result_status TEXT",
        "ALTER TABLE tasks ADD COLUMN last_result_summary TEXT",
        "ALTER TABLE tasks ADD COLUMN last_result_files TEXT",
        "ALTER TABLE tasks ADD COLUMN last_fail_reason TEXT",
        "ALTER TABLE tasks ADD COLUMN last_result_at TEXT",
        "ALTER TABLE tasks ADD COLUMN block_reason TEXT",
        "ALTER TABLE tasks ADD COLUMN input_request TEXT",
        "ALTER TABLE tasks ADD COLUMN input_response TEXT",
    ];

    for migration in tasks_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Tasks migration warning: {}", e);
            }
        }
    }

    if let Err(e) = execute_raw(
        "CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, task_order, created_at)",
    )
    .await
    {
        println!("Tasks project index migration warning: {}", e);
    }

    if table_has_column("tasks", "project_id").await? {
        if let Err(e) = execute_raw(
            r#"
            UPDATE tasks
            SET project_id = (
                SELECT plans.project_id
                FROM plans
                WHERE plans.id = tasks.plan_id
            )
            WHERE (project_id IS NULL OR trim(project_id) = '')
              AND EXISTS (
                SELECT 1
                FROM plans
                WHERE plans.id = tasks.plan_id
              )
            "#,
        )
        .await
        {
            println!("Tasks project backfill from plans warning: {}", e);
        }

        if let Err(e) = execute_raw(
            r#"
            UPDATE tasks
            SET project_id = (
                SELECT sessions.project_id
                FROM sessions
                WHERE sessions.id = tasks.session_id
            )
            WHERE (project_id IS NULL OR trim(project_id) = '')
              AND session_id IS NOT NULL
              AND trim(session_id) != ''
              AND EXISTS (
                SELECT 1
                FROM sessions
                WHERE sessions.id = tasks.session_id
              )
            "#,
        )
        .await
        {
            println!("Tasks project backfill from sessions warning: {}", e);
        }
    }

    let task_memory_libraries_table_sql = r#"
        CREATE TABLE IF NOT EXISTS task_memory_libraries (
            task_id TEXT NOT NULL,
            library_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (task_id, library_id)
        )
    "#;
    if let Err(e) = execute_raw(task_memory_libraries_table_sql).await {
        println!("Task memory libraries table migration warning: {}", e);
    }

    if !table_has_column("solo_runs", "memory_library_ids_json").await? {
        execute_raw(
            "ALTER TABLE solo_runs ADD COLUMN memory_library_ids_json TEXT NOT NULL DEFAULT '[]'",
        )
        .await?;
    }

    let solo_run_memory_libraries_table_sql = r#"
        CREATE TABLE IF NOT EXISTS solo_run_memory_libraries (
            run_id TEXT NOT NULL,
            library_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (run_id, library_id)
        )
    "#;
    if let Err(e) = execute_raw(solo_run_memory_libraries_table_sql).await {
        println!("SOLO run memory libraries table migration warning: {}", e);
    }

    let runtime_binding_tables = [
        r#"
        CREATE TABLE IF NOT EXISTS session_runtime_bindings (
            session_id TEXT NOT NULL,
            runtime_key TEXT NOT NULL,
            external_session_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (session_id, runtime_key)
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_session_runtime_bindings_runtime ON session_runtime_bindings(runtime_key, updated_at DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS task_runtime_bindings (
            task_id TEXT NOT NULL,
            runtime_key TEXT NOT NULL,
            external_session_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (task_id, runtime_key)
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_task_runtime_bindings_runtime ON task_runtime_bindings(runtime_key, updated_at DESC)",
    ];
    for migration in runtime_binding_tables {
        if let Err(e) = execute_raw(migration).await {
            println!("Runtime binding migration warning: {}", e);
        }
    }

    let runtime_binding_backfills = [
        r#"
        INSERT OR IGNORE INTO session_runtime_bindings (
            session_id,
            runtime_key,
            external_session_id,
            created_at,
            updated_at
        )
        SELECT
            id,
            cli_session_provider || '-cli',
            cli_session_id,
            updated_at,
            updated_at
        FROM sessions
        WHERE cli_session_id IS NOT NULL
          AND trim(cli_session_id) != ''
          AND cli_session_provider IS NOT NULL
          AND trim(cli_session_provider) != ''
        "#,
        r#"
        INSERT OR IGNORE INTO task_runtime_bindings (
            task_id,
            runtime_key,
            external_session_id,
            created_at,
            updated_at
        )
        SELECT
            id,
            cli_session_provider || '-cli',
            session_id,
            updated_at,
            updated_at
        FROM tasks
        WHERE session_id IS NOT NULL
          AND trim(session_id) != ''
          AND cli_session_provider IS NOT NULL
          AND trim(cli_session_provider) != ''
        "#,
    ];
    for migration in runtime_binding_backfills {
        if let Err(e) = execute_raw(migration).await {
            println!("Runtime binding backfill warning: {}", e);
        }
    }

    // agent_experts -> sub_agents 迁移（表重建 + persona 数据保留）
    migrate_agent_experts_to_sub_agents().await?;

    // task_split_sessions 表（存储AI原始输出和解析状态）
    let task_split_sessions_table_sql = r#"
        CREATE TABLE IF NOT EXISTS task_split_sessions (
            id TEXT PRIMARY KEY,
            plan_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'processing',
            raw_content TEXT,
            parsed_output TEXT,
            parse_error TEXT,
            granularity INTEGER DEFAULT 20,
            task_count_mode TEXT NOT NULL DEFAULT 'min',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(task_split_sessions_table_sql).await {
        println!("Task split sessions table migration warning: {}", e);
    }

    // 创建索引
    let task_split_sessions_index_sql =
        "CREATE INDEX IF NOT EXISTS idx_task_split_sessions_plan ON task_split_sessions(plan_id)";
    if let Err(e) = execute_raw(task_split_sessions_index_sql).await {
        println!("Task split sessions index migration warning: {}", e);
    }

    let task_split_sessions_migrations = [
        "ALTER TABLE task_split_sessions ADD COLUMN execution_session_id TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN execution_request_json TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN llm_messages_json TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN messages_json TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN form_queue_json TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN current_form_index INTEGER",
        "ALTER TABLE task_split_sessions ADD COLUMN error_message TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN started_at TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN completed_at TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN stopped_at TEXT",
        "ALTER TABLE task_split_sessions ADD COLUMN task_count_mode TEXT NOT NULL DEFAULT 'min'",
    ];
    for migration in task_split_sessions_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Task split sessions migration warning: {}", e);
            }
        }
    }

    let plan_split_logs_table_sql = r#"
        CREATE TABLE IF NOT EXISTS plan_split_logs (
            id TEXT PRIMARY KEY,
            plan_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            log_type TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT,
            created_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(plan_split_logs_table_sql).await {
        println!("Plan split logs table migration warning: {}", e);
    }

    let plan_split_logs_indexes = [
        "CREATE INDEX IF NOT EXISTS idx_plan_split_logs_plan ON plan_split_logs(plan_id, created_at ASC)",
        "CREATE INDEX IF NOT EXISTS idx_plan_split_logs_session ON plan_split_logs(session_id, created_at ASC)",
    ];
    for migration in plan_split_logs_indexes {
        if let Err(e) = execute_raw(migration).await {
            println!("Plan split logs index migration warning: {}", e);
        }
    }

    // task_execution_results 表（存储任务执行完成/失败后的结构化结果）
    let task_execution_results_table_sql = r#"
        CREATE TABLE IF NOT EXISTS task_execution_results (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            plan_id TEXT NOT NULL,
            task_title_snapshot TEXT NOT NULL,
            task_description_snapshot TEXT,
            result_status TEXT NOT NULL,
            result_summary TEXT,
            result_files TEXT,
            fail_reason TEXT,
            created_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(task_execution_results_table_sql).await {
        println!("Task execution results table migration warning: {}", e);
    }

    let task_execution_results_indexes = [
        "CREATE INDEX IF NOT EXISTS idx_task_execution_results_plan_created ON task_execution_results(plan_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_task_execution_results_task_created ON task_execution_results(task_id, created_at DESC)",
    ];
    for migration in task_execution_results_indexes {
        if let Err(e) = execute_raw(migration).await {
            println!("Task execution results index migration warning: {}", e);
        }
    }

    let agent_cli_usage_table_sql = r#"
        CREATE TABLE IF NOT EXISTS agent_cli_usage_records (
            execution_id TEXT PRIMARY KEY,
            execution_mode TEXT NOT NULL,
            provider TEXT NOT NULL,
            agent_id TEXT,
            agent_name_snapshot TEXT,
            model_id TEXT,
            project_id TEXT,
            session_id TEXT,
            task_id TEXT,
            message_id TEXT,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
            cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
            call_count INTEGER NOT NULL DEFAULT 1,
            estimated_input_cost_usd REAL,
            estimated_output_cost_usd REAL,
            estimated_total_cost_usd REAL,
            pricing_status TEXT NOT NULL DEFAULT 'missing_usage',
            pricing_version TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(agent_cli_usage_table_sql).await {
        println!("Agent CLI usage table migration warning: {}", e);
    }

    let agent_cli_usage_indexes = [
        "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_occurred ON agent_cli_usage_records(occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_provider_time ON agent_cli_usage_records(provider, occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_agent_time ON agent_cli_usage_records(agent_id, occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_model_time ON agent_cli_usage_records(model_id, occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_mode_time ON agent_cli_usage_records(execution_mode, occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_session_time ON agent_cli_usage_records(session_id, occurred_at DESC)",
    ];
    for migration in agent_cli_usage_indexes {
        if let Err(e) = execute_raw(migration).await {
            println!("Agent CLI usage index migration warning: {}", e);
        }
    }

    // ==================== Memory domain rebuild ====================
    let cleanup_legacy_memory_tables = [
        "DROP TABLE IF EXISTS memory_compressions",
        "DROP TABLE IF EXISTS user_memories",
        "DROP TABLE IF EXISTS memory_categories",
    ];
    for migration in cleanup_legacy_memory_tables {
        if let Err(e) = execute_raw(migration).await {
            println!("Legacy memory cleanup warning: {}", e);
        }
    }

    let needs_memory_rebuild = !table_has_column("memory_libraries", "content_md").await?;
    if needs_memory_rebuild {
        let rebuild_tables = [
            "DROP TABLE IF EXISTS memory_merge_runs",
            "DROP TABLE IF EXISTS raw_memory_records",
            "DROP TABLE IF EXISTS memory_items",
            "DROP TABLE IF EXISTS memory_extractions",
            "DROP TABLE IF EXISTS memory_records",
            "DROP TABLE IF EXISTS memory_libraries",
        ];
        for migration in rebuild_tables {
            if let Err(e) = execute_raw(migration).await {
                println!("Memory rebuild cleanup warning: {}", e);
            }
        }
    }

    let memory_libraries_table_sql = r#"
        CREATE TABLE IF NOT EXISTS memory_libraries (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            content_md TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(memory_libraries_table_sql).await {
        println!("Memory libraries table migration warning: {}", e);
    }

    let raw_memory_records_table_sql = r#"
        CREATE TABLE IF NOT EXISTS raw_memory_records (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            project_id TEXT,
            message_id TEXT UNIQUE,
            content TEXT NOT NULL,
            source_role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(raw_memory_records_table_sql).await {
        println!("Raw memory records table migration warning: {}", e);
    }

    let memory_merge_runs_table_sql = r#"
        CREATE TABLE IF NOT EXISTS memory_merge_runs (
            id TEXT PRIMARY KEY,
            library_id TEXT NOT NULL,
            source_record_ids TEXT NOT NULL,
            source_record_count INTEGER NOT NULL DEFAULT 0,
            previous_content_md TEXT NOT NULL DEFAULT '',
            merged_content_md TEXT NOT NULL DEFAULT '',
            agent_id TEXT,
            model_id TEXT,
            created_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(memory_merge_runs_table_sql).await {
        println!("Memory merge runs table migration warning: {}", e);
    }

    let project_memory_libraries_table_sql = r#"
        CREATE TABLE IF NOT EXISTS project_memory_libraries (
            project_id TEXT NOT NULL,
            library_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (project_id, library_id)
        )
    "#;
    if let Err(e) = execute_raw(project_memory_libraries_table_sql).await {
        println!("Project memory libraries table migration warning: {}", e);
    }

    let memory_library_chunks_table_sql = r#"
        CREATE TABLE IF NOT EXISTS memory_library_chunks (
            id TEXT PRIMARY KEY,
            library_id TEXT NOT NULL,
            chunk_text TEXT NOT NULL,
            chunk_order INTEGER NOT NULL DEFAULT 0,
            chunk_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#;
    if let Err(e) = execute_raw(memory_library_chunks_table_sql).await {
        println!("Memory library chunks table migration warning: {}", e);
    }

    let session_memory_reference_history_table_sql = r#"
        CREATE TABLE IF NOT EXISTS session_memory_reference_history (
            session_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (session_id, source_type, source_id)
        )
    "#;
    if let Err(e) = execute_raw(session_memory_reference_history_table_sql).await {
        println!(
            "Session memory reference history table migration warning: {}",
            e
        );
    }

    if let Err(e) = execute_raw(RAW_MEMORY_FTS_TABLE_SQL).await {
        println!("Raw memory FTS table migration warning: {}", e);
    }

    if let Err(e) = execute_raw(MEMORY_CHUNKS_FTS_TABLE_SQL).await {
        println!("Memory library chunks FTS table migration warning: {}", e);
    }

    for migration in MEMORY_SEARCH_TRIGGERS_SQL {
        if let Err(e) = execute_raw(migration).await {
            println!("Memory search trigger migration warning: {}", e);
        }
    }

    let memory_indexes = [
        "CREATE INDEX IF NOT EXISTS idx_memory_libraries_updated ON memory_libraries(updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_raw_memory_records_created ON raw_memory_records(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_raw_memory_records_project ON raw_memory_records(project_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_raw_memory_records_session ON raw_memory_records(session_id, created_at DESC)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_memory_records_message ON raw_memory_records(message_id) WHERE message_id IS NOT NULL",
        "CREATE INDEX IF NOT EXISTS idx_memory_merge_runs_library_created ON memory_merge_runs(library_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_project_memory_libraries_project ON project_memory_libraries(project_id, created_at ASC)",
        "CREATE INDEX IF NOT EXISTS idx_project_memory_libraries_library ON project_memory_libraries(library_id, created_at ASC)",
        "CREATE INDEX IF NOT EXISTS idx_memory_library_chunks_library_order ON memory_library_chunks(library_id, chunk_order ASC)",
        "CREATE INDEX IF NOT EXISTS idx_memory_library_chunks_hash ON memory_library_chunks(chunk_hash)",
        "CREATE INDEX IF NOT EXISTS idx_session_memory_reference_history_session ON session_memory_reference_history(session_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_session_memory_reference_history_message ON session_memory_reference_history(message_id, created_at DESC)",
    ];
    for migration in memory_indexes {
        if let Err(e) = execute_raw(migration).await {
            println!("Memory index migration warning: {}", e);
        }
    }

    if let Err(e) = maybe_rebuild_fts_index("raw_memory_records_fts", "raw_memory_records").await {
        println!("Raw memory FTS rebuild warning: {}", e);
    }
    if let Err(e) =
        maybe_rebuild_fts_index("memory_library_chunks_fts", "memory_library_chunks").await
    {
        println!("Memory chunk FTS rebuild warning: {}", e);
    }

    // agent_cli_usage_records 表添加缓存字段（缓存命中 token 统计）
    let usage_cache_migrations = [
        "ALTER TABLE agent_cli_usage_records ADD COLUMN cache_read_input_tokens INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE agent_cli_usage_records ADD COLUMN cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0",
    ];
    for migration in usage_cache_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Usage cache migration warning: {}", e);
            }
        }
    }

    // agents 表添加 acp_command 字段（ACP 统一运行时命令）
    let acp_migrations = [
        "ALTER TABLE agents ADD COLUMN acp_command TEXT",
    ];
    for migration in acp_migrations {
        if let Err(e) = execute_raw(migration).await {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("ACP agent migration warning: {}", e);
            }
        }
    }

    // ==================== Memory repos 2.0 ====================
    // 记忆库重构为磁盘标准 Skills 包仓库：DB 仅存元数据，内容落到文件系统。
    if let Err(e) = init_memory_repos_schema().await {
        println!("Memory repos schema migration warning: {}", e);
    }

    // ==================== 清理废弃的 messages 外键约束 ====================
    // agent_cli_usage_records 和 session_memory_reference_history 有
    // FOREIGN KEY (message_id) REFERENCES messages(id)，但 messages 表已废弃 DROP。
    // 删除这些表行时 SQLite 外键检查会报 "no such table: main.messages"。
    // 重建表去掉坏外键（数据保留）。
    if let Err(e) = drop_legacy_messages_foreign_keys().await {
        println!("Legacy messages FK cleanup warning: {}", e);
    }

    println!("Database initialized successfully");
    Ok(())
}

/// 重建 agent_cli_usage_records 和 session_memory_reference_history，
/// 去掉对已废弃 messages 表的外键引用（数据保留）。
///
/// 幂等：用 table_has_column 守卫（加一个 _fk_cleaned 标记列），
/// 只在未清理时执行一次重建。
async fn drop_legacy_messages_foreign_keys() -> Result<()> {
    // agent_cli_usage_records：重建去掉 message_id 外键
    if !table_has_column("agent_cli_usage_records", "_fk_cleaned").await? {
        execute_raw("ALTER TABLE agent_cli_usage_records RENAME TO _agent_cli_usage_records_old").await?;
        let new_sql = r#"CREATE TABLE agent_cli_usage_records (
            execution_id TEXT PRIMARY KEY,
            execution_mode TEXT NOT NULL,
            provider TEXT NOT NULL,
            agent_id TEXT,
            agent_name_snapshot TEXT,
            model_id TEXT,
            project_id TEXT,
            session_id TEXT,
            task_id TEXT,
            message_id TEXT,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
            cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
            call_count INTEGER NOT NULL DEFAULT 1,
            estimated_input_cost_usd REAL,
            estimated_output_cost_usd REAL,
            estimated_total_cost_usd REAL,
            pricing_status TEXT NOT NULL DEFAULT 'missing_usage',
            pricing_version TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            _fk_cleaned INTEGER NOT NULL DEFAULT 1
        )"#;
        execute_raw(new_sql).await?;
        execute_raw("INSERT INTO agent_cli_usage_records (execution_id, execution_mode, provider, agent_id, agent_name_snapshot, model_id, project_id, session_id, task_id, message_id, input_tokens, output_tokens, total_tokens, cache_read_input_tokens, cache_creation_input_tokens, call_count, estimated_input_cost_usd, estimated_output_cost_usd, estimated_total_cost_usd, pricing_status, pricing_version, occurred_at, created_at) SELECT execution_id, execution_mode, provider, agent_id, agent_name_snapshot, model_id, project_id, session_id, task_id, message_id, input_tokens, output_tokens, total_tokens, cache_read_input_tokens, cache_creation_input_tokens, call_count, estimated_input_cost_usd, estimated_output_cost_usd, estimated_total_cost_usd, pricing_status, pricing_version, occurred_at, created_at FROM _agent_cli_usage_records_old").await?;
        execute_raw("DROP TABLE _agent_cli_usage_records_old").await?;
        // 重建索引
        let indexes = [
            "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_occurred ON agent_cli_usage_records(occurred_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_provider_time ON agent_cli_usage_records(provider, occurred_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_agent_time ON agent_cli_usage_records(agent_id, occurred_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_model_time ON agent_cli_usage_records(model_id, occurred_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_mode_time ON agent_cli_usage_records(execution_mode, occurred_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_agent_cli_usage_session_time ON agent_cli_usage_records(session_id, occurred_at DESC)",
        ];
        for idx in indexes {
            execute_raw(idx).await?;
        }
    }

    // session_memory_reference_history：重建去掉 message_id 外键
    if !table_has_column("session_memory_reference_history", "_fk_cleaned").await? {
        execute_raw("ALTER TABLE session_memory_reference_history RENAME TO _session_memory_reference_history_old").await?;
        execute_raw(r#"CREATE TABLE session_memory_reference_history (
            session_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (session_id, source_type, source_id),
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            _fk_cleaned INTEGER NOT NULL DEFAULT 1
        )"#).await?;
        execute_raw("INSERT INTO session_memory_reference_history (session_id, source_type, source_id, message_id, created_at) SELECT session_id, source_type, source_id, message_id, created_at FROM _session_memory_reference_history_old").await?;
        execute_raw("DROP TABLE _session_memory_reference_history_old").await?;
        execute_raw("CREATE INDEX IF NOT EXISTS idx_session_memory_reference_history_session ON session_memory_reference_history(session_id, created_at DESC)").await?;
        execute_raw("CREATE INDEX IF NOT EXISTS idx_session_memory_reference_history_message ON session_memory_reference_history(message_id, created_at DESC)").await?;
    }

    Ok(())
}

async fn maybe_rebuild_fts_index(fts_table: &str, source_table: &str) -> Result<()> {
    let source_count_sql = format!("SELECT COUNT(*) FROM {}", source_table);
    let fts_count_sql = format!("SELECT COUNT(*) FROM {}", fts_table);
    let source_count: i64 = query_count_i64(&source_count_sql).await?;
    let fts_count: i64 = query_count_i64(&fts_count_sql).await?;

    if source_count == fts_count {
        return Ok(());
    }

    let rebuild_sql = format!("INSERT INTO {}({}) VALUES('rebuild')", fts_table, fts_table);
    execute_raw(&rebuild_sql).await?;
    Ok(())
}

/// 建表：记忆库仓库（memory_repos）及其数据源、定时任务、运行记录。
///
/// 幂等创建：新表用 `CREATE TABLE IF NOT EXISTS`；列以 `table_has_column` 守卫增量补加，
/// 与本文件既有迁移风格保持一致（SQLite 不支持 IF NOT EXISTS 用于 ALTER）。
async fn init_memory_repos_schema() -> Result<()> {
    let table_sql = [
        // 记忆库仓库元数据（内容落到 repo_path 指向的磁盘目录）
        r#"
        CREATE TABLE IF NOT EXISTS memory_repos (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT,
            repo_path TEXT NOT NULL,
            format TEXT NOT NULL DEFAULT 'skill',
            system_prompt TEXT NOT NULL DEFAULT '',
            agent_id TEXT,
            model_id TEXT,
            internal_tools_enabled INTEGER NOT NULL DEFAULT 1,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
        // 内置 MCP 工具可见范围（projectIds / since / until / maxLimit 的上界裁剪）
        r#"
        CREATE TABLE IF NOT EXISTS memory_repo_sources (
            id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            config TEXT NOT NULL DEFAULT '{}',
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
        "#,
        // 独立记忆调度任务（与 Plan 体系解耦）
        r#"
        CREATE TABLE IF NOT EXISTS memory_jobs (
            id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            name TEXT NOT NULL,
            instruction TEXT NOT NULL,
            cron TEXT,
            next_run_at TEXT,
            schedule_status TEXT NOT NULL DEFAULT 'none',
            last_run_at TEXT,
            last_run_status TEXT,
            last_run_summary TEXT,
            agent_id TEXT,
            model_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
        // 任务运行记录（含产物摘要与变更文件）
        r#"
        CREATE TABLE IF NOT EXISTS memory_job_runs (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT,
            files_changed TEXT,
            started_at TEXT NOT NULL,
            finished_at TEXT NOT NULL
        )
        "#,
    ];
    for sql in table_sql {
        execute_raw(sql).await?;
    }

    // 增量列守卫（兼容旧库升级到新表）
    if !table_has_column("memory_repos", "internal_tools_enabled").await? {
        execute_raw("ALTER TABLE memory_repos ADD COLUMN internal_tools_enabled INTEGER NOT NULL DEFAULT 1").await?;
    }
    if !table_has_column("memory_repos", "enabled").await? {
        execute_raw("ALTER TABLE memory_repos ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1").await?;
    }
    if !table_has_column("memory_jobs", "agent_id").await? {
        execute_raw("ALTER TABLE memory_jobs ADD COLUMN agent_id TEXT").await?;
    }
    if !table_has_column("memory_jobs", "model_id").await? {
        execute_raw("ALTER TABLE memory_jobs ADD COLUMN model_id TEXT").await?;
    }

    let index_sql = [
        "CREATE INDEX IF NOT EXISTS idx_memory_repos_updated ON memory_repos(updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_memory_repo_sources_repo ON memory_repo_sources(repo_id)",
        "CREATE INDEX IF NOT EXISTS idx_memory_jobs_repo_status ON memory_jobs(repo_id, schedule_status)",
        "CREATE INDEX IF NOT EXISTS idx_memory_jobs_next_run ON memory_jobs(schedule_status, next_run_at)",
        "CREATE INDEX IF NOT EXISTS idx_memory_job_runs_job ON memory_job_runs(job_id, started_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_memory_job_runs_repo ON memory_job_runs(repo_id, started_at DESC)",
    ];
    for sql in index_sql {
        execute_raw(sql).await?;
    }

    Ok(())
}
