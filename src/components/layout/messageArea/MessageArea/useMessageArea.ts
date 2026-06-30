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

  const { t } = useI18n()
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

  const shouldHideLatestPlanDoc = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      hasPlanMarkdown.value &&
      agentPlanStore.isCurrentOpen
    )
  )

  /** 桌面端浮动面板可见：非移动端 + 面板已展开 + 当前会话有计划文档 */
  const showDesktopPlanPane = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      !isMobileViewport.value &&
      hasPlanMarkdown.value &&
      agentPlanStore.isCurrentOpen &&
      !agentPlanStore.isCurrentMinimized
    )
  )

  /** 桌面端开关按钮可见：非移动端 + 面板未展开或已缩小 + 当前会话有计划文档 */
  const showDesktopPlanHandle = computed(() =>
    Boolean(
      sessionStore.currentSessionId &&
      !isMobileViewport.value &&
      hasPlanMarkdown.value &&
      (!agentPlanStore.isCurrentOpen || agentPlanStore.isCurrentMinimized)
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

  /** 计划就绪 → 开始执行：退出计划模式并自动发送执行消息 */
  const handlePlanExecute = () => {
    void composerRef.value?.startPlanExecution()
  }

  /** 计划就绪 → 继续修改：收起确认 CTA 并聚焦输入框，供用户继续对话细化 */
  const handlePlanModify = () => {
    const sessionId = sessionStore.currentSessionId
    if (sessionId) {
      agentPlanStore.clearConfirm(sessionId)
    }
    composerRef.value?.focusInput()
  }

  // 切换会话时同步 activeSessionId（清零未读 + 让 store 的 current* 计算生效）
  watch(() => sessionStore.currentSessionId, (sessionId) => {
    agentPlanStore.setActiveSession(sessionId)
  }, { immediate: true })

  // 计划模式下出现 PRD 文档时自动打开浮动面板（从无→有触发一次），
  // 使 PRD 进面板展示并从消息流隐藏，避免重复；用户手动关闭后不再自动弹回。
  watch(hasPlanMarkdown, (has, prev) => {
    if (has && !prev) {
      const sessionId = sessionStore.currentSessionId
      if (sessionId && !isMobileViewport.value) {
        agentPlanStore.open(sessionId)
      }
    }
  })

  onMounted(() => {
    updateViewportMode()
    window.addEventListener('resize', updateViewportMode)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateViewportMode)
  })

  // 欢迎页：是否已有导入项目，以及触发导入项目弹窗的动作
  const hasProjects = computed(() => projectStore.projects.length > 0)
  const handleImportProject = () => {
    uiStore.openProjectCreateModal()
  }

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
    handlePlanExecute,
    handlePlanModify,
  }
}
