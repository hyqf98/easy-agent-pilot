import { MANUAL_STOP_ERROR_MARKER, useMessageStore, type Message, type MessageAttachment, type ToolCall } from '@/stores/message'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore, type Session } from '@/stores/session'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useProjectStore } from '@/stores/project'
import { useAgentStore, type AgentConfig, inferAgentProvider } from '@/stores/agent'
import { useNotificationStore } from '@/stores/notification'
import logger from '@/utils/logger'
import { useTokenStore } from '@/stores/token'
import { useMemoryStore } from '@/stores/memory'
import { usePermissionStore } from '@/stores/permission'
import { useSubAgentStore } from '@/stores/subAgent'
import { useFileChangeStore } from '@/stores/fileChange'
import { useAgentPlanStore } from '@/stores/agentPlan'
import { useAgentCapabilityStore } from '@/stores/agentCapability'
import { agentExecutor } from './AgentExecutor'
import type { ConversationContext, McpServerConfig, StreamEvent } from './strategies/types'
import type { ReasoningEffortLevel } from '@/types/reasoning'
import { buildConversationMessages } from './buildConversationMessages'
import { loadMountedMemoryPrompt } from '@/services/memory/mountedMemoryPrompt'
import type { FileEditTrace } from '@/types/fileTrace'
import { FileTraceCollector } from './fileTraceCollector'
import i18n from '@/i18n'
import {
  buildImageAttachmentFallbackPrompt as buildImageAttachmentFallbackSystemPrompt,
  buildMainConversationFormRequestPrompt
} from './prompts'
import { resolveUsageModelHint } from './usageModelHint'
import { loadAgentMcpServers } from '@/utils/mcpServerConfig'
import { mergeToolInputArguments } from '@/utils/toolInput'
import { getErrorMessage } from '@/utils/api'
import {
  classifyCliFailureFragments,
  createCliFailureFragment,
  type CliFailureMatch
} from '@/utils/cliFailureMonitor'
import {
  mergeFinalUsageSnapshotCounts,
  mergeResponseUsageCounts,
  normalizeRuntimeUsage,
  type UsageBaseline
} from '@/utils/runtimeUsage'
import { recordAgentCliUsageInBackground, resolveRecordedModelId } from '@/services/usage/agentCliUsageRecorder'
import {
  readCliSessionUsageSnapshot,
  readSessionCliUsageSnapshot
} from '@/services/usage/cliSessionUsageSnapshot'
import { buildSubAgentSystemPrompt, resolveSubAgentById } from '@/services/subAgent/runtime'
import { writeFrontendRuntimeLog } from '@/services/runtimeLog/client'
import { useSettingsStore } from '@/stores/settings'
import {
  deleteSessionRuntimeBinding,
  getSessionRuntimeBinding,
  isInvalidCliResumeError,
  resolveRuntimeBindingKey,
  upsertSessionRuntimeBinding
} from './runtimeBindings'

interface StreamTimingMetrics {
  startedAt: number
  firstEventAt?: number
  firstRenderAt?: number
  firstContentAt?: number
  firstThinkingAt?: number
  firstToolAt?: number
  doneAt?: number
  persistedAt?: number
}

function resolveCodexContextWindowOccupancy(usage: {
  inputTokens?: number
  outputTokens?: number
  rawInputTokens?: number
  rawOutputTokens?: number
}): number | undefined {
  const rawInputTokens = typeof usage.rawInputTokens === 'number' ? usage.rawInputTokens : undefined
  const rawOutputTokens = typeof usage.rawOutputTokens === 'number' ? usage.rawOutputTokens : undefined
  if (rawInputTokens !== undefined || rawOutputTokens !== undefined) {
    return (rawInputTokens ?? 0) + (rawOutputTokens ?? 0)
  }

  const inputTokens = typeof usage.inputTokens === 'number' ? usage.inputTokens : undefined
  const outputTokens = typeof usage.outputTokens === 'number' ? usage.outputTokens : undefined
  if (inputTokens !== undefined || outputTokens !== undefined) {
    return (inputTokens ?? 0) + (outputTokens ?? 0)
  }

  return undefined
}

function normalizeUsageNumber(value?: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

function resolveRuntimeContextWindowOccupancy(options: {
  provider?: string | null
  inputTokens?: number
  outputTokens?: number
  rawInputTokens?: number
  rawOutputTokens?: number
}): number | undefined {
  const provider = options.provider?.trim().toLowerCase() ?? ''
  if (provider === 'codex') {
    return resolveCodexContextWindowOccupancy(options)
  }

  const inputTokens = normalizeUsageNumber(options.inputTokens)
  const outputTokens = normalizeUsageNumber(options.outputTokens)
  if (inputTokens !== undefined || outputTokens !== undefined) {
    return (inputTokens ?? 0) + (outputTokens ?? 0)
  }

  const rawInputTokens = normalizeUsageNumber(options.rawInputTokens)
  const rawOutputTokens = normalizeUsageNumber(options.rawOutputTokens)
  if (rawInputTokens !== undefined || rawOutputTokens !== undefined) {
    return (rawInputTokens ?? 0) + (rawOutputTokens ?? 0)
  }

  return undefined
}

const REFERENCED_MEMORY_BLOCK_HEADER = '[用户主动引用的历史记忆]'
const CURRENT_INPUT_BLOCK_HEADER = '[用户当前输入]'

function finalizePendingToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  let changed = false
  const finalized = toolCalls.map(toolCall => {
    if (toolCall.status !== 'running') {
      return toolCall
    }

    changed = true
    return {
      ...toolCall,
      status: 'success' as const
    }
  })

  return changed ? finalized : toolCalls
}

function extractRawMemoryCaptureContent(content: string): string {
  const trimmed = content.trim()
  if (!trimmed.startsWith(REFERENCED_MEMORY_BLOCK_HEADER)) {
    return trimmed
  }

  const currentInputIndex = trimmed.indexOf(CURRENT_INPUT_BLOCK_HEADER)
  if (currentInputIndex === -1) {
    return trimmed
  }

  return trimmed.slice(currentInputIndex + CURRENT_INPUT_BLOCK_HEADER.length).trim()
}

function resolveRequestedUsageModel(options: {
  requestedModelId?: string
  reportedModelId?: string
}): string | undefined {
  const normalizedRequested = options.requestedModelId?.trim() || undefined
  const normalizedReported = options.reportedModelId?.trim() || undefined

  return resolveRecordedModelId({
    reportedModelId: normalizedReported,
    requestedModelId: normalizedRequested
  }) ?? normalizedRequested ?? normalizedReported
}

function isSnapshotProneContentRuntime(provider?: string | null): boolean {
  const normalized = provider?.trim().toLowerCase() ?? ''
  return normalized.includes('opencode')
}

function findTextOverlapLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length)
  for (let length = maxLength; length > 0; length -= 1) {
    if (left.endsWith(right.slice(0, length))) {
      return length
    }
  }
  return 0
}

function mergeStreamingText(current: string, incoming: string, provider?: string | null): string {
  if (!incoming) {
    return current
  }

  if (!current || !isSnapshotProneContentRuntime(provider)) {
    return current + incoming
  }

  if (incoming === current || current.endsWith(incoming)) {
    return current
  }

  if (incoming.startsWith(current) || incoming.includes(current)) {
    return incoming
  }

  const overlapLength = findTextOverlapLength(current, incoming)
  return overlapLength > 0
    ? current + incoming.slice(overlapLength)
    : current + incoming
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function hashString(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}

function resolveToolCallId(event: StreamEvent): string {
  const normalizedId = event.toolCallId?.trim()
  if (normalizedId) {
    return normalizedId
  }

  return `tool-${hashString(`${event.toolName ?? ''}:${stableStringify(event.toolInput ?? {})}`)}`
}

/**
 * 对话服务
 * 封装消息发送逻辑，处理流式事件更新
 */
export class ConversationService {
  private static instance: ConversationService | null = null
  private readonly queueDrainLocks = new Set<string>()
  private readonly activeSendSessions = new Set<string>()
  private readonly dedupedInjectedSystemPrompts = new Map<string, Set<string>>()
  private readonly cliRuntimeKeys = ['claude-acp', 'codex-acp', 'opencode-acp'] as const
  private readonly conversationRetryCount = new Map<string, number>()
  private readonly conversationRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly sendEpochs = new Map<string, number>()

  private constructor() {}

  /**
   * 记录已在指定会话成功注入过的系统提示词。
   * 仅用于需要“同一会话只注入一次”的场景，避免重复堆积上下文。
   */
  private markInjectedSystemMessages(sessionId: string, messages: string[]): void {
    if (!sessionId || messages.length === 0) {
      return
    }

    const existing = this.dedupedInjectedSystemPrompts.get(sessionId) ?? new Set<string>()
    messages.forEach(message => existing.add(message))
    this.dedupedInjectedSystemPrompts.set(sessionId, existing)
  }

  /**
   * 过滤已在当前会话注入过的系统提示词，保证同一提示词只追加一次。
   */
  private filterSessionScopedInjectedMessages(sessionId: string, messages: string[]): string[] {
    if (!sessionId || messages.length === 0) {
      return messages
    }

    const existing = this.dedupedInjectedSystemPrompts.get(sessionId)
    if (!existing?.size) {
      return messages
    }

    return messages.filter(message => !existing.has(message))
  }

  private hasTrackedInjectedSystemMessages(sessionId: string): boolean {
    return (this.dedupedInjectedSystemPrompts.get(sessionId)?.size ?? 0) > 0
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ConversationService {
    if (!ConversationService.instance) {
      ConversationService.instance = new ConversationService()
    }
    return ConversationService.instance
  }

  /**
   * 发送消息并执行对话
   * @param projectId 可选的项目 ID,用于指定工作目录
   */
  async sendMessage(
    sessionId: string,
    content: string,
    agentId: string,
    projectId?: string,
    attachments: MessageAttachment[] = [],
    options?: {
      workingDirectory?: string
      modelId?: string
      reasoningEffort?: string
      extraCliArgs?: string[]
      injectedSystemMessages?: string[]
      dedupeInjectedSystemMessagesBySession?: boolean
      previewContent?: string
      existingUserMessageId?: string
      reuseAssistantMessageId?: string
    }
  ): Promise<void> {
    const messageStore = useMessageStore()
    const sessionStore = useSessionStore()
    const sessionExecutionStore = useSessionExecutionStore()
    const tokenStore = useTokenStore()
    const projectStore = useProjectStore()
    const agentStore = useAgentStore()
    const memoryStore = useMemoryStore()

    // 获取智能体配置
    const storedAgent = agentStore.agents.find(a => a.id === agentId)
    if (!storedAgent) {
      throw new Error('智能体不存在')
    }
    const modelIdOverride = options?.modelId?.trim() || undefined
    const agent = modelIdOverride
      ? { ...storedAgent, modelId: modelIdOverride }
      : storedAgent

    if (this.activeSendSessions.has(sessionId) || sessionExecutionStore.getIsSending(sessionId)) {
      throw new Error('当前会话正在处理中，请等待当前消息完成后再发送')
    }

    // 生成本次发送的回合 ID（user 消息与其触发的所有 assistant 事件共享）。
    // 使用局部常量而非实例字段，避免多面板并发发送时相互覆盖（单例竞态）。
    const requestId = crypto.randomUUID()

    // 检查策略支持
    if (!agentExecutor.isSupported(agent)) {
      throw new Error(`不支持的智能体类型: ${agent.type}`)
    }

    // 开始发送状态
    const epoch = (this.sendEpochs.get(sessionId) ?? 0) + 1
    this.sendEpochs.set(sessionId, epoch)
    this.activeSendSessions.add(sessionId)
    sessionExecutionStore.startSending(sessionId)
    this.clearConversationRetryState(sessionId)
    sessionExecutionStore.clearCurrentRetryState(sessionId)

    await invoke('clear_session_abort_flag', { sessionId }).catch(() => {})

    try {
      const existingUserMessageId = options?.existingUserMessageId?.trim()
      const existingSessionMessages = messageStore.messagesBySession(sessionId)
      const hadPriorConversation = existingSessionMessages.some(message =>
        (message.role === 'system' || message.role === 'user' || message.role === 'assistant')
        && message.messageType !== 'compression'
      )
      const userMessage = existingUserMessageId
        ? existingSessionMessages.find(message => message.id === existingUserMessageId && message.role === 'user')
        : undefined
      const targetUserMessage = userMessage ?? await messageStore.addMessage({
        sessionId,
        requestId,
        role: 'user',
        messageType: 'text',
        content,
        attachments,
        status: 'completed',
        seq: 0
      })

      if (!userMessage) {
        const rawMemoryContent = extractRawMemoryCaptureContent(content)
        if (rawMemoryContent) {
          // 记忆记录为 best-effort：失败不阻断消息发送，但给出可见提示（不再静默吞掉）
          try {
            await memoryStore.captureUserMessage({
              sessionId,
              messageId: targetUserMessage.id,
              content: rawMemoryContent
            })
          } catch (captureError) {
            const notificationStore = useNotificationStore()
            console.warn('Failed to capture raw memory:', captureError)
            notificationStore.warning('记忆记录失败', captureError instanceof Error ? captureError.message : '该消息未写入记忆')
          }
        }

        const messagePreview = this.buildMessagePreview(options?.previewContent ?? content, attachments)
        sessionStore.updateLastMessage(sessionId, messagePreview)

        const session = sessionStore.sessions.find(s => s.id === sessionId)
        if (session && (session.name === '未命名会话' || session.name.startsWith('新会话'))) {
          const titleSource = this.buildMessagePreview(options?.previewContent ?? content, attachments)
          const newTitle = titleSource.replace(/\n/g, ' ').slice(0, 20).trim()
          const finalTitle = newTitle.length < titleSource.length ? newTitle + '...' : newTitle
          if (finalTitle) {
            await sessionStore.updateSession(sessionId, { name: finalTitle })
          }
        }
      }

      const reuseAssistantMessageId = options?.reuseAssistantMessageId?.trim()
      const reusableAssistantMessage = reuseAssistantMessageId
        ? messageStore.messagesBySession(sessionId).find(message =>
            message.id === reuseAssistantMessageId
            && message.role === 'assistant'
            && message.status !== 'streaming'
          )
        : undefined

      // 文本行延迟"入场"：创建时使用未来哨兵时间戳，使其在首个 content chunk 到达前
      // 排到回合最末（thinking/tool 行各自按真实到达时间排序）。空内容行已被 CSS 隐藏，
      // 不会出现错位光标；首个文本到达时回填真实 createdAt，落到正确时序位置。
      const textRowSentinelCreatedAt = new Date(Date.now() + 86_400_000).toISOString()
      const aiMessage = reusableAssistantMessage ?? await messageStore.addMessage({
        sessionId,
        requestId,
        role: 'assistant',
        messageType: 'text',
        content: '',
        status: 'streaming',
        seq: 0
      }, { createdAt: textRowSentinelCreatedAt })

      if (reusableAssistantMessage) {
        await messageStore.updateMessage(reusableAssistantMessage.id, {
          status: 'streaming',
          errorMessage: '',
          createdAt: textRowSentinelCreatedAt
        })
      }

      const usageModelHint = await resolveUsageModelHint(agent)
      const executionAgent = (!agent.modelId?.trim() && usageModelHint)
        ? { ...agent, modelId: usageModelHint }
        : agent
      const requestedUsageModel = resolveRequestedUsageModel({
        requestedModelId: executionAgent.modelId,
        reportedModelId: usageModelHint
      })

      if (requestedUsageModel) {
        tokenStore.updateRealtimeTokens(sessionId, undefined, undefined, requestedUsageModel)
      }

      // 环境提示在新消息结构下走独立 system 行，此处不再塞进 aiMessage.runtimeNotices

      // 保存当前流式消息 ID
      sessionExecutionStore.setCurrentStreamingMessageId(sessionId, aiMessage.id)

      // 获取工作目录：优先使用传入的项目 ID，否则使用会话关联的项目
      let workingDirectory: string | undefined
      let targetProject = projectId
        ? projectStore.projects.find(p => p.id === projectId)
        : undefined

      if (options?.workingDirectory) {
        workingDirectory = options.workingDirectory
      } else if (projectId) {
        workingDirectory = targetProject?.path
      } else {
        const session = sessionStore.sessions.find(s => s.id === sessionId)
        if (session?.projectId) {
          targetProject = projectStore.projects.find(p => p.id === session.projectId)
          workingDirectory = targetProject?.path
        }
      }

      const [projectMemoryPrompt, mcpServers] = await Promise.all([
        this.buildProjectMemoryPrompt(targetProject?.memoryLibraryIds ?? []),
        loadAgentMcpServers(executionAgent).catch((error) => {
          console.warn('[ConversationService] Failed to load MCP servers:', error)
          return []
        })
      ])

      const session = sessionStore.sessions.find(s => s.id === sessionId)
      const sessionMessages = messageStore.messagesBySession(sessionId)
      const executionMessages = existingUserMessageId
        ? this.sliceMessagesForRetry(sessionMessages, targetUserMessage.id)
        : sessionMessages
      const reusableCliSessionId = await this.resolveReusableCliSessionId(
        session,
        executionAgent
      )

      const rawInjectedSystemMessages = (options?.injectedSystemMessages ?? [])
        .map(message => message.trim())
        .filter(message => message.length > 0)
      const imageAttachmentFallbackPrompt = this.buildImageAttachmentFallbackPrompt({
        agent: executionAgent,
        currentUserMessage: targetUserMessage,
        mcpServers
      })
      const sessionScopedPromptCandidates = [
        ...rawInjectedSystemMessages,
        ...(projectMemoryPrompt ? [projectMemoryPrompt] : []),
        ...(imageAttachmentFallbackPrompt ? [imageAttachmentFallbackPrompt] : []),
        buildMainConversationFormRequestPrompt()
      ]
      const shouldTrackSessionScopedPrompts = Boolean(options?.dedupeInjectedSystemMessagesBySession)
        || this.shouldReuseCliSession(executionAgent)
      const shouldTreatRuntimeAsInitialized = Boolean(reusableCliSessionId) && hadPriorConversation
      const shouldSkipRepeatedSessionScopedPrompts = shouldTreatRuntimeAsInitialized
        && !this.hasTrackedInjectedSystemMessages(sessionId)
      const injectedSystemMessages = shouldSkipRepeatedSessionScopedPrompts
        ? []
        : shouldTrackSessionScopedPrompts
          ? this.filterSessionScopedInjectedMessages(sessionId, sessionScopedPromptCandidates)
          : sessionScopedPromptCandidates

      const fullMessages = this.buildExecutionMessages(
        executionMessages,
        targetUserMessage,
        sessionId,
        injectedSystemMessages,
        content
      )

      // 构建对话上下文
      const messages = this.buildExecutionMessages(
        executionMessages,
        targetUserMessage,
        sessionId,
        injectedSystemMessages,
        content,
        reusableCliSessionId
      )
      const userMessages = messages.filter(message => message.role === 'user')
      const systemMessages = messages.filter(message => message.role === 'system')
      const assistantMessages = messages.filter(message => message.role === 'assistant')
      const selectedExpert = resolveSubAgentById(session?.expertId, useSubAgentStore().subAgents)
      // 上下文策略提示在新结构下走独立 system 行，不再构造塞进 aiMessage
      void selectedExpert

      console.info('[ConversationService] assembled context messages', {
        sessionId,
        messageCount: messages.length,
        systemMessageCount: systemMessages.length,
        assistantMessageCount: assistantMessages.length,
        historyMessageCount: Math.max(0, fullMessages.length - 1),
        resumeSessionId: reusableCliSessionId ?? null,
        lastUserMessageLength: userMessages.length > 0
          ? (userMessages[userMessages.length - 1].content ?? '').length
          : 0
      })

      // 上下文策略提示在新结构下不再塞进 aiMessage.runtimeNotices

      const context: ConversationContext = {
        sessionId,
        requestId,
        agent: executionAgent,
        messages,
        workingDirectory,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        executionMode: 'chat',
        responseMode: 'stream_text',
        resumeSessionId: reusableCliSessionId,
        reasoningEffort: options?.reasoningEffort as ReasoningEffortLevel | undefined,
        extraCliArgs: options?.extraCliArgs
      }
      const fallbackContext = reusableCliSessionId
        ? {
            ...context,
            messages: fullMessages,
            resumeSessionId: undefined
          }
        : undefined

      await this.syncSessionExecutionBinding(sessionId, executionAgent)

      await this.executeConversation(context, aiMessage, sessionId, targetProject?.id, fallbackContext, epoch)
      if (shouldTrackSessionScopedPrompts) {
        this.markInjectedSystemMessages(sessionId, sessionScopedPromptCandidates)
      }

    } catch (error) {
      if (this.sendEpochs.get(sessionId) === epoch) {
        this.finalizeSend(sessionId, epoch)
      }
      throw error
    }
  }

  private finalizeSend(sessionId: string, expectedEpoch?: number) {
    if (expectedEpoch !== undefined && this.sendEpochs.get(sessionId) !== expectedEpoch) {
      return
    }
    const sessionExecutionStore = useSessionExecutionStore()
    this.activeSendSessions.delete(sessionId)
    sessionExecutionStore.endSending(sessionId)
    void this.processQueuedMessages(sessionId)
  }

  forceResetSendingState(sessionId: string): void {
    const messageStore = useMessageStore()
    const sessionExecutionStore = useSessionExecutionStore()

    agentExecutor.abort(sessionId)
    this.clearConversationRetryState(sessionId)

    const streamingMessageId = sessionExecutionStore.getExecutionState(sessionId).currentStreamingMessageId
    if (streamingMessageId) {
      messageStore.updateMessage(streamingMessageId, {
        status: 'interrupted',
        errorMessage: MANUAL_STOP_ERROR_MARKER
      })
    }

    this.activeSendSessions.delete(sessionId)
    sessionExecutionStore.endSending(sessionId)

    const nextEpoch = (this.sendEpochs.get(sessionId) ?? 0) + 1
    this.sendEpochs.set(sessionId, nextEpoch)
  }

  async drainQueue(sessionId: string): Promise<void> {
    await this.processQueuedMessages(sessionId)
  }

  private async processQueuedMessages(sessionId: string): Promise<void> {
    if (this.queueDrainLocks.has(sessionId)) {
      return
    }

    const sessionExecutionStore = useSessionExecutionStore()
    if (sessionExecutionStore.getIsBusy(sessionId)) {
      return
    }

    const nextDraft = sessionExecutionStore.popNextQueuedMessage(sessionId)
    if (!nextDraft) {
      return
    }

    this.queueDrainLocks.add(sessionId)
    sessionExecutionStore.setIsQueueDraining(sessionId, true)

    try {
      const sessionStore = useSessionStore()
      const agentTeamsStore = useSubAgentStore()
      const projectId = sessionStore.sessions.find(session => session.id === sessionId)?.projectId
      const expert = resolveSubAgentById(nextDraft.expertId, agentTeamsStore.subAgents)
      await this.sendMessage(
        sessionId,
        nextDraft.content,
        nextDraft.agentId,
        projectId,
        nextDraft.attachments,
        {
          modelId: nextDraft.modelId,
          injectedSystemMessages: expert
            ? [buildSubAgentSystemPrompt(expert.prompt)]
            : undefined,
          previewContent: nextDraft.displayContent
        }
      )
    } catch (error) {
      const notificationStore = useNotificationStore()
      const errorMessage = getErrorMessage(error, '发送待发送消息失败')
      void writeFrontendRuntimeLog(
        'ERROR',
        'conversation-queue',
        `drainQueue failed | sessionId=${sessionId} | draftId=${nextDraft.id} | agentId=${nextDraft.agentId} | expertId=${nextDraft.expertId} | error=${errorMessage}`,
        error
      )
      sessionExecutionStore.restoreQueuedMessage(sessionId, {
        ...nextDraft,
        status: 'failed',
        errorMessage
      })
      notificationStore.smartError('发送待发送消息', error instanceof Error ? error : new Error(errorMessage))
    } finally {
      this.queueDrainLocks.delete(sessionId)
      sessionExecutionStore.setIsQueueDraining(sessionId, false)

      const hasPendingQueuedMessages = sessionExecutionStore
        .getExecutionState(sessionId)
        .queuedMessages
        .some(draft => draft.status === 'queued')

      if (!sessionExecutionStore.getIsBusy(sessionId) && hasPendingQueuedMessages) {
        queueMicrotask(() => {
          void this.processQueuedMessages(sessionId)
        })
      }
    }
  }

  private async resetSessionRuntimeAfterAbort(sessionId: string): Promise<void> {
    const sessionStore = useSessionStore()
    const session = sessionStore.sessions.find(s => s.id === sessionId)
    const currentProvider = session?.cliSessionProvider?.trim()

    if (currentProvider) {
      const runtimeKey = this.cliRuntimeKeys.find(key => key === currentProvider)
      if (runtimeKey) {
        await deleteSessionRuntimeBinding(sessionId, runtimeKey).catch(console.error)
      }
    }

    await sessionStore.updateSession(sessionId, {
      cliSessionId: '',
      cliSessionProvider: ''
    })
  }

  private buildMessagePreview(content: string, attachments: MessageAttachment[]): string {
    const trimmed = content.trim()
    if (trimmed) {
      return trimmed.slice(0, 50)
    }

    if (attachments.length === 1) {
      return attachments[0].name.trim()
    }

    if (attachments.length > 1) {
      return i18n.global.t('message.queueAttachments', { count: attachments.length }) as string
    }

    return ''
  }

  private async buildProjectMemoryPrompt(memoryLibraryIds: string[]): Promise<string | null> {
    return loadMountedMemoryPrompt(memoryLibraryIds)
  }

  /**
   * 主会话里用户发送图片时，为具备 MCP 的 CLI 运行时补充视觉降级策略。
   * 这里不绑定具体模型名，只约束“能直读则直读，不能直读则优先用可用 MCP”。
   */
  private buildImageAttachmentFallbackPrompt(input: {
    agent: AgentConfig
    currentUserMessage: Message
    mcpServers: McpServerConfig[]
  }): string | null {
    const { agent, currentUserMessage, mcpServers } = input
    if (agent.provider !== 'opencode') {
      return null
    }

    const hasImageAttachments = (currentUserMessage.attachments ?? []).some(attachment =>
      attachment.mimeType.startsWith('image/') && attachment.path.trim().length > 0
    )
    if (!hasImageAttachments) {
      return null
    }

    return buildImageAttachmentFallbackSystemPrompt({
      runtimeName: 'OpenCode CLI',
      mcpServers
    })
  }

  private resolveCliSessionProvider(agent: AgentConfig): string | undefined {
    const provider = inferAgentProvider(agent)
    return provider?.trim() || undefined
  }

  /**
   * Codex CLI 的 resume 会复用外部会话里的文件视图。
   * 当前工作区如果在长会话期间被本地或其他工具改动，后续 apply_patch 容易基于旧上下文失败，
   * 因此主会话对 Codex 统一退回到“全量上下文 + 新执行”的稳妥路径。
   */
  private shouldReuseCliSession(agent: AgentConfig): boolean {
    if (!agent.acpCommand && !agent.cliPath) {
      return false
    }

    return resolveRuntimeBindingKey(agent) !== 'codex-acp'
  }

  private async resolveReusableCliSessionId(
    session: Session | undefined,
    agent: AgentConfig
  ): Promise<string | undefined> {
    if (!session || !this.shouldReuseCliSession(agent)) {
      return undefined
    }

    const runtimeKey = resolveRuntimeBindingKey(agent)
    if (runtimeKey) {
      try {
        const binding = await getSessionRuntimeBinding(session.id, runtimeKey)
        const externalSessionId = binding?.externalSessionId?.trim()
        if (externalSessionId) {
          return externalSessionId
        }
      } catch (error) {
        console.warn('[ConversationService] Failed to read session runtime binding:', error)
      }
    }

    const cliSessionId = session.cliSessionId?.trim()
    if (!cliSessionId) {
      return undefined
    }

    const expectedProvider = this.resolveCliSessionProvider(agent)
    const boundProvider = session.cliSessionProvider?.trim()
    if (expectedProvider && boundProvider && expectedProvider !== boundProvider) {
      return undefined
    }

    return cliSessionId
  }

  private buildExecutionMessages(
    sessionMessages: Message[],
    currentUserMessage: Message,
    sessionId: string,
    injectedSystemMessages: string[],
    fallbackUserContent: string,
    resumeSessionId?: string
  ): Message[] {
    const sourceMessages = resumeSessionId
      ? [currentUserMessage]
      : sessionMessages

    return buildConversationMessages(sourceMessages, {
      fallbackUserContent,
      sessionId,
      injectedSystemMessages
    })
  }

  private sliceMessagesForRetry(sessionMessages: Message[], userMessageId: string): Message[] {
    const userMessageIndex = sessionMessages.findIndex(message => message.id === userMessageId)
    if (userMessageIndex < 0) {
      return sessionMessages
    }

    return sessionMessages.slice(0, userMessageIndex + 1)
  }

  private async syncSessionExecutionBinding(
    sessionId: string,
    agent: AgentConfig,
    overrides: Partial<Pick<Session, 'cliSessionId' | 'cliSessionProvider'>> = {}
  ): Promise<void> {
    const sessionStore = useSessionStore()
    const currentSession = sessionStore.sessions.find(session => session.id === sessionId)
    if (!currentSession) {
      return
    }

    const provider = this.resolveCliSessionProvider(agent)
    const nextAgentType = provider || agent.type
    const shouldRetainCliBinding = Boolean(provider)
    const currentCliSessionProvider = currentSession.cliSessionProvider?.trim()
    const shouldReuseCurrentCliSessionId = shouldRetainCliBinding
      && provider
      && currentCliSessionProvider === provider
    const nextCliSessionId = shouldRetainCliBinding
      ? (overrides.cliSessionId ?? (shouldReuseCurrentCliSessionId ? currentSession.cliSessionId : ''))
      : ''
    const nextCliSessionProvider = shouldRetainCliBinding
      ? (overrides.cliSessionProvider ?? provider ?? currentSession.cliSessionProvider)
      : ''

    if (
      currentSession.agentId === agent.id
      && currentSession.agentType === nextAgentType
      && (currentSession.cliSessionId ?? '') === (nextCliSessionId ?? '')
      && (currentSession.cliSessionProvider ?? '') === (nextCliSessionProvider ?? '')
    ) {
      return
    }

    await sessionStore.updateSession(sessionId, {
      agentId: agent.id,
      agentType: nextAgentType,
      cliSessionId: nextCliSessionId,
      cliSessionProvider: nextCliSessionProvider
    })
  }

  /**
   * 执行对话
   */
  private async executeConversation(
    context: ConversationContext,
    aiMessage: Message,
    sessionId: string,
    projectId?: string,
    fallbackContext?: ConversationContext,
    epoch?: number
  ): Promise<void> {
    const messageStore = useMessageStore()
    const sessionStore = useSessionStore()
    const sessionExecutionStore = useSessionExecutionStore()
    const tokenStore = useTokenStore()
    const resolvedProjectId = projectId
      ?? sessionStore.sessions.find(session => session.id === sessionId)?.projectId
      ?? null
    const runtimeProvider = inferAgentProvider(context.agent) ?? context.agent.provider ?? context.agent.type
    const runtimeLabel = runtimeProvider.toUpperCase()

    let accumulatedContent = aiMessage.content
      ? `${aiMessage.content.trimEnd()}\n\n`
      : ''
    let accumulatedThinking = ''
    // 实时思考行（仅内存，不落库；后端 MessageRecorder 已落库对应 thinking 行）。
    // 首个思考增量到达时创建，content 到达后由 onDone 收尾（置 completed）。
    // 用对象容器避免 TS 闭包控制流收窄（赋值发生在异步闭包内，同步读取处会被推断为初始 null）。
    const liveThinking = { message: null as Message | null }
    // 实时工具调用行（仅内存，不落库；后端 MessageRecorder 已落库对应 tool_use/tool_result 行）。
    // 按 toolCallId 索引，支持同一回合多工具并发。首个 tool_use 到达时创建，
    // onDone/handleFailure/catch 收尾时置 completed/error，刷新后由后端落库行接管（与 thinking 双轨一致）。
    const liveToolMessages = new Map<string, { message: Message | null }>()
    const toolCalls: ToolCall[] = []
    const editTraces: FileEditTrace[] = []
    const usageState: { model?: string, inputTokens?: number, outputTokens?: number, cacheReadInputTokens?: number, cacheCreationInputTokens?: number, contextWindowOccupancy?: number } = {
      model: resolveRequestedUsageModel({
        requestedModelId: context.agent.modelId
      })
    }
    const fileTraceCollector = new FileTraceCollector({
      sessionId,
      messageId: aiMessage.id,
      projectPath: context.workingDirectory
    })
    const pendingTraceTasks = new Set<Promise<void>>()
    const pendingPersistenceTasks = new Set<Promise<void>>()
    const cliSessionProvider = this.resolveCliSessionProvider(context.agent)
    const cliSnapshotProvider = (
      cliSessionProvider === 'claude'
      || cliSessionProvider === 'codex'
      || cliSessionProvider === 'opencode'
    )
      ? cliSessionProvider
      : undefined
    const shouldDeferCliUsageSync = Boolean(context.agent.acpCommand || context.agent.cliPath)
    const runtimeKey = resolveRuntimeBindingKey(context.agent)
    const streamMetrics: StreamTimingMetrics = {
      startedAt: globalThis.performance?.now() ?? Date.now()
    }
    let usageBaseline: UsageBaseline | null = null
    let lastErrorMessage = ''
    let usageRecorded = false
    let latestExternalSessionId: string | undefined
    let pendingUiUpdate: Partial<Message> | null = null
    let scheduledUiFlushAnimationFrame: number | null = null
    let scheduledUiFlushTimeout: ReturnType<typeof setTimeout> | null = null
    // 文本行哨兵时间戳是否已在首个 content 到达时回填为真实时间（仅触发一次）
    let textRowCreatedAtAnchored = false

    const registerTraceTask = (task: Promise<void>) => {
      pendingTraceTasks.add(task)
      task.finally(() => pendingTraceTasks.delete(task))
    }

    const registerPersistenceTask = (task: Promise<void>) => {
      pendingPersistenceTasks.add(task)
      task.finally(() => pendingPersistenceTasks.delete(task))
    }

    const registerCliSessionBinding = (externalSessionId?: string) => {
      const normalizedExternalSessionId = externalSessionId?.trim()
      if (!normalizedExternalSessionId || !cliSessionProvider) {
        return
      }

      latestExternalSessionId = normalizedExternalSessionId

      registerPersistenceTask(
        (async () => {
          if (runtimeKey) {
            await upsertSessionRuntimeBinding(
              sessionId,
              runtimeKey,
              normalizedExternalSessionId
            )
          }

          await this.syncSessionExecutionBinding(sessionId, context.agent, {
            cliSessionId: normalizedExternalSessionId,
            cliSessionProvider
          })
        })()
      )
    }

    const now = () => globalThis.performance?.now() ?? Date.now()

    const markMetric = (key: keyof Omit<StreamTimingMetrics, 'startedAt'>) => {
      if (!streamMetrics[key]) {
        streamMetrics[key] = now()
      }
    }

    const clearScheduledUiFlush = () => {
      if (scheduledUiFlushAnimationFrame !== null && typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(scheduledUiFlushAnimationFrame)
        scheduledUiFlushAnimationFrame = null
      }

      if (scheduledUiFlushTimeout !== null) {
        clearTimeout(scheduledUiFlushTimeout)
        scheduledUiFlushTimeout = null
      }
    }

    const getCurrentAiMessage = () => {
      return messageStore.messagesBySession(sessionId)
        .find(message => message.id === aiMessage.id)
    }

    const isAiMessageInterrupted = () => getCurrentAiMessage()?.status === 'interrupted'

    const normalizeBufferedMessageUpdate = (
      updates: Partial<Message>
    ): Partial<Message> | null => {
      if (!isAiMessageInterrupted()) {
        return updates
      }

      const nextUpdates: Partial<Message> = { ...updates }

      if (nextUpdates.status === 'completed' || nextUpdates.status === 'error') {
        delete nextUpdates.status
      }

      delete nextUpdates.errorMessage

      return Object.keys(nextUpdates).length > 0 ? nextUpdates : null
    }

    const flushPendingUiUpdate = (options?: { immediate?: boolean }) => {
      clearScheduledUiFlush()
      if (!pendingUiUpdate) {
        return
      }

      markMetric('firstRenderAt')
      const updates = normalizeBufferedMessageUpdate(pendingUiUpdate)
      pendingUiUpdate = null
      if (!updates) {
        return
      }
      messageStore.updateMessageBuffered(aiMessage.id, updates, options)
    }

    const scheduleUiFlush = () => {
      if (scheduledUiFlushAnimationFrame !== null || scheduledUiFlushTimeout !== null) {
        return
      }

      if (typeof globalThis.requestAnimationFrame === 'function') {
        scheduledUiFlushAnimationFrame = globalThis.requestAnimationFrame(() => {
          scheduledUiFlushAnimationFrame = null
          flushPendingUiUpdate()
        })
      }

      // Tauri WebView 在长时间 CLI 流式输出期间可能推迟 animation frame，
      // 这里保留一个 timeout 兜底，确保消息/工具调用/token 能持续刷新到页面。
      scheduledUiFlushTimeout = setTimeout(() => {
        scheduledUiFlushTimeout = null
        flushPendingUiUpdate()
      }, 16)
    }

    const bufferMessageUpdate = (
      updates: Partial<Message>,
      options?: { immediate?: boolean }
    ) => {
      const normalizedUpdates = normalizeBufferedMessageUpdate(updates)
      if (!normalizedUpdates) {
        return
      }

      pendingUiUpdate = pendingUiUpdate
        ? { ...pendingUiUpdate, ...normalizedUpdates }
        : { ...normalizedUpdates }

      if (options?.immediate) {
        flushPendingUiUpdate(options)
        return
      }

      scheduleUiFlush()
    }

    // 确保"正在思考…"实时行存在（仅内存，不落库）。
    // 插入位置：紧跟在 AI 文本回复行（aiMessage）之后，使思考显示在正文上方。
    const ensureLiveThinkingMessage = async (): Promise<void> => {
      if (liveThinking.message) {
        return
      }
      try {
        liveThinking.message = await messageStore.addMessage({
          sessionId,
          requestId: context.requestId,
          role: 'assistant',
          messageType: 'thinking',
          content: '',
          status: 'streaming',
          // thinking 行按真实到达时间排序（不再共用 aiMessage 哨兵时间戳）。
          // seq 仅作同毫秒 tiebreaker；后端入库行有独立递增 seq，刷新后接管。
          seq: 0
        }, { persist: false })
      } catch (error) {
        // 创建失败不阻断主流程，仅记录
        console.warn('[ConversationService] Failed to create live thinking message:', error)
      }
    }

    // 确保工具调用实时行存在（仅内存，不落库）。
    // 按 toolCallId 复用，使同一工具的 use/result 增量落在同一条本地行上。
    const ensureLiveToolUseMessage = async (toolCall: ToolCall): Promise<Message | null> => {
      const existing = liveToolMessages.get(toolCall.id)
      if (existing?.message) {
        return existing.message
      }
      try {
        const liveMessage = await messageStore.addMessage({
          sessionId,
          requestId: context.requestId,
          role: 'assistant',
          messageType: 'tool_use',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          toolInput: toolCall.arguments ? JSON.stringify(toolCall.arguments) : '',
          status: 'streaming',
          // tool 行按真实到达时间排序（不再共用 aiMessage 哨兵时间戳）。
          seq: liveToolMessages.size
        }, { persist: false })
        liveToolMessages.set(toolCall.id, { message: liveMessage })
        return liveMessage
      } catch (error) {
        console.warn('[ConversationService] Failed to create live tool_use message:', error)
        return null
      }
    }

    // 收尾实时工具调用行（与 onDone/handleFailure/catch 的 thinking 收尾对称）：
    // 将所有未终态的本地行置为 completed/error，然后清空索引，刷新后由后端落库行接管。
    const finalizeLiveToolMessages = (hasError: boolean) => {
      for (const { message } of liveToolMessages.values()) {
        if (!message) continue
        messageStore.updateMessageBuffered(message.id, {
          status: hasError ? 'error' : 'completed'
        }, { immediate: true })
      }
      liveToolMessages.clear()
    }

    const recordTimingSummary = () => {
      const summary = {
        sessionId,
        messageId: aiMessage.id,
        firstEventMs: streamMetrics.firstEventAt
          ? Number((streamMetrics.firstEventAt - streamMetrics.startedAt).toFixed(1))
          : null,
        firstRenderMs: streamMetrics.firstRenderAt
          ? Number((streamMetrics.firstRenderAt - streamMetrics.startedAt).toFixed(1))
          : null,
        firstContentMs: streamMetrics.firstContentAt
          ? Number((streamMetrics.firstContentAt - streamMetrics.startedAt).toFixed(1))
          : null,
        firstThinkingMs: streamMetrics.firstThinkingAt
          ? Number((streamMetrics.firstThinkingAt - streamMetrics.startedAt).toFixed(1))
          : null,
        firstToolMs: streamMetrics.firstToolAt
          ? Number((streamMetrics.firstToolAt - streamMetrics.startedAt).toFixed(1))
          : null,
        doneMs: streamMetrics.doneAt
          ? Number((streamMetrics.doneAt - streamMetrics.startedAt).toFixed(1))
          : null,
        persistedMs: streamMetrics.persistedAt
          ? Number((streamMetrics.persistedAt - streamMetrics.startedAt).toFixed(1))
          : null
      }

      console.info('[ConversationService] stream timing metrics', summary)
      ;(globalThis as { __EASY_AGENT_LAST_STREAM_METRICS?: typeof summary }).__EASY_AGENT_LAST_STREAM_METRICS = summary
    }

    const recordUsageOnce = (occurredAt?: string) => {
      if (usageRecorded || !(context.agent.acpCommand || context.agent.cliPath)) {
        return
      }

      usageRecorded = true
      recordAgentCliUsageInBackground(context.agent, {
        executionId: `chat-${aiMessage.id}`,
        executionMode: 'chat',
        modelId: resolveRecordedModelId({
          reportedModelId: usageState.model,
          requestedModelId: context.agent.modelId
        }),
        projectId: resolvedProjectId,
        sessionId,
        messageId: aiMessage.id,
        inputTokens: usageState.inputTokens,
        outputTokens: usageState.outputTokens,
        cacheReadInputTokens: usageState.cacheReadInputTokens,
        cacheCreationInputTokens: usageState.cacheCreationInputTokens,
        occurredAt: occurredAt || new Date().toISOString()
      })
      // 本轮用量已落库，刷新会话累计用量缓存以即时更新浮层三指标
      void tokenStore.loadSessionUsageSummary(sessionId)
    }

    const syncRealtimeUsageNotice = (_options?: { immediate?: boolean }) => {
      // 用量在新结构下由后端 MessageRecorder 落库为独立 usage 行，前端仅更新 token 进度条
      tokenStore.updateRealtimeTokens(
        sessionId,
        usageState.inputTokens,
        usageState.outputTokens,
        usageState.model,
        usageState.contextWindowOccupancy
      )
    }

    const syncProcessingTimeNotice = () => {
      // 处理时长提示在新结构下不再塞进 aiMessage.runtimeNotices
    }

    const applyFinalUsageSnapshot = async () => {
      if (!(context.agent.acpCommand || context.agent.cliPath)) {
        syncRealtimeUsageNotice()
        tokenStore.updateRealtimeTokens(
          sessionId,
          usageState.inputTokens,
          usageState.outputTokens,
          usageState.model,
          usageState.contextWindowOccupancy
        )
        return
      }

      let finalUsageSnapshot = null
      try {
        finalUsageSnapshot = latestExternalSessionId && cliSnapshotProvider
          ? await readCliSessionUsageSnapshot({
            provider: cliSnapshotProvider,
            cliSessionId: latestExternalSessionId
          })
          : await readSessionCliUsageSnapshot(
            sessionStore.sessions.find(session => session.id === sessionId) ?? {
              id: sessionId,
              cliSessionProvider: cliSnapshotProvider,
              cliSessionId: latestExternalSessionId
            }
          )
      } catch (error) {
        console.warn('[ConversationService] Failed to read final CLI usage snapshot:', error)
      }

      if (finalUsageSnapshot) {
        const mergedUsageCounts = mergeFinalUsageSnapshotCounts({
          inputTokens: usageState.inputTokens,
          outputTokens: usageState.outputTokens
        }, {
          inputTokens: finalUsageSnapshot.inputTokens,
          outputTokens: finalUsageSnapshot.outputTokens
        }, cliSnapshotProvider ?? runtimeProvider)
        usageState.model = resolveRequestedUsageModel({
          requestedModelId: context.agent.modelId,
          reportedModelId: finalUsageSnapshot.model
        }) ?? usageState.model
        usageState.inputTokens = mergedUsageCounts.inputTokens
        usageState.outputTokens = mergedUsageCounts.outputTokens
        usageState.contextWindowOccupancy = finalUsageSnapshot.contextWindowOccupancy
      }

      syncRealtimeUsageNotice()
      tokenStore.updateRealtimeTokens(
        sessionId,
        usageState.inputTokens,
        usageState.outputTokens,
        usageState.model,
        usageState.contextWindowOccupancy
      )
    }

    /**
     * 统一处理“执行过程中出现失败”的收尾逻辑，覆盖抛异常与 error 事件两种路径。
     */
    const currentRetryUserMessageId = () => (
      [...context.messages]
        .reverse()
        .find(message => message.role === 'user')
        ?.id
      || null
    )
    let retryPresentationCleared = false

    const clearRetryPresentationOnRecoveredStream = () => {
      if (retryPresentationCleared) {
        return
      }

      const currentRetryState = sessionExecutionStore.getExecutionState(sessionId).currentRetryState
      const currentMessageRetryState = getCurrentAiMessage()?.retryState
      const hasRetryPresentation = (
        currentRetryState?.assistantMessageId === aiMessage.id
        || Boolean(currentMessageRetryState?.current)
      )

      if (!hasRetryPresentation) {
        return
      }

      retryPresentationCleared = true
      sessionExecutionStore.clearCurrentRetryState(sessionId)
      bufferMessageUpdate({
        retryState: undefined
      })
    }

    const handleFailure = async (errorMessage: string) => {
      // 失败时收尾实时思考行（与 onDone 对称），避免遗留 streaming 思考行
      if (liveThinking.message) {
        messageStore.updateMessageBuffered(liveThinking.message.id, {
          status: 'completed'
        }, { immediate: true })
        liveThinking.message = null
      }
      // 收尾实时工具调用行（与 thinking 对称）
      finalizeLiveToolMessages(true)
      const classifiedFailure = detectCliFailure(errorMessage)
      const shouldAutoRetry = this.checkConversationAutoRetry(sessionId, classifiedFailure)
      if (shouldAutoRetry) {
        clearScheduledUiFlush()
        pendingUiUpdate = null
        await Promise.allSettled(Array.from(pendingTraceTasks))
        await Promise.allSettled(Array.from(pendingPersistenceTasks))

        bufferMessageUpdate({
          status: 'streaming',
          errorMessage: '',
          content: ''
        }, { immediate: true })
        await messageStore.flushBufferedMessageUpdate(aiMessage.id, { notifyOnFailure: true })

        const settingsStore = useSettingsStore()
        const intervalMinutes = settingsStore.settings.retryIntervalMinutes ?? 5
        const retryCount = this.conversationRetryCount.get(sessionId) ?? 0
        const maxRetries = settingsStore.settings.cliFailureMaxRetries ?? 5
        const retryUserMessageId = currentRetryUserMessageId()
        const retryState = retryUserMessageId
          ? sessionExecutionStore.beginRetryAttempt(sessionId, {
            assistantMessageId: aiMessage.id,
            userMessageId: retryUserMessageId,
            max: maxRetries
          })
          : null
        const retryAttemptNumber = retryState?.current ?? retryCount
        // 自动重试提示在新结构下走独立 system 行，此处仅更新重试状态
        void retryAttemptNumber
        messageStore.updateMessageBuffered(aiMessage.id, {
          retryState: retryState ?? undefined,
          createdAt: new Date().toISOString()
        })

        this.scheduleConversationAutoRetry(
          sessionId,
          intervalMinutes,
          context,
          aiMessage,
          projectId
        )
        this.finalizeSend(sessionId, epoch)
        return
      }

      this.clearConversationRetryState(sessionId)
      sessionExecutionStore.clearCurrentRetryState(sessionId)
      await Promise.allSettled(Array.from(pendingPersistenceTasks))
      await applyFinalUsageSnapshot()
      syncProcessingTimeNotice()
      bufferMessageUpdate({
        status: 'error',
        errorMessage
      }, { immediate: true })
      await messageStore.flushBufferedMessageUpdate(aiMessage.id, { notifyOnFailure: true })
      markMetric('persistedAt')
      recordTimingSummary()
      recordUsageOnce(new Date().toISOString())
      this.finalizeSend(sessionId, epoch)
    }

    const detectCliFailure = (errorMessage?: string | null): CliFailureMatch | null => {
      const fragments = [
        createCliFailureFragment('error', errorMessage),
        createCliFailureFragment('content', accumulatedContent),
        ...toolCalls.flatMap((toolCall) => [
          createCliFailureFragment('tool_result', typeof toolCall.result === 'string' ? toolCall.result : undefined),
          createCliFailureFragment('error', toolCall.errorMessage)
        ])
      ].filter((item): item is NonNullable<typeof item> => Boolean(item))

      return classifyCliFailureFragments(runtimeLabel, fragments)
    }

    const hasPrimaryAssistantResponse = (): boolean => {
      const normalizedContent = accumulatedContent.trim()
      if (!normalizedContent) {
        return false
      }

      const contentFragment = createCliFailureFragment('content', normalizedContent)
      if (!contentFragment) {
        return false
      }

      return !classifyCliFailureFragments(runtimeLabel, [contentFragment])
    }

    const shouldSurfaceExecutionFailure = (): boolean => {
      if (!lastErrorMessage) {
        return false
      }

      if (!hasPrimaryAssistantResponse()) {
        return true
      }

      return Boolean(detectCliFailure(lastErrorMessage))
    }

    try {
      await agentExecutor.execute(context, (event: StreamEvent) => {
        markMetric('firstEventAt')
        registerCliSessionBinding(event.externalSessionId)
        this.handleStreamEvent(event, {
          aiMessage,
          sessionId,
          runtimeProvider,
          requestedModelId: context.agent.modelId?.trim() || undefined,
          toolCalls,
          onContent: (content) => {
            clearRetryPresentationOnRecoveredStream()
            markMetric('firstContentAt')
            // 首个文本到达时把哨兵时间戳回填为真实时间，使文本行落到正确时序位置
            // （思考/工具行已按各自到达时间排序，文本行此刻归位排在其后）。
            if (!textRowCreatedAtAnchored) {
              textRowCreatedAtAnchored = true
              messageStore.updateMessageBuffered(aiMessage.id, {
                createdAt: new Date().toISOString()
              })
            }
            accumulatedContent = mergeStreamingText(accumulatedContent, content, runtimeProvider)
            bufferMessageUpdate({
              content: accumulatedContent
            })
          },
          onThinking: (thinking) => {
            clearRetryPresentationOnRecoveredStream()
            markMetric('firstThinkingAt')
            accumulatedThinking = mergeStreamingText(accumulatedThinking, thinking, runtimeProvider)
            // 思考由后端 MessageRecorder 落库为独立 thinking 行；前端用一条仅内存的本地行做流式渲染，
            // 使"正在思考…"提示与打字机效果在流式期间即可呈现（刷新后由后端落库行接管）。
            void ensureLiveThinkingMessage().then(() => {
              if (liveThinking.message) {
                messageStore.updateMessageBuffered(liveThinking.message.id, {
                  content: accumulatedThinking
                })
              }
            })
          },
          onThinkingStart: () => {
            clearRetryPresentationOnRecoveredStream()
            void ensureLiveThinkingMessage()
          },
          onToolUse: (toolCall) => {
            clearRetryPresentationOnRecoveredStream()
            markMetric('firstToolAt')
            logger.log('[🔧 tool_use] received:', { id: toolCall.id, name: toolCall.name, status: toolCall.status, toolCallsCount: toolCalls.length })
            const existingIndex = toolCalls.findIndex(tc => tc.id === toolCall.id)
            let isNewToolCall = false
            if (existingIndex >= 0) {
              const existingToolCall = toolCalls[existingIndex]
              const finalizedStatus = existingToolCall.status === 'success' || existingToolCall.status === 'error'
                ? existingToolCall.status
                : toolCall.status
              toolCalls[existingIndex] = {
                ...existingToolCall,
                ...toolCall,
                arguments: mergeToolInputArguments(existingToolCall.arguments, toolCall.arguments),
                status: finalizedStatus,
                result: existingToolCall.result,
                errorMessage: existingToolCall.errorMessage
              }
            } else {
              toolCalls.push(toolCall)
              isNewToolCall = true
              logger.log('[🔧 tool_use] NEW tool pushed, total:', toolCalls.length)
            }
            logger.log('[🔧 tool_use] buffering update, msgStatus:', getCurrentAiMessage()?.status)
            // 工具调用由后端 MessageRecorder 落库为独立 tool_use 行；前端额外用一条仅内存的
            // 本地行做流式渲染（与 thinking 双轨一致），刷新后由后端落库行接管。
            if (isNewToolCall) {
              registerTraceTask((async () => {
                await fileTraceCollector.captureToolUse(toolCall)
              })())
            }
            // 推送本地行：新建或更新参数，使工具气泡在流式期间即时渲染
            void ensureLiveToolUseMessage(toolCall).then((liveMessage) => {
              if (liveMessage) {
                const mergedArguments = existingIndex >= 0
                  ? toolCalls[existingIndex].arguments
                  : toolCall.arguments
                if (mergedArguments && Object.keys(mergedArguments).length > 0) {
                  messageStore.updateMessageBuffered(liveMessage.id, {
                    toolInput: JSON.stringify(mergedArguments)
                  })
                }
                // 透传 ACP ToolKind / ToolCallLocation（跟随 Agent）
                if (toolCall.kind || toolCall.locations) {
                  messageStore.updateMessageBuffered(liveMessage.id, {
                    toolKind: toolCall.kind,
                    toolLocations: toolCall.locations
                  })
                }
              }
            })
          },
          onToolInputDelta: (toolCallId, toolInput) => {
            clearRetryPresentationOnRecoveredStream()
            const targetToolCall = (toolCallId
              ? toolCalls.find(tool => tool.id === toolCallId)
              : null) || [...toolCalls].reverse().find(tool => tool.status === 'running')

            if (!targetToolCall) {
              return
            }

            targetToolCall.arguments = mergeToolInputArguments(targetToolCall.arguments, toolInput)
            if (targetToolCall.id && toolInput && Object.keys(toolInput).length > 0) {
              fileTraceCollector.updateToolArguments(
                targetToolCall.id,
                targetToolCall.name,
                targetToolCall.arguments
              )
            }
            // 同步更新本地行参数，使工具气泡的入参随增量实时呈现
            const liveToolEntry = targetToolCall.id ? liveToolMessages.get(targetToolCall.id) : null
            if (liveToolEntry?.message && targetToolCall.arguments) {
              messageStore.updateMessageBuffered(liveToolEntry.message.id, {
                toolInput: JSON.stringify(targetToolCall.arguments)
              })
            }
          },
          onToolResult: (toolCallId, result, isError) => {
            logger.log('[🔧 tool_result] received:', { toolCallId, isError, resultLen: result?.length })
            if (!isError) {
              clearRetryPresentationOnRecoveredStream()
            }
            const tc = toolCalls.find(t => t.id === toolCallId)
            if (tc) {
              tc.result = result
              tc.status = isError ? 'error' : 'success'
              if (isError) {
                tc.errorMessage = result
              }
              logger.log('[🔧 tool_result] updating tool status to', tc.status)
              // 工具结果由后端落库为独立 tool_result 行
            } else {
              console.warn('[🔧 tool_result] toolCallId not found:', toolCallId, 'existing:', toolCalls.map(t => t.id))
            }
            // 同步更新本地行：在 tool_use 行上直接写入结果，使气泡即时变为 success/error
            // 渲染层 toolUseParsed 会读 message.toolResult 作为 fallback，无需创建独立 tool_result 行
            const liveToolEntry = liveToolMessages.get(toolCallId)
            if (liveToolEntry?.message) {
              messageStore.updateMessageBuffered(liveToolEntry.message.id, {
                toolResult: result,
                status: isError ? 'error' : 'completed',
                errorMessage: isError ? result : '',
                // 工具结果阶段可能补发最终的 ToolKind / ToolCallLocation
                toolKind: tc?.kind,
                toolLocations: tc?.locations
              })
            }

            if (!isError) {
              registerTraceTask((async () => {
                const trace = await fileTraceCollector.resolveToolResult(toolCallId, result)
                if (!trace) {
                  return
                }

                editTraces.push(trace)
                // 编辑追踪在新结构下不塞进 message
              })())
            }
          },
          onFileEdit: (trace) => {
            const exists = editTraces.some(existingTrace => existingTrace.id === trace.id)
            if (exists) {
              return
            }

            editTraces.push(trace)
            // 接入文件变更追踪 store，驱动消息底部汇总条与右侧审查
            try {
              useFileChangeStore().ingestStreamEdit(sessionId, trace)
            } catch (err) {
              console.error('[fileChange] ingest stream edit failed', err)
            }
          },
          onUsage: (usage) => {
            clearRetryPresentationOnRecoveredStream()
            const normalizedUsage = normalizeRuntimeUsage({
              provider: runtimeProvider,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              rawInputTokens: usage.rawInputTokens,
              rawOutputTokens: usage.rawOutputTokens,
              cacheReadInputTokens: usage.cacheReadInputTokens,
              cacheCreationInputTokens: usage.cacheCreationInputTokens,
              baseline: usageBaseline
            })
            usageBaseline = normalizedUsage.nextBaseline
            const normalizedUsageModel = resolveRequestedUsageModel({
              requestedModelId: context.agent.modelId,
              reportedModelId: usage.model
            })
            if (normalizedUsageModel) {
              usageState.model = normalizedUsageModel
            }
            const mergedUsageCounts = mergeResponseUsageCounts({
              inputTokens: usageState.inputTokens,
              outputTokens: usageState.outputTokens
            }, {
              inputTokens: normalizedUsage.inputTokens,
              outputTokens: normalizedUsage.outputTokens
            }, runtimeProvider)
            usageState.inputTokens = mergedUsageCounts.inputTokens
            usageState.outputTokens = mergedUsageCounts.outputTokens
            if (typeof normalizedUsage.cacheReadInputTokens === 'number') {
              usageState.cacheReadInputTokens = (usageState.cacheReadInputTokens ?? 0) + normalizedUsage.cacheReadInputTokens
            }
            if (typeof normalizedUsage.cacheCreationInputTokens === 'number') {
              usageState.cacheCreationInputTokens = (usageState.cacheCreationInputTokens ?? 0) + normalizedUsage.cacheCreationInputTokens
            }
            const nextContextWindowOccupancy = resolveRuntimeContextWindowOccupancy({
              provider: runtimeProvider,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              rawInputTokens: usage.rawInputTokens,
              rawOutputTokens: usage.rawOutputTokens
            })
            if (nextContextWindowOccupancy !== undefined && nextContextWindowOccupancy > 0) {
              usageState.contextWindowOccupancy = nextContextWindowOccupancy
            }

            if (!shouldDeferCliUsageSync) {
              tokenStore.updateRealtimeTokens(
                sessionId,
                usageState.inputTokens,
                usageState.outputTokens,
                usageState.model,
                usageState.contextWindowOccupancy
              )
              syncRealtimeUsageNotice()
            }
          },
          onContextWindow: (used, size) => {
            // 上下文窗口占用通道：ACP UsageUpdate{used,size}。
            // 仅更新进度环 used，保持计费 input/output token 不被覆盖。
            if (typeof used === 'number' && used > 0) {
              usageState.contextWindowOccupancy = used
            }
            // ACP 的 size 反映运行时上报的上下文上限：若可用，透传给 token store 作为 limit 参考
            if (!shouldDeferCliUsageSync) {
              tokenStore.updateRealtimeTokens(
                sessionId,
                undefined,
                undefined,
                undefined,
                typeof used === 'number' && used > 0 ? used : undefined,
                size
              )
            }
          },
          onSystem: (content) => {
            clearRetryPresentationOnRecoveredStream()

            if (content && content.includes('CLI Context Compaction')) {
              if (!shouldDeferCliUsageSync) {
                tokenStore.hardClearSessionTokens(sessionId)
                tokenStore.updateRealtimeTokens(
                  sessionId,
                  undefined,
                  undefined,
                  usageState.model,
                  0
                )
              }
              usageBaseline = null
              usageState.inputTokens = undefined
              usageState.outputTokens = undefined
              usageState.contextWindowOccupancy = undefined
              // 解析压缩明细，组装摘要并落库为独立 compression 行 → 渲染 CompressionMessageBubble
              const lines = content.split('\n').slice(1)
              const detailParts: string[] = []
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) continue
                if (trimmed.startsWith('Trigger:')) {
                  const raw = trimmed.replace('Trigger:', '').trim()
                  const label = raw === 'auto' ? i18n.global.t('compression.cliCompactionAuto') : raw === 'manual' ? i18n.global.t('compression.cliCompactionManual') : raw
                  detailParts.push(`- **${i18n.global.t('compression.cliCompactionTrigger')}**: ${label}`)
                } else if (trimmed.startsWith('Pre-compaction tokens:')) {
                  const val = trimmed.replace('Pre-compaction tokens:', '').trim()
                  detailParts.push(`- **${i18n.global.t('compression.cliCompactionPreTokens')}**: ${val}`)
                } else if (trimmed.startsWith('Truncation limit:')) {
                  const val = trimmed.replace('Truncation limit:', '').trim()
                  detailParts.push(`- **${i18n.global.t('compression.cliCompactionTruncationLimit')}**: ${val}`)
                } else {
                  detailParts.push(trimmed)
                }
              }
              const summaryMarkdown = detailParts.length > 0
                ? `**${i18n.global.t('compression.cliCompactionTitle')}**\n\n${detailParts.join('\n')}`
                : `**${i18n.global.t('compression.cliCompactionTitle')}**`
              void messageStore.addMessage({
                sessionId,
                requestId: context.requestId,
                role: 'assistant',
                messageType: 'compression',
                content: summaryMarkdown,
                status: 'completed',
                seq: 0
              })
              return
            }

            // 非压缩系统消息（如 "Connecting to agent via ACP…"）：
            // 落库为独立 system 行，前端以轻量状态条样式渲染
            if (content && content.trim()) {
              void messageStore.addMessage({
                sessionId,
                requestId: context.requestId,
                role: 'assistant',
                messageType: 'system',
                content,
                status: 'completed',
                seq: 0
              }).catch(error => {
                console.warn('[ConversationService] Failed to persist system message:', error)
              })
            }
          },
          onError: (error) => {
            if (isAiMessageInterrupted()) {
              return
            }

            lastErrorMessage = error
          },
          onPermissionRequest: (permission) => {
            // ask 模式下后端已挂起等待；写入权限 store 驱动询问弹窗
            usePermissionStore().setPending({
              sessionId,
              requestId: context.requestId,
              toolName: permission.toolName,
              toolInput: permission.toolInput,
              options: permission.options
            })
          },
          onPlan: (planJson) => {
            // ACP Agent Plan 全量替换语义：整体覆盖该会话最新计划，驱动右侧面板
            try {
              useAgentPlanStore().ingestStreamPlan(sessionId, planJson)
            } catch (err) {
              console.error('[agentPlan] ingest stream plan failed', err)
            }
          },
          onAvailableCommands: (commandsJson) => {
            // Agent 下发的可斜杠命令列表，驱动 `/` 下拉的 Agent 命令分组
            try {
              useAgentCapabilityStore().setAvailableCommands(sessionId, commandsJson)
            } catch (err) {
              console.error('[agentCapability] set available commands failed', err)
            }
          },
          onDone: () => {
            markMetric('doneAt')
            // 兜底：若整个回合无文本 content（纯工具回合），哨兵时间戳尚未回填，
            // 此时把文本行归位到当前时刻（排在所有已到达的思考/工具行之后）。
            if (!textRowCreatedAtAnchored) {
              textRowCreatedAtAnchored = true
              messageStore.updateMessageBuffered(aiMessage.id, {
                createdAt: new Date().toISOString()
              })
            }
            // 收尾实时思考行：正文已落定，把本地 thinking 行置为 completed。
            // 该行仅存在于内存，刷新后由后端落库的 thinking 行接管渲染。
            if (liveThinking.message) {
              messageStore.updateMessageBuffered(liveThinking.message.id, {
                status: 'completed'
              }, { immediate: true })
              liveThinking.message = null
            }
            // 收尾实时工具调用行（与 thinking 对称）
            finalizeLiveToolMessages(false)
            // 兜底清理：执行结束时移除可能残留的权限询问（后端超时 / 非正常完成）
            usePermissionStore().clearPending(sessionId)
            // 计划模式回合结束且 AI 已产出计划文档（最新 assistant text 非空）
            // → 标记待确认，弹出「开始执行 / 继续修改」
            if (sessionStore.isPlanMode(sessionId)) {
              const sessionMessages = messageStore.messagesBySession(sessionId)
              const hasPlanDoc = [...sessionMessages].reverse().some(
                msg => msg.role === 'assistant'
                  && msg.messageType === 'text'
                  && !!msg.content?.trim()
              )
              if (hasPlanDoc) {
                useAgentPlanStore().requestConfirm(sessionId)
              }
            }
            const finalizedToolCalls = finalizePendingToolCalls(toolCalls)
            if (finalizedToolCalls !== toolCalls) {
              toolCalls.splice(0, toolCalls.length, ...finalizedToolCalls)
            }
            syncProcessingTimeNotice()
            if (!shouldSurfaceExecutionFailure() && !isAiMessageInterrupted()) {
              bufferMessageUpdate({
                status: 'completed',
                errorMessage: ''
              }, { immediate: true })
              this.clearConversationRetryState(sessionId)
              sessionExecutionStore.clearCurrentRetryState(sessionId)
              sessionStore.updateLastMessage(
                sessionId,
                accumulatedContent.slice(0, 50)
              )
            }
            this.finalizeSend(sessionId, epoch)
          }
        })
      })

      flushPendingUiUpdate()
      await Promise.allSettled(Array.from(pendingTraceTasks))
      await Promise.allSettled(Array.from(pendingPersistenceTasks))
      await applyFinalUsageSnapshot()
      await messageStore.flushBufferedMessageUpdate(aiMessage.id, { notifyOnFailure: true })
      recordUsageOnce(new Date().toISOString())

      if (shouldSurfaceExecutionFailure() && !isAiMessageInterrupted()) {
        markMetric('doneAt')
        await handleFailure(lastErrorMessage || getCurrentAiMessage()?.errorMessage || '对话执行失败')
        return
      }

      const abnormalCompletion = detectCliFailure()
      if (abnormalCompletion && !isAiMessageInterrupted()) {
        markMetric('doneAt')
        await handleFailure(abnormalCompletion.message)
        return
      }

      markMetric('persistedAt')
      recordTimingSummary()

      // 兜底：部分后端/CLI 场景可能不会显式发出 done 事件，避免状态长期卡在“生成中”
      if (sessionExecutionStore.getIsSending(sessionId) && !isAiMessageInterrupted()) {
        markMetric('doneAt')
        const finalizedToolCalls = finalizePendingToolCalls(toolCalls)
        if (finalizedToolCalls !== toolCalls) {
          toolCalls.splice(0, toolCalls.length, ...finalizedToolCalls)
        }
        await applyFinalUsageSnapshot()
        syncProcessingTimeNotice()
        if (!shouldSurfaceExecutionFailure()) {
          bufferMessageUpdate({
            status: 'completed',
            errorMessage: ''
          }, { immediate: true })
          this.clearConversationRetryState(sessionId)
          sessionExecutionStore.clearCurrentRetryState(sessionId)
          sessionStore.updateLastMessage(
            sessionId,
            accumulatedContent.slice(0, 50)
          )
        }
        await messageStore.flushBufferedMessageUpdate(aiMessage.id, { notifyOnFailure: true })
        markMetric('persistedAt')
        recordTimingSummary()
        recordUsageOnce(new Date().toISOString())
        this.finalizeSend(sessionId, epoch)
      }
    } catch (error) {
      // 异常兜底：清理可能残留的实时思考行
      if (liveThinking.message) {
        messageStore.updateMessageBuffered(liveThinking.message.id, {
          status: 'completed'
        }, { immediate: true })
        liveThinking.message = null
      }
      // 异常兜底：清理可能残留的实时工具调用行
      finalizeLiveToolMessages(true)
      const errorMessage = getErrorMessage(error, '对话执行失败')
      void writeFrontendRuntimeLog(
        'ERROR',
        'conversation-service',
        `executeConversation failed | sessionId=${sessionId} | agentId=${context.agent.id} | provider=${context.agent.provider || context.agent.type} | error=${errorMessage}`,
        error
      )
      const shouldRetryWithoutResume = Boolean(
        fallbackContext
        && context.resumeSessionId
        && isInvalidCliResumeError(errorMessage, runtimeKey)
      )

      if (shouldRetryWithoutResume) {
        clearScheduledUiFlush()
        pendingUiUpdate = null
        await Promise.allSettled(Array.from(pendingTraceTasks))
        await Promise.allSettled(Array.from(pendingPersistenceTasks))

        if (runtimeKey) {
          try {
            await deleteSessionRuntimeBinding(sessionId, runtimeKey)
          } catch (bindingError) {
            console.warn('[ConversationService] Failed to clear invalid runtime binding:', bindingError)
          }
        }

        await this.syncSessionExecutionBinding(sessionId, context.agent, {
          cliSessionId: '',
          cliSessionProvider: ''
        })
        await messageStore.updateMessage(aiMessage.id, {
          content: '',
          errorMessage: '',
          status: 'pending'
        })

        return this.executeConversation(fallbackContext!, aiMessage, sessionId, projectId, undefined, epoch)
      }

      if (isAiMessageInterrupted()) {
        markMetric('doneAt')
        await Promise.allSettled(Array.from(pendingPersistenceTasks))
        await applyFinalUsageSnapshot()
        syncProcessingTimeNotice()
        await messageStore.flushBufferedMessageUpdate(aiMessage.id, { notifyOnFailure: true })
        markMetric('persistedAt')
        recordTimingSummary()
        recordUsageOnce(new Date().toISOString())
        this.finalizeSend(sessionId, epoch)
        return
      }

      markMetric('doneAt')
      await handleFailure(errorMessage)
    } finally {
      clearScheduledUiFlush()
    }
  }

  /**
   * 检查主会话是否应自动重试。返回 true 表示应继续等待重试。
   */
  private checkConversationAutoRetry(sessionId: string, failure: CliFailureMatch | null): boolean {
    if (!failure) {
      return false
    }

    const settingsStore = useSettingsStore()
    const maxRetries = settingsStore.settings.cliFailureMaxRetries ?? 5
    if (maxRetries <= 0) {
      return false
    }

    const currentCount = this.conversationRetryCount.get(sessionId) ?? 0
    if (currentCount >= maxRetries) {
      return false
    }

    this.conversationRetryCount.set(sessionId, currentCount + 1)
    void writeFrontendRuntimeLog(
      'INFO',
      'conversation-service',
      `auto-retry scheduled | sessionId=${sessionId} | retry=${currentCount + 1}/${maxRetries} | abnormalCompletion=${failure.message.slice(0, 200)}`
    )
    return true
  }

  private scheduleConversationAutoRetry(
    sessionId: string,
    intervalMinutes: number,
    context: ConversationContext,
    aiMessage: Message,
    projectId?: string
  ): void {
    this.cancelConversationAutoRetry(sessionId)

    const timer = setTimeout(async () => {
      this.conversationRetryTimers.delete(sessionId)

      const messageStore = useMessageStore()
      const sessionExecutionStore = useSessionExecutionStore()
      sessionExecutionStore.setIsAwaitingRetry(sessionId, false)
      const currentMessage = messageStore.messagesBySession(sessionId)
        .find(message => message.id === aiMessage.id)
      if (!currentMessage || currentMessage.status === 'interrupted') {
        this.clearConversationRetryState(sessionId)
        return
      }

      try {
        await messageStore.updateMessage(aiMessage.id, {
          content: '',
          errorMessage: '',
          status: 'streaming',
          createdAt: new Date().toISOString()
        })
        sessionExecutionStore.startSending(sessionId)
        await this.executeConversation(context, aiMessage, sessionId, projectId, undefined, undefined)
      } catch (retryError) {
        void writeFrontendRuntimeLog(
          'ERROR',
          'conversation-service',
          `auto-retry execute failed | sessionId=${sessionId} | error=${getErrorMessage(retryError, '重试执行失败')}`,
          retryError
        )
      }
    }, intervalMinutes * 60 * 1000)

    useSessionExecutionStore().setIsAwaitingRetry(sessionId, true)
    this.conversationRetryTimers.set(sessionId, timer)
  }

  private cancelConversationAutoRetry(sessionId: string): void {
    const existingTimer = this.conversationRetryTimers.get(sessionId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.conversationRetryTimers.delete(sessionId)
    }
  }

  private clearConversationRetryState(sessionId: string): void {
    this.cancelConversationAutoRetry(sessionId)
    useSessionExecutionStore().setIsAwaitingRetry(sessionId, false)
    this.conversationRetryCount.delete(sessionId)
  }

  getConversationRetryCount(sessionId: string): number {
    return this.conversationRetryCount.get(sessionId) ?? 0
  }

  isConversationRetryScheduled(sessionId: string): boolean {
    return this.conversationRetryTimers.has(sessionId)
  }

  /**
   * 处理流式事件
   */
  private handleStreamEvent(
    event: StreamEvent,
    handlers: {
      aiMessage: Message
      sessionId: string
      runtimeProvider?: string
      requestedModelId?: string
      toolCalls: ToolCall[]
      onContent: (content: string) => void
      onThinking: (thinking: string) => void
      onThinkingStart: () => void
      onToolUse: (toolCall: ToolCall) => void
      onToolInputDelta: (toolCallId: string | undefined, toolInput: Record<string, unknown> | undefined) => void
      onToolResult: (toolCallId: string, result: string, isError: boolean) => void
      onFileEdit: (trace: FileEditTrace) => void
      onUsage: (usage: {
        model?: string
        inputTokens?: number
        outputTokens?: number
        rawInputTokens?: number
        rawOutputTokens?: number
        cacheReadInputTokens?: number
        cacheCreationInputTokens?: number
      }) => void
      // 上下文窗口占用通道（ACP UsageUpdate），仅更新进度环 used，不触碰计费 token
      onContextWindow: (used: number | undefined, size: number | undefined) => void
      onSystem: (content: string) => void
      onError: (error: string) => void
      onPermissionRequest: (permission: {
        toolName: string
        toolInput?: Record<string, unknown>
        options: { optionId: string; name: string; kind: string }[]
      }) => void
      /** ACP Agent Plan 全量快照（JSON 字符串），驱动右侧计划面板实时更新 */
      onPlan: (planJson: string) => void
      /** ACP Agent 下发的可斜杠命令列表（JSON 字符串），驱动 `/` 下拉 Agent 分组 */
      onAvailableCommands: (commandsJson: string) => void
      onDone: () => void
    }
  ): void {
    const { onContent, onThinking, onThinkingStart, onToolUse, onToolInputDelta, onToolResult, onFileEdit, onUsage, onContextWindow, onSystem, onError, onPermissionRequest, onPlan, onAvailableCommands, onDone } = handlers

    switch (event.type) {
      case 'content':
        if (event.content) {
          onContent(event.content)
        }
        break

      case 'thinking':
        if (event.content) {
          onThinking(event.content)
        }
        break

      case 'thinking_start':
        onThinkingStart()
        break

      case 'tool_use':
        if (event.toolName) {
          const toolCallId = resolveToolCallId(event)
          const toolCall: ToolCall = {
            id: toolCallId,
            name: event.toolName,
            arguments: event.toolInput || {},
            status: 'running',
            kind: event.toolKind,
            locations: event.toolLocations
          }
          onToolUse(toolCall)
        } else {
          console.warn('[ConversationService] tool_use 事件缺少 toolName，跳过处理')
        }
        break

      case 'tool_input_delta':
        onToolInputDelta(event.toolCallId, event.toolInput)
        break

      case 'tool_result':
        // 工具结果阶段可能补发最终的 ToolKind / ToolCallLocation，先回填到 toolCalls 索引
        if (event.toolCallId && (event.toolKind || event.toolLocations)) {
          const tc = handlers.toolCalls.find(t => t.id === event.toolCallId)
          if (tc) {
            if (event.toolKind) tc.kind = event.toolKind
            if (event.toolLocations) tc.locations = event.toolLocations
          }
        }
        if (event.toolCallId) {
          const result = typeof event.toolResult === 'string'
            ? event.toolResult
            : JSON.stringify(event.toolResult, null, 2)
          onToolResult(event.toolCallId, result, false)
        } else {
          console.warn('[ConversationService] tool_result 事件缺少 toolCallId，尝试匹配最后一个工具调用')
          const lastRunningTool = [...handlers.toolCalls].reverse().find(tc => tc.status === 'running')
          if (lastRunningTool && event.toolResult) {
            const result = typeof event.toolResult === 'string'
              ? event.toolResult
              : JSON.stringify(event.toolResult, null, 2)
            onToolResult(lastRunningTool.id, result, false)
          }
        }
        break

      case 'error':
        if (event.error) {
          onError(event.error)
        }
        break

      case 'usage':
        onUsage({
          model: event.model,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          rawInputTokens: event.rawInputTokens,
          rawOutputTokens: event.rawOutputTokens,
          cacheReadInputTokens: event.cacheReadInputTokens,
          cacheCreationInputTokens: event.cacheCreationInputTokens
        })
        break

      case 'context_window':
        // 独立通道：仅刷新上下文窗口占用（进度环 used），不改计费 token，
        // 避免 ACP UsageUpdate.used 覆盖回合结束时 PromptResponse.usage 的累计输入。
        onContextWindow(event.contextWindowUsed, event.contextWindowSize)
        break

      case 'system':
        if (event.content) {
          onSystem(event.content)
        }
        break

      case 'file_edit':
        if (event.fileEdit) {
          onFileEdit(event.fileEdit)
        }
        break

      case 'permission_request':
        onPermissionRequest({
          toolName: event.toolName ?? '',
          toolInput: event.toolInput,
          options: event.permissionOptions ?? []
        })
        break

      case 'plan':
        if (event.content) {
          onPlan(event.content)
        }
        break

      case 'available_commands':
        if (event.content) {
          onAvailableCommands(event.content)
        }
        break

      case 'done':
        onDone()
        break
    }
  }

  /**
   * 中断指定会话的执行
   * @param sessionId 会话 ID
   * @param messageId 可选的消息 ID，用于更新消息状态
   */
  abort(sessionId: string, messageId?: string): Promise<void>

  /**
   * 中断当前执行（向后兼容）
   * @deprecated 使用 abort(sessionId) 替代
   */
  abort(): void

  /**
   * 中断执行的具体实现
   */
  async abort(sessionId?: string, messageId?: string): Promise<void> {
    const messageStore = useMessageStore()
    const sessionExecutionStore = useSessionExecutionStore()

    if (sessionId) {
      this.clearConversationRetryState(sessionId)

      // 中断指定会话
      const streamingMessageId = sessionExecutionStore.getExecutionState(sessionId).currentStreamingMessageId
      if (messageId && streamingMessageId && messageId !== streamingMessageId) {
        void messageStore.updateMessage(messageId, {
          status: 'interrupted',
          errorMessage: MANUAL_STOP_ERROR_MARKER
        })
        return
      }

      // 1. 调用 AgentExecutor 中断策略
      agentExecutor.abort(sessionId)

      // 2. 更新消息状态为 interrupted
      if (messageId) {
        messageStore.updateMessage(messageId, {
          status: 'interrupted',
          errorMessage: MANUAL_STOP_ERROR_MARKER
        })
      } else {
        // 如果没有传入 messageId，从 sessionExecutionStore 获取当前流式消息 ID
        if (streamingMessageId) {
          messageStore.updateMessage(streamingMessageId, {
            status: 'interrupted',
            errorMessage: MANUAL_STOP_ERROR_MARKER
          })
        }
      }

      // 3. 更新会话执行状态
      try {
        await this.resetSessionRuntimeAfterAbort(sessionId)
      } catch (error) {
        console.warn('[ConversationService] Failed to reset runtime binding after abort:', error)
      } finally {
        this.finalizeSend(sessionId)
      }
    } else {
      // 向后兼容：中断所有正在执行的会话
      const runningIds = sessionExecutionStore.runningSessionIds
      for (const id of runningIds) {
        await this.abort(id)
      }
    }
  }

  /**
   * 检查智能体是否可用
   */
  isAgentAvailable(agent: AgentConfig): { available: boolean; reason?: string } {
    if (!agentExecutor.isSupported(agent)) {
      return {
        available: false,
        reason: `不支持的智能体类型: ${agent.type}`
      }
    }

    return { available: true }
  }
}

// 导出单例
export const conversationService = ConversationService.getInstance()
