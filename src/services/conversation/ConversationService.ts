import { MANUAL_STOP_ERROR_MARKER, useMessageStore, type Message, type MessageAttachment, type ToolCall } from '@/stores/message'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore, type Session } from '@/stores/session'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useProjectStore } from '@/stores/project'
import { useAgentStore, type AgentConfig, inferAgentProvider } from '@/stores/agent'
import { useNotificationStore } from '@/stores/notification'
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
  buildMainConversationLanguagePrompt,
  buildMainConversationFormRequestPrompt
} from './prompts'
import { resolveUsageModelHint } from './usageModelHint'
import { loadAgentMcpServers } from '@/utils/mcpServerConfig'
import { mergeToolInputArguments } from '@/utils/toolInput'
import { mergeStreamingText } from '@/utils/mergeStreamingText'
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

/** 解析 CLI Context Compaction 系统消息，生成前端摘要 */
function buildCompactionSummary(content: string): string {
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
      detailParts.push(`- **${i18n.global.t('compression.cliCompactionPreTokens')}**: ${trimmed.replace('Pre-compaction tokens:', '').trim()}`)
    } else if (trimmed.startsWith('Truncation limit:')) {
      detailParts.push(`- **${i18n.global.t('compression.cliCompactionTruncationLimit')}**: ${trimmed.replace('Truncation limit:', '').trim()}`)
    } else {
      detailParts.push(trimmed)
    }
  }
  return detailParts.length > 0
    ? `**${i18n.global.t('compression.cliCompactionTitle')}**\n\n${detailParts.join('\n')}`
    : `**${i18n.global.t('compression.cliCompactionTitle')}**`
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

      const aiMessage: Message = reusableAssistantMessage ?? {
        id: `local_anchor_${requestId}`,
        sessionId,
        requestId,
        role: 'assistant',
        messageType: 'text',
        content: '',
        status: 'streaming',
        seq: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (reusableAssistantMessage) {
        await messageStore.updateMessage(reusableAssistantMessage.id, {
          status: 'streaming',
          errorMessage: ''
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
        buildMainConversationLanguagePrompt(),
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

    // 收尾所有 streaming 行：onDone/onError/onAbort 时调用
    const finalizeStreamingMessages = (status: Message['status']) => {
      for (const msg of messageStore.messagesBySession(sessionId)) {
        if (msg.requestId === context.requestId && msg.status === 'streaming') {
          messageStore.updateMessageBuffered(msg.id, { status }, { immediate: true })
        }
      }
    }
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
    let hasAcpContextWindow = false
    let latestExternalSessionId: string | undefined
    let receivedPlanEvent = false
    let pendingUiUpdate: Partial<Message> | null = null
    let scheduledUiFlushAnimationFrame: number | null = null
    let scheduledUiFlushTimeout: ReturnType<typeof setTimeout> | null = null
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

    const syncRealtimeUsageNotice = () => {
      // 用量在新结构下由后端 MessageRecorder 落库为独立 usage 行，前端仅更新 token 进度条
      tokenStore.updateRealtimeTokens(
        sessionId,
        usageState.inputTokens,
        usageState.outputTokens,
        usageState.model,
        usageState.contextWindowOccupancy,
        undefined,
        hasAcpContextWindow ? 'acp' : undefined
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
          usageState.contextWindowOccupancy,
          undefined,
          hasAcpContextWindow ? 'acp' : undefined
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
        if (usageState.contextWindowOccupancy === undefined) {
          usageState.contextWindowOccupancy = finalUsageSnapshot.contextWindowOccupancy
        }
      }

      syncRealtimeUsageNotice()
      tokenStore.updateRealtimeTokens(
        sessionId,
        usageState.inputTokens,
        usageState.outputTokens,
        usageState.model,
        usageState.contextWindowOccupancy,
        undefined,
        hasAcpContextWindow ? 'acp' : (usageState.contextWindowOccupancy !== undefined ? 'snapshot' : undefined)
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

    let lastSegmentType: string | null = null
    let lastSegmentMessageId: string | null = null

    const finalizePreviousSegment = (currentType: string) => {
      if (lastSegmentType === currentType) return
      if (!lastSegmentType || !lastSegmentMessageId) {
        lastSegmentType = currentType
        return
      }
      const prevMsg = messageStore.messagesBySession(sessionId)
        .find(m => m.id === lastSegmentMessageId && m.status === 'streaming')
      if (prevMsg) {
        messageStore.updateMessageBuffered(prevMsg.id, { status: 'completed' }, { immediate: true })
      }
      lastSegmentType = currentType
      lastSegmentMessageId = null
    }

    const handleFailure = async (errorMessage: string) => {
      finalizeStreamingMessages('error')
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
          retryState: retryState ?? undefined
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
      const hasVisibleAssistantEvent = messageStore.messagesBySession(sessionId).some(message =>
        message.requestId === context.requestId
        && message.role === 'assistant'
        && message.messageType !== 'usage'
        && message.messageType !== 'context_window'
        && message.messageType !== 'system'
        && (
          message.messageType === 'thinking'
          || message.messageType === 'tool_use'
          || message.messageType === 'tool_result'
          || Boolean(message.content?.trim())
        )
      )
      if (!hasVisibleAssistantEvent) {
        await messageStore.addMessage({
          sessionId,
          requestId: context.requestId,
          role: 'assistant',
          messageType: 'error',
          content: errorMessage,
          status: 'error',
          errorMessage,
          seq: 0
        })
      }
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

        switch (event.type) {
          // ═══ 内容行：连续同类型（text）合并到同一气泡；不同类型开启新行 ═══
          // 后端 isAppend 未显式设置（null）时，按"同类型连续追加"语义处理：
          // 上一段同为 text 则复用同一 messageId 继续追加，保持单气泡渲染；
          // 上一段为其他类型（thinking/tool）则 finalize 旧行并开启新 text 行。
          case 'content': {
            clearRetryPresentationOnRecoveredStream()
            markMetric('firstContentAt')
            const isSameTextSegment = lastSegmentType === 'text' && lastSegmentMessageId
            const shouldStartNewSegment = event.isAppend === false
              || !isSameTextSegment
            if (shouldStartNewSegment) {
              finalizePreviousSegment('text')
              lastSegmentMessageId = event.messageId ?? `local_seg_${crypto.randomUUID()}`
            } else if (!lastSegmentMessageId) {
              lastSegmentMessageId = event.messageId ?? `local_seg_${crypto.randomUUID()}`
            }
            if (event.content) {
              accumulatedContent = mergeStreamingText(accumulatedContent, event.content)
              const targetId = lastSegmentMessageId
              const existing = targetId
                ? messageStore.messagesBySession(sessionId).find(m => m.id === targetId)
                : undefined
              if (existing) {
                messageStore.appendToMessage(targetId!, event.content)
              } else if (targetId) {
                messageStore.addMessage({
                  id: targetId, sessionId, requestId: context.requestId,
                  role: 'assistant', messageType: 'text',
                  content: event.content, status: 'streaming', seq: event.seq ?? 0,
                }, { persist: false })
              }
            }
            break
          }

          case 'thinking': {
            clearRetryPresentationOnRecoveredStream()
            markMetric('firstThinkingAt')
            const isSameThinkingSegment = lastSegmentType === 'thinking' && lastSegmentMessageId
            const shouldStartNewThinkingSegment = event.isAppend === false
              || !isSameThinkingSegment
            if (shouldStartNewThinkingSegment) {
              finalizePreviousSegment('thinking')
              lastSegmentMessageId = event.messageId ?? `local_seg_${crypto.randomUUID()}`
            } else if (!lastSegmentMessageId) {
              lastSegmentMessageId = event.messageId ?? `local_seg_${crypto.randomUUID()}`
            }
            if (event.content) {
              const targetId = lastSegmentMessageId
              const existing = targetId
                ? messageStore.messagesBySession(sessionId).find(m => m.id === targetId)
                : undefined
              if (existing) {
                messageStore.appendToMessage(targetId!, event.content)
              } else if (targetId) {
                messageStore.addMessage({
                  id: targetId, sessionId, requestId: context.requestId,
                  role: 'assistant', messageType: 'thinking',
                  content: event.content, status: 'streaming', seq: event.seq ?? 0,
                }, { persist: false })
              }
            }
            break
          }

          case 'thinking_start':
            clearRetryPresentationOnRecoveredStream()
            break

          // ═══ 工具行：各自独立行 ═══
          case 'tool_use': {
            clearRetryPresentationOnRecoveredStream()
            markMetric('firstToolAt')
            const toolUseMessageId = event.messageId ?? `local_seg_${crypto.randomUUID()}`
            messageStore.addMessage({
              id: toolUseMessageId, sessionId, requestId: context.requestId,
              role: 'assistant', messageType: 'tool_use',
              toolCallId: event.toolCallId, toolName: event.toolName,
              toolInput: event.toolInput ? JSON.stringify(event.toolInput) : '',
              toolKind: event.toolKind, toolLocations: event.toolLocations,
              status: 'streaming', seq: event.seq ?? 0,
            }, { persist: false })
            // 业务追踪
            if (event.toolName) {
              const toolCallId = resolveToolCallId(event)
              const existingIndex = toolCalls.findIndex(tc => tc.id === toolCallId)
              if (existingIndex >= 0) {
                toolCalls[existingIndex] = {
                  ...toolCalls[existingIndex],
                  arguments: mergeToolInputArguments(toolCalls[existingIndex].arguments, event.toolInput || {}),
                  kind: event.toolKind ?? toolCalls[existingIndex].kind,
                  locations: event.toolLocations ?? toolCalls[existingIndex].locations,
                }
              } else {
                toolCalls.push({
                  id: toolCallId, name: event.toolName,
                  arguments: event.toolInput || {}, status: 'running',
                  kind: event.toolKind, locations: event.toolLocations,
                })
                registerTraceTask((async () => {
                  await fileTraceCollector.captureToolUse(toolCalls[toolCalls.length - 1])
                })())
              }
            }
            break
          }

          case 'tool_result': {
            const resultStr = typeof event.toolResult === 'string'
              ? event.toolResult
              : JSON.stringify(event.toolResult ?? '')

            const toolResultMessageId = event.messageId ?? `local_seg_${crypto.randomUUID()}`
            messageStore.addMessage({
              id: toolResultMessageId, sessionId, requestId: context.requestId,
              role: 'assistant', messageType: 'tool_result',
              toolCallId: event.toolCallId,
              toolResult: resultStr,
              toolKind: event.toolKind, toolLocations: event.toolLocations,
              status: 'completed', seq: event.seq ?? 0,
            }, { persist: false })
            // 业务追踪
            if (event.toolCallId) {
              const tc = toolCalls.find(t => t.id === event.toolCallId)
              if (tc) {
                tc.result = resultStr
                tc.status = 'success'
                if (event.toolKind) tc.kind = event.toolKind
                if (event.toolLocations) tc.locations = event.toolLocations
                registerTraceTask((async () => {
                  const trace = await fileTraceCollector.resolveToolResult(event.toolCallId!, resultStr)
                  if (trace) editTraces.push(trace)
                })())
              }
              // 将结果回写到对应的 tool_use 消息行，使 ToolCallDisplay 展开后能看到输出内容
              const sessionMessages = messageStore.messagesBySession(sessionId)
              const toolUseMsg = sessionMessages.find(
                m => m.messageType === 'tool_use' && m.toolCallId === event.toolCallId
              )
              if (toolUseMsg) {
                void messageStore.updateMessage(toolUseMsg.id, {
                  toolResult: resultStr,
                  toolKind: event.toolKind ?? toolUseMsg.toolKind,
                  toolLocations: event.toolLocations ?? toolUseMsg.toolLocations,
                })
              }
            }
            break
          }

          case 'tool_input_delta': {
            clearRetryPresentationOnRecoveredStream()
            // raw_input 延迟到达：更新已创建的 tool_use 消息参数
            if (event.toolCallId && event.toolInput) {
              const existing = toolCalls.find(tc => tc.id === event.toolCallId)
              if (existing) {
                existing.arguments = mergeToolInputArguments(existing.arguments, event.toolInput)
                if (event.toolKind) existing.kind = event.toolKind
                if (event.toolLocations) existing.locations = event.toolLocations
              }
              // 更新已渲染的 tool_use 消息行（内存态）
              const sessionMessages = messageStore.messagesBySession(sessionId)
              const toolUseMsg = sessionMessages.find(
                m => m.messageType === 'tool_use' && m.toolCallId === event.toolCallId
              )
              if (toolUseMsg) {
                const currentInput = (() => {
                  try { return JSON.parse(toolUseMsg.toolInput || '{}') as Record<string, unknown> }
                  catch { return { raw: toolUseMsg.toolInput } }
                })()
                const merged = mergeToolInputArguments(currentInput, event.toolInput)
                void messageStore.updateMessage(toolUseMsg.id, {
                  toolInput: JSON.stringify(merged),
                  toolKind: event.toolKind ?? toolUseMsg.toolKind,
                  toolLocations: event.toolLocations ?? toolUseMsg.toolLocations,
                })
              }
            }
            break
          }

          case 'file_edit':
            if (event.fileEdit) {
              // FileEditView 缺少 id/requestId/sessionId/timestamp，这里补全以便按 requestId 过滤
              const traceId = `${event.fileEdit.toolCallId}::${event.fileEdit.filePath}`
              const exists = editTraces.some(t => (t.id ?? `${t.toolCallId}::${t.filePath}`) === traceId)
              if (!exists) {
                const enrichedTrace: FileEditTrace = {
                  ...event.fileEdit,
                  id: traceId,
                  sessionId,
                  requestId: context.requestId,
                  timestamp: new Date().toISOString()
                }
                editTraces.push(enrichedTrace)
                try { useFileChangeStore().ingestStreamEdit(sessionId, enrichedTrace) }
                catch (err) { console.error('[fileChange] ingest stream edit failed', err) }
              }
            }
            break

          // ═══ Token 更新（不渲染为消息） ═══
          case 'usage': {
            clearRetryPresentationOnRecoveredStream()
            const normalizedUsage = normalizeRuntimeUsage({
              provider: runtimeProvider,
              inputTokens: event.inputTokens, outputTokens: event.outputTokens,
              rawInputTokens: event.rawInputTokens, rawOutputTokens: event.rawOutputTokens,
              cacheReadInputTokens: event.cacheReadInputTokens,
              cacheCreationInputTokens: event.cacheCreationInputTokens,
              baseline: usageBaseline,
            })
            usageBaseline = normalizedUsage.nextBaseline
            const normalizedUsageModel = resolveRequestedUsageModel({
              requestedModelId: context.agent.modelId, reportedModelId: event.model,
            })
            if (normalizedUsageModel) usageState.model = normalizedUsageModel
            const mergedUsageCounts = mergeResponseUsageCounts(
              { inputTokens: usageState.inputTokens, outputTokens: usageState.outputTokens },
              { inputTokens: normalizedUsage.inputTokens, outputTokens: normalizedUsage.outputTokens },
              runtimeProvider,
            )
            usageState.inputTokens = mergedUsageCounts.inputTokens
            usageState.outputTokens = mergedUsageCounts.outputTokens
            if (typeof normalizedUsage.cacheReadInputTokens === 'number') {
              usageState.cacheReadInputTokens = (usageState.cacheReadInputTokens ?? 0) + normalizedUsage.cacheReadInputTokens
            }
            if (typeof normalizedUsage.cacheCreationInputTokens === 'number') {
              usageState.cacheCreationInputTokens = (usageState.cacheCreationInputTokens ?? 0) + normalizedUsage.cacheCreationInputTokens
            }
            if (!shouldDeferCliUsageSync) {
              tokenStore.updateRealtimeTokens(
                sessionId, usageState.inputTokens, usageState.outputTokens,
                usageState.model, usageState.contextWindowOccupancy, undefined,
                hasAcpContextWindow ? 'acp' : undefined,
              )
            }
            break
          }

          case 'context_window': {
            if (typeof event.contextWindowUsed === 'number' && event.contextWindowUsed > 0) {
              usageState.contextWindowOccupancy = event.contextWindowUsed
              hasAcpContextWindow = true
            }
            tokenStore.updateRealtimeTokens(
              sessionId, undefined, undefined, event.model,
              event.contextWindowUsed, event.contextWindowSize, 'acp',
            )
            break
          }

          // ═══ 系统消息（含压缩检测） ═══
          case 'system': {
            clearRetryPresentationOnRecoveredStream()
            const content = event.content ?? ''
            if (content.includes('CLI Context Compaction')) {
              tokenStore.hardClearSessionTokens(sessionId)
              tokenStore.updateRealtimeTokens(sessionId, undefined, undefined, usageState.model, 0, undefined, 'acp')
              usageBaseline = null
              usageState.inputTokens = undefined
              usageState.outputTokens = undefined
              usageState.contextWindowOccupancy = undefined
              hasAcpContextWindow = true
              void messageStore.addMessage({
                sessionId, requestId: context.requestId,
                role: 'assistant', messageType: 'compression',
                content: buildCompactionSummary(content), status: 'completed', seq: 0,
              })
              return
            }
            if (content.trim()) {
              void messageStore.addMessage({
                sessionId, requestId: context.requestId,
                role: 'assistant', messageType: 'system',
                content, status: 'completed', seq: 0,
              }).catch(e => console.warn('[ConversationService] persist system:', e))
            }
            break
          }

          case 'error':
            if (!isAiMessageInterrupted() && event.error) lastErrorMessage = event.error
            break

          case 'permission_request':
            usePermissionStore().setPending({
              sessionId, requestId: context.requestId,
              toolName: event.toolName ?? '', toolInput: event.toolInput,
              options: event.permissionOptions ?? [],
            })
            break

          case 'plan':
            if (event.content) {
              try {
                receivedPlanEvent = true
                useAgentPlanStore().ingestStreamPlan(sessionId, event.content)
              } catch (err) { console.error('[agentPlan]', err) }
            }
            break

          case 'available_commands':
            if (event.content) {
              try { useAgentCapabilityStore().setAvailableCommands(sessionId, event.content) }
              catch (err) { console.error('[agentCapability]', err) }
            }
            break

          case 'done': {
            console.log('[ACP] done')
            markMetric('doneAt')
            finalizeStreamingMessages('completed')
            usePermissionStore().clearPending(sessionId)
            if (sessionStore.isPlanMode(sessionId) && receivedPlanEvent) {
              useAgentPlanStore().requestConfirm(sessionId)
            }
            const finalizedToolCalls = finalizePendingToolCalls(toolCalls)
            if (finalizedToolCalls !== toolCalls) {
              toolCalls.splice(0, toolCalls.length, ...finalizedToolCalls)
            }
            syncProcessingTimeNotice()
            if (!shouldSurfaceExecutionFailure() && !isAiMessageInterrupted()) {
              bufferMessageUpdate({ status: 'completed', errorMessage: '' }, { immediate: true })
              this.clearConversationRetryState(sessionId)
              sessionExecutionStore.clearCurrentRetryState(sessionId)
              sessionStore.updateLastMessage(sessionId, accumulatedContent.slice(0, 50))
            }
            this.finalizeSend(sessionId, epoch)
            break
          }
        }
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
      finalizeStreamingMessages('error')
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
        if (!aiMessage.id.startsWith('local_anchor_')) {
          await messageStore.updateMessage(aiMessage.id, {
            content: '',
            errorMessage: '',
            status: 'pending'
          })
        }

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

      // 并发守卫：如果用户在重试等待期间已手动发送新消息，跳过本次重试，
      // 避免两个回合并发往同一 session 写入导致消息交错。
      if (this.activeSendSessions.has(sessionId) || sessionExecutionStore.getIsSending(sessionId)) {
        this.clearConversationRetryState(sessionId)
        return
      }

      const isLocalAnchor = aiMessage.id.startsWith('local_anchor_')
      if (!isLocalAnchor) {
        const currentMessage = messageStore.messagesBySession(sessionId)
          .find(message => message.id === aiMessage.id)
        if (!currentMessage || currentMessage.status === 'interrupted') {
          this.clearConversationRetryState(sessionId)
          return
        }
      }

      try {
        if (!isLocalAnchor) {
          await messageStore.updateMessage(aiMessage.id, {
            content: '',
            errorMessage: '',
            status: 'streaming'
          })
        }
        this.activeSendSessions.add(sessionId)
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
        messageStore.updateMessageBuffered(messageId, {
          status: 'interrupted',
          errorMessage: MANUAL_STOP_ERROR_MARKER
        }, { immediate: true })
        return
      }

      // 1. 调用 AgentExecutor 中断策略
      agentExecutor.abort(sessionId)

      // 2. 更新消息状态为 interrupted
      if (messageId) {
        messageStore.updateMessageBuffered(messageId, {
          status: 'interrupted',
          errorMessage: MANUAL_STOP_ERROR_MARKER
        }, { immediate: true })
      } else {
        // 如果没有传入 messageId，从 sessionExecutionStore 获取当前流式消息 ID
        if (streamingMessageId?.startsWith('local_anchor_')) {
          for (const message of messageStore.messagesBySession(sessionId)) {
            if (
              message.role === 'assistant'
              && message.status === 'streaming'
              && (message.messageType === 'text' || message.messageType === 'thinking' || message.messageType === 'tool_use')
            ) {
              messageStore.updateMessageBuffered(message.id, {
                status: 'interrupted',
                errorMessage: MANUAL_STOP_ERROR_MARKER
              }, { immediate: true })
            }
          }
        } else if (streamingMessageId) {
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

  /**
   * 清理会话级的内存状态（关闭标签页/删除会话时调用）。
   * 释放 dedupedInjectedSystemPrompts、retry 计数/定时器、sendEpoch 等按 sessionId 索引的 Map 条目，
   * 避免长时间运行后单例 Maps 无限增长。
   */
  clearSessionState(sessionId: string): void {
    if (!sessionId) return

    this.dedupedInjectedSystemPrompts.delete(sessionId)
    this.conversationRetryCount.delete(sessionId)

    const timer = this.conversationRetryTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.conversationRetryTimers.delete(sessionId)
    }

    this.sendEpochs.delete(sessionId)
    this.activeSendSessions.delete(sessionId)
    this.queueDrainLocks.delete(sessionId)
  }
}

// 导出单例
export const conversationService = ConversationService.getInstance()
