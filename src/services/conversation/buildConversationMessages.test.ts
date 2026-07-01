import { describe, expect, it, vi } from 'vitest'
import type { Message, MessageType } from '@/stores/message'
import { buildConversationMessages } from './buildConversationMessages'

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string) => key
    }
  }
}))

function message(overrides: Partial<Message> & Pick<Message, 'id' | 'role' | 'content'>): Message {
  return {
    sessionId: 'session-1',
    requestId: 'request-1',
    messageType: 'text',
    status: 'completed',
    seq: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  } as Message
}

describe('buildConversationMessages', () => {
  it('keeps assistant text history but excludes ACP internal assistant event rows', () => {
    const messages = [
      message({ id: 'user-1', role: 'user', content: '我要实现人员管理系统' }),
      message({ id: 'thinking-1', role: 'assistant', messageType: 'thinking' as MessageType, content: 'internal reasoning' }),
      message({ id: 'tool-1', role: 'assistant', messageType: 'tool_use' as MessageType, content: '', toolName: 'todowrite' }),
      message({ id: 'tool-result-1', role: 'assistant', messageType: 'tool_result' as MessageType, content: '', toolResult: 'ok' }),
      message({ id: 'assistant-1', role: 'assistant', content: '请确认你要使用哪种技术栈？' })
    ]

    const result = buildConversationMessages(messages, { sessionId: 'session-1' })

    expect(result.map(item => item.id)).toEqual(['user-1', 'assistant-1'])
  })
})
