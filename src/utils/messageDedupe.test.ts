import { describe, it, expect } from 'vitest'
import { dedupeMessagesById, dedupeRequestTextRows } from './messageDedupe'
import type { DedupeMessageLike } from './messageDedupe'

function buildMessage(overrides: Partial<DedupeMessageLike> & { id: string }): DedupeMessageLike {
  return {
    sessionId: 's1',
    requestId: 'r1',
    role: 'assistant',
    messageType: 'text',
    content: '',
    ...overrides
  }
}

describe('dedupeMessagesById', () => {
  it('按 id 去重，保留最后出现的', () => {
    const a = buildMessage({ id: '1', content: 'a' })
    const aDup = buildMessage({ id: '1', content: 'a-updated' })
    const b = buildMessage({ id: '2', content: 'b' })
    const result = dedupeMessagesById([a, aDup, b])
    expect(result).toHaveLength(2)
    expect(result.find(m => m.id === '1')?.content).toBe('a-updated')
  })

  it('空数组返回空数组', () => {
    expect(dedupeMessagesById([])).toEqual([])
  })
})

describe('dedupeRequestTextRows', () => {
  it('同回合多条 assistant text 段必须全部保留', () => {
    const short = buildMessage({ id: 'a1', requestId: 'r1', content: 'hi' })
    const long = buildMessage({ id: 'a2', requestId: 'r1', content: 'hello world response' })
    const result = dedupeRequestTextRows([short, long])
    expect(result.filter(m => m.messageType === 'text')).toHaveLength(2)
    expect(result.map(m => m.content)).toEqual(['hi', 'hello world response'])
  })

  it('不同回合的 text 各自保留', () => {
    const r1 = buildMessage({ id: 'a1', requestId: 'r1', content: 'resp1' })
    const r2 = buildMessage({ id: 'a2', requestId: 'r2', content: 'resp2' })
    const result = dedupeRequestTextRows([r1, r2])
    expect(result.filter(m => m.messageType === 'text')).toHaveLength(2)
  })

  it('非 text 类型（thinking/tool_use/usage）不受影响', () => {
    const text1 = buildMessage({ id: 't1', requestId: 'r1', messageType: 'text', content: 'full response' })
    const text2 = buildMessage({ id: 't2', requestId: 'r1', messageType: 'text', content: '' })
    const thinking = buildMessage({ id: 'th1', requestId: 'r1', messageType: 'thinking', content: 'thought' })
    const usage = buildMessage({ id: 'u1', requestId: 'r1', messageType: 'usage' })
    const result = dedupeRequestTextRows([text1, text2, thinking, usage])
    expect(result.filter(m => m.messageType === 'text')).toHaveLength(2)
    expect(result.filter(m => m.messageType === 'thinking')).toHaveLength(1)
    expect(result.filter(m => m.messageType === 'usage')).toHaveLength(1)
  })

  it('user 消息不参与去重', () => {
    const user = buildMessage({ id: 'u1', requestId: 'r1', role: 'user', content: 'question' })
    const a1 = buildMessage({ id: 'a1', requestId: 'r1', content: 'answer' })
    const a2 = buildMessage({ id: 'a2', requestId: 'r1', content: 'longer answer text' })
    const result = dedupeRequestTextRows([user, a1, a2])
    expect(result.filter(m => m.role === 'user')).toHaveLength(1)
    expect(result.filter(m => m.role === 'assistant' && m.messageType === 'text')).toHaveLength(2)
  })

  it('无 requestId 的 assistant text 不参与去重', () => {
    const noReq = buildMessage({ id: 'a1', requestId: '', content: 'orphan' })
    const result = dedupeRequestTextRows([noReq])
    expect(result).toHaveLength(1)
  })

  it('content 长度相同时也保留所有 text 段', () => {
    const first = buildMessage({ id: 'a1', requestId: 'r1', content: 'same' })
    const second = buildMessage({ id: 'a2', requestId: 'r1', content: 'same' })
    const result = dedupeRequestTextRows([first, second])
    expect(result.filter(m => m.messageType === 'text')).toHaveLength(2)
  })
})
