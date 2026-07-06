/** useMessageList — MessageList 消息列表组件的 composable，负责虚拟滚动定位、自动滚动到底与新消息提示。 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  isVisibleForRender,
  useMessageStore,
  type Message
} from '@/stores/message'
import { useSessionStore } from '@/stores/session'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useUIStore } from '@/stores/ui'

interface VirtualMessageItem {
  message: Message
  top: number
  height: number
}

type LiveStreamStatusKind = 'generating' | 'thinking' | 'tool' | 'permission' | 'form' | 'queue'

interface LiveStreamStatus {
  kind: LiveStreamStatusKind
  text: string
}

interface SessionScrollSnapshot {
  scrollTop: number
  isAtBottom: boolean
  anchorMessageId: string | null
  anchorOffset: number
}

interface MessageAnchor {
  messageId: string | null
  offset: number
}

export interface MessageListProps {
  sessionId?: string
  messages?: Message[]
  externalIsSending?: boolean
  currentStreamingMessageId?: string | null
  hideContextStrategyNotice?: boolean
  topSafeInset?: number
  forceScrollToBottomToken?: number
  waitingPermission?: boolean
  waitingForm?: boolean
  /** 计划模式 + 浮动面板展示时，隐藏最新一条 assistant text（PRD 文档），避免与面板重复 */
  hideLatestPlanDoc?: boolean
}

export interface MessageListEmits {
  (event: 'retry', message: Message): void
  (event: 'edit', message: Message, content: string): void
  (event: 'formSubmit', formId: string, values: Record<string, unknown>, assistantMessageId?: string): void
  (event: 'openEditTrace', messageId: string, traceId: string): void
  (event: 'stop', message: Message): void
}

const sessionScrollSnapshots = new Map<string, SessionScrollSnapshot>()
const sessionMessageHeights = new Map<string, Record<string, number>>()
// 未测量消息的估算高度：偏大/偏小都会让虚拟滚动的总高度与实际不符，表现为
// 滚动条 thumb 在滚动过程中长短跳变（滚动经过的消息被实测后总高度变化）。
// 取贴近真实样本中位/平均的值（实测多数文本消息 34~110px），使双向偏差最小。
const DEFAULT_MESSAGE_HEIGHT = 90
const STREAM_STATUS_HEIGHT = 34
// 虚拟化阈值：低于此数量的会话全量渲染，所有消息高度由 ResizeObserver 一次性实测，
// scrollHeight 立即确定、滚动条全程稳定。仅当消息量较大（带来明显性能压力）时才启用
// 虚拟滚动（未测量消息用估算高度，滚动实测时总高度会变化、滚动条 thumb 长短跳变）。
const VIRTUALIZE_THRESHOLD = 150
const VIRTUAL_OVERSCAN_PX = 1200
const SCROLL_THRESHOLD = 100
const LOAD_MORE_THRESHOLD = 100

export function clearMessageListSessionState(sessionId?: string | null) {
  if (!sessionId) {
    return
  }

  sessionScrollSnapshots.delete(sessionId)
  sessionMessageHeights.delete(sessionId)
}

function detectWindowsRuntime(): boolean {
  const platform = (navigator as Navigator & {
    userAgentData?: { platform?: string }
  }).userAgentData?.platform || navigator.platform || navigator.userAgent

  return /win/i.test(platform)
}

/**
 * 会话消息列表逻辑。
 * 负责虚拟滚动、滚动位置恢复、历史消息加载以及流式消息期间的自动滚动状态。
 */
export function useMessageList(props: MessageListProps, emit: MessageListEmits) {
  const { t } = useI18n()
  const messageStore = useMessageStore()
  const sessionStore = useSessionStore()
  const sessionExecutionStore = useSessionExecutionStore()
  const uiStore = useUIStore()

  const listRef = ref<HTMLElement | null>(null)
  const messageHeights = ref<Record<string, number>>({})
  const viewportHeight = ref(0)
  const scrollTop = ref(0)
  const isUserAtBottom = ref(true)
  const previousMessageCount = ref(0)
  const savedScrollHeight = ref(0)
  const showScrollToBottom = ref(false)

  const resizeObservers = new Map<string, ResizeObserver>()
  const messageElements = new Map<string, HTMLElement>()
  const isWindowsRuntime = detectWindowsRuntime()
  let scrollFramePending = false
  let restoringSessionId: string | null = null
  let restoreReleaseTimer: number | null = null
  let listResizeObserver: ResizeObserver | null = null
  let resizeRestoreTimer: number | null = null
  let bottomAlignFrame: number | null = null
  let bottomAlignTimeout: number | null = null
  let forceBottomAlignTimeout: number | null = null
  let isBottomAligning = false

  const resolvedSessionId = computed(() => props.sessionId || sessionStore.currentSessionId)
  const isExternalMessagesMode = computed(() => Array.isArray(props.messages))

  const currentMessages = computed(() => {
    if (props.messages) {
      return props.messages
    }

    if (!resolvedSessionId.value) {
      return []
    }

    const messages = messageStore.messagesBySession(resolvedSessionId.value)
    // 计划模式 + 浮动面板展示时，隐藏最新一条 assistant text（PRD 文档），避免与面板重复
    if (!props.hideLatestPlanDoc) {
      return messages
    }
    const result = [...messages]
    for (let i = result.length - 1; i >= 0; i -= 1) {
      const msg = result[i]
      if (
        msg.role === 'assistant'
        && msg.messageType === 'text'
        && msg.content
        && msg.content.trim().length > 0
      ) {
        result.splice(i, 1)
        break
      }
    }
    return result
  })

  const renderableMessages = computed(() =>
    currentMessages.value
      .filter(message => isVisibleForRender(message))
  )

  /**
   * 渲染项列表：在每回合第一条可见 assistant 消息前插入 WorkDivider。
   * 若最新可见消息是 user 且该回合尚无 assistant 消息，则在末尾插入一条
   * awaiting 分割线（等待 AI 首个事件）。
   *
   * 将 awaiting 分割线纳入 renderItems（而非独立的 pendingRequestId 元素），
   * 避免两个同视觉位置的 TransitionGroup 元素 leave 卡住导致重复分割线。
   */
  const renderItems = computed(() => {
    const messages = renderableMessages.value
    const items: Array<{ type: 'divider'; key: string; requestId: string } | { type: 'message'; key: string; message: Message }> = []
    const seenRequestIds = new Set<string>()

    for (const message of messages) {
      if (message.role === 'assistant' && !seenRequestIds.has(message.requestId)) {
        seenRequestIds.add(message.requestId)
        items.push({ type: 'divider', key: `divider-${message.requestId}`, requestId: message.requestId })
      }
      items.push({ type: 'message', key: message.id, message })
    }

    // 末尾 awaiting 分割线：最新可见消息是 user 且该回合无 assistant 消息时追加。
    if (isAwaitingFirstAssistantEvent.value && latestVisibleMessage.value) {
      const pendingRequestId = latestVisibleMessage.value.requestId
      items.push({ type: 'divider', key: `divider-${pendingRequestId}`, requestId: pendingRequestId })
    }

    return items
  })

  /**
   * 等待 AI 响应的 requestId：保留用于消息列表底部流式状态判断，
   * awaiting 分割线已纳入 renderItems 统一渲染（见上）。
   */
  const pendingRequestId = computed(() => {
    if (!isAwaitingFirstAssistantEvent.value) return null
    return latestVisibleMessage.value?.requestId ?? null
  })

  const executionStateVersion = computed(() => {
    if (!resolvedSessionId.value) {
      return 0
    }

    return sessionExecutionStore.getStateVersion(resolvedSessionId.value)
  })

  const currentExecutionState = computed(() => {
    // 访问 executionStateVersion.value 以建立响应式依赖，确保状态变更时重新计算
    void executionStateVersion.value
    return resolvedSessionId.value
      ? sessionExecutionStore.getExecutionState(resolvedSessionId.value)
      : null
  })

  const currentIsProcessing = computed(() => {
    if (typeof props.externalIsSending === 'boolean') {
      return props.externalIsSending
    }

    if (!resolvedSessionId.value) {
      return currentMessages.value.some(message => message.role === 'assistant' && message.status === 'streaming')
    }

    const state = currentExecutionState.value
    if (!state) {
      return currentMessages.value.some(message => message.role === 'assistant' && message.status === 'streaming')
    }

    return state.isSending
      || state.isStreaming
      || state.isQueueDraining
      || state.isAwaitingRetry
      || currentMessages.value.some(message => message.role === 'assistant' && message.status === 'streaming')
  })

  const latestVisibleMessage = computed(() => {
    const messages = renderableMessages.value
    return messages[messages.length - 1] ?? null
  })

  const isAwaitingFirstAssistantEvent = computed(() => {
    if (latestVisibleMessage.value?.role !== 'user') {
      return false
    }

    const latestUser = latestVisibleMessage.value
    return !currentMessages.value.some(message =>
      message.requestId === latestUser.requestId
      && message.role === 'assistant'
      && isVisibleForRender(message)
    )
  })

  const streamStatus = computed<LiveStreamStatus | null>(() => {
    if (props.waitingPermission) {
      return { kind: 'permission', text: t('message.status.waitingPermission') }
    }
    if (props.waitingForm) {
      return { kind: 'form', text: t('message.status.waitingUserAnswer') }
    }

    // 排队状态：有消息在队列里等待，显示队列计数（即使当前未在流式也显示）
    const queuedCount = resolvedSessionId.value
      ? sessionExecutionStore.getQueuedMessages(resolvedSessionId.value).length
      : 0
    if (queuedCount > 0 && !currentIsProcessing.value) {
      return { kind: 'queue', text: t('message.queueCount', { count: queuedCount }) }
    }

    if (!currentIsProcessing.value) return null
    if (isAwaitingFirstAssistantEvent.value) return null

    const messages = renderableMessages.value
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant) return { kind: 'generating', text: t('message.status.assistantStreaming') }

    if (lastAssistant.messageType === 'thinking') {
      return { kind: 'thinking', text: t('message.status.assistantThinking') }
    }
    if (lastAssistant.messageType === 'tool_use') {
      const toolName = lastAssistant.toolName?.trim()
      const baseStatus = lastAssistant.status === 'streaming' && toolName
        ? t('message.status.assistantToolRunning', { tool: toolName })
        : t('message.status.assistantStreaming')
      // 流式中附带排队计数
      const queueSuffix = queuedCount > 0 ? ` · ${t('message.queueCount', { count: queuedCount })}` : ''
      return {
        kind: lastAssistant.status === 'streaming' ? 'tool' : 'generating',
        text: `${baseStatus}${queueSuffix}`
      }
    }
    const queueSuffix = queuedCount > 0 ? ` · ${t('message.queueCount', { count: queuedCount })}` : ''
    return { kind: 'generating', text: `${t('message.status.assistantStreaming')}${queueSuffix}` }
  })

  const isListVisible = computed(() => {
    if (props.sessionId) {
      return true
    }

    return uiStore.appMode === 'chat'
  })

  const shouldVirtualize = computed(() => (
    !isWindowsRuntime && renderableMessages.value.length > VIRTUALIZE_THRESHOLD
  ))

  const latestMessageActivity = computed(() => {
    const messages = renderableMessages.value
    const latestMessage = messages[messages.length - 1]

    // 新结构下工具调用/思考/编辑追踪/运行时通知都是独立行，
    // 活动签名只需要关注消息数量、最后一条消息的基本字段与附件。
    return [
      messages.length,
      latestMessage?.id ?? '',
      latestMessage?.status ?? '',
      (latestMessage?.content ?? '').length,
      latestMessage?.messageType ?? '',
      latestMessage?.attachments?.length ?? 0
    ].join(':')
  })

  const currentPagination = computed(() => {
    if (isExternalMessagesMode.value) {
      return null
    }

    if (!resolvedSessionId.value) {
      return null
    }

    return messageStore.getPagination(resolvedSessionId.value)
  })

  const hasMoreMessages = computed(() => currentPagination.value?.hasMore ?? false)
  const isLoadingMore = computed(() => currentPagination.value?.isLoadingMore ?? false)

  const messageLayout = computed<VirtualMessageItem[]>(() => {
    let offset = 0

    return renderableMessages.value.map(message => {
      const height = messageHeights.value[message.id] ?? DEFAULT_MESSAGE_HEIGHT
      const item = { message, top: offset, height }
      offset += height
      return item
    })
  })

  const totalMessageHeight = computed(() => {
    const lastItem = messageLayout.value[messageLayout.value.length - 1]
    const messageHeight = lastItem ? lastItem.top + lastItem.height : 0
    return messageHeight + (streamStatus.value ? STREAM_STATUS_HEIGHT : 0)
  })

  const virtualWindow = computed(() => {
    if (!shouldVirtualize.value) {
      return {
        start: 0,
        end: renderableMessages.value.length,
        topSpacer: 0,
        bottomSpacer: 0
      }
    }

    const layouts = messageLayout.value
    const visibleTop = Math.max(0, scrollTop.value - VIRTUAL_OVERSCAN_PX)
    const visibleBottom = scrollTop.value + viewportHeight.value + VIRTUAL_OVERSCAN_PX

    let start = 0
    while (start < layouts.length && layouts[start].top + layouts[start].height < visibleTop) {
      start += 1
    }

    let end = start
    while (end < layouts.length && layouts[end].top < visibleBottom) {
      end += 1
    }

    const safeEnd = Math.max(end, start + 1)
    const lastVisible = layouts[safeEnd - 1]
    const renderedBottom = (lastVisible?.top ?? 0) + (lastVisible?.height ?? 0)
    const statusHeight = streamStatus.value ? STREAM_STATUS_HEIGHT : 0

    return {
      start,
      end: safeEnd,
      topSpacer: layouts[start]?.top ?? 0,
      bottomSpacer: Math.max(
        0,
        totalMessageHeight.value - renderedBottom - statusHeight
      )
    }
  })

  const visibleMessages = computed(() => {
    if (!shouldVirtualize.value) {
      return messageLayout.value
    }

    return messageLayout.value.slice(virtualWindow.value.start, virtualWindow.value.end)
  })

  const listStyle = computed(() => ({
    '--message-list-top-safe-space': `${Math.max(0, props.topSafeInset ?? 0)}px`
  }))

  function getSessionMessages(sessionId?: string | null) {
    if (!sessionId) {
      return []
    }

    if (isExternalMessagesMode.value && resolvedSessionId.value === sessionId) {
      return currentMessages.value
    }

    return messageStore.messagesBySession(sessionId)
  }

  function buildMessageLayout(messages: Message[]): VirtualMessageItem[] {
    let offset = 0

    return messages.map(message => {
      const height = messageHeights.value[message.id] ?? DEFAULT_MESSAGE_HEIGHT
      const item = { message, top: offset, height }
      offset += height
      return item
    })
  }

  function persistMessageHeights(sessionId?: string | null) {
    if (!sessionId) {
      return
    }

    const activeIds = new Set(getSessionMessages(sessionId).map(message => message.id))
    const nextHeights = Object.fromEntries(
      Object.entries(messageHeights.value).filter(([messageId]) => activeIds.has(messageId))
    )
    sessionMessageHeights.set(sessionId, nextHeights)
  }

  function restoreMessageHeights(sessionId?: string | null) {
    if (!sessionId) {
      messageHeights.value = {}
      return
    }

    messageHeights.value = { ...(sessionMessageHeights.get(sessionId) ?? {}) }
  }

  function getMessageOffsetTop(messageId: string): number | null {
    if (!listRef.value) {
      return null
    }

    const element = messageElements.get(messageId)
    if (!element) {
      return null
    }

    const listRect = listRef.value.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    return elementRect.top - listRect.top + listRef.value.scrollTop
  }

  function resolveAnchorAtScrollTop(top: number, sessionId?: string | null): MessageAnchor {
    const sessionMessages = getSessionMessages(sessionId)

    for (const message of sessionMessages) {
      const elementTop = getMessageOffsetTop(message.id)
      if (elementTop == null) {
        continue
      }

      const height = messageHeights.value[message.id] ?? Math.ceil(messageElements.get(message.id)?.getBoundingClientRect().height ?? 0)
      const elementBottom = elementTop + height
      if (top >= elementTop && top < elementBottom) {
        return {
          messageId: message.id,
          offset: Math.max(0, top - elementTop)
        }
      }
    }

    const fallbackLayout = buildMessageLayout(sessionMessages)
    const fallbackAnchor = fallbackLayout.find((item) => {
      const itemBottom = item.top + item.height
      return top >= item.top && top < itemBottom
    }) ?? fallbackLayout[fallbackLayout.length - 1]

    return {
      messageId: fallbackAnchor?.message.id ?? null,
      offset: fallbackAnchor ? Math.max(0, top - fallbackAnchor.top) : 0
    }
  }

  function resolveAnchorScrollTop(messageId: string | null, offset: number, fallbackScrollTop: number): number {
    if (!messageId) {
      return fallbackScrollTop
    }

    const elementTop = getMessageOffsetTop(messageId)
    if (elementTop != null) {
      return elementTop + offset
    }

    const anchorItem = messageLayout.value.find((item) => item.message.id === messageId)
    if (!anchorItem) {
      return fallbackScrollTop
    }

    return anchorItem.top + offset
  }

  function isRestoringScroll(sessionId?: string | null) {
    return Boolean(sessionId && restoringSessionId === sessionId)
  }

  function clearRestoreGuard() {
    restoringSessionId = null
    if (restoreReleaseTimer != null) {
      window.clearTimeout(restoreReleaseTimer)
      restoreReleaseTimer = null
    }
  }

  function finishRestoreGuard(sessionId?: string | null) {
    if (!sessionId) {
      clearRestoreGuard()
      return
    }

    if (restoreReleaseTimer != null) {
      window.clearTimeout(restoreReleaseTimer)
    }

    restoreReleaseTimer = window.setTimeout(() => {
      if (restoringSessionId !== sessionId) {
        clearRestoreGuard()
        return
      }

      clearRestoreGuard()
      saveScrollSnapshot(sessionId)
    }, 80)
  }

  function saveScrollSnapshot(sessionId?: string | null) {
    if (!sessionId || !listRef.value || isRestoringScroll(sessionId)) {
      return
    }

    const { scrollTop: top, scrollHeight, clientHeight } = listRef.value
    const anchor = resolveAnchorAtScrollTop(top, sessionId)

    persistMessageHeights(sessionId)
    sessionScrollSnapshots.set(sessionId, {
      scrollTop: top,
      isAtBottom: scrollHeight - top - clientHeight < SCROLL_THRESHOLD,
      anchorMessageId: anchor.messageId,
      anchorOffset: anchor.offset
    })
  }

  function applyScrollSnapshot(
    savedSnapshot: SessionScrollSnapshot,
    options: { preferAnchor?: boolean } = {}
  ) {
    if (!listRef.value) {
      return
    }

    const maxScrollTop = Math.max(0, listRef.value.scrollHeight - listRef.value.clientHeight)
    const nextScrollTop = options.preferAnchor
      ? resolveAnchorScrollTop(
        savedSnapshot.anchorMessageId,
        savedSnapshot.anchorOffset,
        savedSnapshot.scrollTop
      )
      : savedSnapshot.scrollTop

    listRef.value.scrollTop = Math.min(Math.max(0, nextScrollTop), maxScrollTop)
  }

  async function restoreScrollSnapshot(sessionId?: string | null) {
    if (!sessionId) {
      return
    }

    if (!listRef.value) {
      await nextTick()
    }

    if (!listRef.value) {
      await nextTick()
    }

    if (!listRef.value) {
      return
    }

    if (restoringSessionId !== sessionId) {
      clearRestoreGuard()
      restoringSessionId = sessionId
    }

    const savedSnapshot = sessionScrollSnapshots.get(sessionId)
    if (!savedSnapshot) {
      isUserAtBottom.value = true
      showScrollToBottom.value = false
      await nextTick()
      if (!listRef.value) {
        finishRestoreGuard(sessionId)
        return
      }
      // 刷新/首次进入：消息由 SQLite 异步加载且 markdown 异步渲染，单次 scrollToBottom
      // 时 scrollHeight 尚未稳定。改用 forceBottomAlignment：rAF + 定时器多次复滚，确保
      // 渲染完成后仍锚定底部。
      await forceBottomAlignment()
      updateViewportMetrics()
      finishRestoreGuard(sessionId)
      return
    }

    await nextTick()
    if (!listRef.value) {
      finishRestoreGuard(sessionId)
      return
    }

    if (savedSnapshot.isAtBottom) {
      isUserAtBottom.value = true
      showScrollToBottom.value = false
      scrollToBottom()
      updateViewportMetrics()
      finishRestoreGuard(sessionId)
      return
    }

    applyScrollSnapshot(savedSnapshot)
    await nextTick()
    applyScrollSnapshot(savedSnapshot)
    updateViewportMetrics()
    isUserAtBottom.value = checkIsAtBottom()
    showScrollToBottom.value = !isUserAtBottom.value
    finishRestoreGuard(sessionId)
  }

  function checkIsAtBottom() {
    if (!listRef.value) {
      return true
    }

    const { scrollTop: top, scrollHeight, clientHeight } = listRef.value
    return scrollHeight - top - clientHeight < SCROLL_THRESHOLD
  }

  function checkIsAtTop() {
    return Boolean(listRef.value && listRef.value.scrollTop < LOAD_MORE_THRESHOLD)
  }

  function getBottomScrollTop() {
    if (!listRef.value) {
      return 0
    }

    return Math.max(0, listRef.value.scrollHeight - listRef.value.clientHeight)
  }

  function clearBottomAlignTasks() {
    if (bottomAlignFrame != null) {
      cancelAnimationFrame(bottomAlignFrame)
      bottomAlignFrame = null
    }

    if (bottomAlignTimeout != null) {
      window.clearTimeout(bottomAlignTimeout)
      bottomAlignTimeout = null
    }

    isBottomAligning = false
  }

  function clearForceBottomAlignTask() {
    if (forceBottomAlignTimeout != null) {
      window.clearTimeout(forceBottomAlignTimeout)
      forceBottomAlignTimeout = null
    }
  }

  function scrollToBottom() {
    if (!listRef.value) {
      return
    }

    listRef.value.scrollTop = getBottomScrollTop()
  }

  function queueBottomAlignment() {
    if (!listRef.value) {
      return
    }

    if (bottomAlignFrame != null) {
      cancelAnimationFrame(bottomAlignFrame)
      bottomAlignFrame = null
    }

    if (bottomAlignTimeout != null) {
      window.clearTimeout(bottomAlignTimeout)
      bottomAlignTimeout = null
    }

    isBottomAligning = true
    scrollToBottom()

    bottomAlignFrame = requestAnimationFrame(() => {
      bottomAlignFrame = null
      if (!listRef.value || (!isUserAtBottom.value && !isBottomAligning)) {
        return
      }

      scrollToBottom()
    })

    bottomAlignTimeout = window.setTimeout(() => {
      bottomAlignTimeout = null
      if (!listRef.value || (!isUserAtBottom.value && !isBottomAligning)) {
        isBottomAligning = false
        return
      }

      scrollToBottom()
      updateViewportMetrics()
      saveScrollSnapshot(resolvedSessionId.value)
      isBottomAligning = false
    }, 80)
  }

  async function forceBottomAlignment() {
    clearForceBottomAlignTask()
    isUserAtBottom.value = true
    showScrollToBottom.value = false
    await nextTick()
    updateViewportMetrics()
    queueBottomAlignment()

    forceBottomAlignTimeout = window.setTimeout(() => {
      forceBottomAlignTimeout = null
      if (!isListVisible.value) {
        return
      }

      isUserAtBottom.value = true
      showScrollToBottom.value = false
      updateViewportMetrics()
      queueBottomAlignment()
    }, 180)
  }

  function updateViewportMetrics() {
    viewportHeight.value = listRef.value?.clientHeight ?? 0
    scrollTop.value = listRef.value?.scrollTop ?? 0
  }

  function handleViewportResize() {
    updateViewportMetrics()

    const sessionId = resolvedSessionId.value
    if (!sessionId || !isListVisible.value || isRestoringScroll(sessionId)) {
      return
    }

    const savedSnapshot = sessionScrollSnapshots.get(sessionId)
    if (!savedSnapshot) {
      return
    }

    if (resizeRestoreTimer != null) {
      window.clearTimeout(resizeRestoreTimer)
    }

    resizeRestoreTimer = window.setTimeout(() => {
      if (!listRef.value || isRestoringScroll(sessionId) || resolvedSessionId.value !== sessionId) {
        return
      }

      if (savedSnapshot.isAtBottom) {
        queueBottomAlignment()
      } else {
        applyScrollSnapshot(savedSnapshot, { preferAnchor: true })
      }

      updateViewportMetrics()
      saveScrollSnapshot(sessionId)
    }, 80)
  }

  function handleScroll() {
    const scrollingSessionId = resolvedSessionId.value
    saveScrollSnapshot(scrollingSessionId)

    if (scrollFramePending) {
      return
    }

    scrollFramePending = true
    requestAnimationFrame(() => {
      scrollFramePending = false

      if (scrollingSessionId !== resolvedSessionId.value) {
        return
      }

      scrollTop.value = listRef.value?.scrollTop ?? 0
      isUserAtBottom.value = checkIsAtBottom()
      if (!isUserAtBottom.value && !isBottomAligning) {
        clearBottomAlignTasks()
      }
      showScrollToBottom.value = !isUserAtBottom.value
      saveScrollSnapshot(scrollingSessionId)

      if (checkIsAtTop() && hasMoreMessages.value && !isLoadingMore.value && scrollingSessionId) {
        savedScrollHeight.value = listRef.value?.scrollHeight ?? 0
        void messageStore.loadMoreMessages(scrollingSessionId)
      }
    })
  }

  function handleScrollToBottom() {
    isUserAtBottom.value = true
    showScrollToBottom.value = false
    queueBottomAlignment()
  }

  function bindMessageElement(messageId: string, element: Element | ComponentPublicInstance | null) {
    const existingObserver = resizeObservers.get(messageId)

    if (!(element instanceof HTMLElement)) {
      existingObserver?.disconnect()
      resizeObservers.delete(messageId)
      messageElements.delete(messageId)
      return
    }

    existingObserver?.disconnect()
    messageElements.set(messageId, element)

    const observer = new ResizeObserver((entries) => {
      const nextHeight = Math.ceil(entries[0]?.contentRect.height ?? 0)
      if (nextHeight > 0 && messageHeights.value[messageId] !== nextHeight) {
        messageHeights.value = {
          ...messageHeights.value,
          [messageId]: nextHeight
        }
      }
    })

    observer.observe(element)
    resizeObservers.set(messageId, observer)
  }

  function handleRetry(message: Message) {
    emit('retry', message)
  }

  function handleEdit(message: Message, content: string) {
    emit('edit', message, content)
  }

  function handleFormSubmit(
    formId: string,
    values: Record<string, unknown>,
    assistantMessageId?: string
  ) {
    emit('formSubmit', formId, values, assistantMessageId)
  }

  function handleOpenEditTrace(messageId: string, traceId: string) {
    emit('openEditTrace', messageId, traceId)
  }

  function handleStop(message: Message) {
    emit('stop', message)
  }

  watch(resolvedSessionId, async (sessionId, previousSessionId) => {
    saveScrollSnapshot(previousSessionId)
    persistMessageHeights(previousSessionId)

    clearRestoreGuard()
    if (!sessionId) {
      return
    }

    restoringSessionId = sessionId

    restoreMessageHeights(sessionId)
    const hasCachedMessages = currentMessages.value.length > 0
    const isSessionStreaming = sessionExecutionStore.getIsSending(sessionId)

    const savedSnapshot = sessionScrollSnapshots.get(sessionId)
    isUserAtBottom.value = savedSnapshot?.isAtBottom ?? true
    previousMessageCount.value = currentMessages.value.length

    if (!hasCachedMessages) {
      restoreMessageHeights(sessionId)
    }

    scrollTop.value = 0

    if (!isSessionStreaming && !isExternalMessagesMode.value) {
      await messageStore.loadMessages(sessionId)
    }

    if (isListVisible.value) {
      await restoreScrollSnapshot(sessionId)
    }

    await nextTick()
    updateViewportMetrics()
  }, { immediate: true })

  watch(isListVisible, async (visible, wasVisible) => {
    if (!resolvedSessionId.value) {
      return
    }

    if (!visible) {
      saveScrollSnapshot(resolvedSessionId.value)
      return
    }

    if (wasVisible === false) {
      await restoreScrollSnapshot(resolvedSessionId.value)
    }
  })

  watch(() => props.forceScrollToBottomToken, async (token, previousToken) => {
    if (token === undefined || token === previousToken || !resolvedSessionId.value || !isListVisible.value) {
      return
    }

    await forceBottomAlignment()
  })

  watch(latestMessageActivity, async () => {
    const messages = currentMessages.value
    const currentCount = messages.length
    const hasNewMessage = currentCount > previousMessageCount.value
    const latestMessage = messages[messages.length - 1]
    const hasStreamingMessage = latestMessage?.status === 'streaming'

    if (isLoadingMore.value && savedScrollHeight.value > 0 && listRef.value) {
      await nextTick()
      listRef.value.scrollTop = listRef.value.scrollHeight - savedScrollHeight.value
      savedScrollHeight.value = 0
      previousMessageCount.value = currentCount
      updateViewportMetrics()
      return
    }

    previousMessageCount.value = currentCount
    if (!isListVisible.value) {
      return
    }

    await nextTick()
    updateViewportMetrics()
    if (isRestoringScroll(resolvedSessionId.value)) {
      return
    }

    if (latestMessage?.role === 'user' && hasNewMessage) {
      isUserAtBottom.value = true
      showScrollToBottom.value = false
      queueBottomAlignment()
      return
    }

    if (isUserAtBottom.value && (hasNewMessage || hasStreamingMessage)) {
      queueBottomAlignment()
    }
  })

  watch(currentIsProcessing, async (processing, wasProcessing) => {
    if (!processing || wasProcessing || !isListVisible.value || isRestoringScroll(resolvedSessionId.value)) {
      return
    }

    isUserAtBottom.value = true
    showScrollToBottom.value = false
    await nextTick()
    updateViewportMetrics()
    queueBottomAlignment()
  })

  watch(currentMessages, (messages) => {
    const activeIds = new Set(messages.map(message => message.id))
    const nextHeights: Record<string, number> = {}

    for (const [messageId, height] of Object.entries(messageHeights.value)) {
      if (activeIds.has(messageId)) {
        nextHeights[messageId] = height
        continue
      }

      resizeObservers.get(messageId)?.disconnect()
      resizeObservers.delete(messageId)
      messageElements.delete(messageId)
    }

    messageHeights.value = nextHeights
    persistMessageHeights(resolvedSessionId.value)
  })

  watch(messageHeights, () => {
    persistMessageHeights(resolvedSessionId.value)
    if (!isListVisible.value || isRestoringScroll(resolvedSessionId.value)) {
      return
    }

    saveScrollSnapshot(resolvedSessionId.value)
  })

  watch(totalMessageHeight, async (currentHeight, previousHeight) => {
    if (currentHeight === previousHeight || !isListVisible.value) {
      return
    }

    await nextTick()
    updateViewportMetrics()
    if (isRestoringScroll(resolvedSessionId.value)) {
      return
    }
    if (isUserAtBottom.value) {
      queueBottomAlignment()
      return
    }

    saveScrollSnapshot(resolvedSessionId.value)
  })

  watch(() => sessionStore.openSessionIds.slice(), (openSessionIds, previousOpenSessionIds) => {
    if (!previousOpenSessionIds?.length) {
      return
    }

    const openSessionIdSet = new Set(openSessionIds)
    for (const sessionId of previousOpenSessionIds) {
      if (!openSessionIdSet.has(sessionId)) {
        clearMessageListSessionState(sessionId)
      }
    }
  })

  onMounted(() => {
    listRef.value?.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleViewportResize, { passive: true })
    if (listRef.value) {
      listResizeObserver = new ResizeObserver(handleViewportResize)
      listResizeObserver.observe(listRef.value)
    }
    updateViewportMetrics()
    if (resolvedSessionId.value && isListVisible.value) {
      void restoreScrollSnapshot(resolvedSessionId.value)
    }
  })

  onUnmounted(() => {
    clearRestoreGuard()
    clearBottomAlignTasks()
    clearForceBottomAlignTask()
    listRef.value?.removeEventListener('scroll', handleScroll)
    window.removeEventListener('resize', handleViewportResize)
    if (resizeRestoreTimer != null) {
      window.clearTimeout(resizeRestoreTimer)
      resizeRestoreTimer = null
    }
    listResizeObserver?.disconnect()
    listResizeObserver = null
    resizeObservers.forEach(observer => observer.disconnect())
    resizeObservers.clear()
    messageElements.clear()
  })

  return {
    listRef,
    currentMessages,
    renderableMessages,
    renderItems,
    pendingRequestId,
    streamStatus,
    isAwaitingFirstAssistantEvent,
    resolvedSessionId,
    isExternalMessagesMode,
    hasMoreMessages,
    isLoadingMore,
    shouldVirtualize,
    totalMessageHeight,
    virtualWindow,
    visibleMessages,
    showScrollToBottom,
    listStyle,
    bindMessageElement,
    handleRetry,
    handleEdit,
    handleFormSubmit,
    handleOpenEditTrace,
    handleStop,
    handleScrollToBottom
  }
}
