import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import { conversationService } from '@/services/conversation'
import { resolveRecordedModelId } from '@/services/usage/agentCliUsageRecorder'
import { useAgentStore } from '@/stores/agent'
import { MANUAL_STOP_ERROR_MARKER, isVisibleConversationMessage, type Message, type ToolCall } from '@/stores/message'
import { useMessageStore } from '@/stores/message'
import { useFileChangeStore } from '@/stores/fileChange'
import { useSessionStore } from '@/stores/session'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { FILE_MENTION_PATTERN, getMentionDisplayText } from '@/utils/fileMention'
import { extractFormResponse, parseStructuredContent } from '@/utils/structuredContent'
import { resolveSessionAgent } from '@/utils/sessionAgent'

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

function toTimeMs(value?: string): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function formatWorkDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * 单条消息气泡状态。
 * 负责消息状态推导、结构化内容解析、附件预览与工具调用排序。
 */
export function useMessageBubble(props: MessageBubbleProps, emit: MessageBubbleEmits) {
  const { t, locale } = useI18n()
  const agentStore = useAgentStore()
  const messageStore = useMessageStore()
  const fileChangeStore = useFileChangeStore()
  const sessionStore = useSessionStore()
  const sessionExecutionStore = useSessionExecutionStore()
  const nowTick = ref(Date.now())
  const areToolCallsExpanded = ref(false)
  // 用户消息内联编辑态：进入编辑时填充原文，发送后由父组件刷新
  const isEditing = ref(false)
  const editContent = ref('')
  const editTextareaRef = ref<HTMLTextAreaElement | null>(null)
  const isFormResponseExpanded = ref(false)
  // 点击编辑控件外部（textarea / 发送 / 取消按钮以外）时取消编辑
  let editOutsideClickListener: ((event: PointerEvent) => void) | null = null
  let elapsedTimer: ReturnType<typeof setInterval> | null = null

  const isUser = computed(() => props.message.role === 'user')
  const isAssistant = computed(() => props.message.role === 'assistant')
  const isCompression = computed(() => props.message.messageType === 'compression')
  // 系统状态消息（如 "Connecting to agent via ACP…"）：轻量状态条，不走完整气泡
  const isSystemStatus = computed(() => props.message.messageType === 'system' && props.message.role === 'assistant')
  const isStreaming = computed(() => props.message.status === 'streaming')
  const isAssistantText = computed(() => isAssistant.value && props.message.messageType === 'text')
  // 同回合是否已有思考行（思考行存在时，等待态由 ThinkingDisplay 的"正在思考"承担）
  const hasRequestThinkingRow = computed(() =>
    resolvedSessionMessages.value.some(message =>
      message.requestId === props.message.requestId
      && message.role === 'assistant'
      && message.messageType === 'thinking'
    )
  )
  // AI 文本回复等待首字：assistant text 行处于 streaming、内容为空、且同回合尚无思考行。
  // 此时在气泡内渲染旋转圆环加载动画，首字/思考到达后自动让位。
  const isAwaitingFirstToken = computed(() =>
    isAssistantText.value
    && isStreaming.value
    && !props.message.content?.trim()
    && !hasRequestThinkingRow.value
  )
  const resolvedSessionMessages = computed(() => {
    if (props.sessionMessages) {
      return props.sessionMessages
    }

    if (!props.sessionId) {
      return []
    }

    return messageStore.messagesBySession(props.sessionId)
  })
  const requestAssistantMessages = computed(() =>
    resolvedSessionMessages.value.filter(message =>
      message.requestId === props.message.requestId
      && message.role === 'assistant'
      && message.messageType !== 'usage'
      && message.messageType !== 'context_window'
      && message.messageType !== 'system'
    )
  )
  const latestAssistantRequestId = computed(() => {
    const latestAssistant = [...resolvedSessionMessages.value]
      .reverse()
      .find(message =>
        message.role === 'assistant'
        && message.messageType !== 'usage'
        && message.messageType !== 'context_window'
        && message.messageType !== 'system'
      )

    return latestAssistant?.requestId ?? null
  })
  const isLatestAssistantRequestSending = computed(() => {
    if (!props.sessionId || !props.message.requestId) {
      return false
    }

    return sessionExecutionStore.getIsSending(props.sessionId)
      && latestAssistantRequestId.value === props.message.requestId
      && requestAssistantMessages.value.length > 0
  })
  const isRequestActive = computed(() =>
    requestAssistantMessages.value.some(message => message.status === 'streaming')
    || isLatestAssistantRequestSending.value
  )
  const hasVisibleRequestEvent = computed(() =>
    requestAssistantMessages.value.some(message => {
      if (!isVisibleConversationMessage(message, resolvedSessionMessages.value)) {
        return false
      }
      if (message.messageType === 'thinking') return true
      if (message.messageType === 'tool_use' || message.messageType === 'tool_result') return true
      return Boolean(message.content?.trim())
    })
  )
  // 回合终态推导：执行中 → 已完成 → 已中断 → 已失败
  // streaming 优先（仍在工作）；其次 error（失败）；其次 interrupted（停止/中断）；否则 completed
  type RequestTerminalStatus = 'active' | 'completed' | 'interrupted' | 'failed'
  const requestTerminalStatus = computed<RequestTerminalStatus>(() => {
    if (isRequestActive.value) return 'active'
    if (requestAssistantMessages.value.some(message => message.status === 'error')) return 'failed'
    if (requestAssistantMessages.value.some(message => message.status === 'interrupted')) return 'interrupted'
    return 'completed'
  })
  const isFirstAssistantInRequest = computed(() => {
    if (!isAssistant.value) return false

    const firstVisibleAssistant = requestAssistantMessages.value.find(message => {
      if (message.messageType !== 'tool_result' || !message.toolCallId) {
        return true
      }

      return !resolvedSessionMessages.value.some(candidate =>
        candidate.messageType === 'tool_use'
        && candidate.toolCallId === message.toolCallId
      )
    })

    return firstVisibleAssistant?.id === props.message.id
  })
  const shouldShowWorkDivider = computed(() =>
    isFirstAssistantInRequest.value
    && props.message.messageType === 'text'
    && !isSystemStatus.value
    && !(requestTerminalStatus.value === 'active' && hasVisibleRequestEvent.value)
  )
  const workDurationLabel = computed(() => {
    const times = requestAssistantMessages.value
      .flatMap(message => [toTimeMs(message.createdAt), toTimeMs(message.updatedAt)])
      .filter((value): value is number => value !== null)

    if (times.length === 0) {
      return '0:00'
    }

    const start = Math.min(...times)
    const end = isRequestActive.value ? nowTick.value : Math.max(...times)
    return formatWorkDuration(end - start)
  })
  const workDividerLabel = computed(() => {
    switch (requestTerminalStatus.value) {
      case 'active': return t('message.workDivider.working')
      case 'interrupted': return t('message.workDivider.interrupted')
      case 'failed': return t('message.workDivider.failed')
      default: return t('message.workDivider.completed')
    }
  })
  const workDividerIcon = computed(() => {
    switch (requestTerminalStatus.value) {
      case 'active': return 'loader-circle'
      case 'interrupted': return 'square'
      case 'failed': return 'triangle-alert'
      default: return 'check'
    }
  })
  // 分割线修饰类：active / interrupted / failed 各自配色，completed 不加修饰类
  const workDividerStatusClass = computed(() => `message-bubble__work-divider--${requestTerminalStatus.value}`)
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
  const isError = computed(() => props.message.status === 'error')
  const isInterrupted = computed(() => props.message.status === 'interrupted')
  const canRetry = computed(() => isError.value || isInterrupted.value)
  const isManualStopped = computed(() => props.message.errorMessage === MANUAL_STOP_ERROR_MARKER)
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
  // 用户消息可编辑：任意用户消息（不限最新），回合已结束（完成/失败/停止），无表单回填。
  // 编辑后重发会清空该消息之下的全部 AI 响应并重新生成。
  const canEditUserMessage = computed(() => {
    if (!isUser.value || isEditing.value) return false
    if (userFormResponseDisplay.value) return false
    if (requestTerminalStatus.value === 'active') return false
    if (!props.sessionId) return false
    return !sessionExecutionStore.getIsSending(props.sessionId)
  })
  const isAutoRetryPending = computed(() => {
    if (!props.sessionId || !isAssistant.value || isStreaming.value) return false
    const executionState = sessionExecutionStore.getExecutionState(props.sessionId)
    return executionState.isAwaitingRetry
  })

  watch(
    isRequestActive,
    active => {
      if (elapsedTimer) {
        clearInterval(elapsedTimer)
        elapsedTimer = null
      }

      if (!active) {
        nowTick.value = Date.now()
        return
      }

      nowTick.value = Date.now()
      elapsedTimer = setInterval(() => {
        nowTick.value = Date.now()
      }, 1000)
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    stopListeningEditOutsideClick()
  })

  const formattedTime = computed(() => {
    const date = new Date(props.message.createdAt)
    return date.toLocaleTimeString(locale.value, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  })

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

      const blocks = parseStructuredContent(candidate.content ?? ''  )
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

  const visibleRuntimeNotices = computed(() => {
    // 新结构下 runtimeNotices 不再折叠进 message
    return []
  })

  const displayRuntimeNotices = computed(() => visibleRuntimeNotices.value)

  const shouldShowRuntimeNotices = computed(() =>
    isAssistant.value && displayRuntimeNotices.value.length > 0
  )

  const assistantVisibleEditTraces = computed(() => {
    if (props.sessionMessages) {
      return []
    }

    // 文件变更追踪：从 fileChange store 读取本回合（requestId）的变更
    return fileChangeStore.getTracesForRequest(props.message.sessionId, props.message.requestId)
  })

  const hasFileChanges = computed(() => assistantVisibleEditTraces.value.length > 0)

  // 工具调用气泡内嵌的文件变更：按 toolCallId 精确匹配当前工具产生的文件修改，
  // 用于在修改文件的工具气泡（Edit/Write 等）内部展开文件列表，复用同一气泡。
  const toolCallFileTraces = computed(() => {
    if (props.sessionMessages || !props.message.toolCallId) {
      return []
    }
    return fileChangeStore.getTracesForSession(props.message.sessionId)
      .filter(trace => trace.toolCallId === props.message.toolCallId)
  })

  const hasToolCallFileChanges = computed(() => toolCallFileTraces.value.length > 0)

  const errorMessage = computed(() => props.message.errorMessage || t('message.failed'))

  // 新结构下工具调用是独立行，单条 message 上不再有 toolCalls
  const toolCallCount = computed(() => 0)
  const shouldClampToolCalls = computed(() => toolCallCount.value > 10)
  const toolCallModelLabel = computed(() => {
    if (!isAssistant.value || toolCallCount.value === 0) {
      return ''
    }

    const sessionId = props.sessionId || props.message.sessionId
    const session = sessionId
      ? sessionStore.sessions.find(item => item.id === sessionId)
      : null
    const fallbackModel = resolveSessionAgent(session, agentStore.agents)?.modelId?.trim() || ''

    return resolveRecordedModelId({
      reportedModelId: props.message.model,
      requestedModelId: fallbackModel
    }) || fallbackModel || props.message.model || ''
  })

  const sortedToolCalls = computed(() => [])

  // ── 工具调用独立行渲染（tool_use / tool_result） ─────────────────────────
  // 新结构下 tool_use 与 tool_result 各自独立成行，按 toolCallId 关联。
  const isToolUse = computed(() => props.message.messageType === 'tool_use')
  const isToolResult = computed(() => props.message.messageType === 'tool_result')
  const matchedToolUseMessage = computed(() => {
    if (!props.message.toolCallId) return null
    return resolvedSessionMessages.value.find(message =>
      message.messageType === 'tool_use' && message.toolCallId === props.message.toolCallId
    ) ?? null
  })
  const matchedToolResultMessage = computed(() => {
    if (!props.message.toolCallId) return null
    const resultMessages = resolvedSessionMessages.value.filter(message =>
      message.messageType === 'tool_result' && message.toolCallId === props.message.toolCallId
    )
    return [...resultMessages].reverse().find(message => message.toolResult?.trim())
      ?? resultMessages[resultMessages.length - 1]
      ?? null
  })
  const isRequestStreaming = computed(() => {
    if (isStreaming.value) return true
    return resolvedSessionMessages.value.some(message =>
      message.requestId === props.message.requestId
      && message.role === 'assistant'
      && message.status === 'streaming'
    )
  })

  // tool_use 行解析入参，构造 ToolCall 供 ToolCallDisplay 渲染
  const toolUseParsed = computed<ToolCall | null>(() => {
    if (!isToolUse.value) return null
    let parsedArguments: Record<string, unknown> = {}
    if (props.message.toolInput) {
      try {
        parsedArguments = JSON.parse(props.message.toolInput)
      } catch {
        parsedArguments = { raw: props.message.toolInput }
      }
    }
    const resultMessage = matchedToolResultMessage.value
    const hasResult = Boolean(resultMessage?.toolResult || props.message.toolResult)
    const hasError = resultMessage?.status === 'error' || props.message.status === 'error'
    const status = hasError ? 'error' : !hasResult && isRequestStreaming.value ? 'running' : 'success'
    return {
      id: props.message.toolCallId || props.message.id,
      name: props.message.toolName || 'tool',
      arguments: parsedArguments,
      status,
      result: resultMessage?.toolResult || props.message.toolResult,
      errorMessage: hasError ? (resultMessage?.errorMessage || props.message.errorMessage) : undefined,
      kind: props.message.toolKind,
      locations: props.message.toolLocations
    }
  })

  // tool_result 行：尝试在会话消息中找到同 toolCallId 的 tool_use 获取 name，
  // 组装成带结果的 ToolCall
  const toolResultParsed = computed<ToolCall | null>(() => {
    if (!isToolResult.value) return null
    const toolCallId = props.message.toolCallId
    const useMessage = matchedToolUseMessage.value
    const name = useMessage?.toolName || props.message.toolName || 'tool'
    let parsedArguments: Record<string, unknown> = {}
    if (useMessage?.toolInput) {
      try {
        parsedArguments = JSON.parse(useMessage.toolInput)
      } catch {
        parsedArguments = { raw: useMessage.toolInput }
      }
    }
    const hasError = props.message.status === 'error'
    return {
      id: toolCallId || props.message.id,
      name,
      arguments: parsedArguments,
      status: hasError ? 'error' : 'success',
      result: props.message.toolResult,
      errorMessage: hasError ? props.message.errorMessage : undefined,
      kind: useMessage?.toolKind || props.message.toolKind,
      locations: useMessage?.toolLocations || props.message.toolLocations
    }
  })

  const toolCallForDisplay = computed<ToolCall | null>(() =>
    toolUseParsed.value || toolResultParsed.value
  )

  const isMergedToolResult = computed(() =>
    isToolResult.value && matchedToolUseMessage.value !== null
  )

  const shouldRenderAsToolCall = computed(() =>
    (isToolUse.value || isToolResult.value) && toolCallForDisplay.value !== null
  )

  const toolDisplayLive = computed(() =>
    toolCallForDisplay.value?.status === 'running'
  )

  // ── 用量独立行渲染（usage / context_window） ───────────────────────────
  // 这两类消息仅供 token 进度环使用，不作为独立消息气泡渲染。
  const isTokenOnlyMessage = computed(() =>
    props.message.messageType === 'usage' || props.message.messageType === 'context_window'
  )
  const isUsage = computed(() => props.message.messageType === 'usage')
  const isContextWindow = computed(() => props.message.messageType === 'context_window')

  const usageSummary = computed(() => {
    if (!isUsage.value && !isContextWindow.value) return null
    const input = props.message.inputTokens ?? 0
    const output = props.message.outputTokens ?? 0
    const cacheRead = props.message.cacheReadTokens ?? 0
    const cacheCreation = props.message.cacheCreationTokens ?? 0
    const total = input + output + cacheRead + cacheCreation
    return {
      input,
      output,
      cacheRead,
      cacheCreation,
      total,
      model: props.message.model || '',
      costUsd: props.message.costUsd ?? null
    }
  })

  const assistantStructuredBlocks = computed(() => {
    if (!isAssistant.value) {
      return []
    }

    return parseStructuredContent(props.message.content ?? ''  )
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

      const formResponse = extractFormResponse(candidate.content ?? '' )
      if (formResponse && assistantFormIds.value.includes(formResponse.formId)) {
        resolvedById[formResponse.formId] = formResponse.values
      }
    }

    return resolvedById
  })

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
  // 按内容自适应文本框高度（无缝接管气泡，无固定行数）
  function autoResizeEditTextarea() {
    const textarea = editTextareaRef.value
    if (!textarea) return
    // 先归零再读 scrollHeight，得到内容的真实高度（撑开当前内容）
    textarea.style.height = '0px'
    const nextHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${nextHeight}px`
  }

  // 编辑控件选择器：点击这些元素之内不触发取消
  const EDIT_CONTROL_SELECTOR = '.message-bubble__edit-editor, .message-bubble__edit-send, .message-bubble__edit-cancel'

  function stopListeningEditOutsideClick() {
    if (editOutsideClickListener) {
      document.removeEventListener('pointerdown', editOutsideClickListener)
      editOutsideClickListener = null
    }
  }

  // 进入编辑时绑定「点击空白处取消」监听（pointerdown 先于 click，避免误触按钮）
  function startListeningEditOutsideClick() {
    stopListeningEditOutsideClick()
    editOutsideClickListener = (event: PointerEvent) => {
      const target = event.target as Element | null
      // 目标在编辑控件之外时取消编辑
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
    // v-if 文本框需两帧后挂载，再用 rAF 等布局完成以读取准确的 scrollHeight
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

  // 编辑内容变化时自适应高度
  watch(editContent, () => {
    if (isEditing.value) {
      autoResizeEditTextarea()
    }
  })

  // 提交编辑：trim 非空后 emit，父组件负责持久化新内容并重发；成功后退出编辑态由父组件刷新
  function handleEditSubmit() {
    const nextContent = editContent.value.trim()
    if (!nextContent || (props.message.attachments?.length ?? 0) === 0 && nextContent === (props.message.content ?? '').trim()) {
      cancelEdit()
      return
    }
    // 先捕获待发送内容，再退出编辑态并解绑外部点击监听，最后 emit
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

  function formatTraceChangeType(changeType: 'create' | 'modify' | 'delete') {
    switch (changeType) {
      case 'create':
        return '新建'
      case 'delete':
        return '删除'
      default:
        return '修改'
    }
  }

  function getTraceDisplayName(relativePath: string) {
    const segments = relativePath.split(/[\\/]/)
    return segments[segments.length - 1] || relativePath
  }

  function getTraceParentPath(relativePath: string) {
    const segments = relativePath.split(/[\\/]/)
    if (segments.length <= 1) {
      return '项目根目录'
    }
    return segments.slice(0, -1).join('/')
  }

  // 新结构下工具调用是独立行，单条 message 上不再有 toolCalls。
  // 保留占位类型，便于后续按 tool_use 行单独渲染。
  interface LegacyToolCallShape {
    id: string
    status: string
    arguments?: Record<string, unknown> | null
    result?: string | null
    errorMessage?: string | null
  }

  function getToolCallRenderKey(toolCall: LegacyToolCallShape) {
    return [
      toolCall.id,
      toolCall.status,
      Object.keys(toolCall.arguments ?? {}).length,
      toolCall.result?.length ?? 0,
      toolCall.errorMessage?.length ?? 0
    ].join(':')
  }

  function getTraceChangeIcon(changeType: 'create' | 'modify' | 'delete') {
    switch (changeType) {
      case 'create':
        return 'plus'
      case 'delete':
        return 'trash-2'
      default:
        return 'square-pen'
    }
  }

  function toggleToolCallsExpanded() {
    areToolCallsExpanded.value = !areToolCallsExpanded.value
  }

  return {
    t,
    EaIcon,
    areToolCallsExpanded,
    isUser,
    isAssistant,
    isCompression,
    isSystemStatus,
    isTokenOnlyMessage,
    isStreaming,
    isAwaitingFirstToken,
    isCurrentStreamingMessage,
    isError,
    isInterrupted,
    canRetry,
    canRetryCurrentAssistant,
    canRetryCurrentUser,
    followingAssistantMessage,
    isUserTurnActive,
    canRetryUserMessage,
    canEditUserMessage,
    isEditing,
    editContent,
    editTextareaRef,
    isFormResponseExpanded,
    isAutoRetryPending,
    formattedTime,
    userFormResponseDisplay,
    userFormResponseSummary,
    processedUserMessage,
    hasUserText,
    statusInfo,
    assistantStatusInfo,
    visibleRuntimeNotices,
    displayRuntimeNotices,
    shouldShowRuntimeNotices,
    assistantVisibleEditTraces,
    hasFileChanges,
    toolCallFileTraces,
    hasToolCallFileChanges,
    shouldShowWorkDivider,
    workDividerLabel,
    workDividerIcon,
    workDividerStatusClass,
    requestTerminalStatus,
    workDurationLabel,
    isRequestActive,
    errorMessage,
    toolCallCount,
    toolCallModelLabel,
    shouldClampToolCalls,
    sortedToolCalls,
    isAssistantFormOnly,
    resolvedFormResponsesById,
    isToolUse,
    isToolResult,
    toolCallForDisplay,
    isMergedToolResult,
    shouldRenderAsToolCall,
    toolDisplayLive,
    isUsage,
    isContextWindow,
    usageSummary,
    handleStop,
    handleRetry,
    startEdit,
    cancelEdit,
    handleEditSubmit,
    handleFormSubmit,
    toggleFormResponseExpanded,
    handleOpenEditTrace,
    formatTraceChangeType,
    getTraceDisplayName,
    getTraceParentPath,
    getToolCallRenderKey,
    getTraceChangeIcon,
    toggleToolCallsExpanded
  }
}
