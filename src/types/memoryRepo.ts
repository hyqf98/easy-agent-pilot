/**
 * 记忆库仓库（Memory Repo）类型定义。
 *
 * 记忆库 2.0：每个仓库是磁盘上的一个目录（标准 Skills 包或单文件 index.md），
 * DB 仅存元数据。与旧 MemoryLibrary（SQLite Markdown 文档）并存，新功能基于仓库。
 */

/** 记忆库仓库格式。 */
export type MemoryRepoFormat = 'skill' | 'single'

/** 记忆库仓库（磁盘目录的元数据索引）。 */
export interface MemoryRepo {
  id: string
  name: string
  slug: string
  description?: string
  /** 仓库目录的绝对路径。 */
  repoPath: string
  format: MemoryRepoFormat
  /** 仓库关联的系统提示词（运行归纳/任务时注入）。 */
  systemPrompt: string
  agentId?: string
  modelId?: string
  /** 是否向该仓库的运行注入内置 MCP 工具（查询内部历史）。 */
  internalToolsEnabled: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** 内置 MCP 工具可见范围（上界裁剪配置）。 */
export interface MemoryRepoSource {
  id: string
  repoId: string
  /** 源类型，当前仅 `conversation_history`。 */
  sourceType: string
  /** JSON 字符串：`{ projectIds?, since?, until?, maxLimit? }`。 */
  config: string
  enabled: boolean
  createdAt: string
}

/** 内置工具可见范围的解析后配置（工具范围上界）。 */
export interface MemoryRepoSourceConfig {
  projectIds?: string[]
  since?: string
  until?: string
  maxLimit?: number
}

export interface CreateSkillReferenceInput {
  title: string
  summary?: string
  content: string
}

export interface CreateMemoryRepoInput {
  name: string
  description?: string
  format?: MemoryRepoFormat
  systemPrompt?: string
  agentId?: string
  modelId?: string
  /** 仅 skill 格式有效。 */
  references?: CreateSkillReferenceInput[]
}

export interface UpdateMemoryRepoInput {
  name?: string
  description?: string
  systemPrompt?: string
  agentId?: string
  modelId?: string
  internalToolsEnabled?: boolean
  enabled?: boolean
}

export interface UpsertMemoryRepoSourceInput {
  repoId: string
  sourceType: string
  config?: string
  enabled?: boolean
}

/** 旧 Markdown 记忆库迁移为仓库的结果。 */
export interface MigrateLegacyLibrariesResult {
  migrated: number
  skipped: number
  items: MigratedLibraryItem[]
}

export interface MigratedLibraryItem {
  libraryId: string
  repoId: string
  name: string
}

/** 解析内置工具可见范围的 config JSON（容错）。 */
export function parseMemoryRepoSourceConfig(config: string): MemoryRepoSourceConfig {
  if (!config) return {}
  try {
    return JSON.parse(config) as MemoryRepoSourceConfig
  } catch {
    return {}
  }
}

// ==================== 定时任务（Memory Job）====================

/** 任务调度状态。 */
export type MemoryJobStatus = 'none' | 'scheduled' | 'running' | 'triggered' | 'done' | 'error'

/** 记忆库定时任务。 */
export interface MemoryJob {
  id: string
  repoId: string
  name: string
  instruction: string
  /** v1：`daily:HH:MM` / `weekly:W-HH:MM`（W=0..6，周一=0），或留空（一次性 nextRunAt）。 */
  cron?: string
  /** 下次执行时间（ISO-8601）。 */
  nextRunAt?: string
  scheduleStatus: MemoryJobStatus
  lastRunAt?: string
  lastRunStatus?: string
  lastRunSummary?: string
  agentId?: string
  modelId?: string
  createdAt: string
  updatedAt: string
}

/** 任务运行记录。 */
export interface MemoryJobRun {
  id: string
  jobId: string
  repoId: string
  status: string
  summary?: string
  filesChanged?: string
  startedAt: string
  finishedAt: string
}

export interface CreateMemoryJobInput {
  repoId: string
  name: string
  instruction: string
  cron?: string
  nextRunAt?: string
  agentId?: string
  modelId?: string
}

export interface UpdateMemoryJobInput {
  name?: string
  instruction?: string
  cron?: string
  nextRunAt?: string
  scheduleStatus?: MemoryJobStatus
  agentId?: string
  modelId?: string
}

export interface RecordJobRunInput {
  jobId: string
  status: 'success' | 'error'
  summary?: string
  filesChanged?: string[]
}
