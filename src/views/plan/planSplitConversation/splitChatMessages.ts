/**
 * 拆分会话：将一个 turn 的 logs 转换为多条独立 Message（对齐主会话「一事件一行 + seq」模型）。
 *
 * 之前 splitChatMessages 把整个 turn 合并成一条纯文本 Message，丢弃了 tool_use/thinking
 * 结构化字段，导致工具调用/思考无法渲染；且用 createdAt 毫秒排序导致随机顺序。
 * 现在改为每个 tool_use/tool_result/thinking/content 各自独立成行，用递增 seq 保证顺序。
 */
import type { Message, MessageStatus } from '@/stores/message'
import type { PlanSplitLogRecord } from '@/types/plan'

// —— 纯函数 helpers（从 usePlanSplitConversation 提取，供共享） ——

export function parseLogMetadata(log: PlanSplitLogRecord): Record<string, unknown> | null {
  if (!log.metadata) {
    return null
  }
  if (typeof log.metadata === 'object') {
    return log.metadata as Record<string, unknown>
  }
  try {
    const parsed = JSON.parse(log.metadata as string)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

export function trimContent(value?: string | null): string {
  return (value ?? '').trim()
}

export function resolveToolCallId(log: PlanSplitLogRecord, metadata: Record<string, unknown> | null): string {
  const toolCallId = metadata?.toolCallId
  return typeof toolCallId === 'string' && toolCallId.trim()
    ? toolCallId.trim()
    : `tool-${log.id}`
}

function readMetadataString(metadata: Record<string, unknown> | null, key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}

export function resolveToolName(metadata: Record<string, unknown> | null): string {
  return readMetadataString(metadata, 'toolName')
    || readMetadataString(metadata, 'name')
    || readMetadataString(metadata, 'tool_name')
    || '工具调用'
}


export interface TurnAssistantMessageResult {
  /** 本 turn 产出的所有 assistant Message（含 tool_use/tool_result/thinking/text/system/error） */
  messages: Message[]
  /** 本 turn 最后一条 assistant 消息在全局 messages 数组中的索引（供外层 streaming/form 后处理定位） */
  lastAssistantMessageGlobalIndex: number
  /** 本 turn 最后一条 assistant 消息（可能为 null，如无任何产出） */
  lastAssistantMessage: Message | null
  /** 本 turn 是否有 assistant 产出 */
  hasAssistantPayload: boolean
  /** assistant 状态（completed/streaming/error） */
  assistantStatus: MessageStatus
  /** 错误消息 */
  assistantErrorMessage: string
}

interface BuildTurnOptions {
  /** turn 的 sessionId（用于 message.sessionId） */
  sessionId: string
  /** turn 的 requestId（同一 user 回合内所有 assistant Message 共享） */
  requestId: string
  /** 起始 seq（全局递增，保证跨 turn 顺序） */
  startSeq: number
  /** 是否正在流式运行（影响最后一条消息的 streaming 状态） */
  isRunning: boolean
  /** assistant 文本内容的前置处理（如 buildAssistantDisplayContent / formRequest 解析） */
  normalizeContent: (rawContent: string) => string
  /** system 内容是否为环境运行时通知（需跳过） */
  isEnvironmentSystemContent: (content: string) => boolean
}

/**
 * 将一个 turn 的 logs 转换为多条独立 Message。
 * 顺序保证：遍历 logs 时按出现顺序 + 递增 seq，tool_use/tool_result 等到遇到时
 * 先 flush 累积的 thinking/content chunks（保持原始交错顺序）。
 */
export function buildTurnAssistantMessages(
  turnLogs: PlanSplitLogRecord[],
  fallbackTimestamp: string,
  assistantSummaryTimestamp: string | undefined,
  options: BuildTurnOptions
): TurnAssistantMessageResult {
  const { sessionId, requestId, startSeq, isRunning, normalizeContent, isEnvironmentSystemContent } = options
  const messages: Message[] = []
  let seq = startSeq
  const thinkingChunks: string[] = []
  const contentChunks: string[] = []
  const toolCallIdToName = new Map<string, string>()
  const runningToolCallIds: string[] = []
  let assistantStatus: MessageStatus = 'completed'
  let assistantErrorMessage = ''
  let assistantCreatedAt = turnLogs[0]?.createdAt || assistantSummaryTimestamp || fallbackTimestamp

  /** flush 累积的 thinking + content chunks（保持顺序：先 thinking 后 content） */
  const flushAccumulatedChunks = (flushTimestamp: string) => {
    if (thinkingChunks.length > 0) {
      const thinkingContent = thinkingChunks
        .map(item => item.trim())
        .filter(Boolean)
        .join('\n\n')
      thinkingChunks.length = 0
      if (thinkingContent) {
        messages.push({
          id: `${requestId}-thinking-${seq}`,
          sessionId,
          requestId,
          role: 'assistant',
          messageType: 'thinking',
          content: thinkingContent,
          status: 'completed',
          seq: seq++,
          createdAt: flushTimestamp,
          updatedAt: flushTimestamp
        })
      }
    }
    if (contentChunks.length > 0) {
      const rawContent = contentChunks.join('')
      contentChunks.length = 0
      const normalized = normalizeContent(rawContent)
      if (normalized.trim()) {
        messages.push({
          id: `${requestId}-text-${seq}`,
          sessionId,
          requestId,
          role: 'assistant',
          messageType: 'text',
          content: normalized,
          status: assistantStatus,
          seq: seq++,
          createdAt: flushTimestamp,
          updatedAt: flushTimestamp
        })
      }
    }
  }

  turnLogs.forEach((log) => {
    const rawContent = trimContent(log.content)
    const metadata = parseLogMetadata(log)

    if (!assistantCreatedAt) {
      assistantCreatedAt = log.createdAt
    }

    // 跳过不需要渲染的事件类型
    if (log.type === 'usage' || log.type === 'message_start' || log.type === 'tool_input_delta' || log.type === 'thinking_start') {
      return
    }

    if (log.type === 'content') {
      if (rawContent) {
        contentChunks.push(log.content ?? '')
      }
      return
    }

    if (log.type === 'thinking') {
      if (rawContent) {
        thinkingChunks.push(rawContent)
      }
      return
    }

    if (log.type === 'tool_use') {
      // 先 flush 累积的 thinking/content（保持顺序）
      flushAccumulatedChunks(log.createdAt)

      const toolCallId = resolveToolCallId(log, metadata)
      const toolName = resolveToolName(metadata)
      const toolInputStr = typeof metadata?.toolInput === 'string' && metadata.toolInput.trim()
        ? metadata.toolInput.trim()
        : trimContent(log.content)
      const toolKind = typeof metadata?.toolKind === 'string' ? metadata.toolKind : undefined
      const toolLocations = Array.isArray(metadata?.toolLocations) ? metadata.toolLocations as Message['toolLocations'] : undefined

      toolCallIdToName.set(toolCallId, toolName)
      runningToolCallIds.push(toolCallId)

      messages.push({
        id: `${requestId}-tool_use-${toolCallId}-${seq}`,
        sessionId,
        requestId,
        role: 'assistant',
        messageType: 'tool_use',
        toolCallId,
        toolName,
        toolInput: toolInputStr,
        toolKind,
        toolLocations,
        content: '',
        status: 'completed',
        seq: seq++,
        createdAt: log.createdAt,
        updatedAt: log.createdAt
      })
      return
    }

    if (log.type === 'tool_result') {
      if (!rawContent) {
        return
      }

      const toolCallId = resolveToolCallId(log, metadata)
      const fallbackToolCallId = runningToolCallIds.length > 0
        ? runningToolCallIds[runningToolCallIds.length - 1]
        : undefined
      const matchedToolCallId = toolCallIdToName.has(toolCallId)
        ? toolCallId
        : fallbackToolCallId

      // 先 flush 累积的 thinking/content
      flushAccumulatedChunks(log.createdAt)

      messages.push({
        id: `${requestId}-tool_result-${matchedToolCallId || 'unknown'}-${seq}`,
        sessionId,
        requestId,
        role: 'assistant',
        messageType: 'tool_result',
        toolCallId: matchedToolCallId,
        toolName: matchedToolCallId ? toolCallIdToName.get(matchedToolCallId) : undefined,
        toolResult: rawContent,
        content: '',
        status: 'completed',
        seq: seq++,
        createdAt: log.createdAt,
        updatedAt: log.createdAt
      })

      if (matchedToolCallId) {
        const runningIndex = runningToolCallIds.lastIndexOf(matchedToolCallId)
        if (runningIndex >= 0) {
          runningToolCallIds.splice(runningIndex, 1)
        }
      }
      return
    }

    if (log.type === 'error') {
      assistantStatus = 'error'
      assistantErrorMessage = rawContent || '拆分执行失败'
      // flush 累积的内容
      flushAccumulatedChunks(log.createdAt)
      messages.push({
        id: `${requestId}-error-${seq}`,
        sessionId,
        requestId,
        role: 'assistant',
        messageType: 'error',
        content: assistantErrorMessage,
        status: 'error',
        errorMessage: assistantErrorMessage,
        seq: seq++,
        createdAt: log.createdAt,
        updatedAt: log.createdAt
      })
      return
    }

    // system 类型
    if (rawContent) {
      if (isEnvironmentSystemContent(rawContent)) {
        return
      }
      flushAccumulatedChunks(log.createdAt)
      messages.push({
        id: `${requestId}-system-${seq}`,
        sessionId,
        requestId,
        role: 'assistant',
        messageType: 'system',
        content: rawContent,
        status: 'completed',
        seq: seq++,
        createdAt: log.createdAt,
        updatedAt: log.createdAt
      })
    }
  })

  // flush 剩余的 thinking/content（turn 末尾）
  flushAccumulatedChunks(assistantCreatedAt || fallbackTimestamp)

  const hasAssistantPayload = messages.length > 0

  // 如果没有任何产出，但有 assistantSummary（session 持久化的摘要），构造一条 fallback text
  if (messages.length === 0 && assistantSummaryTimestamp) {
    // 无 logs 产出但有摘要时间戳 —— 由外层处理 fallback
  }

  // streaming 状态：如果正在运行，最后一条 assistant 消息标记为 streaming
  if (isRunning && messages.length > 0 && assistantErrorMessage === '') {
    const lastMsg = messages[messages.length - 1]
    lastMsg.status = 'streaming'
    assistantStatus = 'streaming'
  }

  // 未匹配的 running tool 调用：非 streaming 时标记为 success/error
  if (assistantStatus !== 'streaming') {
    messages.forEach(msg => {
      if (msg.messageType === 'tool_use' && msg.status === 'completed') {
        // tool_use 默认 completed 即可，tool_result 会独立显示
      }
    })
  }

  return {
    messages,
    lastAssistantMessageGlobalIndex: -1, // 由外层填充
    lastAssistantMessage: messages.length > 0 ? messages[messages.length - 1] : null,
    hasAssistantPayload,
    assistantStatus,
    assistantErrorMessage
  }
}
