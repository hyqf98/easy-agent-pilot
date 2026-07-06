/**
 * taskSplitShared.ts
 *
 * 职责：集中存放 useTaskSplitStore 的「纯模块级」代码，与 taskExecutionShared.ts 范式对齐。
 *   - 接口 / 类型定义（TaskSplitContext、RustPlanSplitLogRecord、PlanSplitRuntimeMetrics 等）
 *   - 模块级常量（流式防护阈值、自动重试参数、PLAN_SPLIT_STREAMING_LIMITS 等）
 *   - 纯函数 helper（日志解析、结构化恢复、执行请求构造、prompt 装配、性能度量等）
 *
 * 主 store（taskSplit.ts）只负责响应式状态与生命周期，所有无副作用、可复用的逻辑沉淀于此，
 * 通过 `import { ... } from './taskSplitShared'` 引用。
 *
 * 注意：流式运行期的可变单例状态（streamBuffer / streamFlushTimer / watchdog 定时器 /
 * anomalousContentStreak 等）需被 store 内部函数反复「赋值」重置，且与 store 的响应式状态强耦合，
 * ES Module 导入绑定无法被重新赋值，因此这些 let 变量仍保留在 taskSplit.ts 内，未迁入本文件。
 */
import type {
  AITaskItem,
  DynamicFormSchema,
  PlanSplitLogRecord,
  PlanSplitSessionRecord,
  PlanSplitStreamPayload,
  SplitMessage,
  TaskCountMode,
  TaskListOptimizeConfig,
  TaskSplitRefinementMode,
  TaskResplitConfig
} from '@/types/plan'
import type { MessageAttachment } from './message'
import type { AgentConfig } from './agent'
import type { ExecutionRequest, MessageInput } from '@/services/conversation/strategies/types'
import { useSubAgentStore } from './subAgent'
import { logger } from '@/utils/logger'
import { normalizeFormSchemasForRendering } from '@/utils/formSchema'
import {
  extractFirstFormRequestFromContents,
  extractTaskSplitResultFromContents
} from '@/utils/structuredContent'
import {
  buildSubAgentCatalogPrompt,
  buildSubAgentSystemPrompt,
  resolveSubAgentById
} from '@/services/subAgent/runtime'
import {
  buildPlanSplitJsonSchema,
  buildPlanSplitSystemPrompt
} from '@/services/plan'
import { buildAgentExecutionRequest } from '@/services/conversation/runtimeProfiles'

interface TaskSplitContext {
  planId: string
  planName: string
  planDescription?: string
  granularity: number
  expertId?: string
  agentId: string
  modelId: string
  taskCountMode?: TaskCountMode
  workingDirectory?: string
}

interface TaskSplitRefinementState {
  mode: TaskSplitRefinementMode
  originalTasks: AITaskItem[]
  targetIndex: number | null
  config: TaskResplitConfig | TaskListOptimizeConfig
}

interface ContinueSessionWithInstructionOptions {
  attachments?: MessageAttachment[]
  displayContent?: string
}

interface SubmittedFormSnapshot {
  formId: string
  schema: DynamicFormSchema
  promptText?: string
  values: Record<string, unknown>
  submittedAt: string
}

interface PlanSplitRuntimeMetrics {
  startedAt: number
  firstEventAt?: number
  firstRenderableAt?: number
  doneAt?: number
}

const STALE_PLAN_SPLIT_SESSION_TIMEOUT_MS = 2_000
const PLAN_SPLIT_AUTO_RETRY_DELAY_MS = 10_000
const PLAN_SPLIT_AUTO_RETRY_GROUP = 'cli_failure_retry'

// —— 流式性能与稳定性防护（4 层） ——
/** 层 1：流式日志 flush 间隔（ms），用 setTimeout 而非 rAF（后台 tab 仍触发） */
const STREAM_FLUSH_INTERVAL_MS = 50
/** 层 2：前端 logs 缓冲上限（不影响后端落库，仅限内存） */
const MAX_PLAN_SPLIT_LOGS = 2000
/** 层 2：单条 content 字符上限 */
const MAX_LOG_CONTENT_CHARS = 100_000
/** 层 3：isProcessing watchdog 超时（ms），无任何流式事件即自动 stop */
const PROCESSING_TIMEOUT_MS = 120_000
/** 层 4：连续异常 content 触发熔断的阈值 */
const ANOMALOUS_CONTENT_STREAK_LIMIT = 5
/** 层 4：判定「无结构超长」的字符阈值（且无换行） */
const ANOMALOUS_LONG_CONTENT_CHARS = 20_000
/** 层 4：匹配 MCP 工具定义 JSON 开头（[{"description"... / {"description"... 等） */
const TOOL_DEFINITION_PATTERN = /^\s*[{[]*\s*"(?:description|name|inputSchema|tools|type)"\s*:/

/**
 * 层 4：检测单条 content 是否为异常输出（MCP 工具定义 JSON / 无结构超长）。
 * 纯函数，导出供单测验证。
 */
export function isAnomalousContent(content: string): boolean {
  if (!content) return false
  if (TOOL_DEFINITION_PATTERN.test(content)) return true
  if (content.length > ANOMALOUS_LONG_CONTENT_CHARS && !content.includes('\n')) return true
  return false
}

/** 层 2：截断单条 content 到 MAX_LOG_CONTENT_CHARS。纯函数，导出供单测验证。 */
export function clampLogContent(content: string): string {
  if (content.length <= MAX_LOG_CONTENT_CHARS) return content
  return content.slice(0, MAX_LOG_CONTENT_CHARS) + '\n…[内容过长已截断]'
}

export const PLAN_SPLIT_STREAMING_LIMITS = {
  MAX_PLAN_SPLIT_LOGS,
  MAX_LOG_CONTENT_CHARS,
  STREAM_FLUSH_INTERVAL_MS,
  PROCESSING_TIMEOUT_MS,
  ANOMALOUS_CONTENT_STREAK_LIMIT,
  ANOMALOUS_LONG_CONTENT_CHARS
} as const

interface RustPlanSplitLogRecord {
  id: string
  planId: string
  sessionId: string
  logType?: PlanSplitLogRecord['type']
  type?: PlanSplitLogRecord['type']
  content: string
  metadata?: string | null
  createdAt: string
}

function measurePlanSplit(label: string, startedAt: number, detail: Record<string, unknown> = {}) {
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10
  console.info(`[PlanSplitPerf] ${label}`, { durationMs, ...detail })
}

function measurePlanSplitPoint(label: string, detail: Record<string, unknown> = {}) {
  console.info(`[PlanSplitPerf] ${label}`, detail)
}

function sumPlanSplitLogBytes(items: RustPlanSplitLogRecord[] | PlanSplitLogRecord[]) {
  return items.reduce((total, item) =>
    total + (item.content?.length ?? 0) + (item.metadata?.length ?? 0),
  0)
}

function formatOptionValue(field: DynamicFormSchema['fields'][number], value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  if (Array.isArray(value)) {
    if (value.length === 0) return '-'
    return value.map(item => formatOptionValue(field, item)).join('、')
  }
  const matched = field.options?.find(option => option.value === value)
  if (matched) return matched.label
  return String(value)
}

function summarizeFormValues(schema: DynamicFormSchema, values: Record<string, unknown>): string {
  return schema.fields
    .map(field => `${field.label}：${formatOptionValue(field, values[field.name])}`)
    .join('\n')
}

function parseJson<T>(raw?: string | null, fallback?: T): T {
  if (!raw) return fallback as T
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    logger.warn('[TaskSplit] JSON parse failed:', error)
    return fallback as T
  }
}

function parseStreamPayloadMetadata(raw?: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function readMetadataNumericValue(
  metadata: Record<string, unknown> | null,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) {
        return numeric
      }
    }
  }

  return undefined
}

function readMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
  fallbackKey?: string
): string | null {
  const target = metadata?.[key] ?? (fallbackKey ? metadata?.[fallbackKey] : undefined)
  return typeof target === 'string' && target.trim()
    ? target.trim()
    : null
}

function isStructuredOutputToolName(toolName: string | null): boolean {
  return toolName === 'StructuredOutput' || toolName === 'structured_output'
}

function collectStructuredOutputCandidatesFromLogs(splitLogs: PlanSplitLogRecord[]): string[] {
  const sortedLogs = [...splitLogs]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
  const structuredToolCallIds = new Set<string>()
  const structuredToolCallOrder: string[] = []
  const structuredToolInputChunks = new Map<string, string[]>()
  const candidates: string[] = []

  sortedLogs.forEach((log) => {
    const metadata = parseStreamPayloadMetadata(log.metadata)
    const toolName = readMetadataString(metadata, 'toolName', 'tool_name')
    const toolCallId = readMetadataString(metadata, 'toolCallId', 'tool_call_id')

    if (log.type === 'tool_use' && isStructuredOutputToolName(toolName)) {
      if (toolCallId && !structuredToolCallIds.has(toolCallId)) {
        structuredToolCallIds.add(toolCallId)
        structuredToolCallOrder.push(toolCallId)
      }

      const toolInput = readMetadataString(metadata, 'toolInput', 'tool_input')
      const candidate = toolInput ?? (log.content?.trim() ? log.content.trim() : '')
      if (candidate) {
        candidates.push(candidate)
      }
      return
    }

    if (!toolCallId || !structuredToolCallIds.has(toolCallId)) {
      return
    }

    if (log.type === 'tool_input_delta') {
      const chunk = log.content?.trim()
        ? log.content
        : readMetadataString(metadata, 'toolInput', 'tool_input') ?? ''
      if (!chunk.trim()) {
        return
      }

      const chunks = structuredToolInputChunks.get(toolCallId) ?? []
      chunks.push(chunk)
      structuredToolInputChunks.set(toolCallId, chunks)
      return
    }

    if (log.type === 'tool_result') {
      const toolResult = readMetadataString(metadata, 'toolResult', 'tool_result')
      const candidate = toolResult ?? (log.content?.trim() ? log.content.trim() : '')
      if (candidate) {
        candidates.push(candidate)
      }
    }
  })

  structuredToolCallOrder.forEach((toolCallId) => {
    const chunks = structuredToolInputChunks.get(toolCallId)
    if (!chunks?.length) {
      return
    }

    const candidate = chunks.join('').trim()
    if (candidate) {
      candidates.push(candidate)
    }
  })

  return candidates
}

function buildPersistedLogMetadata(
  payload: PlanSplitStreamPayload,
  parsedMetadata: Record<string, unknown> | null
): string {
  const model = typeof payload.model === 'string' && payload.model.trim()
    ? payload.model.trim()
    : typeof parsedMetadata?.model === 'string' && parsedMetadata.model.trim()
      ? parsedMetadata.model.trim()
      : undefined
  const inputTokens = typeof payload.inputTokens === 'number'
    ? payload.inputTokens
    : typeof parsedMetadata?.inputTokens === 'number'
      ? parsedMetadata.inputTokens
      : undefined
  const outputTokens = typeof payload.outputTokens === 'number'
    ? payload.outputTokens
    : typeof parsedMetadata?.outputTokens === 'number'
      ? parsedMetadata.outputTokens
      : undefined
  const rawInputTokens = typeof payload.rawInputTokens === 'number'
    ? payload.rawInputTokens
    : readMetadataNumericValue(parsedMetadata, 'rawInputTokens', 'raw_input_tokens')
  const rawOutputTokens = typeof payload.rawOutputTokens === 'number'
    ? payload.rawOutputTokens
    : readMetadataNumericValue(parsedMetadata, 'rawOutputTokens', 'raw_output_tokens')
  const cacheReadInputTokens = typeof payload.cacheReadInputTokens === 'number'
    ? payload.cacheReadInputTokens
    : readMetadataNumericValue(parsedMetadata, 'cacheReadInputTokens', 'cache_read_input_tokens')
  const cacheCreationInputTokens = typeof payload.cacheCreationInputTokens === 'number'
    ? payload.cacheCreationInputTokens
    : readMetadataNumericValue(parsedMetadata, 'cacheCreationInputTokens', 'cache_creation_input_tokens')
  const externalSessionId = typeof payload.externalSessionId === 'string' && payload.externalSessionId.trim()
    ? payload.externalSessionId.trim()
    : typeof parsedMetadata?.externalSessionId === 'string' && parsedMetadata.externalSessionId.trim()
      ? parsedMetadata.externalSessionId.trim()
      : undefined

  return JSON.stringify({
    model,
    inputTokens,
    outputTokens,
    rawInputTokens,
    rawOutputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    externalSessionId,
    ...(payload.metadata ? { rawMetadata: payload.metadata } : {}),
    toolName: payload.toolName,
    toolCallId: payload.toolCallId,
    toolInput: payload.toolInput,
    toolResult: payload.toolResult
  })
}

function buildExecutionRequest(
  context: TaskSplitContext,
  agent: AgentConfig,
  llmMessages: MessageInput[],
  mcpServers: ExecutionRequest['mcpServers'],
  resumeSessionId?: string
): ExecutionRequest {
  const normalizedProvider = (agent.provider || 'claude').toLowerCase()
  const provider = normalizedProvider === 'codex'
    ? 'codex'
    : normalizedProvider === 'claude'
      ? 'claude'
      : 'generic'
  return buildAgentExecutionRequest({
    sessionId: crypto.randomUUID(),
    planId: context.planId,
    agent,
    messages: llmMessages,
    modelId: context.modelId || undefined,
    workingDirectory: context.workingDirectory,
    systemPrompt: llmMessages.find(message => message.role === 'system')?.content,
    mcpServers,
    jsonSchema: buildPlanSplitJsonSchema(context.granularity, provider, context.taskCountMode ?? 'min'),
    executionMode: 'task_split',
    responseMode: 'stream_text',
    resumeSessionId
  })
}

function toSplitMessages(raw?: string | null): SplitMessage[] {
  const parsed = parseJson<Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    attachments?: SplitMessage['attachments']
    timestamp: string
  }>>(raw, [])
  return parsed.map(message => ({
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.attachments,
    timestamp: message.timestamp
  }))
}

function toFormQueue(raw?: string | null): DynamicFormSchema[] {
  const forms = parseJson<DynamicFormSchema[]>(raw, [])
  return normalizeFormSchemasForRendering(forms)
}

function toSplitResult(raw?: string | null): AITaskItem[] | null {
  if (!raw) return null
  const parsed = parseJson<{ tasks?: AITaskItem[] }>(raw, {})
  return parsed.tasks ?? null
}

function toPlanSplitLogs(logs: RustPlanSplitLogRecord[]): PlanSplitLogRecord[] {
  return logs
    .map(log => ({
      ...log,
      type: log.type ?? log.logType ?? 'system'
    }))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
}

function collectStructuredRecoveryCandidates(
  snapshot: PlanSplitSessionRecord,
  splitLogs: PlanSplitLogRecord[]
): string[] {
  const messageContents = toSplitMessages(snapshot.messagesJson)
    .filter(message => message.role === 'assistant')
    .map(message => message.content)
  const logContents = [...splitLogs]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map(log => log.content)
  const structuredOutputCandidates = collectStructuredOutputCandidatesFromLogs(splitLogs)

  return [
    ...messageContents,
    ...logContents,
    ...structuredOutputCandidates,
    snapshot.rawContent ?? null
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function recoverSplitResultFromSnapshot(
  snapshot: PlanSplitSessionRecord,
  splitLogs: PlanSplitLogRecord[]
): AITaskItem[] | null {
  const persisted = toSplitResult(snapshot.resultJson)
  if (persisted?.length) {
    return persisted
  }

  const recovered = extractTaskSplitResultFromContents(
    collectStructuredRecoveryCandidates(snapshot, splitLogs)
  )
  return recovered?.tasks ?? null
}

function recoverFormQueueFromSnapshot(
  snapshot: PlanSplitSessionRecord,
  splitLogs: PlanSplitLogRecord[]
): DynamicFormSchema[] {
  const persisted = toFormQueue(snapshot.formQueueJson)
  if (persisted.length > 0) {
    return persisted
  }

  const recovered = extractFirstFormRequestFromContents(
    collectStructuredRecoveryCandidates(snapshot, splitLogs)
  )
  return normalizeFormSchemasForRendering(recovered?.forms ?? [])
}

function trimTrailingAssistantMessages<T extends { role: string }>(items: T[]): T[] {
  const lastUserIndex = [...items].map(item => item.role).lastIndexOf('user')
  if (lastUserIndex < 0) {
    return [...items]
  }

  let endIndex = items.length
  while (endIndex > lastUserIndex + 1 && items[endIndex - 1]?.role === 'assistant') {
    endIndex -= 1
  }

  return items.slice(0, endIndex)
}

function trimPlanSplitLogsBySessionId(
  items: PlanSplitLogRecord[],
  sessionId?: string | null
): PlanSplitLogRecord[] {
  const normalizedSessionId = sessionId?.trim()
  if (!normalizedSessionId) {
    return [...items]
  }

  return items.filter(log => log.sessionId !== normalizedSessionId)
}

function trimPlanSplitLogsAfterTimestamp(
  items: PlanSplitLogRecord[],
  boundaryTimestamp?: string | null
): PlanSplitLogRecord[] {
  if (!boundaryTimestamp) {
    return [...items]
  }

  const boundaryMs = new Date(boundaryTimestamp).getTime()
  if (!Number.isFinite(boundaryMs)) {
    return [...items]
  }

  return items.filter((log) => {
    const logMs = new Date(log.createdAt).getTime()
    return !Number.isFinite(logMs) || logMs < boundaryMs
  })
}

function isAutoRetryProgressLog(log: Pick<PlanSplitLogRecord, 'type' | 'metadata'>): boolean {
  if (log.type !== 'system' || typeof log.metadata !== 'string') {
    return false
  }

  return log.metadata.includes(`"retryGroup":"${PLAN_SPLIT_AUTO_RETRY_GROUP}"`)
}

async function buildSplitSystemPrompt(expertId?: string): Promise<string> {
  const agentTeamsStore = useSubAgentStore()
  await agentTeamsStore.loadSubAgents()

  const expert = resolveSubAgentById(expertId, agentTeamsStore.subAgents)
    || agentTeamsStore.builtinPlannerSubAgent
    || agentTeamsStore.enabledSubAgents[0]
    || null

  return buildSubAgentSystemPrompt(expert?.prompt, [
    buildPlanSplitSystemPrompt(),
    buildSubAgentCatalogPrompt(agentTeamsStore.enabledSubAgents)
  ])
}

export {
  // —— 接口 / 类型 ——
  type TaskSplitContext,
  type TaskSplitRefinementState,
  type ContinueSessionWithInstructionOptions,
  type SubmittedFormSnapshot,
  type PlanSplitRuntimeMetrics,
  type RustPlanSplitLogRecord,
  // —— 模块级常量 ——
  STALE_PLAN_SPLIT_SESSION_TIMEOUT_MS,
  PLAN_SPLIT_AUTO_RETRY_DELAY_MS,
  PLAN_SPLIT_AUTO_RETRY_GROUP,
  STREAM_FLUSH_INTERVAL_MS,
  MAX_PLAN_SPLIT_LOGS,
  MAX_LOG_CONTENT_CHARS,
  PROCESSING_TIMEOUT_MS,
  ANOMALOUS_CONTENT_STREAK_LIMIT,
  ANOMALOUS_LONG_CONTENT_CHARS,
  // —— 纯函数 helper ——
  measurePlanSplit,
  measurePlanSplitPoint,
  sumPlanSplitLogBytes,
  summarizeFormValues,
  parseJson,
  parseStreamPayloadMetadata,
  buildPersistedLogMetadata,
  buildExecutionRequest,
  toSplitMessages,
  toPlanSplitLogs,
  recoverSplitResultFromSnapshot,
  recoverFormQueueFromSnapshot,
  trimTrailingAssistantMessages,
  trimPlanSplitLogsBySessionId,
  trimPlanSplitLogsAfterTimestamp,
  isAutoRetryProgressLog,
  buildSplitSystemPrompt
}
