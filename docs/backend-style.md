# 后端开发风格指南（Tauri 2 + Rust）

> 本文档定义 `Tauri 2 + Rust` 后端的开发规范，包括命令结构、状态管理、数据库访问、多线程、错误处理、设计模式和注释标准。

---

## 1. 命令结构

### 1.1 文件布局

每个命令文件按以下顺序组织：

```rust
// 1. 导入
use serde::{Deserialize, Serialize};
use crate::commands::support::{open_db_connection, now_rfc3339};

// 2. 数据结构（Request / Response / 内部结构体）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan { ... }

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePlanInput { ... }

// 3. 私有辅助函数（SQL 常量、行映射、转换）
const PLAN_SELECT_SQL: &str = "SELECT id, project_id, ... FROM plans";
fn map_plan_row(row: &Row) -> Result<RustPlan> { ... }

// 4. 公开 Tauri 命令
#[tauri::command]
pub fn list_plans(project_id: String) -> Result<Vec<Plan>, String> { ... }
```

### 1.2 命令签名规范

```rust
// 简单查询：扁平参数
#[tauri::command]
pub fn get_plan(id: String) -> Result<Plan, String> { ... }

// 创建/更新：结构化输入
#[tauri::command]
pub fn create_plan(input: CreatePlanInput) -> Result<Plan, String> { ... }

// 需要运行时的异步操作：AppHandle 作为第一个参数
#[tauri::command]
pub async fn execute_task(app: AppHandle, task_id: String) -> Result<(), String> { ... }

// 需要前端事件推送：同时接收 AppHandle 和 WebviewWindow
#[tauri::command]
pub async fn stream_conversation(
    app: AppHandle,
    window: WebviewWindow,
    request: ConversationRequest,
) -> Result<(), String> { ... }
```

### 1.3 命令注册

所有命令在 `src-tauri/src/lib.rs` 中统一注册：

```rust
.invoke_handler(tauri::generate_handler![
    commands::plan::list_plans,
    commands::plan::create_plan,
    commands::task::list_tasks,
    // ...
])
```

### 1.4 子模块组织

复杂子系统使用目录 + `mod.rs`：

```
src-tauri/src/commands/conversation/
  mod.rs              # 模块入口，re-export 公开命令
  strategies/         # 执行策略子模块
    claude_cli.rs
    codex_cli.rs
    mod.rs
```

---

## 2. 数据类型与序列化

### 2.1 命名策略

项目存在两种命名策略，**新代码统一使用 `#[serde(rename_all = "camelCase")]`**：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub plan_id: String,
    pub status: String,
    pub expert_id: Option<String>,
}
```

已有的 `snake_case` 模块保持不变，但新增结构体必须使用 `camelCase` 输出，减少前端转换负担。

### 2.2 部分更新类型

使用 `UpdateField<T>` 枚举区分 Value / Null / Missing：

```rust
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(untagged)]
pub enum UpdateField<T> {
    Value(T),
    Null,
    #[default]
    Missing,
}
```

配套 `UpdateSqlBuilder` 动态构建 SET 子句：

```rust
let mut builder = UpdateSqlBuilder::new();
if let UpdateField::Value(v) = &input.name { builder.push("name", v); }
if let UpdateField::Value(v) = &input.status { builder.push("status", v); }
```

---

## 3. 数据库访问

### 3.1 连接获取

```rust
// 普通读写
let conn = open_db_connection().map_err(|e| e.to_string())?;

// 需要外键约束的写操作
let mut conn = open_db_connection_with_foreign_keys().map_err(|e| e.to_string())?;
```

每次命令调用创建新连接（连接池由 SQLite WAL 模式支撑），**禁止缓存 Connection**。

### 3.2 读操作模板

```rust
pub fn list_plans(project_id: String) -> Result<Vec<Plan>, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let sql = format!("{PLAN_SELECT_SQL} WHERE project_id = ?1 ORDER BY updated_at DESC");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([&project_id], |row| map_plan_row(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(transform_plan).collect())
}
```

### 3.3 写操作模板（事务）

```rust
pub fn create_plan(input: CreatePlanInput) -> Result<Plan, String> {
    let mut conn = open_db_connection_with_foreign_keys().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO plans (id, project_id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, input.project_id, input.title, &now, &now],
    ).map_err(|e| e.to_string())?;

    // 关联数据操作...
    replace_plan_tags(&tx, &id, &input.tag_ids)?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Plan { id, project_id: input.project_id, title: input.title, /* ... */ })
}
```

### 3.4 SQL 规范

- 常用 SELECT 语句定义为模块级常量 `const XXX_SELECT_SQL: &str = ...`
- 参数使用位置占位符 `?1, ?2`（rusqlite 风格）
- 批量参数使用 `rusqlite::params![]` 宏
- 禁止字符串拼接用户输入构建 SQL，必须使用参数化查询

---

## 4. 错误处理

### 4.1 统一错误传播

所有 Tauri 命令返回 `Result<T, String>`，通过 `.map_err(|e| e.to_string())?` 传播：

```rust
let conn = open_db_connection().map_err(|e| e.to_string())?;
let result = conn.execute(sql, params).map_err(|e| e.to_string())?;
```

**禁止** 使用 `unwrap()` / `expect()` 在命令代码中。仅在测试中允许。

### 4.2 错误上下文

对用户可见的错误，附加操作上下文：

```rust
.map_err(|e| format!("创建计划失败: {}", e))?
```

### 4.3 前端错误分类

前端通过 `src/utils/api.ts` 的 `classifyError()` 将后端错误字符串分类为 `ErrorType` 枚举（CLI / Auth / Network / MCP / Database）。后端应确保错误消息包含足够的关键词供分类。

---

## 5. 状态管理

### 5.1 全局静态状态

使用 `Lazy<Mutex<T>>` 或 `Lazy<RwLock<T>>` 管理进程级状态：

```rust
use std::sync::LazyLock as Lazy;
use std::sync::{Mutex, RwLock};

static EXECUTION_REGISTRY: Lazy<RwLock<HashMap<String, ExecutionHandle>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));
```

### 5.2 Tauri Managed State

仅在需要跨命令共享且有生命周期依赖的场景使用：

```rust
// 注册
builder.manage(UnattendedRuntimeState::default())

// 使用
#[tauri::command]
pub fn get_runtime_status(state: State<'_, UnattendedRuntimeState>) -> Result<RuntimeStatus, String> { ... }
```

### 5.3 状态访问原则

- 读多写少：`RwLock`，读用 `read()`，写用 `write()`
- 写多或简单状态：`Mutex`
- **禁止在持有锁时执行异步操作或长时间阻塞**
- 锁的作用域必须最小化：

```rust
{
    let registry = EXECUTION_REGISTRY.read().map_err(|e| e.to_string())?;
    let handle = registry.get(&task_id).cloned();
} // 锁在此释放

if let Some(handle) = handle {
    handle.execute().await?;
}
```

---

## 6. 多线程与异步

### 6.1 同步 vs 异步命令

| 场景 | 命令类型 | 说明 |
|------|---------|------|
| 数据库 CRUD | `fn`（同步） | SQLite 操作是同步的，不需要 async |
| CLI/SDK 执行 | `async fn` | 长时间运行，需要 tokio runtime |
| 文件 I/O（大量） | `async fn` + `tokio::task::spawn_blocking` | 避免阻塞 tokio 线程 |
| 后台定时任务 | `tauri::async_runtime::spawn` | 不阻塞命令返回 |

### 6.2 后台任务启动

在 `lib.rs` 的 `setup` 回调中启动：

```rust
tauri::Builder::default()
    .setup(|app| {
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            scheduler::restore_scheduled_plans(&app_handle).await;
            scheduler::start_scheduler(app_handle);
        });
        Ok(())
    })
```

### 6.3 异步任务中的事件推送

```rust
app_handle.emit("task-progress", ProgressPayload {
    task_id: id.clone(),
    percent: 50,
}).map_err(|e| e.to_string())?;
```

### 6.4 线程安全要求

- 跨线程共享数据必须使用 `Arc<T>` + `Mutex` / `RwLock`
- 发送到异步任务的数据必须实现 `Send + 'static`
- 禁止在异步上下文中执行同步阻塞操作（如 SQLite 查询），除非使用 `spawn_blocking`

---

## 7. 设计模式

### 7.1 策略模式

不同 CLI / SDK 的执行逻辑使用 trait 策略分发：

```rust
#[async_trait]
pub trait ExecutionStrategy: Send + Sync {
    async fn execute(&self, request: ExecutionRequest) -> Result<ExecutionOutput, String>;
    fn name(&self) -> &str;
}

pub struct ClaudeCliStrategy;
pub struct CodexCliStrategy;

pub fn get_strategy(runtime: &str) -> Box<dyn ExecutionStrategy> {
    match runtime {
        "claude" => Box::new(ClaudeCliStrategy),
        "codex" => Box::new(CodexCliStrategy),
        _ => return Err(format!("Unknown runtime: {}", runtime)),
    }
}
```

### 7.2 命令模式

安装、回滚、升级等流程使用服务对象封装：

```rust
pub struct MarketplaceInstaller {
    source: MarketSource,
    target_dir: PathBuf,
}

impl MarketplaceInstaller {
    pub async fn install(&self) -> Result<InstallResult, String> { ... }
    pub async fn rollback(&self) -> Result<(), String> { ... }
    pub async fn upgrade(&self) -> Result<UpgradeResult, String> { ... }
}
```

### 7.3 枚举驱动状态机

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlanStatus {
    Draft,
    Active,
    Completed,
    Archived,
}

impl PlanStatus {
    pub fn can_transition_to(&self, target: &PlanStatus) -> bool {
        matches!(
            (self, target),
            (PlanStatus::Draft, PlanStatus::Active)
            | (PlanStatus::Active, PlanStatus::Completed)
            | (PlanStatus::Completed, PlanStatus::Archived)
        )
    }
}
```

### 7.4 Builder 模式

SQL 更新使用 `UpdateSqlBuilder`，配置构建使用 Builder：

```rust
let mut builder = UpdateSqlBuilder::new();
builder.push("title", &input.title);
builder.push("status", &input.status);

if builder.is_empty() {
    return Ok(get_plan(id)?);
}

let sql = builder.build("UPDATE plans SET ", "WHERE id = ?1");
conn.execute(&sql, params)?;
```

---

## 8. 注释标准

### 8.1 文档注释

所有 `pub` 级别结构体、枚举、函数、Tauri command 必须使用 `///` 文档注释：

```rust
/// 创建新计划并关联记忆库
///
/// - 参数 `input`: 计划创建参数（标题、项目 ID、关联记忆库等）
/// - 返回: 创建成功的计划对象
/// - 副作用: 插入 plans 表和关联表，更新 projects.updated_at
/// - 事务: 整个操作在事务中执行，失败自动回滚
#[tauri::command]
pub fn create_plan(input: CreatePlanInput) -> Result<Plan, String> { ... }
```

### 8.2 行注释

私有复杂逻辑使用 `//` 注释，说明"为什么"：

```rust
// SQLite WAL 模式下无需显式 BEGIN，直接操作即可
// 但外键约束需要在每个连接上单独启用
conn.execute("PRAGMA foreign_keys = ON", [])?;
```

### 8.3 危险操作注释

涉及数据库写入、文件写入、进程调用、网络请求、调度恢复的代码必须标注边界和风险：

```rust
/// ⚠️ 危险操作：直接删除数据库记录
/// 该操作不可逆，调用方必须在前端做二次确认
pub fn delete_plan(id: String) -> Result<(), String> { ... }
```

### 8.4 模块级注释

每个命令文件开头应有简要模块说明：

```rust
//! 计划管理命令模块
//!
//! 提供计划的 CRUD、状态管理、调度触发等 Tauri IPC 命令。
//! 所有命令均通过 SQLite 持久化，使用 support 模块提供的数据库连接工具。
```

---

## 9. 平台适配

### 9.1 平台条件编译

```rust
#[cfg(target_os = "macos")]
fn register_global_shortcut() -> Result<(), String> { ... }

#[cfg(target_os = "windows")]
fn register_global_shortcut() -> Result<(), String> { ... }
```

### 9.2 平台差异封装

平台差异逻辑必须在独立文件中封装，禁止在命令主体中出现 `#[cfg]` 散落：

```
commands/
  mini_panel.rs                    # 公共逻辑
  mini_panel_macos_shortcut.rs     # macOS 快捷键
  mini_panel_windows_shortcut.rs   # Windows 快捷键
```

---

## 10. 性能规范

### 10.1 数据库

- 查询结果使用 `LIMIT` 限制返回行数，禁止无限制 `SELECT *`
- 批量操作使用事务
- 高频查询字段建立索引
- 使用 `EXPLAIN QUERY PLAN` 验证关键查询

### 10.2 内存

- 大数据集使用 `query_map` 流式处理，禁止一次性加载到内存
- 字符串优先使用 `String`，避免不必要的 `clone()`
- 长生命周期数据使用 `Arc` 共享

### 10.3 并发

- 独立的异步任务使用 `tokio::spawn` 并行
- 同步数据库操作不要放在 async 上下文中
- 事件推送使用非阻塞 `emit()` 而非 `emit_to()` 轮询
