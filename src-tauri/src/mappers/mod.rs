//! RBatis mapper 层。
//!
//! 每个 mapper 通过 `#[html_sql("sql/<module>.html")]` 绑定 `src-tauri/sql/` 下的
//! SQL 模板（XHTML 格式，语法与 MyBatis XML 一致）。模块按业务拆分，与
//! `commands/` 下的命令文件一一对应。
//!
//! 阶段 0：仅含示例 mapper（不接业务命令），验证 rbatis 宏 + .html 加载链路。
//! 阶段 1+：按迁移路线逐步添加各业务 mapper。

pub mod agent;
pub mod agent_cli_usage;
pub mod agent_config;
pub mod agent_plan;
pub mod app_state;
pub mod example;
pub mod file_change;
pub mod memory;
pub mod memory_repo;
pub mod memory_job;
pub mod mini_panel;
pub mod plan;
pub mod project_access;
pub mod provider_profile;
pub mod session;
pub mod settings;
pub mod sub_agent;
pub mod task;
pub mod task_execution;
pub mod window;
pub mod cli;
pub mod solo;
pub mod mcp;
pub mod project;
pub mod plan_split;
pub mod unattended;
pub mod mcp_server;
pub mod scheduler;
