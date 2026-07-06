/**
 * soloExecutionShared.ts
 *
 * 职责：集中存放 useSoloExecutionStore 的「纯模块级」代码，与 taskExecutionShared.ts /
 * taskSplitShared.ts 范式对齐。
 *   - 自定义错误类（SoloRecoverableOutputError）
 *   - 接口 / 类型定义（RustSoloStep、RustSoloLog、SoloResolvedRuntime、SoloBindingRole）
 *   - 模块级常量（停止标记、CLI 失败重试延迟、输出修复上限、AI 重试上限）
 *   - 纯函数 helper（JSON 解析、sleep、错误归一化、CLI 不可用判定、
 *     Rust 记录→领域模型转换、执行状态/消息工厂、运行时绑定 key 构造、挂载记忆库 id 收集）
 *
 * 主 store（soloExecution.ts）只负责响应式状态与生命周期，所有无副作用、可复用的逻辑沉淀于此，
 * 通过 `import { ... } from './soloExecutionShared'` 引用。
 *
 * 注意：流式运行期的可变单例状态（usageBaselines / pendingLogWrites 等 Map，以及
 * store 内部对它们的反复赋值）与 store 响应式状态强耦合，ES Module 导入绑定无法被重新赋值，
 * 因此这些 let/Map 仍保留在 soloExecution.ts 内，未迁入本文件。
 */
import type {
  SoloExecutionState,
  SoloLogEntry,
  SoloStep
} from '@/types/solo'
import type { ExecutionLogMetadata } from '@/types/taskExecution'
import type { Message } from '@/stores/message'
import type { AgentConfig } from '@/stores/agent'
import type { McpServerConfig } from '@/services/conversation/strategies/types'
import type { AgentRuntimeKey } from '@/services/conversation/runtimeProfiles'
import { resolveRuntimeBindingKey } from '@/services/conversation/runtimeBindings'

const SOLO_STOPPED_ERROR = '__SOLO_STOPPED__'
const SOLO_CLI_FAILURE_RETRY_DELAY_MS = 10_000
const SOLO_OUTPUT_REPAIR_MAX_ATTEMPTS = 3
const SOLO_AI_RETRY_MAX_ATTEMPTS = 10

class SoloRecoverableOutputError extends Error {
  rawOutput: string

  constructor(message: string, rawOutput: string) {
    super(message)
    this.name = 'SoloRecoverableOutputError'
    this.rawOutput = rawOutput
  }
}

interface RustSoloStep {
  id: string
  run_id: string
  step_ref: string
  parent_step_ref?: string | null
  depth: number
  title: string
  description?: string | null
  execution_prompt?: string | null
  selected_expert_id?: string | null
  status: SoloStep['status']
  summary?: string | null
  result_summary?: string | null
  result_files_json?: string | null
  fail_reason?: string | null
  created_at: string
  updated_at: string
  started_at?: string | null
  completed_at?: string | null
}

interface RustSoloLog {
  id: string
  run_id: string
  step_id?: string | null
  scope: SoloLogEntry['scope']
  type: SoloLogEntry['type']
  content: string
  metadata?: string | null
  created_at: string
}

type SoloBindingRole = 'coordinator' | 'expert'

interface SoloResolvedRuntime {
  agent: AgentConfig
  workingDirectory?: string
  mcpServers?: McpServerConfig[]
  expertPrompt?: string
  expertName?: string
  expertId?: string
  runtimeKey: AgentRuntimeKey | null
  bindingKey: string | null
}

function parseJson<T>(raw?: string | null): T | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isSoloRecoverableOutputError(error: unknown): error is SoloRecoverableOutputError {
  return error instanceof SoloRecoverableOutputError
}

function normalizeSoloErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isCliUnavailableError(agent: AgentConfig, error: unknown): boolean {
  if (!agent.acpCommand && !agent.cliPath) {
    return false
  }

  const normalized = normalizeSoloErrorMessage(error).trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return normalized.includes('cli 路径未配置')
    || normalized.includes('path not configured')
    || normalized.includes('cli 命令未配置')
    || normalized.includes('command not configured')
    || normalized.includes('command not found')
    || normalized.includes('executable file not found')
    || normalized.includes('binary not found')
    || normalized.includes('program not found')
    || normalized.includes('no such file or directory')
    || normalized.includes('not found in $path')
    || normalized.includes('not found')
    || normalized.includes('enoent')
    || normalized.includes('os error 2')
    || normalized.includes('permission denied')
    || normalized.includes('operation not permitted')
    || normalized.includes('not executable')
    || normalized.includes('failed to spawn')
    || normalized.includes('spawn')
}

function transformStep(raw: RustSoloStep): SoloStep {
  return {
    id: raw.id,
    runId: raw.run_id,
    stepRef: raw.step_ref,
    parentStepRef: raw.parent_step_ref || undefined,
    depth: raw.depth,
    title: raw.title,
    description: raw.description || undefined,
    executionPrompt: raw.execution_prompt || undefined,
    selectedExpertId: raw.selected_expert_id || undefined,
    status: raw.status,
    summary: raw.summary || undefined,
    resultSummary: raw.result_summary || undefined,
    resultFiles: parseJson<string[]>(raw.result_files_json) ?? [],
    failReason: raw.fail_reason || undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    startedAt: raw.started_at || undefined,
    completedAt: raw.completed_at || undefined
  }
}

function transformLog(raw: RustSoloLog): SoloLogEntry {
  return {
    id: raw.id,
    runId: raw.run_id,
    stepId: raw.step_id || undefined,
    scope: raw.scope,
    type: raw.type,
    content: raw.content,
    metadata: parseJson<ExecutionLogMetadata>(raw.metadata),
    timestamp: raw.created_at
  }
}

function createExecutionState(runId: string): SoloExecutionState {
  return {
    runId,
    status: 'idle',
    sessionId: null,
    startedAt: null,
    completedAt: null,
    currentStepId: null,
    logs: [],
    accumulatedContent: '',
    accumulatedThinking: '',
    toolCalls: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      resetCount: 0,
      lastUpdatedAt: null
    }
  }
}

function createMessage(runId: string, role: 'system' | 'user' | 'assistant', content: string): Message {
  const now = new Date().toISOString()
  return {
    id: `solo-${role}-${runId}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: runId,
    requestId: `solo-${runId}`,
    role,
    messageType: role === 'system' ? 'system' : 'text',
    content,
    status: 'completed',
    seq: 0,
    createdAt: now,
    updatedAt: now
  }
}

function buildSoloBindingKey(
  agent: Pick<AgentConfig, 'type' | 'provider' | 'name' | 'cliPath'>,
  role: SoloBindingRole,
  expertId?: string | null,
  stepId?: string | null
): string | null {
  const runtimeKey = resolveRuntimeBindingKey(agent)
  if (!runtimeKey) {
    return null
  }

  if (role === 'coordinator') {
    return `${runtimeKey}::solo::coordinator`
  }

  if (stepId) {
    return `${runtimeKey}::solo::step::${stepId}`
  }

  return `${runtimeKey}::solo::expert::${expertId?.trim() || 'default'}`
}

function collectMountedMemoryLibraryIds(
  projectIds: string[] | undefined,
  runIds: string[] | undefined
): string[] {
  return Array.from(
    new Set(
      [...(projectIds ?? []), ...(runIds ?? [])]
        .map((id) => id.trim())
        .filter(Boolean)
    )
  )
}

export {
  // —— 自定义错误类 ——
  SoloRecoverableOutputError,
  // —— 接口 / 类型 ——
  type RustSoloStep,
  type RustSoloLog,
  type SoloBindingRole,
  type SoloResolvedRuntime,
  // —— 模块级常量 ——
  SOLO_STOPPED_ERROR,
  SOLO_CLI_FAILURE_RETRY_DELAY_MS,
  SOLO_OUTPUT_REPAIR_MAX_ATTEMPTS,
  SOLO_AI_RETRY_MAX_ATTEMPTS,
  // —— 纯函数 helper ——
  parseJson,
  sleep,
  isSoloRecoverableOutputError,
  normalizeSoloErrorMessage,
  isCliUnavailableError,
  transformStep,
  transformLog,
  createExecutionState,
  createMessage,
  buildSoloBindingKey,
  collectMountedMemoryLibraryIds
}
