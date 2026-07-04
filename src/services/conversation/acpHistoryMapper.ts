import type { AcpReplayedEvent } from '@/types/cliSessionManager'
import type { Message, MessageRole, MessageType, MessageStatus } from '@/stores/message'

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 将 ACP session/load 回放的事件序列映射为前端 Message[]。
 *
 * 每个事件独立成一行；user_message 开启新的 requestId 分组，
 * 后续的 assistant 事件（思考/工具/文本）共享该 requestId。
 */
export function mapAcpEventsToMessages(
  sessionId: string,
  events: AcpReplayedEvent[]
): Message[] {
  const messages: Message[] = []
  let seq = 0
  let currentRequestId = uuid()

  for (const event of events) {
    const now = new Date().toISOString()

    switch (event.eventType) {
      case 'user_message': {
        seq++
        // 新回合
        currentRequestId = uuid()
        messages.push({
          id: uuid(),
          sessionId,
          requestId: currentRequestId,
          role: 'user' as MessageRole,
          messageType: 'text' as MessageType,
          content: event.content ?? '',
          status: 'completed' as MessageStatus,
          seq,
          createdAt: now,
          updatedAt: now,
        })
        break
      }
      case 'agent_message': {
        // 连续 agent_message 合并到同一行（与 live 流式语义一致），
        // 避免回放时每个 chunk 各成一个气泡。
        const last = messages[messages.length - 1]
        if (last && last.messageType === 'text' && last.role === 'assistant') {
          last.content = `${last.content ?? ''}${event.content ?? ''}`
          last.updatedAt = now
          break
        }
        seq++
        messages.push({
          id: uuid(),
          sessionId,
          requestId: currentRequestId,
          role: 'assistant' as MessageRole,
          messageType: 'text' as MessageType,
          content: event.content ?? '',
          status: 'completed' as MessageStatus,
          seq,
          createdAt: now,
          updatedAt: now,
        })
        break
      }
      case 'agent_thought': {
        // 连续 agent_thought 合并到同一行
        const last = messages[messages.length - 1]
        if (last && last.messageType === 'thinking' && last.role === 'assistant') {
          last.content = `${last.content ?? ''}${event.content ?? ''}`
          last.updatedAt = now
          break
        }
        seq++
        messages.push({
          id: uuid(),
          sessionId,
          requestId: currentRequestId,
          role: 'assistant' as MessageRole,
          messageType: 'thinking' as MessageType,
          content: event.content ?? '',
          status: 'completed' as MessageStatus,
          seq,
          createdAt: now,
          updatedAt: now,
        })
        break
      }
      case 'tool_call': {
        seq++
        messages.push({
          id: uuid(),
          sessionId,
          requestId: currentRequestId,
          role: 'assistant' as MessageRole,
          messageType: 'tool_use' as MessageType,
          toolCallId: event.toolCallId ?? undefined,
          toolName: event.toolName ?? undefined,
          toolInput: event.toolInput ?? undefined,
          status: 'completed' as MessageStatus,
          seq,
          createdAt: now,
          updatedAt: now,
        })
        break
      }
      case 'tool_result': {
        seq++
        messages.push({
          id: uuid(),
          sessionId,
          requestId: currentRequestId,
          role: 'assistant' as MessageRole,
          messageType: 'tool_result' as MessageType,
          toolCallId: event.toolCallId ?? undefined,
          toolResult: event.toolResult ?? undefined,
          status: 'completed' as MessageStatus,
          seq,
          createdAt: now,
          updatedAt: now,
        })
        break
      }
      case 'usage':
        // usage 事件不创建消息行，由 extractUsageFromEvents 单独处理
        break
    }
  }

  return messages
}

/**
 * 从事件序列中提取最近一次 usage 事件的 token 信息。
 * 若不存在 usage 事件则返回 null。
 */
export function extractUsageFromEvents(events: AcpReplayedEvent[]): {
  inputTokens: number
  outputTokens: number
} | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].eventType === 'usage') {
      return {
        inputTokens: events[i].inputTokens ?? 0,
        outputTokens: events[i].outputTokens ?? 0,
      }
    }
  }
  return null
}