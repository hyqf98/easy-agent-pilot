/**
 * taskExecutionShared.ts
 *
 * 职责：集中存放 useTaskExecutionStore 的「纯模块级」代码，与 taskSplitShared.ts /
 * soloExecutionShared.ts / unattendedShared.ts / skillConfigShared.ts 范式对齐。
 *   - 接口 / 类型定义（PendingLogBuffer）
 *   - 模块级常量（flush 阈值、活跃 / 终态状态集合、停止错误标记、自动重试延迟）
 *   - 纯函数 helper（执行状态 / 队列 / 日志条目工厂、Rust 日志映射、token 上下文占用计算、
 *     CLI session provider 归一化、工具调用收尾、缺省工具调用 id 生成、sleep、
 *     挂载记忆库 id 收集、表单请求解析、缺失记录错误判定）
 *
 * 主 store（taskExecution.ts）只负责响应式状态与生命周期，所有无副作用、可复用的逻辑沉淀于此，
 * 通过 `import { ... } from './taskExecutionShared'` 引用。
 *
 * 注意：流式运行期的可变单例状态（pendingLogBuffers / 各种 timer / let 计数器等）需被 store
 * 内部函数反复「赋值」重置，ES Module 导入绑定无法被重新赋值，因此这些仍保留在 taskExecution.ts 内。
 */
import type { TaskStatus } from '@/types/plan'
import type {
  CreateExecutionLogInput,
  ExecutionLogEntry,
  ExecutionLogType,
  ExecutionQueue,
  RustExecutionLog,
  TaskExecutionState
} from '@/types/taskExecution'
import type { ToolCall } from '@/stores/message'
import type { AIFormRequest } from '@/types/plan'
import type { CliSessionProvider } from '@/services/usage/cliSessionUsageSnapshot'
import { getErrorMessage } from '@/utils/api'
import { extractFirstFormRequest } from '@/utils/structuredContent'

export interface PendingLogBuffer {
  content: string
  thinking: string
  lastFlushTime: number
  flushTimer: ReturnType<typeof setTimeout> | null
}

export const FLUSH_INTERVAL_MS = 2000
export const FLUSH_THRESHOLD_CHARS = 500
export const ACTIVE_EXECUTION_STATUSES = new Set<TaskExecutionState['status']>(['running', 'queued'])
export const TERMINAL_TASK_STATUSES = new Set<TaskStatus>(['completed', 'failed', 'cancelled'])

export function createExecutionState(taskId: string): TaskExecutionState {
  return {
    taskId,
    executionRunId: null,
    status: 'idle',
    sessionId: null,
    startedAt: null,
    completedAt: null,
    logs: [],
    accumulatedContent: '',
    accumulatedThinking: '',
    toolCalls: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      contextWindowOccupancy: undefined,
      resetCount: 0,
      lastUpdatedAt: null
    }
  }
}

export function createExecutionQueue(planId: string): ExecutionQueue {
  return {
    planId,
    currentTaskId: null,
    pendingTaskIds: [],
    isPaused: false,
    lastInterruptedTaskId: null
  }
}

export function createPendingLogBuffer(): PendingLogBuffer {
  return {
    content: '',
    thinking: '',
    lastFlushTime: Date.now(),
    flushTimer: null
  }
}

export function createExecutionLogEntry(input: CreateExecutionLogInput): ExecutionLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    taskId: input.taskId,
    type: input.type,
    content: input.content,
    timestamp: new Date().toISOString(),
    metadata: input.metadata
  }
}

export function createStreamLogEntry(
  taskId: string,
  type: Extract<ExecutionLogType, 'content' | 'thinking'>,
  content: string
): ExecutionLogEntry {
  return createExecutionLogEntry({
    taskId,
    type,
    content
  })
}

export function parseExecutionLogMetadata(metadata: string | null): ExecutionLogEntry['metadata'] {
  if (!metadata) return undefined

  try {
    return JSON.parse(metadata) as ExecutionLogEntry['metadata']
  } catch {
    return undefined
  }
}

function normalizeLegacyExecutionLogContent(content: string): string {
  if (content === '???????') {
    return '任务已停止'
  }

  if (content.startsWith('???????:')) {
    return content.replace(/^(\?){7}:/, '用户已提交输入:')
  }

  if (content.startsWith('??????:')) {
    return content.replace(/^(\?){6}:/, '开始执行任务:')
  }

  return content
}

export function mapRustExecutionLog(log: RustExecutionLog): ExecutionLogEntry {
  return {
    id: log.id,
    taskId: log.task_id,
    type: log.type as ExecutionLogType,
    content: normalizeLegacyExecutionLogContent(log.content),
    timestamp: log.created_at,
    metadata: parseExecutionLogMetadata(log.metadata)
  }
}

// —— 任务执行控制常量 ——
const TASK_EXECUTION_STOPPED_ERROR = '__TASK_EXECUTION_STOPPED__'
const TASK_AUTO_RETRY_DELAY_MS = 10_000
const CLI_FAILURE_RETRY_DELAY_MS = 10_000

/** 将进行中的工具调用统一收尾为 success */
function finalizeRunningToolCalls(toolCalls: ToolCall[]): void {
  for (const toolCall of toolCalls) {
    if (toolCall.status === 'running') {
      toolCall.status = 'success'
    }
  }
}

/** 把字符串 provider 归一化为 CliSessionProvider 联合类型 */
function normalizeCliSessionProvider(provider?: string | null): CliSessionProvider | null {
  const normalizedProvider = provider?.trim().toLowerCase()
  if (normalizedProvider === 'claude') return 'claude'
  if (normalizedProvider === 'codex') return 'codex'
  if (normalizedProvider === 'opencode') return 'opencode'
  return null
}

/** 根据 provider 与 token 计数计算上下文窗口占用（codex 优先用 raw token） */
function resolveTaskContextWindowOccupancy(options: {
  provider?: string | null
  inputTokens?: number
  outputTokens?: number
  rawInputTokens?: number
  rawOutputTokens?: number
}): number | undefined {
  const provider = options.provider?.trim().toLowerCase() ?? ''

  if (provider === 'codex') {
    const rawInputTokens = typeof options.rawInputTokens === 'number' ? Math.max(0, options.rawInputTokens) : undefined
    const rawOutputTokens = typeof options.rawOutputTokens === 'number' ? Math.max(0, options.rawOutputTokens) : undefined
    if (rawInputTokens !== undefined || rawOutputTokens !== undefined) {
      return (rawInputTokens ?? 0) + (rawOutputTokens ?? 0)
    }
  }

  const inputTokens = typeof options.inputTokens === 'number' ? Math.max(0, options.inputTokens) : undefined
  const outputTokens = typeof options.outputTokens === 'number' ? Math.max(0, options.outputTokens) : undefined
  if (inputTokens !== undefined || outputTokens !== undefined) {
    return (inputTokens ?? 0) + (outputTokens ?? 0)
  }

  const rawInputTokens = typeof options.rawInputTokens === 'number' ? Math.max(0, options.rawInputTokens) : undefined
  const rawOutputTokens = typeof options.rawOutputTokens === 'number' ? Math.max(0, options.rawOutputTokens) : undefined
  if (rawInputTokens !== undefined || rawOutputTokens !== undefined) {
    return (rawInputTokens ?? 0) + (rawOutputTokens ?? 0)
  }

  return undefined
}

/** 判定错误是否为数据库「查询无记录」类型 */
function isMissingRecordError(error: unknown): boolean {
  return /query returned no rows/i.test(getErrorMessage(error))
}

/** 生成兜底的工具调用 id */
function createFallbackToolCallId(taskId: string): string {
  return `tool-${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** 合并去重项目 / 计划 / 任务维度的挂载记忆库 id */
function collectMountedMemoryLibraryIds(
  projectIds: string[] | undefined,
  planIds: string[] | undefined,
  taskIds: string[] | undefined
): string[] {
  return Array.from(
    new Set(
      [...(projectIds ?? []), ...(planIds ?? []), ...(taskIds ?? [])]
        .map((id) => id.trim())
        .filter(Boolean)
    )
  )
}

/** 解析 AI 输出中的表单请求 */
function parseFormRequest(content: string): AIFormRequest | null {
  return extractFirstFormRequest(content)
}

export {
  // —— 任务执行控制常量 ——
  TASK_EXECUTION_STOPPED_ERROR,
  TASK_AUTO_RETRY_DELAY_MS,
  CLI_FAILURE_RETRY_DELAY_MS,
  // —— 纯函数 helper ——
  finalizeRunningToolCalls,
  normalizeCliSessionProvider,
  resolveTaskContextWindowOccupancy,
  isMissingRecordError,
  createFallbackToolCallId,
  sleep,
  collectMountedMemoryLibraryIds,
  parseFormRequest
}
