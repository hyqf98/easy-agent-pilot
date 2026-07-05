import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import { conversationService } from '@/services/conversation'
import { MANUAL_STOP_ERROR_MARKER, type Message, type ToolCall, type ToolCallStatus } from '@/stores/message'
import { useMessageStore } from '@/stores/message'
import { useFileChangeStore } from '@/stores/fileChange'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { FILE_MENTION_PATTERN, getMentionDisplayText } from '@/utils/fileMention'
import { extractFormResponse, parseStructuredContent } from '@/utils/structuredContent'

export interface MessageBubbleProps {
  message: Message
  sessionId?: string
  hideContextStrategyNotice?: boolean
  sessionMessages?: Message[]
  isCurrentStreamingMessageOverride?: boolean
}

export interface MessageBubbleEmits {
  (event: 'retry', message: Message): void
  (event: 'edit', message: Message, content: string): void
  (event: 'formSubmit', formId: string, values: Record<string, unknown>, assistantMessageId?: string): void
  (event: 'openEditTrace', messageId: string, traceId: string): void
  (event: 'stop', message: Message): void
}

interface MessagePart {
  type: 'text' | 'file-mention'
  content: string
}

/**
 * 单条消息气泡状态。
 * 精简版：每个事件独立成行，气泡直接读取单条 message 字段，不再做跨行匹配/推导。
 */
export function useMessageBubble(props: MessageBubbleProps, emit: MessageBubbleEmits) {
  const { t, locale } = useI18n()
  const messageStore = useMessageStore()
  const fileChangeStore = useFileChangeStore()
  const sessionExecutionStore = useSessionExecutionStore()
  // 用户消息内联编辑态：进入编辑时填充原文，发送后由父组件刷新
  const isEditing = ref(false)
  const editContent = ref('')
  const editTextareaRef = ref<HTMLTextAreaElement | null>(null)
  const isFormResponseExpanded = ref(false)
  // 点击编辑控件外部（textarea / 发送 / 取消按钮以外）时取消编辑
  let editOutsideClickListener: ((event: PointerEvent) => void) | null = null

  // ── 基础角色/状态 ──────────────────────────────────────────────
  const isUser = computed(() => props.message.role === 'user')
  const isAssistant = computed(() => props.message.role === 'assistant')
  const isCompression = computed(() => props.message.messageType === 'compression')
  // 系统状态消息（如 "Connecting to agent via ACP…"）：轻量状态条，不走完整气泡
  const isSystemStatus = computed(() => props.message.messageType === 'system' && props.message.role === 'assistant')
  const isStreaming = computed(() => props.message.status === 'streaming')
  const isError = computed(() => props.message.status === 'error')
  const isInterrupted = computed(() => props.message.status === 'interrupted')
  const isManualStopped = computed(() => props.message.errorMessage === MANUAL_STOP_ERROR_MARKER)
  const canRetry = computed(() => isError.value || isInterrupted.value)

  const isCurrentStreamingMessage = computed(() => {
    if (typeof props.isCurrentStreamingMessageOverride === 'boolean') {
      return props.isCurrentStreamingMessageOverride
    }

    if (!props.sessionId || !isStreaming.value) {
      return false
    }

    return sessionExecutionStore.getExecutionState(props.sessionId).currentStreamingMessageId === props.message.id
  })

  const resolvedRetryState = computed(() => {
    if (props.message.retryState?.current) {
      return props.message.retryState
    }

    if (!props.sessionId || !isAssistant.value || !isStreaming.value) {
      return null
    }

    const currentRetryState = sessionExecutionStore.getExecutionState(props.sessionId).currentRetryState
    if (!currentRetryState || currentRetryState.assistantMessageId !== props.message.id) {
      return null
    }

    return {
      current: currentRetryState.current,
      max: currentRetryState.max
    }
  })

  // ── 用户消息操作 ──────────────────────────────────────────────
  const resolvedSessionMessages = computed(() => {
    if (props.sessionMessages) {
      return props.sessionMessages
    }

    if (!props.sessionId) {
      return []
    }

    return messageStore.messagesBySession(props.sessionId)
  })

  const latestAssistantMessageId = computed(() => {
    const latestAssistant = [...resolvedSessionMessages.value]
      .slice()
      .reverse()
      .find(message => message.role === 'assistant')
    return latestAssistant?.id ?? null
  })
  const latestUserMessageId = computed(() => {
    const latestUser = [...resolvedSessionMessages.value]
      .slice()
      .reverse()
      .find(message => message.role === 'user')
    return latestUser?.id ?? null
  })
  const canRetryCurrentAssistant = computed(() =>
    isAssistant.value
    && !isStreaming.value
    && latestAssistantMessageId.value === props.message.id
    && (canRetry.value || Boolean(props.message.content))
  )
  const canRetryCurrentUser = computed(() =>
    isUser.value
    && canRetry.value
    && latestUserMessageId.value === props.message.id
  )
  // 当前用户消息紧随其后第一条 assistant 消息（即本轮 AI 响应）
  const followingAssistantMessage = computed(() => {
    if (!isUser.value) return null
    const messages = resolvedSessionMessages.value
    const currentIndex = messages.findIndex(message => message.id === props.message.id)
    if (currentIndex === -1) return null
    for (let i = currentIndex + 1; i < messages.length; i += 1) {
      if (messages[i].role === 'assistant') return messages[i]
    }
    return null
  })
  // 本轮 AI 正在响应（pending → streaming 全程）
  const isUserTurnActive = computed(() => {
    const following = followingAssistantMessage.value
    if (!isUser.value || !following) return false
    if (following.status === 'pending' || following.status === 'streaming') return true
    if (props.sessionId) {
      return sessionExecutionStore.getExecutionState(props.sessionId).currentStreamingMessageId === following.id
    }
    return false
  })
  // 用户消息可重试：是最新用户消息、且本轮不在进行中、且失败/中断/已有 AI 响应
  const canRetryUserMessage = computed(() =>
    isUser.value
    && latestUserMessageId.value === props.message.id
    && !isUserTurnActive.value
    && (canRetry.value || Boolean(followingAssistantMessage.value) || Boolean(props.sessionId))
  )
  // 用户消息可编辑：任意用户消息（不限最新），回合已结束，无表单回填
  const canEditUserMessage = computed(() => {
    if (!isUser.value || isEditing.value) return false
    if (userFormResponseDisplay.value) return false
    if (!props.sessionId) return false
    return !sessionExecutionStore.getIsSending(props.sessionId)
  })

  // ── 时间格式化 ──────────────────────────────────────────────
  const formattedTime = computed(() => {
    const date = new Date(props.message.createdAt)
    return date.toLocaleTimeString(locale.value, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  })

  // ── 用户消息表单回填 ──────────────────────────────────────────
  const userFormResponse = computed(() => {
    if (!isUser.value) return null
    return extractFormResponse(props.message.content ?? '')
  })

  const userFormResponseDisplay = computed(() => {
    const formResponse = userFormResponse.value
    if (!formResponse) return null

    const sessionMessages = resolvedSessionMessages.value
    const currentIndex = sessionMessages.findIndex(message => message.id === props.message.id)
    if (currentIndex < 0) return null

    const fieldLabelMap = new Map<string, string>()
    const fieldOptionsMap = new Map<string, Array<{ label: string; value: unknown }>>()

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const candidate = sessionMessages[index]
      if (candidate.role !== 'assistant') continue

      const blocks = parseStructuredContent(candidate.content ?? '')
      for (const block of blocks) {
        if (block.type !== 'form' || block.formSchema.formId !== formResponse.formId) continue
        for (const field of block.formSchema.fields) {
          fieldLabelMap.set(field.name, field.label)
          if (field.options) {
            fieldOptionsMap.set(field.name, field.options)
          }
        }
      }
      if (fieldLabelMap.size > 0) break
    }

    const lines: string[] = []
    for (const [key, rawValue] of Object.entries(formResponse.values)) {
      const label = fieldLabelMap.get(key) || key
      const options = fieldOptionsMap.get(key)
      let displayValue = String(rawValue ?? '')

      if (options && options.length > 0) {
        const optionLabels = (Array.isArray(rawValue) ? rawValue : [rawValue])
          .map((value: unknown) => options.find(option => String(option.value) === String(value))?.label || String(value))
        displayValue = optionLabels.join(', ')
      }

      lines.push(`${label}: ${displayValue}`)
    }

    return lines.length > 0 ? lines : null
  })

  const userFormResponseCount = computed(() => userFormResponseDisplay.value?.length ?? 0)
  const userFormResponseSummary = computed(() =>
    t('message.formResponseSummary', { count: userFormResponseCount.value })
  )

  function toggleFormResponseExpanded() {
    isFormResponseExpanded.value = !isFormResponseExpanded.value
  }

  // ── 用户消息内容渲染（文件引用） ──────────────────────────────
  const processedUserMessage = computed(() => {
    if (!isUser.value) return []

    if (userFormResponseDisplay.value) {
      return []
    }

    const content = props.message.content ?? ''
    const parts: MessagePart[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    FILE_MENTION_PATTERN.lastIndex = 0

    while ((match = FILE_MENTION_PATTERN.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        })
      }

      parts.push({
        type: 'file-mention',
        content: getMentionDisplayText(match[0], match[1] ?? match[2])
      })

      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      })
    }

    if (parts.length === 0) {
      parts.push({
        type: 'text',
        content
      })
    }

    return parts
  })

  const hasUserText = computed(() =>
    processedUserMessage.value.some(part => part.type === 'file-mention' || part.content.trim().length > 0)
  )

  // ── 状态信息 ──────────────────────────────────────────────
  const statusInfo = computed(() => {
    if (!isUser.value) return null

    switch (props.message.status) {
      case 'pending':
        return { text: t('message.status.userPending'), icon: 'loading', class: 'status--pending' }
      case 'error':
        return { text: t('message.status.userError'), icon: 'error', class: 'status--error' }
      case 'completed':
        return { text: t('message.status.userCompleted'), icon: 'check', class: 'status--completed' }
      default:
        return null
    }
  })

  const assistantStatusInfo = computed(() => {
    if (!isAssistant.value) return null

    switch (props.message.status) {
      case 'streaming':
        if (resolvedRetryState.value && resolvedRetryState.value.current > 0) {
          return {
            text: t('message.status.assistantRetrying', {
              current: resolvedRetryState.value.current,
              max: resolvedRetryState.value.max
            }),
            icon: 'loading',
            class: 'status--retrying'
          }
        }
        return { text: t('message.status.assistantStreaming'), icon: 'loading', class: 'status--streaming' }
      case 'interrupted':
        return {
          text: isManualStopped.value ? t('message.status.assistantStopped') : t('message.status.interrupted'),
          icon: 'square',
          class: 'status--interrupted'
        }
      case 'error':
        return { text: t('message.status.assistantError'), icon: 'error', class: 'status--error' }
      case 'completed':
        return { text: t('message.status.assistantCompleted'), icon: 'check', class: 'status--completed' }
      default:
        return null
    }
  })

  const errorMessage = computed(() => props.message.errorMessage || t('message.failed'))

  // ── 工具调用独立行渲染（tool_use / tool_result） ──────────────
  const isToolUse = computed(() => props.message.messageType === 'tool_use')
  const isToolResult = computed(() => props.message.messageType === 'tool_result')

  const parsedToolArguments = computed<Record<string, unknown>>(() => {
    if (!props.message.toolInput) return {}
    try {
      const parsed = JSON.parse(props.message.toolInput)
      return parsed && typeof parsed === 'object' ? parsed : { raw: props.message.toolInput }
    } catch {
      return { raw: props.message.toolInput }
    }
  })

  const toolStatus = computed<ToolCallStatus>(() => {
    if (props.message.status === 'error') return 'error'
    if (props.message.status === 'streaming') return 'running'
    return 'success'
  })

  // 构造 ToolCall 对象供 ToolCallDisplay 组件
  const toolCallForDisplay = computed<ToolCall | null>(() => {
    if (!isToolUse.value && !isToolResult.value) return null
    return {
      id: props.message.toolCallId || props.message.id,
      name: props.message.toolName || 'tool',
      arguments: parsedToolArguments.value,
      status: toolStatus.value,
      result: props.message.toolResult,
      errorMessage: isError.value ? props.message.errorMessage : undefined,
      kind: props.message.toolKind,
      locations: props.message.toolLocations,
    }
  })

  const shouldRenderAsToolCall = computed(() =>
    (isToolUse.value || isToolResult.value) && toolCallForDisplay.value !== null
  )

  const toolDisplayLive = computed(() =>
    toolCallForDisplay.value?.status === 'running'
  )

  // tool_result 已合并进对应 tool_use 行时跳过独立渲染
  const isMergedToolResult = computed(() => {
    if (!isToolResult.value || !props.message.toolCallId) return false
    return resolvedSessionMessages.value.some(message =>
      message.messageType === 'tool_use' && message.toolCallId === props.message.toolCallId
    )
  })

  // ── 文件变更追踪（工具气泡内嵌） ──────────────────────────────
  const toolCallFileTraces = computed(() => {
    if (props.sessionMessages || !props.message.toolCallId) {
      return []
    }
    // 直接读取响应式 Map 确保依赖追踪
    return (fileChangeStore.tracesBySession.get(props.message.sessionId) ?? [])
      .filter(trace => trace.toolCallId === props.message.toolCallId)
  })

  const hasToolCallFileChanges = computed(() => toolCallFileTraces.value.length > 0)

  // ── 回合级文件变更汇总（AI 完成后追加在最后一条 assistant 消息下） ────
  // 仅当当前 assistant 消息是其 requestId 内最后一条可见 assistant 消息时显示，
  // 汇总整轮所有工具编辑的文件（不按 toolCallId 过滤）。
  const isLastAssistantInRequest = computed(() => {
    if (!isAssistant.value || props.sessionMessages) return false
    const requestId = props.message.requestId
    if (!requestId) return false
    const messages = resolvedSessionMessages.value
    const currentIndex = messages.findIndex(message => message.id === props.message.id)
    if (currentIndex === -1) return true // 消息不在可见列表（可能是流式本地行），乐观返回 true
    // 后面不再有同 requestId 的 assistant 消息（含工具消息）→ 是本轮最后一条
    for (let i = currentIndex + 1; i < messages.length; i += 1) {
      if (messages[i].role === 'assistant' && messages[i].requestId === requestId) {
        return false
      }
    }
    return true
  })

  const requestLevelFileTraces = computed(() => {
    if (!isLastAssistantInRequest.value) return []
    const requestId = props.message.requestId
    const sessionId = props.message.sessionId
    // 直接读取响应式 Map（确保 Vue 能追踪依赖，store 更新后重新计算）
    const allSessionTraces = sessionId
      ? (fileChangeStore.tracesBySession.get(sessionId) ?? [])
      : []
    // 优先用当前消息的 requestId 查找（同一回合的文件变更）
    if (requestId) {
      const sameRequest = allSessionTraces.filter(t => t.requestId === requestId)
      if (sameRequest.length > 0) return sameRequest
    }
    // 回退：历史回放（ACP session/load）会重新生成 requestId，无法与持久化的 traces
    // requestId 对齐；为避免刷新后文件列表丢失，这里展示该会话全部编辑文件。
    if (allSessionTraces.length > 0) return allSessionTraces
    return []
  })

  const hasRequestLevelFileChanges = computed(() => requestLevelFileTraces.value.length > 0)

  // ── assistant 结构化内容（表单） ──────────────────────────────
  const assistantStructuredBlocks = computed(() => {
    if (!isAssistant.value) {
      return []
    }

    return parseStructuredContent(props.message.content ?? '')
  })

  const assistantFormBlocks = computed(() =>
    assistantStructuredBlocks.value.filter(block => block.type === 'form')
  )

  const isAssistantFormOnly = computed(() => {
    if (!isAssistant.value) {
      return false
    }

    const blocks = assistantStructuredBlocks.value
    return blocks.length > 0 && blocks.every(block => block.type === 'form')
  })

  const assistantFormIds = computed(() =>
    assistantFormBlocks.value.map(block => block.formSchema.formId)
  )

  const resolvedFormResponsesById = computed<Record<string, Record<string, unknown>>>(() => {
    if (assistantFormIds.value.length === 0) {
      return {}
    }

    const sessionMessages = resolvedSessionMessages.value
    const currentIndex = sessionMessages.findIndex(message => message.id === props.message.id)
    if (currentIndex < 0) {
      return {}
    }

    const resolvedById: Record<string, Record<string, unknown>> = {}

    for (let index = currentIndex + 1; index < sessionMessages.length; index += 1) {
      const candidate = sessionMessages[index]
      if (candidate.role !== 'user') {
        continue
      }

      const formResponse = extractFormResponse(candidate.content ?? '')
      if (formResponse && assistantFormIds.value.includes(formResponse.formId)) {
        resolvedById[formResponse.formId] = formResponse.values
      }
    }

    return resolvedById
  })

  // ── 用量独立行渲染（usage / context_window） ──────────────────
  const isTokenOnlyMessage = computed(() =>
    props.message.messageType === 'usage' || props.message.messageType === 'context_window'
  )

  // ── Handlers ──────────────────────────────────────────────
  function handleStop() {
    if (props.sessionMessages) {
      emit('stop', props.message)
      return
    }

    // 用户消息上的停止：中断本轮紧随其后的 AI 响应，保留已生成内容
    const following = followingAssistantMessage.value
    if (isUser.value && following && props.sessionId && isUserTurnActive.value) {
      conversationService.abort(props.sessionId, following.id)
      return
    }

    if (props.message.status === 'streaming' && props.sessionId && isCurrentStreamingMessage.value) {
      conversationService.abort(props.sessionId, props.message.id)
      return
    }

    emit('stop', props.message)
  }

  function handleRetry() {
    emit('retry', props.message)
  }

  // 进入内联编辑：用当前消息原文填充编辑框
  function autoResizeEditTextarea() {
    const textarea = editTextareaRef.value
    if (!textarea) return
    textarea.style.height = '0px'
    const nextHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${nextHeight}px`
  }

  const EDIT_CONTROL_SELECTOR = '.message-bubble__edit-editor, .message-bubble__edit-send, .message-bubble__edit-cancel'

  function stopListeningEditOutsideClick() {
    if (editOutsideClickListener) {
      document.removeEventListener('pointerdown', editOutsideClickListener)
      editOutsideClickListener = null
    }
  }

  function startListeningEditOutsideClick() {
    stopListeningEditOutsideClick()
    editOutsideClickListener = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target && !target.closest(EDIT_CONTROL_SELECTOR)) {
        cancelEdit()
      }
    }
    document.addEventListener('pointerdown', editOutsideClickListener)
  }

  function startEdit() {
    editContent.value = props.message.content ?? ''
    isEditing.value = true
    startListeningEditOutsideClick()
    nextTick(() => {
      nextTick(() => {
        autoResizeEditTextarea()
        editTextareaRef.value?.focus()
      })
    })
  }

  function cancelEdit() {
    isEditing.value = false
    editContent.value = ''
    stopListeningEditOutsideClick()
  }

  watch(editContent, () => {
    if (isEditing.value) {
      autoResizeEditTextarea()
    }
  })

  function handleEditSubmit() {
    const nextContent = editContent.value.trim()
    if (!nextContent || (props.message.attachments?.length ?? 0) === 0 && nextContent === (props.message.content ?? '').trim()) {
      cancelEdit()
      return
    }
    const contentToSend = editContent.value
    isEditing.value = false
    editContent.value = ''
    stopListeningEditOutsideClick()
    emit('edit', props.message, contentToSend)
  }

  function handleFormSubmit(formId: string, values: Record<string, unknown>) {
    emit('formSubmit', formId, values, props.message.id)
  }

  function handleOpenEditTrace(traceId: string) {
    if (!traceId) return
    emit('openEditTrace', props.message.id, traceId)
  }

  return {
    t,
    EaIcon,
    // 基础
    isUser,
    isAssistant,
    isCompression,
    isSystemStatus,
    isTokenOnlyMessage,
    isStreaming,
    isCurrentStreamingMessage,
    isError,
    isInterrupted,
    canRetry,
    canRetryCurrentAssistant,
    canRetryCurrentUser,
    // 用户消息
    followingAssistantMessage,
    isUserTurnActive,
    canRetryUserMessage,
    canEditUserMessage,
    isEditing,
    editContent,
    editTextareaRef,
    isFormResponseExpanded,
    // 时间
    formattedTime,
    // 表单回填
    userFormResponseDisplay,
    userFormResponseSummary,
    processedUserMessage,
    hasUserText,
    // 状态
    statusInfo,
    assistantStatusInfo,
    errorMessage,
    // 工具
    shouldRenderAsToolCall,
    toolCallForDisplay,
    isMergedToolResult,
    toolDisplayLive,
    hasToolCallFileChanges,
    // 回合级文件变更汇总
    hasRequestLevelFileChanges,
    // 结构化内容
    isAssistantFormOnly,
    resolvedFormResponsesById,
    // Handlers
    handleStop,
    handleRetry,
    startEdit,
    cancelEdit,
    handleEditSubmit,
    handleFormSubmit,
    toggleFormResponseExpanded,
    handleOpenEditTrace
  }
}
