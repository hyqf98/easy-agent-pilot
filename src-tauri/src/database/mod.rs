use anyhow::Result;
use rusqlite::Connection;

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
        agent_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);

    -- 消息表
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        tokens INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

    -- 会话头脑风暴状态表
    CREATE TABLE IF NOT EXISTS session_brainstorm_state (
        session_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'normal',
        context_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_session_brainstorm_state_mode ON session_brainstorm_state(mode);

    -- 会话头脑风暴 Todo 表
    CREATE TABLE IF NOT EXISTS session_brainstorm_todos (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        task_order INTEGER NOT NULL DEFAULT 0,
        source_message_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_session_brainstorm_todos_session ON session_brainstorm_todos(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_brainstorm_todos_status ON session_brainstorm_todos(status);

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
        PRIMARY KEY (session_id, mcp_server_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
    );

    -- 主题配置表
    CREATE TABLE IF NOT EXISTS themes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        colors_light TEXT NOT NULL,
        colors_dark TEXT NOT NULL,
        created_at TEXT NOT NULL
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

    -- 市场源配置表
    CREATE TABLE IF NOT EXISTS market_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'github',
        url_or_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_market_sources_name ON market_sources(name);

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
        updated_at TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
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
        updated_at TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
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
        updated_at TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
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
        split_agent_id TEXT,
        split_model_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        agent_team TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_id);
    CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);

    -- 任务表 (Plan Mode)
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        parent_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        assignee TEXT,
        session_id TEXT,
        progress_file TEXT,
        dependencies TEXT,
        task_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

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
        updated_at TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
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
        access_count INTEGER DEFAULT 1,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_access_log_time ON project_access_log(last_accessed_at DESC);

    -- 窗口会话锁定表（防止同会话多窗口）
    CREATE TABLE IF NOT EXISTS window_session_locks (
        session_id TEXT PRIMARY KEY,
        window_label TEXT NOT NULL,
        locked_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
"#;

/// 初始化数据库
pub fn init_database() -> Result<()> {
    // 获取持久化目录
    let persistence_dir = crate::commands::get_persistence_dir_path()?;
    let db_path = persistence_dir.join("data").join("easy-agent.db");

    // 确保目录存在
    std::fs::create_dir_all(db_path.parent().unwrap())?;

    println!("Database path: {:?}", db_path);

    // 打开数据库连接
    let conn = Connection::open(&db_path)?;

    // 启用外键约束（SQLite 默认不启用）
    conn.execute("PRAGMA foreign_keys = ON", [])?;

    // 执行初始化 SQL
    conn.execute_batch(INIT_SQL)?;

    // 执行迁移（忽略列已存在的错误）
    // SQLite 不支持 IF NOT EXISTS 用于 ALTER TABLE ADD COLUMN
    // 所以我们需要单独执行每条语句并忽略错误
    let migrations = [
        "ALTER TABLE mcp_servers ADD COLUMN test_status TEXT",
        "ALTER TABLE mcp_servers ADD COLUMN test_message TEXT",
        "ALTER TABLE mcp_servers ADD COLUMN tool_count INTEGER",
        "ALTER TABLE mcp_servers ADD COLUMN tested_at TEXT",
        "ALTER TABLE mcp_servers ADD COLUMN server_type TEXT DEFAULT 'stdio'",
        "ALTER TABLE mcp_servers ADD COLUMN url TEXT",
        "ALTER TABLE mcp_servers ADD COLUMN headers TEXT",
        // sessions 表添加 pinned 和 last_message 字段
        "ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN last_message TEXT",
        "ALTER TABLE sessions ADD COLUMN error_message TEXT",
    ];

    for migration in migrations {
        // 忽略"列已存在"错误
        if let Err(e) = conn.execute(migration, []) {
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
        if let Err(e) = conn.execute(migration, []) {
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
    ];

    for migration in unified_agent_migrations {
        if let Err(e) = conn.execute(migration, []) {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Unified agent migration warning: {}", e);
            }
        }
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
        if let Err(e) = conn.execute(migration, []) {
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
        if let Err(e) = conn.execute(migration, []) {
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
    if let Err(e) = conn.execute(history_table_sql, []) {
        println!("MCP install history table migration warning: {}", e);
    }

    // 创建索引
    let history_index_migrations = [
        "CREATE INDEX IF NOT EXISTS idx_mcp_install_history_created ON mcp_install_history(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_mcp_install_history_mcp ON mcp_install_history(mcp_name)",
    ];
    for migration in history_index_migrations {
        if let Err(e) = conn.execute(migration, []) {
            println!("MCP install history index migration warning: {}", e);
        }
    }

    // messages 表添加 error_message 字段（用于存储发送失败的原因）
    let message_migrations = [
        "ALTER TABLE messages ADD COLUMN error_message TEXT",
        "ALTER TABLE messages ADD COLUMN tool_calls TEXT", // JSON string for tool calls
        "ALTER TABLE messages ADD COLUMN thinking TEXT",   // 思考内容（扩展思维模型）
    ];

    for migration in message_migrations {
        if let Err(e) = conn.execute(migration, []) {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Messages migration warning: {}", e);
            }
        }
    }

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
            updated_at TEXT NOT NULL,
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
        )
    "#;
    if let Err(e) = conn.execute(agent_models_table_sql, []) {
        println!("Agent models table migration warning: {}", e);
    }

    // 创建索引
    let agent_models_index_sql =
        "CREATE INDEX IF NOT EXISTS idx_agent_models_agent ON agent_models(agent_id)";
    if let Err(e) = conn.execute(agent_models_index_sql, []) {
        println!("Agent models index migration warning: {}", e);
    }

    // agent_models 表添加 context_window 字段
    let agent_models_migrations =
        ["ALTER TABLE agent_models ADD COLUMN context_window INTEGER DEFAULT 128000"];

    for migration in agent_models_migrations {
        if let Err(e) = conn.execute(migration, []) {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Agent models migration warning: {}", e);
            }
        }
    }

    // plans 表添加新字段（任务拆分颗粒度、最大重试次数、执行状态、当前任务ID）
    let plans_migrations = [
        "ALTER TABLE plans ADD COLUMN granularity INTEGER DEFAULT 20",
        "ALTER TABLE plans ADD COLUMN max_retry_count INTEGER DEFAULT 3",
        "ALTER TABLE plans ADD COLUMN execution_status TEXT DEFAULT 'idle'",
        "ALTER TABLE plans ADD COLUMN current_task_id TEXT",
        "ALTER TABLE plans ADD COLUMN split_agent_id TEXT",
        "ALTER TABLE plans ADD COLUMN split_model_id TEXT",
    ];

    for migration in plans_migrations {
        if let Err(e) = conn.execute(migration, []) {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Plans migration warning: {}", e);
            }
        }
    }

    // tasks 表添加新字段（重试计数、最大重试、错误信息、实现步骤、测试步骤、验收标准）
    let tasks_migrations = [
        "ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 3",
        "ALTER TABLE tasks ADD COLUMN error_message TEXT",
        "ALTER TABLE tasks ADD COLUMN implementation_steps TEXT",
        "ALTER TABLE tasks ADD COLUMN test_steps TEXT",
        "ALTER TABLE tasks ADD COLUMN acceptance_criteria TEXT",
    ];

    for migration in tasks_migrations {
        if let Err(e) = conn.execute(migration, []) {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("Tasks migration warning: {}", e);
            }
        }
    }

    println!("Database initialized successfully");
    Ok(())
}
