import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useNotificationStore } from './notification'
import { useSessionStore } from './session'
import { useSessionExecutionStore } from './sessionExecution'
import { useTokenStore, type CompressionStrategy } from './token'
import { readSessionCliUsageSnapshot } from '@/services/usage/cliSessionUsageSnapshot'
import { getErrorMessage } from '@/utils/api'
import type { FileEditTrace } from '@/types/fileTrace'

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageStatus = 'pending' | 'streaming' | 'completed' | 'error' | 'interrupted'
export type MessageType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'usage'
  | 'context_window'
  | 'compression'
  | 'system'
  | 'error'
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error'
export const MANUAL_STOP_ERROR_MARKER = '__manual_stop__'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: ToolCallStatus
  result?: string
  errorMessage?: string
}

// 工具调用摘要
export interface ToolCallSummary {
  name: string
  count: number
  status: 'success' | 'error' | 'mixed'
}

export interface MessageAttachment {
  id: string
  name: string
  path: string
  mimeType: string
  size: number
  previewUrl?: string
}

// 压缩消息元数据
export interface CompressionMetadata {
  compressedAt: string
  originalMessageCount: number
  originalTokenCount: number
  strategy: CompressionStrategy
  summaryContent?: string
  triggerPrompt?: string
  triggerSource?: 'manual' | 'auto' | 'silent'
  toolCallsSummary?: ToolCallSummary[]
  panelExpanded?: boolean
}

export interface MessageRetryState {
  current: number
  max: number
}

/**
 * 消息（一行一事件）。
 *
 * 每条 ACP 事件（思考/工具/文本/用量/压缩/系统/错误）各自独立成一行，
 * 共享同一个 requestId（一个用户回合）。渲染时按 (createdAt, seq) 排序。
 */
export interface Message {
  id: string
  sessionId: string
  /** 回合归组键：user 消息与其触发的所有 assistant 事件共享 */
  requestId: string
  role: MessageRole
  /** 事件类型（text/thinking/tool_use/tool_result/usage/context_window/compression/system/error） */
  messageType: MessageType
  content?: string
  status: MessageStatus
  // 工具相关（仅 tool_use / tool_result 有值）
  toolCallId?: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  // token / 用量（仅 usage / context_window 有值）
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  model?: string
  costUsd?: number
  // 用户消息附件
  attachments?: MessageAttachment[]
  // 错误
  errorMessage?: string
  retryState?: MessageRetryState
  // 顺序与时间
  seq: number
  createdAt: string
  updatedAt: string
}

interface RustMessage {
  id: string
  sessionId: string
  requestId: string
  role: string
  messageType: string
  content?: string | null
  status: string
  toolCallId?: string | null
  toolName?: string | null
  toolInput?: string | null
  toolResult?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  cacheReadTokens?: number | null
  cacheCreationTokens?: number | null
  model?: string | null
  costUsd?: number | null
  attachments?: MessageAttachment[] | null
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
  seq: number
}

interface PaginatedRustMessages {
  messages: RustMessage[]
  total: number
  has_more: boolean
}

// 文件编辑追踪功能在新消息结构下已搁置；保留 FileEditTrace 作为占位类型，
// 使依赖 trace 的组件（AiEditTracePane 等）在新结构下仍可编译，实际数据恒为空。
type SessionEditTrace = FileEditTrace

function resolveRawMessageCreatedAt(message?: RustMessage): string | null {
  return message?.createdAt ?? null
}

function compareMessageOrder(left: Pick<Message, 'createdAt' | 'seq'>, right: Pick<Message, 'createdAt' | 'seq'>): number {
  const t = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  return t !== 0 ? t : left.seq - right.seq
}

/** @deprecated 旧名保留兼容，内部改用 compareMessageOrder */
const compareMessageCreatedAt = compareMessageOrder

function dedupeMessagesById(items: Message[]): Message[] {
  const map = new Map<string, Message>()

  for (const message of items) {
    map.set(message.id, message)
  }

  return Array.from(map.values())
}

const EMPTY_MESSAGES: Message[] = []
const EMPTY_ASSISTANT_EDIT_TRACES: SessionEditTrace[] = []
const EMPTY_TRACE_MAP = new Map<string, { traceId: string, messageId: string, timestamp: string }>()
const EMPTY_VISIBLE_MESSAGE_TRACES: SessionEditTrace[] = []

interface CreateMessageInput {
  sessionId: string
  requestId: string
  role: string
  messageType: string
  content?: string
  attachments?: string
  status?: string
  toolCallId?: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  model?: string
  costUsd?: number
  errorMessage?: string
  seq?: number
}

interface UpdateMessageInput {
  content?: string
  attachments?: string
  status?: string
  errorMessage?: string
}

// 分页状态
export interface PaginationState {
  total: number
  hasMore: boolean
  isLoadingMore: boolean
  oldestMessageCreatedAt: string | null
}

interface BufferedMessageUpdateOptions {
  immediate?: boolean
}

interface FlushBufferedMessageOptions {
  notifyOnFailure?: boolean
}

const MESSAGE_FLUSH_INTERVAL_MS = 300

function buildLatestAssistantTraceMap(
  _messages: Message[]
): Map<string, { traceId: string, messageId: string, timestamp: string }> {
  // 新消息结构（一行一事件）不再把 editTraces 折叠进 message，文件编辑追踪功能后续按需重建
  return new Map()
}

function buildAssistantEditTraces(_messages: Message[]): SessionEditTrace[] {
  return []
}

function buildAssistantTraceDigest(traces: SessionEditTrace[]): string {
  const latestTrace = traces[traces.length - 1]
  return `${traces.length}:${latestTrace?.id ?? ''}:${latestTrace?.timestamp ?? ''}`
}

function buildVisibleAssistantEditTracesByMessage(
  _messages: Message[],
  _latestTraceByFile: Map<string, { traceId: string, messageId: string, timestamp: string }>
): Map<string, SessionEditTrace[]> {
  return new Map()
}

function shouldReconcileStreamingMessage(
  message: Message,
  currentStreamingMessageId: string | null,
  isSessionBusy: boolean,
  hasLocalActivity: boolean
): boolean {
  if (message.role !== 'assistant' || message.status !== 'streaming') {
    return false
  }

  if (isSessionBusy) {
    return false
  }

  if (hasLocalActivity) {
    return false
  }

  if (!currentStreamingMessageId) {
    return true
  }

  return message.id !== currentStreamingMessageId
}

function transformMessage(rustMsg: RustMessage): Message {
  return {
    id: rustMsg.id,
    sessionId: rustMsg.sessionId,
    requestId: rustMsg.requestId,
    role: rustMsg.role as MessageRole,
    messageType: (rustMsg.messageType as MessageType) ?? 'text',
    content: rustMsg.content ?? undefined,
    attachments: rustMsg.attachments?.length ? rustMsg.attachments : undefined,
    status: rustMsg.status as MessageStatus,
    toolCallId: rustMsg.toolCallId ?? undefined,
    toolName: rustMsg.toolName ?? undefined,
    toolInput: rustMsg.toolInput ?? undefined,
    toolResult: rustMsg.toolResult ?? undefined,
    inputTokens: rustMsg.inputTokens ?? undefined,
    outputTokens: rustMsg.outputTokens ?? undefined,
    cacheReadTokens: rustMsg.cacheReadTokens ?? undefined,
    cacheCreationTokens: rustMsg.cacheCreationTokens ?? undefined,
    model: rustMsg.model ?? undefined,
    costUsd: rustMsg.costUsd ?? undefined,
    errorMessage: rustMsg.errorMessage ?? undefined,
    seq: rustMsg.seq ?? 0,
    createdAt: rustMsg.createdAt,
    updatedAt: rustMsg.updatedAt ?? rustMsg.createdAt
  }
}

export const useMessageStore = defineStore('message', () => {
  // State
  const messages = ref<Message[]>([])
  const isLoading = ref(false)
  const pagination = ref<Map<string, PaginationState>>(new Map())
  const sessionMessages = ref<Map<string, Message[]>>(new Map())
  const assistantEditTracesBySession = ref<Map<string, SessionEditTrace[]>>(new Map())
  const latestAssistantTraceBySession = ref<Map<string, Map<string, { traceId: string, messageId: string, timestamp: string }>>>(new Map())
  const visibleAssistantEditTracesByMessageBySession = ref<Map<string, Map<string, SessionEditTrace[]>>>(new Map())
  const assistantTraceDigestBySession = ref<Map<string, string>>(new Map())
  const pendingMessageUpdates = new Map<string, Partial<Message>>()
  const pendingMessageTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const inFlightMessageFlushes = new Map<string, Promise<void>>()

  // 默认分页大小
  const PAGE_SIZE = 20

  // 普通函数：在调用方（如 useMessageList 的 computed）的依赖作用域内
  // 直接读取响应式 Map，确保 sessionMessages 变化能正确触发调用方重算。
  // 避免使用返回函数的 computed（高阶 computed 会丢失对具体 key 的依赖追踪）。
  function messagesBySession(sessionId: string): Message[] {
    return sessionMessages.value.get(sessionId) ?? EMPTY_MESSAGES
  }

  const getLatestAssistantTraceIdsByFile = (sessionId: string) => {
    return latestAssistantTraceBySession.value.get(sessionId) ?? EMPTY_TRACE_MAP
  }

  const getVisibleAssistantEditTracesForMessage = (sessionId: string, messageId: string) => {
    return visibleAssistantEditTracesByMessageBySession.value.get(sessionId)?.get(messageId) ?? EMPTY_VISIBLE_MESSAGE_TRACES
  }

  const getAssistantEditTraces = (sessionId: string) => {
    return assistantEditTracesBySession.value.get(sessionId) ?? EMPTY_ASSISTANT_EDIT_TRACES
  }

  const getAssistantTraceDigest = (sessionId: string) => {
    return assistantTraceDigestBySession.value.get(sessionId) ?? '0::'
  }

  const lastMessage = computed(() => {
    return (sessionId: string) => {
      const sessionMessages = messagesBySession(sessionId)
      return sessionMessages[sessionMessages.length - 1]
    }
  })

  // 获取分页状态
  const getPagination = (sessionId: string): PaginationState => {
    return pagination.value.get(sessionId) || {
      total: 0,
      hasMore: false,
      isLoadingMore: false,
      oldestMessageCreatedAt: null
    }
  }

  // Actions
  function buildUpdateMessageInput(updates: Partial<Message>): UpdateMessageInput {
    const input: UpdateMessageInput = {}
    if (updates.content !== undefined) input.content = updates.content
    if (updates.attachments !== undefined) input.attachments = JSON.stringify(updates.attachments)
    if (updates.status !== undefined) input.status = updates.status
    if (updates.errorMessage !== undefined) input.errorMessage = updates.errorMessage
    return input
  }

  function setSessionMessages(sessionId: string, nextMessages: Message[]): void {
    const normalizedMessages = dedupeMessagesById(nextMessages).sort(compareMessageCreatedAt)
    const assistantEditTraces = buildAssistantEditTraces(normalizedMessages)
    const latestAssistantTraceMap = buildLatestAssistantTraceMap(normalizedMessages)
    sessionMessages.value.set(sessionId, normalizedMessages)
    assistantEditTracesBySession.value.set(sessionId, assistantEditTraces)
    latestAssistantTraceBySession.value.set(sessionId, latestAssistantTraceMap)
    visibleAssistantEditTracesByMessageBySession.value.set(
      sessionId,
      buildVisibleAssistantEditTracesByMessage(normalizedMessages, latestAssistantTraceMap)
    )
    assistantTraceDigestBySession.value.set(sessionId, buildAssistantTraceDigest(assistantEditTraces))
  }

  function clearSessionDerivedState(sessionId: string): void {
    sessionMessages.value.delete(sessionId)
    assistantEditTracesBySession.value.delete(sessionId)
    latestAssistantTraceBySession.value.delete(sessionId)
    visibleAssistantEditTracesByMessageBySession.value.delete(sessionId)
    assistantTraceDigestBySession.value.delete(sessionId)
  }

  /**
   * 清理单个会话的消息缓存、分页和缓冲写入状态。
   * 用于删除会话后同步移除前端残留数据，避免当前运行期继续引用已删除消息。
   */
  function clearSessionMessagesCache(sessionId: string): void {
    const cachedSessionMessages = sessionMessages.value.get(sessionId) ?? EMPTY_MESSAGES
    const messageIds = [...messages.value, ...cachedSessionMessages]
      .filter(message => message.sessionId === sessionId)
      .map(message => message.id)

    for (const messageId of messageIds) {
      const timer = pendingMessageTimers.get(messageId)
      if (timer) {
        clearTimeout(timer)
        pendingMessageTimers.delete(messageId)
      }

      pendingMessageUpdates.delete(messageId)
      inFlightMessageFlushes.delete(messageId)
    }

    updateGlobalMessagesForSession(sessionId, [])
    clearSessionDerivedState(sessionId)
    pagination.value.delete(sessionId)
  }

  function updateGlobalMessagesForSession(sessionId: string, nextSessionMessages: Message[]): void {
    const otherSessionMessages = messages.value.filter(message => message.sessionId !== sessionId)
    messages.value = [...otherSessionMessages, ...nextSessionMessages]
  }

  function applyMessageUpdatesLocally(id: string, updates: Partial<Message>): void {
    const index = messages.value.findIndex(message => message.id === id)
    if (index === -1) {
      return
    }

    const currentMessage = messages.value[index]
    const nextMessage = {
      ...currentMessage,
      ...updates
    }
    messages.value[index] = nextMessage

    const currentSessionMessages = sessionMessages.value.get(currentMessage.sessionId)
    if (!currentSessionMessages) {
      return
    }

    const sessionIndex = currentSessionMessages.findIndex(message => message.id === id)
    if (sessionIndex < 0) {
      return
    }

    const nextSessionMessages = [...currentSessionMessages]
    nextSessionMessages[sessionIndex] = nextMessage
    setSessionMessages(currentMessage.sessionId, nextSessionMessages)
  }

  function mergeBufferedMessageUpdate(
    previous: Partial<Message> | undefined,
    next: Partial<Message>
  ): Partial<Message> {
    if (!previous) {
      return { ...next }
    }

    return {
      ...previous,
      ...next
    }
  }

  async function persistMessageUpdates(id: string, updates: Partial<Message>): Promise<void> {
    const input = buildUpdateMessageInput(updates)

    if (Object.keys(input).length === 0) {
      return
    }

    await invoke('update_message_fields', { id, input })
  }

  function scheduleBufferedMessageFlush(id: string): void {
    const existingTimer = pendingMessageTimers.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      pendingMessageTimers.delete(id)
      void flushBufferedMessageUpdate(id)
    }, MESSAGE_FLUSH_INTERVAL_MS)

    pendingMessageTimers.set(id, timer)
  }

  async function flushBufferedMessageUpdate(
    id: string,
    options: FlushBufferedMessageOptions = {}
  ): Promise<void> {
    const existingTimer = pendingMessageTimers.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      pendingMessageTimers.delete(id)
    }

    const inFlightFlush = inFlightMessageFlushes.get(id)
    if (inFlightFlush) {
      await inFlightFlush
      if (pendingMessageUpdates.has(id)) {
        await flushBufferedMessageUpdate(id, options)
      }
      return
    }

    const updates = pendingMessageUpdates.get(id)
    if (!updates) {
      return
    }

    pendingMessageUpdates.delete(id)

    const notificationStore = useNotificationStore()
    const flushTask = persistMessageUpdates(id, updates)
      .catch((error) => {
        pendingMessageUpdates.set(
          id,
          mergeBufferedMessageUpdate(pendingMessageUpdates.get(id), updates)
        )

        if (options.notifyOnFailure) {
          notificationStore.databaseError(
            '刷新消息状态失败',
            getErrorMessage(error),
            () => flushBufferedMessageUpdate(id, options)
          )
        } else {
          console.warn('[MessageStore] Failed to flush buffered message update:', error)
          scheduleBufferedMessageFlush(id)
        }
      })
      .finally(() => {
        inFlightMessageFlushes.delete(id)
      })

    inFlightMessageFlushes.set(id, flushTask)
    await flushTask

    if (pendingMessageUpdates.has(id)) {
      await flushBufferedMessageUpdate(id, options)
    }
  }

  function updateMessageBuffered(
    id: string,
    updates: Partial<Message>,
    options: BufferedMessageUpdateOptions = {}
  ): void {
    applyMessageUpdatesLocally(id, updates)
    pendingMessageUpdates.set(
      id,
      mergeBufferedMessageUpdate(pendingMessageUpdates.get(id), updates)
    )

    if (options.immediate) {
      void flushBufferedMessageUpdate(id)
      return
    }

    scheduleBufferedMessageFlush(id)
  }

  async function loadMessages(sessionId: string) {
    const notificationStore = useNotificationStore()
    const sessionExecutionStore = useSessionExecutionStore()
    const sessionStore = useSessionStore()
    const tokenStore = useTokenStore()
    isLoading.value = true
    try {
      const result = await invoke<PaginatedRustMessages>('list_messages', {
        sessionId,
        limit: PAGE_SIZE
      })

      const currentExecutionState = sessionExecutionStore.getExecutionState(sessionId)
      const nextSessionMessages = result.messages.map(transformMessage)
      const currentSessionMessageMap = new Map(
        (sessionMessages.value.get(sessionId) ?? EMPTY_MESSAGES).map(message => [message.id, message] as const)
      )
      const isSessionBusy = currentExecutionState.isSending
        || currentExecutionState.isStreaming
        || currentExecutionState.isAwaitingRetry
        || currentExecutionState.isQueueDraining
      const streamingMessagesToReconcile = nextSessionMessages.filter(message => (
        shouldReconcileStreamingMessage(
          message,
          currentExecutionState.currentStreamingMessageId,
          isSessionBusy,
          currentSessionMessageMap.get(message.id)?.status === 'streaming'
            || pendingMessageUpdates.has(message.id)
            || inFlightMessageFlushes.has(message.id)
        )
      ))

      const normalizedSessionMessages = streamingMessagesToReconcile.length > 0
        ? nextSessionMessages.map(message => (
          streamingMessagesToReconcile.some(streamingMessage => streamingMessage.id === message.id)
            ? { ...message, status: 'interrupted' as const }
            : message
        ))
        : nextSessionMessages

      const session = sessionStore.sessions.find(item => item.id === sessionId)
      const sessionProvider = session?.cliSessionProvider?.trim().toLowerCase()
      const correctedSessionMessages = sessionProvider
        ? await reconcilePersistedUsageDisplay(sessionId, normalizedSessionMessages)
        : normalizedSessionMessages

      const latestUsageMessage = [...correctedSessionMessages]
        .reverse()
        .find(message => message.messageType === 'usage')
      if (latestUsageMessage) {
        const restoredInputTokens = latestUsageMessage.inputTokens
        const restoredOutputTokens = latestUsageMessage.outputTokens
        const restoredOccupancy = (restoredInputTokens ?? 0) + (restoredOutputTokens ?? 0) > 0
          ? (restoredInputTokens ?? 0) + (restoredOutputTokens ?? 0)
          : restoredInputTokens
        tokenStore.updateRealtimeTokens(
          sessionId,
          restoredInputTokens ?? undefined,
          restoredOutputTokens ?? undefined,
          latestUsageMessage.model,
          restoredOccupancy ?? undefined
        )
      } else if (sessionProvider && session) {
        const snapshot = await readSessionCliUsageSnapshot(session)
        if (snapshot) {
          const occupancy = snapshot.contextWindowOccupancy
            ?? (snapshot.inputTokens + snapshot.outputTokens)
          tokenStore.updateRealtimeTokens(
            sessionId,
            snapshot.inputTokens || undefined,
            snapshot.outputTokens || undefined,
            snapshot.model,
            occupancy || undefined
          )
        } else {
          tokenStore.clearRealtimeTokens(sessionId)
        }
      } else {
        tokenStore.clearRealtimeTokens(sessionId)
      }

      updateGlobalMessagesForSession(sessionId, correctedSessionMessages)
      setSessionMessages(sessionId, correctedSessionMessages)

      if (streamingMessagesToReconcile.length > 0) {
        await Promise.allSettled(streamingMessagesToReconcile.map(async message => {
          try {
            await persistMessageUpdates(message.id, { status: 'interrupted' })
          } catch (error) {
            console.warn('[MessageStore] Failed to reconcile stale streaming message:', message.id, error)
          }
        }))
      }

      // 更新分页状态
      const oldestMessage = result.messages[0]
      pagination.value.set(sessionId, {
        total: result.total,
        hasMore: result.has_more,
        isLoadingMore: false,
        oldestMessageCreatedAt: resolveRawMessageCreatedAt(oldestMessage)
      })

      // 加载文件变更追踪（用于响应底部汇总条与右侧 diff 审查）
      try {
        const { useFileChangeStore } = await import('@/stores/fileChange')
        void useFileChangeStore().load(sessionId)
      } catch (err) {
        console.error('[MessageStore] load file changes failed', err)
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
      updateGlobalMessagesForSession(sessionId, [])
      clearSessionDerivedState(sessionId)
      notificationStore.databaseError(
        '加载消息列表失败',
        getErrorMessage(error),
        () => loadMessages(sessionId)
      )
    } finally {
      isLoading.value = false
    }
  }

  async function reconcilePersistedUsageDisplay(
    _sessionId: string,
    messages: Message[]
  ): Promise<Message[]> {
    // 新消息结构（一行一事件）下用量是独立 usage 行，不再需要从 assistant 消息的 runtimeNotices 回填
    return messages
  }

  // 加载更多历史消息
  async function loadMoreMessages(sessionId: string) {
    const notificationStore = useNotificationStore()
    const currentPagination = getPagination(sessionId)

    // 如果没有更多消息或正在加载，直接返回
    if (!currentPagination.hasMore || currentPagination.isLoadingMore) {
      return
    }

    // 如果没有最早消息的时间戳，无法加载更多
    if (!currentPagination.oldestMessageCreatedAt) {
      return
    }

    // 更新加载状态
    pagination.value.set(sessionId, {
      ...currentPagination,
      isLoadingMore: true
    })

    try {
      const result = await invoke<PaginatedRustMessages>('list_messages', {
        sessionId,
        limit: PAGE_SIZE,
        before: currentPagination.oldestMessageCreatedAt
      })

      // 将新加载的消息添加到当前会话列表开头，同时保留其他会话消息
      const newMessages = result.messages.map(transformMessage)
      const currentSessionMessages = sessionMessages.value.get(sessionId) ?? EMPTY_MESSAGES
      const nextSessionMessages = dedupeMessagesById([
        ...newMessages,
        ...currentSessionMessages
      ]).sort(compareMessageCreatedAt)
      updateGlobalMessagesForSession(sessionId, nextSessionMessages)
      setSessionMessages(sessionId, nextSessionMessages)

      // 更新分页状态
      const oldestMessage = result.messages[0]
      const resolvedOldestMessageCreatedAt = resolveRawMessageCreatedAt(oldestMessage)
      const hasMore = result.messages.length > 0
        && resolvedOldestMessageCreatedAt !== currentPagination.oldestMessageCreatedAt
        && result.has_more
      pagination.value.set(sessionId, {
        total: result.total,
        hasMore,
        isLoadingMore: false,
        oldestMessageCreatedAt: resolvedOldestMessageCreatedAt || currentPagination.oldestMessageCreatedAt
      })
    } catch (error) {
      console.error('Failed to load more messages:', error)
      notificationStore.databaseError(
        '加载历史消息失败',
        getErrorMessage(error),
        () => loadMoreMessages(sessionId)
      )
      // 恢复加载状态
      pagination.value.set(sessionId, {
        ...currentPagination,
        isLoadingMore: false
      })
    }
  }

  async function addMessage(message: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>) {
    const notificationStore = useNotificationStore()
    const input: CreateMessageInput = {
      sessionId: message.sessionId,
      requestId: message.requestId,
      role: message.role,
      messageType: message.messageType,
      content: message.content,
      attachments: message.attachments ? JSON.stringify(message.attachments) : undefined,
      status: message.status,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      toolInput: message.toolInput,
      toolResult: message.toolResult,
      inputTokens: message.inputTokens,
      outputTokens: message.outputTokens,
      cacheReadTokens: message.cacheReadTokens,
      cacheCreationTokens: message.cacheCreationTokens,
      model: message.model,
      costUsd: message.costUsd,
      errorMessage: message.errorMessage,
      seq: message.seq
    }

    try {
      const rustMsg = await invoke<RustMessage>('create_message', { input })
      const newMessage = transformMessage(rustMsg)
      messages.value.push(newMessage)
      const currentSessionMessages = sessionMessages.value.get(newMessage.sessionId) ?? EMPTY_MESSAGES
      setSessionMessages(newMessage.sessionId, [...currentSessionMessages, newMessage])
      return newMessage
    } catch (error) {
      console.error('Failed to add message:', error)
      notificationStore.databaseError(
        '添加消息失败',
        getErrorMessage(error),
        async () => { await addMessage(message) }
      )
      throw error
    }
  }

  async function updateMessage(id: string, updates: Partial<Message>) {
    const notificationStore = useNotificationStore()
    applyMessageUpdatesLocally(id, updates)

    try {
      await persistMessageUpdates(id, updates)
    } catch (error) {
      console.error('Failed to update message:', error)
      notificationStore.databaseError(
        '更新消息失败',
        getErrorMessage(error),
        () => updateMessage(id, updates)
      )
      throw error
    }
  }

  async function deleteMessage(id: string) {
    const notificationStore = useNotificationStore()

    try {
      await invoke('delete_message', { id })
      const index = messages.value.findIndex(m => m.id === id)
      if (index !== -1) {
        const deletedMessage = messages.value[index]
        messages.value.splice(index, 1)
        const currentSessionMessages = sessionMessages.value.get(deletedMessage.sessionId) ?? EMPTY_MESSAGES
        const nextSessionMessages = currentSessionMessages.filter(message => message.id !== id)
        if (nextSessionMessages.length === 0) {
          clearSessionDerivedState(deletedMessage.sessionId)
        } else {
          setSessionMessages(deletedMessage.sessionId, nextSessionMessages)
        }
      }
    } catch (error) {
      console.error('Failed to delete message:', error)
      notificationStore.databaseError(
        '删除消息失败',
        getErrorMessage(error),
        () => deleteMessage(id)
      )
      throw error
    }
  }

  async function clearSessionMessages(sessionId: string) {
    const notificationStore = useNotificationStore()

    try {
      await invoke('clear_session_messages', { sessionId })
      clearSessionMessagesCache(sessionId)

      const sessionStore = useSessionStore()
      const session = sessionStore.sessions.find(item => item.id === sessionId)
      if (session) {
        session.lastMessage = undefined
        session.messageCount = 0
      }
    } catch (error) {
      console.error('Failed to clear session messages:', error)
      notificationStore.databaseError(
        '清空会话消息失败',
        getErrorMessage(error),
        () => clearSessionMessages(sessionId)
      )
      throw error
    }
  }

  function clearProjectMessages(sessionIds: string[]) {
    if (sessionIds.length === 0) {
      return
    }

    const sessionIdSet = new Set(sessionIds)
    messages.value = messages.value.filter(message => !sessionIdSet.has(message.sessionId))
    sessionIds.forEach(sessionId => {
      clearSessionMessagesCache(sessionId)
    })
  }

  return {
    // State
    messages,
    isLoading,
    pagination,
    // Constants
    PAGE_SIZE,
    // Getters
    messagesBySession,
    lastMessage,
    getPagination,
    getAssistantEditTraces,
    getAssistantTraceDigest,
    getLatestAssistantTraceIdsByFile,
    getVisibleAssistantEditTracesForMessage,
    // Actions
    loadMessages,
    loadMoreMessages,
    addMessage,
    updateMessage,
    updateMessageBuffered,
    flushBufferedMessageUpdate,
    deleteMessage,
    clearSessionMessages,
    clearSessionMessagesCache,
    clearProjectMessages
  }
})
