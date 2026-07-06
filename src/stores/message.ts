import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useNotificationStore } from './notification'
import { useSessionStore } from './session'
import { useTokenStore, type CompressionStrategy } from './token'
import { readSessionCliUsageSnapshot } from '@/services/usage/cliSessionUsageSnapshot'
import { getErrorMessage } from '@/utils/api'
import { dedupeMessagesById } from '@/utils/messageDedupe'
import type { FileEditTrace } from '@/types/fileTrace'
import type { ToolLocation } from '@/services/conversation/strategies/types'
import { readSessionDetail } from '@/services/cliSession'
import { mapAcpEventsToMessages, extractUsageFromEvents } from '@/services/conversation/acpHistoryMapper'
import { isFormResponseMessage } from '@/utils/structuredContent'
import type { AcpReplayedEvent } from '@/types/cliSessionManager'

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
  | 'work_divider'
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error'
export const MANUAL_STOP_ERROR_MARKER = '__manual_stop__'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: ToolCallStatus
  result?: string
  errorMessage?: string
  /** 工具语义类别（read/edit/delete/move/search/execute/...），透传 ACP ToolKind */
  kind?: string
  /** 工具访问/修改的文件位置，透传 ACP ToolCallLocation */
  locations?: ToolLocation[]
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
  // 工具语义类别（read/edit/delete/move/search/execute/...）与文件位置（跟随 Agent）
  toolKind?: string
  toolLocations?: ToolLocation[]
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



// 文件编辑追踪功能在新消息结构下已搁置；保留 FileEditTrace 作为占位类型，
// 使依赖 trace 的组件（AiEditTracePane 等）在新结构下仍可编译，实际数据恒为空。
type SessionEditTrace = FileEditTrace



/**
 * 纯 (requestId, seq) 比较：仅用于定位/比较场景，不参与渲染排序。
 * 渲染顺序由后端推送顺序（addMessage push 到末尾）和 DB 返回顺序保证。
 */
function compareMessageOrder(
  left: Pick<Message, 'seq' | 'requestId'>,
  right: Pick<Message, 'seq' | 'requestId'>
): number {
  if (left.requestId !== right.requestId) {
    return left.requestId < right.requestId ? -1 : 1
  }
  return left.seq - right.seq
}

export function compareMessagesForRender(left: Message, right: Message): number {
  return compareMessageOrder(left, right)
}

export function isVisibleForRender(message: Message): boolean {
  if (message.messageType === 'usage' || message.messageType === 'context_window') {
    return false
  }
  // form_response 用户消息不在右侧渲染，回显到左侧 assistant 表单
  if (message.role === 'user' && isFormResponseMessage(message.content)) {
    return false
  }
  return true
}

export interface LoadMessagesOptions {
  /** 忽略缓存强制重新拉取 ACP 历史 */
  force?: boolean
  /** 有缓存时静默刷新，不展示 loading spinner */
  background?: boolean
  /** 低优先级预取（可被当前会话加载插队） */
  priority?: 'high' | 'low'
}

interface AcpEventsCacheEntry {
  events: AcpReplayedEvent[]
  fetchedAt: number
}

const ACP_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000
const acpEventsCache = new Map<string, AcpEventsCacheEntry>()
const pendingReloadSessionIds = new Set<string>()
let loadRequestToken = 0
let loadMessagesInFlightSessionId: string | null = null
let loadMessagesInFlight: Promise<void> | null = null
let queuedHighPrioritySessionId: string | null = null

/** @deprecated 旧名保留兼容，内部改用 isVisibleForRender */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isVisibleConversationMessage(message: Message, _messages: Message[]): boolean {
  return isVisibleForRender(message)
}

const EMPTY_MESSAGES: Message[] = []

const EMPTY_ASSISTANT_EDIT_TRACES: SessionEditTrace[] = []
const EMPTY_TRACE_MAP = new Map<string, { traceId: string, messageId: string, timestamp: string }>()
const EMPTY_VISIBLE_MESSAGE_TRACES: SessionEditTrace[] = []

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

export const useMessageStore = defineStore('message', () => {
  // State
  const messages = ref<Message[]>([])
  const isLoading = ref(false)
  // 正在加载消息的会话集合：用于「会话切换时显示加载态」
  const loadingSessions = ref<Set<string>>(new Set())
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

  /** 该会话是否正在加载消息（用于切换会话时显示加载态） */
  function isLoadingSession(sessionId: string): boolean {
    return loadingSessions.value.has(sessionId)
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

  function setSessionMessages(sessionId: string, nextMessages: Message[]): void {
    const normalizedMessages = dedupeMessagesById(nextMessages)
    sessionMessages.value.set(sessionId, normalizedMessages)
    // 文件编辑追踪功能在新消息结构下已搁置；保留 ref 与 getter 以兼容外部依赖，数据恒为空
    assistantEditTracesBySession.value.set(sessionId, EMPTY_ASSISTANT_EDIT_TRACES)
    latestAssistantTraceBySession.value.set(sessionId, EMPTY_TRACE_MAP)
    visibleAssistantEditTracesByMessageBySession.value.set(sessionId, new Map())
    assistantTraceDigestBySession.value.set(sessionId, '0::')
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

  async function persistMessageUpdates(): Promise<void> {
    // 新架构：消息不再本地落库（ACP 协议重放历史），更新已在 applyMessageUpdatesLocally 完成
    return
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
    const flushTask = persistMessageUpdates()
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

  async function loadMessages(sessionId: string, options: LoadMessagesOptions = {}) {
    const { force = false, background = false, priority = 'high' } = options
    const cachedMessages = sessionMessages.value.get(sessionId) ?? EMPTY_MESSAGES

    // Stale-while-revalidate：有缓存时立即展示，后台静默刷新
    if (!force && !background && cachedMessages.length > 0) {
      void loadMessages(sessionId, { force: true, background: true, priority: 'low' })
      return
    }

    // 同一会话已在加载：非 force 时直接等待
    if (loadMessagesInFlightSessionId === sessionId && loadMessagesInFlight && !force) {
      try { await loadMessagesInFlight } catch { /* 已由首发起方处理 */ }
      return
    }

    // 高优先级请求插队：取消排队中的低优先级，优先加载当前会话
    if (
      priority === 'high'
      && loadMessagesInFlightSessionId
      && loadMessagesInFlightSessionId !== sessionId
      && loadMessagesInFlight
    ) {
      loadRequestToken += 1
      queuedHighPrioritySessionId = sessionId
      try { await loadMessagesInFlight } catch { /* 忽略被丢弃的请求 */ }
      if (queuedHighPrioritySessionId === sessionId) {
        queuedHighPrioritySessionId = null
      } else {
        return
      }
    } else if (
      priority === 'low'
      && loadMessagesInFlightSessionId
      && loadMessagesInFlightSessionId !== sessionId
      && loadMessagesInFlight
    ) {
      try { await loadMessagesInFlight } catch { /* 忽略 */ }
    }

    if (loadMessagesInFlightSessionId === sessionId && loadMessagesInFlight && !force) {
      try { await loadMessagesInFlight } catch { /* 已由首发起方处理 */ }
      return
    }

    const requestToken = ++loadRequestToken
    const showLoadingIndicator = !background || cachedMessages.length === 0

    if (showLoadingIndicator) {
      isLoading.value = true
      const next = new Set(loadingSessions.value)
      next.add(sessionId)
      loadingSessions.value = next
    }

    loadMessagesInFlightSessionId = sessionId

    const task = executeLoadMessages(sessionId, requestToken, showLoadingIndicator)
    loadMessagesInFlight = task

    try {
      await task
    } finally {
      if (loadMessagesInFlightSessionId === sessionId) {
        loadMessagesInFlightSessionId = null
        loadMessagesInFlight = null
      }
      // 处理插队期间排队的会话
      const queuedSessionId = queuedHighPrioritySessionId
      if (queuedSessionId && queuedSessionId !== sessionId) {
        queuedHighPrioritySessionId = null
        void loadMessages(queuedSessionId, { force: true, priority: 'high' })
      }
    }
  }

  async function executeLoadMessages(
    sessionId: string,
    requestToken: number,
    showLoadingIndicator: boolean
  ): Promise<void> {
    const notificationStore = useNotificationStore()
    const sessionStore = useSessionStore()
    const tokenStore = useTokenStore()

    const loadSessionAttachments = async () => {
      try {
        const { useFileChangeStore } = await import('@/stores/fileChange')
        void useFileChangeStore().load(sessionId)
      } catch (err) {
        console.error('[MessageStore] load file changes failed', err)
      }
      try {
        const { useAgentPlanStore } = await import('@/stores/agentPlan')
        void useAgentPlanStore().load(sessionId)
      } catch (err) {
        console.error('[MessageStore] load agent plan failed', err)
      }
    }

    const isStaleRequest = () => requestToken !== loadRequestToken

    try {
      const session = sessionStore.sessions.find(item => item.id === sessionId)

      let externalSessionId = session?.cliSessionId?.trim() || ''
      if (!externalSessionId && session) {
        try {
          const [{ resolveRuntimeBindingKey, getSessionRuntimeBinding }, { useAgentStore }] = await Promise.all([
            import('@/services/conversation/runtimeBindings'),
            import('./agent')
          ])
          const agentStore = useAgentStore()
          const agent = session.agentId
            ? agentStore.agents.find(agentItem => agentItem.id === session.agentId)
            : undefined
          const runtimeKey = agent ? resolveRuntimeBindingKey(agent) : null
          if (runtimeKey) {
            const binding = await getSessionRuntimeBinding(sessionId, runtimeKey)
            if (binding?.externalSessionId) {
              externalSessionId = binding.externalSessionId
            }
          }
        } catch (bindingError) {
          console.warn('[MessageStore] resolve runtime binding failed:', bindingError)
        }
      }

      if (externalSessionId && session) {
        const [{ useAgentStore }, { useProjectStore }] = await Promise.all([
          import('./agent'),
          import('./project')
        ])
        const agentStore = useAgentStore()
        const projectStore = useProjectStore()

        const agent = session.agentId
          ? agentStore.agents.find(agentItem => agentItem.id === session.agentId)
          : undefined
        const agentCmd = agent?.acpCommand || agent?.cliPath || ''
        const project = projectStore.projects.find(projectItem => projectItem.id === session.projectId)
        const cwd = project?.path || projectStore.currentProject?.path || ''

        if (!agentCmd) {
          pendingReloadSessionIds.add(sessionId)
          if (isStaleRequest()) return
          tokenStore.clearRealtimeTokens(sessionId)
          updateGlobalMessagesForSession(sessionId, [])
          setSessionMessages(sessionId, [])
          pagination.value.set(sessionId, {
            total: 0,
            hasMore: false,
            isLoadingMore: false,
            oldestMessageCreatedAt: null
          })
          void loadSessionAttachments()
          return
        }

        pendingReloadSessionIds.delete(sessionId)

        if (isStaleRequest()) return

        let events: AcpReplayedEvent[]
        const cacheEntry = acpEventsCache.get(externalSessionId)
        const cacheFresh = cacheEntry
          && (Date.now() - cacheEntry.fetchedAt) < ACP_EVENTS_CACHE_TTL_MS

        if (cacheFresh) {
          events = cacheEntry.events
        } else {
          const result = await readSessionDetail(agentCmd, externalSessionId, cwd)
          if (isStaleRequest()) return
          events = result.events
          acpEventsCache.set(externalSessionId, { events, fetchedAt: Date.now() })
        }

        const correctedSessionMessages = mapAcpEventsToMessages(sessionId, events)

        try {
          const usage = extractUsageFromEvents(events)
          if (usage) {
            tokenStore.updateRealtimeTokens(
              sessionId,
              usage.inputTokens || undefined,
              usage.outputTokens || undefined,
              undefined,
              undefined,
              undefined,
              'acp'
            )
          } else {
            const snapshot = await readSessionCliUsageSnapshot(session)
            if (isStaleRequest()) return
            if (snapshot) {
              tokenStore.updateRealtimeTokens(
                sessionId,
                snapshot.inputTokens || undefined,
                snapshot.outputTokens || undefined,
                snapshot.model,
                snapshot.contextWindowOccupancy ?? undefined,
                undefined,
                snapshot.contextWindowOccupancy ? 'snapshot' : undefined
              )
            } else {
              tokenStore.clearRealtimeTokens(sessionId)
            }
          }
        } catch (tokenError) {
          console.warn('[MessageStore] token snapshot restore failed, skipping:', tokenError)
          tokenStore.clearRealtimeTokens(sessionId)
        }

        if (isStaleRequest()) return

        updateGlobalMessagesForSession(sessionId, correctedSessionMessages)
        setSessionMessages(sessionId, correctedSessionMessages)
        pagination.value.set(sessionId, {
          total: correctedSessionMessages.length,
          hasMore: false,
          isLoadingMore: false,
          oldestMessageCreatedAt: correctedSessionMessages[0]?.createdAt ?? null
        })
      } else {
        if (isStaleRequest()) return
        tokenStore.clearRealtimeTokens(sessionId)
        updateGlobalMessagesForSession(sessionId, [])
        setSessionMessages(sessionId, [])
        pagination.value.set(sessionId, {
          total: 0,
          hasMore: false,
          isLoadingMore: false,
          oldestMessageCreatedAt: null
        })
      }

      void loadSessionAttachments()
    } catch (error) {
      if (isStaleRequest()) return
      console.error('Failed to load messages:', error)
      updateGlobalMessagesForSession(sessionId, [])
      clearSessionDerivedState(sessionId)
      notificationStore.databaseError(
        '加载消息列表失败',
        getErrorMessage(error),
        () => loadMessages(sessionId, { force: true })
      )
    } finally {
      if (showLoadingIndicator) {
        isLoading.value = false
        const next = new Set(loadingSessions.value)
        next.delete(sessionId)
        loadingSessions.value = next
      }
    }
  }

  /** agent 配置就绪后重试因 agentCmd 为空而跳过的会话加载 */
  function retryPendingReloadSessions(): void {
    if (pendingReloadSessionIds.size === 0) {
      return
    }
    const sessionIds = [...pendingReloadSessionIds]
    pendingReloadSessionIds.clear()
    for (const pendingSessionId of sessionIds) {
      void loadMessages(pendingSessionId, { force: true, priority: 'low' })
    }
  }

  /** 预取已打开 Tab 的历史（低优先级，不影响当前会话） */
  function prefetchOpenSessionMessages(openSessionIds: string[], currentSessionId: string | null): void {
    for (const openSessionId of openSessionIds) {
      if (openSessionId === currentSessionId) {
        continue
      }
      const cached = sessionMessages.value.get(openSessionId)
      if (cached && cached.length > 0) {
        continue
      }
      void loadMessages(openSessionId, { priority: 'low', background: true })
    }
  }

  function invalidateAcpEventsCache(externalSessionId?: string): void {
    if (externalSessionId) {
      acpEventsCache.delete(externalSessionId)
      return
    }
    acpEventsCache.clear()
  }



  // ACP 会话无分页，loadMore 为 no-op
  async function loadMoreMessages(_sessionId: string) {
    const currentPagination = getPagination(_sessionId)
    if (currentPagination.hasMore) {
      pagination.value.set(_sessionId, {
        ...currentPagination,
        hasMore: false,
        isLoadingMore: false
      })
    }
    return
  }

  // 新架构：消息不再本地落库，历史由 ACP 协议重放（read_acp_session_history），
  // CLI 自身是会话的唯一数据源。options.persist 参数保留向后兼容，但一律按内存处理。
  async function addMessage(
    message: Omit<Message, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    options: { persist?: boolean; createdAt?: string } = {}
  ) {
    const id = message.id ?? `local_${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`
    // 允许调用方指定 createdAt（如 live thinking 行需对齐同回合 text 行的时间，
    // 使排序反映「先思考后回复」的自然顺序，而非前端创建时刻）
    const now = options.createdAt ?? new Date().toISOString()
    const newMessage: Message = {
      ...message,
      id,
      createdAt: now,
      updatedAt: now
    } as Message
    messages.value.push(newMessage)
    const currentSessionMessages = sessionMessages.value.get(newMessage.sessionId) ?? EMPTY_MESSAGES
    setSessionMessages(newMessage.sessionId, [...currentSessionMessages, newMessage])
    return newMessage
  }

  async function updateMessage(id: string, updates: Partial<Message>) {
    const notificationStore = useNotificationStore()
    applyMessageUpdatesLocally(id, updates)

    try {
      await persistMessageUpdates()
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
  }

  /**
   * 删除会话内锚点消息之后的所有消息（编辑并重发场景）。
   *
   * 按 sessionMessages 中的顺序删除锚点之后的所有消息，并同步移除全局 messages
   * 与分页缓冲。后端按 (created_at, seq) 判定顺序，这里复用已排序的会话消息快照。
   */
  async function deleteMessagesAfter(sessionId: string, anchorMessageId: string): Promise<number> {
    const currentSessionMessages = sessionMessages.value.get(sessionId) ?? EMPTY_MESSAGES
    const anchorIndex = currentSessionMessages.findIndex(message => message.id === anchorMessageId)
    if (anchorIndex === -1) {
      return 0
    }

    const remainingSessionMessages = currentSessionMessages.slice(0, anchorIndex + 1)
    const removedIds = new Set(
      currentSessionMessages.slice(anchorIndex + 1).map(message => message.id)
    )
    const deletedCount = removedIds.size

    if (remainingSessionMessages.length === 0) {
      clearSessionDerivedState(sessionId)
    } else {
      setSessionMessages(sessionId, remainingSessionMessages)
    }

    // 清理全局 messages 数组与缓冲写入状态
    for (const messageId of removedIds) {
      const timer = pendingMessageTimers.get(messageId)
      if (timer) {
        clearTimeout(timer)
        pendingMessageTimers.delete(messageId)
      }
      pendingMessageUpdates.delete(messageId)
      inFlightMessageFlushes.delete(messageId)
    }
    messages.value = messages.value.filter(message => !removedIds.has(message.id))

    return deletedCount
  }

  async function clearSessionMessages(sessionId: string) {
    clearSessionMessagesCache(sessionId)

    const sessionStore = useSessionStore()
    const session = sessionStore.sessions.find(item => item.id === sessionId)
    if (session) {
      session.lastMessage = undefined
      session.messageCount = 0
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

  /**
   * 追加内容到已有消息行（后端 isAppend=true 时调用）。
   * 后端已落库，前端仅做内存更新，不写入 DB。
   */
  function appendToMessage(id: string, chunk: string): void {
    const index = messages.value.findIndex(message => message.id === id)
    if (index === -1) return

    const currentMessage = messages.value[index]
    const nextContent = (currentMessage.content ?? '') + chunk
    applyMessageUpdatesLocally(id, { content: nextContent })
  }

  function hasMessage(id: string): boolean {
    return messages.value.some(message => message.id === id)
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
    isLoadingSession,
    lastMessage,
    getPagination,
    getAssistantEditTraces,
    getAssistantTraceDigest,
    getLatestAssistantTraceIdsByFile,
    getVisibleAssistantEditTracesForMessage,
    // Actions
    loadMessages,
    loadMoreMessages,
    retryPendingReloadSessions,
    prefetchOpenSessionMessages,
    invalidateAcpEventsCache,
    addMessage,
    appendToMessage,
    hasMessage,
    updateMessage,
    updateMessageBuffered,
    flushBufferedMessageUpdate,
    deleteMessage,
    deleteMessagesAfter,
    clearSessionMessages,
    clearSessionMessagesCache,
    clearProjectMessages
  }
})
