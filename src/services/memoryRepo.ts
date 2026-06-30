/**
 * 记忆库仓库 IPC 封装（薄服务层）。
 *
 * 全部走 Tauri `invoke`（匹配本仓库约定：store 直接 invoke，见 stores/memory.ts）。
 * 这里集中命令名，供 store/runner 复用，避免命令名散落。
 */
import { invoke } from '@tauri-apps/api/core'
import type {
  CreateMemoryJobInput,
  CreateMemoryRepoInput,
  MemoryJob,
  MemoryJobRun,
  MemoryRepo,
  MemoryRepoSource,
  MigrateLegacyLibrariesResult,
  RecordJobRunInput,
  UpdateMemoryJobInput,
  UpdateMemoryRepoInput,
  UpsertMemoryRepoSourceInput
} from '@/types/memoryRepo'

/** 列出全部记忆库仓库。 */
export function listMemoryRepos(): Promise<MemoryRepo[]> {
  return invoke<MemoryRepo[]>('list_memory_repos')
}

/** 获取单个仓库。 */
export function getMemoryRepo(id: string): Promise<MemoryRepo> {
  return invoke<MemoryRepo>('get_memory_repo', { id })
}

/** 创建仓库（DB 元数据 + 磁盘目录物化）。 */
export function createMemoryRepo(input: CreateMemoryRepoInput): Promise<MemoryRepo> {
  return invoke<MemoryRepo>('create_memory_repo', { input })
}

/** 更新仓库元数据。 */
export function updateMemoryRepo(id: string, input: UpdateMemoryRepoInput): Promise<MemoryRepo> {
  return invoke<MemoryRepo>('update_memory_repo', { id, input })
}

/** 删除仓库（同时移除磁盘目录）。 */
export function deleteMemoryRepo(id: string): Promise<void> {
  return invoke<void>('delete_memory_repo', { id })
}

/** 读取仓库内文件内容（复用通用 read_file_content）。 */
export function readRepoFile(filePath: string): Promise<string> {
  return invoke<string>('read_file_content', { filePath })
}

/** 写入仓库内文件内容（复用通用 write_file_content，已放宽允许根）。 */
export function writeRepoFile(filePath: string, content: string): Promise<void> {
  return invoke<void>('write_file_content', { filePath, content })
}

/** 列出仓库的内置工具可见范围配置。 */
export function listMemoryRepoSources(repoId: string): Promise<MemoryRepoSource[]> {
  return invoke<MemoryRepoSource[]>('list_memory_repo_sources', { repoId })
}

/** 新建或更新仓库的可见范围（按 repoId + sourceType 唯一）。 */
export function upsertMemoryRepoSource(input: UpsertMemoryRepoSourceInput): Promise<MemoryRepoSource> {
  return invoke<MemoryRepoSource>('upsert_memory_repo_source', { input })
}

/** 迁移旧 Markdown 记忆库为单文件仓库。 */
export function migrateLegacyMemoryLibraries(): Promise<MigrateLegacyLibrariesResult> {
  return invoke<MigrateLegacyLibrariesResult>('migrate_legacy_memory_libraries')
}

// ==================== 定时任务 ====================

/** 列出仓库下的全部定时任务。 */
export function listMemoryJobs(repoId: string): Promise<MemoryJob[]> {
  return invoke<MemoryJob[]>('list_memory_jobs', { repoId })
}

/** 创建定时任务。 */
export function createMemoryJob(input: CreateMemoryJobInput): Promise<MemoryJob> {
  return invoke<MemoryJob>('create_memory_job', { input })
}

/** 更新定时任务。 */
export function updateMemoryJob(id: string, input: UpdateMemoryJobInput): Promise<MemoryJob> {
  return invoke<MemoryJob>('update_memory_job', { id, input })
}

/** 删除定时任务。 */
export function deleteMemoryJob(id: string): Promise<void> {
  return invoke<void>('delete_memory_job', { id })
}

/** 立即触发任务（emit memory:job-trigger）。 */
export function triggerMemoryJob(id: string): Promise<void> {
  return invoke<void>('trigger_memory_job', { id })
}

/** 列出任务的运行历史。 */
export function listMemoryJobRuns(jobId: string): Promise<MemoryJobRun[]> {
  return invoke<MemoryJobRun[]>('list_memory_job_runs', { jobId })
}

/** 记录一次运行结果（执行完调用）。 */
export function recordMemoryJobRun(input: RecordJobRunInput): Promise<MemoryJobRun> {
  return invoke<MemoryJobRun>('record_memory_job_run', { input })
}

// ==================== 导出 ====================

/** 导出结果。 */
export interface ExportMemoryRepoResult {
  targetDir: string
  fileCount: number
}

/** 导出仓库为标准 Skills 包到指定目录（缺省 `~/.easy-agent/exported-skills/<slug>`）。 */
export function exportMemoryRepo(id: string, targetDir?: string): Promise<ExportMemoryRepoResult> {
  return invoke<ExportMemoryRepoResult>('export_memory_repo', { id, targetDir })
}
