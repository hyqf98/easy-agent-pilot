import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/stores/message'

/**
 * `@/stores/message` 的导入图会经过 stores/session → stores/settings → i18n，
 * 而 i18n 在模块加载时读取 localStorage（node 环境默认无）。
 * 这里先 stub 一个最小 localStorage，再动态 import，避免污染共享 vitest 配置。
 */
let compareMessagesForRender!: (left: Message, right: Message) => number

beforeAll(async () => {
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value)
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key]
    }
  })
  ;({ compareMessagesForRender } = await import('@/stores/message'))
})

/**
 * 构造最小可比较的 Message，字段仅填比较器与类型必需项。
 * compareMessageOrder 只读 seq / requestId。
 */
function makeMessage(
  partial: Partial<Message> & Pick<Message, 'role' | 'messageType' | 'seq' | 'requestId'>
): Message {
  return {
    id: `id-${partial.seq}-${partial.requestId}`,
    sessionId: 'session-1',
    createdAt: '2026-07-02T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
    status: 'completed',
    ...partial
  } as Message
}

const REQUEST_ID_A = 'req-a'
const REQUEST_ID_B = 'req-b'

describe('compareMessagesForRender — 纯 (requestId, seq) 比较', () => {
  it('同 requestId 下按 seq 升序', () => {
    const first = makeMessage({ role: 'assistant', messageType: 'text', seq: 0, requestId: REQUEST_ID_A })
    const second = makeMessage({ role: 'assistant', messageType: 'thinking', seq: 1, requestId: REQUEST_ID_A })

    expect(compareMessagesForRender(first, second)).toBeLessThan(0)
    expect(compareMessagesForRender(second, first)).toBeGreaterThan(0)
  })

  it('同 requestId 同 seq 视为相等', () => {
    const left = makeMessage({ role: 'assistant', messageType: 'text', seq: 0, requestId: REQUEST_ID_A })
    const right = makeMessage({ role: 'assistant', messageType: 'thinking', seq: 0, requestId: REQUEST_ID_A })

    expect(compareMessagesForRender(left, right)).toBe(0)
  })

  it('不同 requestId 按 requestId 字典序比较，不受 seq 影响', () => {
    const msgFromB = makeMessage({ role: 'assistant', messageType: 'text', seq: 0, requestId: REQUEST_ID_B })
    const msgFromA = makeMessage({ role: 'assistant', messageType: 'text', seq: 99, requestId: REQUEST_ID_A })

    // 'req-a' < 'req-b' → A 在前
    expect(compareMessagesForRender(msgFromA, msgFromB)).toBeLessThan(0)
    expect(compareMessagesForRender(msgFromB, msgFromA)).toBeGreaterThan(0)
  })

  it('乱序消息排序后严格按 (requestId, seq) 正序', () => {
    const a1 = makeMessage({ role: 'assistant', messageType: 'thinking', seq: 1, requestId: REQUEST_ID_A })
    const b0 = makeMessage({ role: 'assistant', messageType: 'text', seq: 0, requestId: REQUEST_ID_B })
    const a0 = makeMessage({ role: 'user', messageType: 'text', seq: 0, requestId: REQUEST_ID_A })
    const b1 = makeMessage({ role: 'assistant', messageType: 'tool_use', seq: 1, requestId: REQUEST_ID_B })

    const sorted = [a1, b0, a0, b1].sort(compareMessagesForRender)
    expect(sorted.map(m => m.id)).toEqual([a0.id, a1.id, b0.id, b1.id])
  })
})