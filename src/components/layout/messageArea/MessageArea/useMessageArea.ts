/** useMessageArea — MessageArea 主消息区组件的 composable，聚合消息渲染、Token 压缩、计划/追踪面板与发送编排。 */
import { computed, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/message'
import { useSessionStore } from '@/stores/session'
import { useMessageStore } from '@/stores/message'
import { useAiEditTraceStore } from '@/stores/aiEditTrace'
import { useLayoutStore } from '@/stores/layout'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useTokenStore, type CompressionStrategy } from '@/stores/token'
import { useNotificationStore } from '@/stores/notification'
import { useUIStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { useAgentStore } from '@/stores/agent'
import { useAgentPlanStore } from '@/stores/agentPlan'
import { compressionService } from '@/services/compression'
import { conversationService } from '@/services/conversation'
import { resolveSessionAgentId } from '@/utils/sessionAgent'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function useMessageArea() {
  type ComposerExposed = ComponentPublicInstance & {
    focusInput: () => void
    startPlanExecution: () => void | Promise<void>
    handleMessageFormSubmit: (
      formId: string,
      values: Record<string, unknown>,
      assistantMessageId?: string
    ) => Promise<void>
    retryMessage: (
      messageId: string,
      content: string,
      attachments?: Message['attachments'],
      replaceMessageId?: string
    ) => Promise<boolean>
    editAndResendMessage: (
      messageId: string,
      content: string,
      attachments?: Message['attachments']
    ) => Promise<boolean>
  }

  const { t, tm } = useI18n()
  const sessionStore = useSessionStore()
  const messageStore = useMessageStore()
  const aiEditTraceStore = useAiEditTraceStore()
  const layoutStore = useLayoutStore()
  const sessionExecutionStore = useSessionExecutionStore()
  const tokenStore = useTokenStore()
  const notificationStore = useNotificationStore()
  const uiStore = useUIStore()
  const projectStore = useProjectStore()
  const agentPlanStore = useAgentPlanStore()

  // 压缩相关状态
  const showCompressionDialog = ref(false)
  const isCompressing = ref(false)

  const isMobileViewport = ref(false)
  const lastObservedTraceId = ref<string | null>(null)
  const workspaceRef = ref<HTMLElement | null>(null)
  const composerRef = ref<ComposerExposed | null>(null)
  const traceHistoryLoadToken = ref(0)
  // Tauri 原生窗口 resize 监听卸载函数（onMounted 注册、onUnmounted 清理）
  let unlistenWindowResized: (() => void) | null = null
  // onMounted 后短延时复测视口模式的定时器句柄（覆盖窗口恢复动画）
  let viewportRecheckTimeout: number | null = null

  const TRACE_PANE_MIN_WIDTH = 460
  const TRACE_PANE_MAX_WIDTH = 1080
  const CONVERSATION_MIN_WIDTH = 360

  const updateViewportMode = () => {
    isMobileViewport.value = window.innerWidth < 960

    const sessionId = sessionStore.currentSessionId
    if (!sessionId || isMobileViewport.value || !currentTraceState.value) {
      return
    }

    aiEditTraceStore.setPaneWidth(sessionId, clampTracePaneWidth(currentTraceState.value.paneWidth))
  }
  const handleRetry = async (message: Message) => {
    const sessionId = sessionStore.currentSessionId
    const isSending = sessionId ? sessionExecutionStore.getIsSending(sessionId) : false
    if (!sessionId || isSending) return
    const retry = async (targetMessage: Message, replaceMessageId?: string) => {
      await composerRef.value?.retryMessage(
        targetMessage.id,
        targetMessage.content ?? '',
        targetMessage.attachments ?? [],
        replaceMessageId
      )
    }

    // 如果是用户消息的重试，将内容填回输入框；若已有 AI 响应则删除重建
    if (message.role === 'user') {
      const messages = messageStore.messagesBySession(sessionId)
      const messageIndex = messages.findIndex(m => m.id === message.id)
      let followingAssistantId: string | undefined
      for (let i = messageIndex + 1; i < messages.length; i += 1) {
        if (messages[i].role === 'assistant') {
          followingAssistantId = messages[i].id
          break
        }
      }
      await retry(message, followingAssistantId)
      return
    }

    if (message.role === 'assistant') {
      const messages = messageStore.messagesBySession(sessionId)
      const messageIndex = messages.findIndex(m => m.id === message.id)

      for (let i = messageIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          await retry(messages[i], message.id)
          return
        }
      }
    }
  }

  // 编辑用户消息并重发：持久化新内容 → 删除该消息之后的所有消息 → 重新生成
  const handleEdit = async (message: Message, content: string) => {
    const sessionId = sessionStore.currentSessionId
    const isSending = sessionId ? sessionExecutionStore.getIsSending(sessionId) : false
    if (!sessionId || isSending) return
    await composerRef.value?.editAndResendMessage(message.id, content, message.attachments ?? [])
  }

  const currentTraceState = computed(() => {
    if (!sessionStore.currentSessionId) {
      return null
    }

    return aiEditTraceStore.getSessionState(sessionStore.currentSessionId)
  })

  const currentEditTraces = computed(() => {
    if (!sessionStore.currentSessionId) {
      return []
    }

    return messageStore.getAssistantEditTraces(sessionStore.currentSessionId)
  })

  const currentTraceDigest = computed(() => {
    if (!sessionStore.currentSessionId) {
      return '0::'
    }

    return messageStore.getAssistantTraceDigest(sessionStore.currentSessionId)
  })

  const currentTracePagination = computed(() => {
    if (!sessionStore.currentSessionId) {
      return null
    }

    return messageStore.getPagination(sessionStore.currentSessionId)
  })

  const ensureTraceHistoryLoaded = async (sessionId: string) => {
    const loadToken = ++traceHistoryLoadToken.value
    let attempts = 0

    while (attempts < 8) {
      if (traceHistoryLoadToken.value !== loadToken || sessionStore.currentSessionId !== sessionId) {
        return
      }

      const traces = messageStore.getAssistantEditTraces(sessionId)

      if (traces.length > 0) {
        return
      }

      const pagination = messageStore.getPagination(sessionId)
      if (!pagination.hasMore || pagination.isLoadingMore) {
        return
      }

      attempts += 1
      await messageStore.loadMoreMessages(sessionId)
    }
  }

  const hasTraceContent = computed(() => currentEditTraces.value.length > 0)

  // Token 使用情况
  const currentTokenUsage = computed(() => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) {
      return { used: 0, limit: 128000, percentage: 0, level: 'safe' as const }
    }
    return tokenStore.getTokenUsage(sessionId)
  })

  const currentMessageCount = computed(() => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) return 0
    return messageStore.messagesBySession(sessionId).length
  })

  // MessageList is not mounted while the empty-session welcome state is shown,
  // so it cannot own the first history load for a newly selected session.
  // Start that load at the MessageArea boundary; once loading begins the main
  // workspace mounts and MessageList reuses the same de-duplicated request.
  watch(() => sessionStore.currentSessionId, (sessionId) => {
    if (!sessionId || messageStore.messagesBySession(sessionId).length > 0) {
      return
    }
    void messageStore.loadMessages(sessionId)
  }, { immediate: true })

  const showDesktopTraceHandle = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      hasTraceContent.value &&
      !isMobileViewport.value &&
      !showDesktopTracePane.value
    )
  )

  const showDesktopTracePane = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      hasTraceContent.value &&
      !isMobileViewport.value &&
      currentTraceState.value?.isPaneVisible
    )
  )

  const showMobileTraceDrawer = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      hasTraceContent.value &&
      isMobileViewport.value &&
      currentTraceState.value?.isMobileDrawerOpen
    )
  )

  const showMobileTraceButton = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      hasTraceContent.value &&
      isMobileViewport.value
    )
  )

  const handleHideTracePane = () => {
    if (!sessionStore.currentSessionId) {
      return
    }

    if (isMobileViewport.value) {
      aiEditTraceStore.closeMobileDrawer(sessionStore.currentSessionId)
      return
    }

    aiEditTraceStore.hidePane(sessionStore.currentSessionId)
  }

  const traceOverlayDismiss = useOverlayDismiss(handleHideTracePane)
  const handleTraceOverlayPointerDown = traceOverlayDismiss.handleOverlayPointerDown
  const handleTraceOverlayClick = traceOverlayDismiss.handleOverlayClick

  const handleShowTracePane = () => {
    if (!sessionStore.currentSessionId) {
      return
    }

    aiEditTraceStore.showPane(sessionStore.currentSessionId)

    if (!isMobileViewport.value) {
      layoutStore.closePanel()
    }
  }

  const handleOpenMobileTrace = () => {
    if (!sessionStore.currentSessionId) {
      return
    }

    aiEditTraceStore.openMobileDrawer(sessionStore.currentSessionId)
  }

  const handleOpenEditTrace = (messageId: string, traceId: string) => {
    if (!sessionStore.currentSessionId) {
      return
    }

    aiEditTraceStore.selectTrace(sessionStore.currentSessionId, {
      messageId,
      traceId,
      openPane: !isMobileViewport.value,
      openMobileDrawer: isMobileViewport.value,
      userInitiated: true
    })

    if (!isMobileViewport.value) {
      layoutStore.closePanel()
    }
  }

  const handleComposerFocus = () => {
    if (!sessionStore.currentSessionId || !isMobileViewport.value) {
      return
    }

    aiEditTraceStore.closeMobileDrawer(sessionStore.currentSessionId)
  }

  const handleOpenCompress = () => {
    showCompressionDialog.value = true
  }

  const handleConfirmCompress = async (strategy: CompressionStrategy) => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) return

    const session = sessionStore.currentSession
    const agentStore = useAgentStore()
    const agentId = resolveSessionAgentId(session, agentStore.agents)

    if (!agentId) {
      notificationStore.smartError('压缩失败', new Error('未找到可用智能体'))
      showCompressionDialog.value = false
      return
    }

    showCompressionDialog.value = false
    isCompressing.value = true

    try {
      const result = await compressionService.compressSession(
        sessionId,
        agentId,
        {
          strategy,
          triggerSource: 'manual'
        }
      )

      if (result.success) {
        notificationStore.success(t('compression.success'))
        await conversationService.drainQueue(sessionId)
      } else {
        notificationStore.error(t('compression.failed'), result.error)
      }
    } catch (error) {
      notificationStore.smartError('压缩失败', error instanceof Error ? error : new Error(String(error)))
    } finally {
      isCompressing.value = false
      showCompressionDialog.value = false
    }
  }

  const handleCancelCompress = () => {
    showCompressionDialog.value = false
  }

  const handleMessageFormSubmit = async (
    formId: string,
    values: Record<string, unknown>,
    assistantMessageId?: string
  ) => {
    await composerRef.value?.handleMessageFormSubmit(formId, values, assistantMessageId)
  }

  watch(() => sessionStore.currentSessionId, (sessionId) => {
    if (!sessionId) {
      traceHistoryLoadToken.value += 1
      lastObservedTraceId.value = null
      return
    }

    const traces = messageStore.getAssistantEditTraces(sessionId)

    const latestTrace = traces[traces.length - 1]
    lastObservedTraceId.value = latestTrace?.id ?? null

    if (latestTrace && !aiEditTraceStore.getSessionState(sessionId).selectedTraceId) {
      aiEditTraceStore.selectTrace(sessionId, {
        messageId: latestTrace.messageId,
        traceId: latestTrace.id
      })
    }

    if (!latestTrace) {
      void ensureTraceHistoryLoaded(sessionId)
    }
  }, { immediate: true })

  watch(currentTraceDigest, () => {
    const sessionId = sessionStore.currentSessionId
    const traces = currentEditTraces.value
    if (!sessionId || traces.length === 0) {
      return
    }

    const latestTrace = traces[traces.length - 1]
    if (!latestTrace) {
      return
    }

    if (!lastObservedTraceId.value) {
      if (sessionExecutionStore.getIsSending(sessionId)) {
        aiEditTraceStore.handleIncomingTrace(sessionId, {
          messageId: latestTrace.messageId,
          traceId: latestTrace.id,
          shouldAutoOpen: true,
          isDesktop: !isMobileViewport.value
        })
      }
      lastObservedTraceId.value = latestTrace.id
      return
    }

    if (lastObservedTraceId.value === latestTrace.id) {
      return
    }

    aiEditTraceStore.handleIncomingTrace(sessionId, {
      messageId: latestTrace.messageId,
      traceId: latestTrace.id,
      shouldAutoOpen: sessionExecutionStore.getIsSending(sessionId),
      isDesktop: !isMobileViewport.value
    })
    lastObservedTraceId.value = latestTrace.id
  })

  watch(
    () => [
      sessionStore.currentSessionId,
      currentTraceDigest.value,
      currentTracePagination.value?.hasMore ?? false,
      currentTracePagination.value?.isLoadingMore ?? false,
      currentTracePagination.value?.oldestMessageCreatedAt ?? null
    ] as const,
    ([sessionId, traceDigest, hasMore, isLoadingMore, oldestMessageCreatedAt]) => {
      const traceCount = Number(traceDigest.split(':', 1)[0] ?? '0')
      if (!sessionId || traceCount > 0 || !hasMore || isLoadingMore || !oldestMessageCreatedAt) {
        return
      }

      void ensureTraceHistoryLoaded(sessionId)
    },
    { immediate: true }
  )

  watch(showDesktopTracePane, (visible) => {
    if (visible) {
      layoutStore.closePanel()
    }
  })

  const getTracePaneMaxWidth = () => {
    const workspaceWidth = workspaceRef.value?.clientWidth ?? window.innerWidth
    return Math.min(TRACE_PANE_MAX_WIDTH, Math.max(TRACE_PANE_MIN_WIDTH, workspaceWidth - CONVERSATION_MIN_WIDTH - 12))
  }

  const clampTracePaneWidth = (nextWidth: number) => {
    return Math.max(TRACE_PANE_MIN_WIDTH, Math.min(nextWidth, getTracePaneMaxWidth()))
  }

  const handleTracePaneResize = (delta: number) => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId || !currentTraceState.value) {
      return
    }

    aiEditTraceStore.setPaneWidth(sessionId, clampTracePaneWidth(currentTraceState.value.paneWidth + delta))
  }

  const handleTracePaneResizeEnd = (width: number) => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) {
      return
    }

    aiEditTraceStore.setPaneWidth(sessionId, clampTracePaneWidth(width))
  }

  // ---- Agent Plan 悬浮面板（浮于会话上方，不占会话列宽） ----
  const planPaneWidth = computed(() => agentPlanStore.paneWidth)
  const planUnseenCount = computed(() => agentPlanStore.currentUnseen)

  /**
   * 当前活动会话是否存在可展示的计划文档：
   * 处于计划模式（isPlanMode）且最新一条 assistant text 消息非空。
   * 无计划文档时不展示面板/入口，避免空态。
   */
  const hasPlanMarkdown = computed(() => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId || !sessionStore.isPlanMode(sessionId)) return false
    const messages = messageStore.messagesBySession(sessionId)
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (
        msg.role === 'assistant'
        && msg.messageType === 'text'
        && msg.content
        && msg.content.trim().length > 0
      ) {
        return true
      }
    }
    return false
  })

  // PRD 文档始终从主会话消息流隐藏：计划内容统一由右上角浮动面板承载，
  // 面板默认收起，用户点击 handle 展开。不再依赖 isCurrentOpen，避免面板收起时
  // PRD 又重复出现在主会话流中。
  const shouldHideLatestPlanDoc = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      hasPlanMarkdown.value
    )
  )

  /** 桌面端浮动面板可见：非移动端 + 当前会话有计划文档 + 面板已展开且未缩小 */
  const showDesktopPlanPane = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      !isMobileViewport.value &&
      hasPlanMarkdown.value &&
      agentPlanStore.isCurrentOpen &&
      !agentPlanStore.isCurrentMinimized
    )
  )

  /**
   * 桌面端开关按钮可见：
   * - 非移动端 + 当前会话有计划文档，且
   * - 面板未展开或已缩小（正常入口），或
   * - 面板标记为已展开但实际未渲染（兜底）：当 isCurrentOpen 为 true 但
   *   showDesktopPlanPane 因瞬态/竞态（如 isMobileViewport 闪烁、Transition 延迟）
   *   仍为 false 时，避免出现"面板与按钮双双不显示"的死锁，保证至少有一个入口。
   */
  const showDesktopPlanHandle = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      !isMobileViewport.value &&
      hasPlanMarkdown.value &&
      (!agentPlanStore.isCurrentOpen ||
        agentPlanStore.isCurrentMinimized ||
        !showDesktopPlanPane.value)
    )
  )

  const handleTogglePlanPane = () => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) return
    agentPlanStore.open(sessionId)
  }

  const handleHidePlanPane = () => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) return
    agentPlanStore.close(sessionId)
  }

  const handleMinimizePlanPane = () => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) return
    agentPlanStore.minimize(sessionId)
  }

  // 切换会话时同步 activeSessionId（清零未读 + 让 store 的 current* 计算生效）
  watch(() => sessionStore.currentSessionId, (sessionId) => {
    agentPlanStore.setActiveSession(sessionId)
  }, { immediate: true })

  // 计划模式下出现 PRD 文档时默认收起浮动面板（仅显示右上角入口按钮），
  // 由用户点击 handle 手动展开。PRD 文档在收起时仍保留在消息流中可见。
  watch(hasPlanMarkdown, () => {
    // 默认收起：不自动调用 agentPlanStore.open。
    // 仅保留 watcher 以便未来在此挂接“有新计划”的提示逻辑。
  })

  onMounted(() => {
    updateViewportMode()
    window.addEventListener('resize', updateViewportMode)
    // 兜底：Tauri 窗口刷新/恢复（最大化等）时，onMounted 执行瞬间 webview 可能尚未达到
    // 最终尺寸，且原生窗口尺寸变化未必触发 webview 的 window.resize。
    // 1) 下一帧复测一次（覆盖同步布局延迟）；
    // 2) 短延时再复测一次（覆盖窗口 maximize/restore 动画期间尺寸持续变化）。
    requestAnimationFrame(() => updateViewportMode())
    viewportRecheckTimeout = window.setTimeout(() => updateViewportMode(), 240)
    // 权威事件源：监听 Tauri 原生窗口 resize（与 stores/windowState.ts 用法一致）。
    getCurrentWindow()
      .onResized(() => updateViewportMode())
      .then((unlisten) => {
        unlistenWindowResized = unlisten
      })
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateViewportMode)
    if (unlistenWindowResized) {
      unlistenWindowResized()
      unlistenWindowResized = null
    }
    if (viewportRecheckTimeout != null) {
      window.clearTimeout(viewportRecheckTimeout)
      viewportRecheckTimeout = null
    }
  })

  // 欢迎页：是否已有导入项目，以及触发导入项目弹窗的动作
  const hasProjects = computed(() => projectStore.projects.length > 0)
  const handleImportProject = () => {
    uiStore.openProjectCreateModal()
  }

  // 已选择会话且历史正在加载时先进入主工作区显示 loading；只有确认加载完成后仍为空，
  // 才展示新会话欢迎态，避免 welcome 与 MessageList 加载职责互相等待。
  const isWelcomeMode = computed(() => {
    const sessionId = sessionStore.currentSessionId
    if (!sessionId) return true
    return currentMessageCount.value === 0 && !messageStore.isLoadingSession(sessionId)
  })

  // 按时段（24h）选择调皮问候语；6 分段：00-04 / 05-10 / 11-13 / 14-17 / 18-22 / 23
  const greeting = computed((): { emoji: string; period: string; text: string } => {
    const hour = new Date().getHours()
    let slot: 'lateNight' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'
    if (hour >= 0 && hour < 5) slot = 'lateNight'
    else if (hour < 11) slot = 'morning'
    else if (hour < 14) slot = 'noon'
    else if (hour < 18) slot = 'afternoon'
    else if (hour < 23) slot = 'evening'
    else slot = 'night'
    // tm() 返回原始消息对象（支持嵌套对象值），t() 仅用于 string 翻译
    const greetings = tm('messageArea.welcome.greetings') as Record<string, { emoji: string; period: string; text: string }>
    return greetings[slot] ?? { emoji: '👋', period: '', text: t('messageArea.welcome.titleReturning') }
  })

  return {
    sessionStore,
    messageStore,
    aiEditTraceStore,
    layoutStore,
    sessionExecutionStore,
    tokenStore,
    notificationStore,
    uiStore,
    projectStore,
    hasProjects,
    handleImportProject,
    isWelcomeMode,
    greeting,
    showCompressionDialog,
    isCompressing,
    isMobileViewport,
    lastObservedTraceId,
    workspaceRef,
    composerRef,
    traceHistoryLoadToken,
    TRACE_PANE_MIN_WIDTH,
    TRACE_PANE_MAX_WIDTH,
    CONVERSATION_MIN_WIDTH,
    updateViewportMode,
    handleRetry,
    handleEdit,
    currentTraceState,
    currentEditTraces,
    currentTraceDigest,
    currentTracePagination,
    ensureTraceHistoryLoaded,
    hasTraceContent,
    currentTokenUsage,
    currentMessageCount,
    showDesktopTraceHandle,
    showDesktopTracePane,
    showMobileTraceDrawer,
    showMobileTraceButton,
    handleHideTracePane,
    handleShowTracePane,
    handleOpenMobileTrace,
    handleOpenEditTrace,
    handleComposerFocus,
    handleOpenCompress,
    handleConfirmCompress,
    handleCancelCompress,
    handleMessageFormSubmit,
    handleTraceOverlayPointerDown,
    handleTraceOverlayClick,
    getTracePaneMaxWidth,
    clampTracePaneWidth,
    handleTracePaneResize,
    handleTracePaneResizeEnd,
    agentPlanStore,
    showDesktopPlanPane,
    showDesktopPlanHandle,
    shouldHideLatestPlanDoc,
    planPaneWidth,
    planUnseenCount,
    handleTogglePlanPane,
    handleHidePlanPane,
    handleMinimizePlanPane,
  }
}
