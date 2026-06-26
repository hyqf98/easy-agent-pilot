import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAgentConfigStore } from './agentConfig'
import { inferAgentProvider, useAgentStore } from './agent'
import { useMessageStore } from './message'
import { useSessionStore } from './session'
import { readSessionCliUsageSnapshot } from '@/services/usage/cliSessionUsageSnapshot'
import {
  DEFAULT_CONTEXT_WINDOW,
  resolveConfiguredContextWindow
} from '@/utils/configuredModelContext'
import { formatContextWindowCount } from '@/utils/contextWindow'
import { resolveSessionAgent } from '@/utils/sessionAgent'
import { getUsageNoticeSummary, type RuntimeNotice } from '@/utils/runtimeNotice'
import type { Message } from './message'

/**
 * 新消息结构下，usage 数据存在 messageType === 'usage' 的独立行上，
 * 直接读取 token 列；这里封装为与旧 runtimeNotice 等价的形状，方便复用既有解析逻辑。
 */
function findLatestUsageMessage(messages: Message[]): Message | undefined {
  return [...messages]
    .reverse()
    .find(message => message.role === 'assistant' && message.messageType === 'usage')
}

function usageMessageToRuntimeNotice(message: Message): RuntimeNotice {
  const lines: string[] = []
  if (message.inputTokens !== undefined) {
    lines.push(`input: ${message.inputTokens}`)
  }
  if (message.outputTokens !== undefined) {
    lines.push(`output: ${message.outputTokens}`)
  }
  if (message.cacheReadTokens !== undefined) {
    lines.push(`cache_read: ${message.cacheReadTokens}`)
  }
  if (message.cacheCreationTokens !== undefined) {
    lines.push(`cache_creation: ${message.cacheCreationTokens}`)
  }
  return {
    id: 'usage',
    content: lines.join('\n'),
    model: message.model
  } as unknown as RuntimeNotice
}

function extractPersistedUsageFromMessage(
  message: Message | undefined
): {
  counts: ReturnType<typeof extractPersistedUsageCounts>
  summary: ReturnType<typeof getUsageNoticeSummary>
} {
  if (!message) {
    return { counts: {}, summary: null }
  }

  const notice = usageMessageToRuntimeNotice(message)
  return {
    counts: extractPersistedUsageCounts(notice),
    summary: getUsageNoticeSummary(notice)
  }
}

export type TokenLevel = 'safe' | 'warning' | 'danger' | 'critical'

export interface TokenUsage {
  used: number
  limit: number
  percentage: number
  level: TokenLevel
}

export interface TokenUsageDetails extends TokenUsage {
  model?: string
  inputTokens?: number
  outputTokens?: number
  contextWindowOccupancy?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

export interface RealtimeTokenData {
  inputTokens: number
  outputTokens: number
  model?: string
  contextWindowOccupancy?: number
}

export type CompressionStrategy = 'simple' | 'smart' | 'summary'

export interface CompressionOptions {
  strategy: CompressionStrategy
  keepRecentCount: number
}

function parsePersistedTokenCount(value?: string | null): number | undefined {
  if (!value) {
    return undefined
  }

  const digitsOnly = value.replace(/[^\d]/g, '')
  if (!digitsOnly) {
    return undefined
  }

  const parsed = Number.parseInt(digitsOnly, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function extractPersistedUsageCounts(notice: RuntimeNotice): {
  inputTokens?: number
  outputTokens?: number
  contextWindowOccupancy?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
} {
  const lines = notice.content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^-\s*/, ''))

  let inputTokens: number | undefined
  let outputTokens: number | undefined
  let contextWindowOccupancy: number | undefined
  let cacheReadInputTokens: number | undefined
  let cacheCreationInputTokens: number | undefined

  for (const line of lines) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex < 0) {
      continue
    }

    const label = line.slice(0, separatorIndex).trim().toLowerCase()
    const value = line.slice(separatorIndex + 1).trim()
    const parsed = parsePersistedTokenCount(value)
    if (parsed === undefined) {
      continue
    }

    if (label.includes('输入') || label.includes('input')) {
      inputTokens = parsed
      continue
    }

    if (label.includes('上下文占用') || label.includes('context occupancy') || label.includes('context window occupancy')) {
      contextWindowOccupancy = parsed
      continue
    }

    if (label.includes('缓存读取') || label.includes('cache read') || label.includes('cache hit')) {
      cacheReadInputTokens = parsed
      continue
    }

    if (label.includes('缓存写入') || label.includes('cache creation') || label.includes('cache write')) {
      cacheCreationInputTokens = parsed
      continue
    }

    if (label.includes('输出') || label.includes('output')) {
      outputTokens = parsed
    }
  }

  return {
    inputTokens,
    outputTokens,
    contextWindowOccupancy,
    cacheReadInputTokens,
    cacheCreationInputTokens
  }
}

function replaceMapEntry<K, V>(source: Map<K, V>, key: K, value: V): Map<K, V> {
  const next = new Map(source)
  next.set(key, value)
  return next
}

function deleteMapEntry<K, V>(source: Map<K, V>, key: K): Map<K, V> {
  if (!source.has(key)) {
    return source
  }

  const next = new Map(source)
  next.delete(key)
  return next
}

function getLevel(percentage: number): TokenLevel {
  if (percentage >= 95) return 'critical'
  if (percentage >= 80) return 'danger'
  if (percentage >= 60) return 'warning'
  return 'safe'
}

export function formatTokenCount(count: number): string {
  if (count <= 0) {
    return '0'
  }
  return formatContextWindowCount(count)
}

export const useTokenStore = defineStore('token', () => {
  const realtimeTokens = ref<Map<string, RealtimeTokenData>>(new Map())

  function buildEmptyTokenUsage(limit: number = DEFAULT_CONTEXT_WINDOW): TokenUsageDetails {
    return {
      used: 0,
      limit,
      percentage: 0,
      level: 'safe'
    }
  }

  async function restorePersistedSessionTokens(sessionId: string): Promise<RealtimeTokenData | null> {
    const messageStore = useMessageStore()
    const sessionStore = useSessionStore()
    const session = sessionStore.sessions.find(item => item.id === sessionId)
    const boundProvider = session?.cliSessionProvider?.trim().toLowerCase()
    const hasPersistedCliRuntime = Boolean(boundProvider)

    if (!hasPersistedCliRuntime) {
      return null
    }

    const latestUsageMessage = findLatestUsageMessage(messageStore.messagesBySession(sessionId))

    if (session) {
      try {
        const snapshot = await readSessionCliUsageSnapshot(session)
        if (snapshot) {
          return {
            inputTokens: snapshot.inputTokens ?? 0,
            outputTokens: snapshot.outputTokens ?? 0,
            model: snapshot.model,
            contextWindowOccupancy: snapshot.contextWindowOccupancy
          }
        }
      } catch (error) {
        console.warn(`[TokenStore] Failed to restore ${boundProvider} usage snapshot:`, error)
      }
    }

    if (!latestUsageMessage) {
      return null
    }

    const { counts: rawCounts, summary } = extractPersistedUsageFromMessage(latestUsageMessage)
    if (!summary) {
      return null
    }

    const inputTokens = rawCounts.inputTokens ?? parsePersistedTokenCount(summary.input)
    const outputTokens = rawCounts.outputTokens ?? parsePersistedTokenCount(summary.output)
    const contextWindowOccupancy = rawCounts.contextWindowOccupancy
      ?? (
        inputTokens !== undefined || outputTokens !== undefined
          ? (inputTokens ?? 0) + (outputTokens ?? 0)
          : undefined
      )
    const model = summary.model?.trim() || undefined

    if (inputTokens === undefined && outputTokens === undefined && !model) {
      return null
    }

    return {
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      model,
      contextWindowOccupancy
    }
  }

  function resolveTokenUsageDetails(sessionId: string): TokenUsageDetails {
    const agentConfigStore = useAgentConfigStore()
    const agentStore = useAgentStore()
    const messageStore = useMessageStore()
    const sessionStore = useSessionStore()
    const session = sessionStore.sessions.find(s => s.id === sessionId)
    if (!session) {
      return buildEmptyTokenUsage()
    }

    const agent = resolveSessionAgent(session, agentStore.agents)

    const realtimeData = realtimeTokens.value.get(sessionId)
    if (!realtimeData) {
      void restorePersistedSessionTokens(sessionId).then(restored => {
        if (!restored) {
          return
        }
        realtimeTokens.value = replaceMapEntry(realtimeTokens.value, sessionId, restored)
      })
    }
    const sessionMessages = messageStore.messagesBySession(sessionId)
    const latestUsageMessage = findLatestUsageMessage(sessionMessages)
    const { counts: persistedUsageCounts, summary: persistedUsageSummary } =
      extractPersistedUsageFromMessage(latestUsageMessage)
    const persistedOccupancy = persistedUsageCounts.contextWindowOccupancy
      ?? (
        persistedUsageCounts.inputTokens !== undefined || persistedUsageCounts.outputTokens !== undefined
          ? (persistedUsageCounts.inputTokens ?? 0) + (persistedUsageCounts.outputTokens ?? 0)
          : undefined
      )
    const realtimeModel = realtimeData?.model?.trim() || persistedUsageSummary?.model?.trim() || undefined

    let contextWindow = DEFAULT_CONTEXT_WINDOW
    if (agent) {
      const configuredModels = agentConfigStore.getModelsConfigs(agent.id)
      if (configuredModels.length === 0) {
        void agentConfigStore.ensureModelsConfigs(agent.id, inferAgentProvider(agent)).catch((error) => {
          console.warn(`[TokenStore] Failed to load model configs for ${agent.id}:`, error)
        })
      }

      contextWindow = resolveConfiguredContextWindow(
        configuredModels,
        {
          runtimeModelId: realtimeModel,
          agentModelId: agent.modelId
        }
      )
    }

    const hasCompressionPlaceholderOnly = sessionMessages.length > 0
      && sessionMessages.every(message => message.messageType === 'compression')
      && !session.cliSessionId?.trim()

    if (hasCompressionPlaceholderOnly) {
      if (realtimeTokens.value.has(sessionId)) {
        realtimeTokens.value = deleteMapEntry(realtimeTokens.value, sessionId)
      }

      return buildEmptyTokenUsage(contextWindow)
    }

    const usedTokens = realtimeData?.contextWindowOccupancy
      ?? persistedOccupancy
      ?? 0

    const percentage = contextWindow > 0
      ? Math.min(100, (usedTokens / contextWindow) * 100)
      : 0

    return {
      used: usedTokens,
      limit: contextWindow,
      percentage,
      level: getLevel(percentage),
      model: realtimeModel,
      inputTokens: realtimeData?.inputTokens ?? persistedUsageCounts.inputTokens,
      outputTokens: realtimeData?.outputTokens ?? persistedUsageCounts.outputTokens,
      contextWindowOccupancy: usedTokens > 0 ? usedTokens : persistedOccupancy,
      cacheReadInputTokens: persistedUsageCounts.cacheReadInputTokens,
      cacheCreationInputTokens: persistedUsageCounts.cacheCreationInputTokens
    }
  }

  function getTokenUsage(sessionId: string): TokenUsage {
    const { used, limit, percentage, level } = resolveTokenUsageDetails(sessionId)
    return {
      used,
      limit,
      percentage,
      level
    }
  }

  function getTokenUsageDetails(sessionId: string): TokenUsageDetails {
    return resolveTokenUsageDetails(sessionId)
  }

  function updateRealtimeTokens(
    sessionId: string,
    inputTokens: number | undefined,
    outputTokens: number | undefined,
    model?: string,
    contextWindowOccupancy?: number
  ) {
    if (inputTokens === undefined && outputTokens === undefined && !model && contextWindowOccupancy === undefined) return
    const existing = realtimeTokens.value.get(sessionId) || { inputTokens: 0, outputTokens: 0 }

    realtimeTokens.value = replaceMapEntry(realtimeTokens.value, sessionId, {
      inputTokens: inputTokens ?? existing.inputTokens,
      outputTokens: outputTokens ?? existing.outputTokens,
      model: model ?? existing.model,
      contextWindowOccupancy: contextWindowOccupancy ?? existing.contextWindowOccupancy
    })
  }

  function clearRealtimeTokens(sessionId: string) {
    realtimeTokens.value = deleteMapEntry(realtimeTokens.value, sessionId)
  }

  function hardClearSessionTokens(sessionId: string) {
    realtimeTokens.value = deleteMapEntry(realtimeTokens.value, sessionId)
  }

  function clearProjectSessionTokenCaches(sessionIds: string[]) {
    if (sessionIds.length === 0) {
      return
    }

    const nextRealtimeTokens = new Map(realtimeTokens.value)
    sessionIds.forEach((sessionId) => {
      nextRealtimeTokens.delete(sessionId)
    })
    realtimeTokens.value = nextRealtimeTokens
  }

  return {
    realtimeTokens,
    getTokenUsage,
    getTokenUsageDetails,
    updateRealtimeTokens,
    clearRealtimeTokens,
    hardClearSessionTokens,
    clearProjectSessionTokenCaches,
    restorePersistedSessionTokens,
    formatTokenCount
  }
})
