# 当前任务
记忆库 2.0 重构：SQLite 单 Markdown 文档 → 磁盘标准 Skills 包仓库，ACP agent 自治进化（内置 MCP 工具查询内部历史 + 读电脑找外部数据），独立定时调度，导出为标准 Skills 包。

## ✅ 全部 4 个 Phase 已完成并验证

### Phase 1 — 仓库骨架 ✅
后端：新表 + `memory_repo.rs`(CRUD+迁移) + `skill_plugin.rs` 抽出 `scaffold_skill_package` + `write_file_content` 放宽允许根。
前端：types/services/store + memoryRepoPanel(overview/files) + MainLayout 挂载 + i18n。

### Phase 2 — 内置 MCP 工具 + 手动归纳 ✅
后端：`mcp_server/`(rmcp stdio server + query_conversation_history + 范围裁剪 + 6 测) + `main.rs/lib.rs` `--mcp-stdio` 自重入 + `types.rs/acp.rs` 注入内置工具。
前端：MemoryRepoRunner(复用 AgentExecutor) + Run/Sources Tab + 透传 internalToolsEnabled/repoId/modelId。

### Phase 3 — 独立调度 ✅
后端：`memory_job.rs`(CRUD+trigger+record+cron 重算, 5 测) + `scheduler/memory_scheduler.rs`(60s 轮询 emit memory:job-trigger) + lib.rs 启动/恢复。
前端：Jobs Tab(列表/增删改/立即运行/历史) + store 监听 memory:job-trigger 自动执行 + record 回写。

### Phase 4 — 导出与挂载闭环 ✅
后端：`export_memory_repo`(导出为标准 Skills 包, 跳过 memory.config.json/schedule.json, 1 测) + dev-dep tempfile。
前端：导出按钮+服务、`mountedMemoryPrompt` 重接(优先读 repo 主文件 SKILL.md/index.md, 回退旧库)、`buildMemoryPromptFromInputs` 通用化。
清理：删除旧 Markdown 组件(MemoryMarkdownEditor/RawMemoryModal/MemoryMergeModal/MemoryBatchDeleteModal/MemoryAuthoringDialog/memoryModePanel/memoryAuthoringDialog)。**保留** MemoryLibraryPicker(被 8 个 plan/solo 对话框引用，已 git restore)。

## 最终验收结果
- 前端 typecheck：✅ 过
- 前端 lint：✅ 0 错误（20 既存警告无新增）
- 前端 test：✅ 86 过（2 个 solo prompts 失败为既存，非本次引入）
- 后端 cargo check/clippy：✅ 我的文件零错误零警告（2 个 provider_profile 错误为既存）
- 后端 test：✅ 13 个新测试全过（5 cron + 6 query + 1 export + 1 无关）
- 注：`pnpm tauri build` 与 `pnpm tauri dev` 手测需用户在桌面环境执行（此处为 CLI 环境）

## 已知后续（未做，属计划内延后）
- composer FTS 指向仓库文件（v1 仍读旧库 chunks FTS，兼容期可用）
- MemoryLibraryPicker 列表接入仓库（当前仅旧库）
- 标准五段 cron（v1 仅 daily/weekly/一次性）
- 旧 memory_libraries 等表的最终 DROP（当前保留只读，迁移期安全）

## 上下文锚点
- 关键决策：① 统一为 Skills 体系 ② 独立记忆调度器 ③ 内部数据通过 MCP 工具让 AI 自查
- 后端约定：rusqlite + Result<T,String> + 裸 invoke + 扁平命令文件（AGENTS.md §5/§6 权威）
- ACP = Zed Agent Client Protocol；NewSessionRequest.mcp_servers 接收 stdio MCP
- rmcp 0.17：#[tool_router]+#[tool_handler] 声明式；serve_server(svc,(stdin,stdout)) + running.waiting()
- 调度闭环：scheduler 到期 emit memory:job-trigger → 前端 listen 执行 → record 回写重算 next_run_at
- 关键文件：commands/{memory_repo,memory_job}.rs、mcp_server/、scheduler/memory_scheduler.rs、services/memory/{MemoryRepoRunner,mountedMemoryPrompt,projectMemoryPrompt}.ts、components/memory/memoryRepoPanel/
