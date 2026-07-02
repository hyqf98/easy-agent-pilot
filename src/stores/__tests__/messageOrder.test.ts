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
 * compareMessageOrder 只读 createdAt / seq / requestId / role。
 */
function makeMessage(
  partial: Partial<Message> & Pick<Message, 'role' | 'messageType' | 'seq' | 'createdAt' | 'requestId'>
): Message {
  return {
    id: `id-${partial.seq}-${partial.createdAt}`,
    sessionId: 'session-1',
    status: 'completed',
    ...partial
  } as Message
}

const T = '2026-07-02T10:00:00.000Z'
const T_PLUS_1 = '2026-07-02T10:00:00.001Z'
const T_PLUS_5 = '2026-07-02T10:00:00.005Z'
const REQUEST_ID = 'req-1'

describe('compareMessagesForRender — work_divider 排序', () => {
  it('历史派生 divider（seq:0, createdAt=user+1ms）排在用户消息之后', () => {
    // 修复前：deriveWorkDividers 用 seq:-1 且 createdAt 等于 user，
    // 兜底 seq 比较会把 divider 排到 user 前面（顶部多一条线的根因）。
    const user = makeMessage({ role: 'user', messageType: 'text', seq: 0, createdAt: T, requestId: REQUEST_ID })
    const divider = makeMessage({ role: 'assistant', messageType: 'work_divider', seq: 0, createdAt: T_PLUS_1, requestId: REQUEST_ID })

    expect(compareMessagesForRender(user, divider)).toBeLessThan(0)
    expect(compareMessagesForRender(divider, user)).toBeGreaterThan(0)
  })

  it('divider 排在同回合第一条 assistant（seq:0）之前', () => {
    const divider = makeMessage({ role: 'assistant', messageType: 'work_divider', seq: 0, createdAt: T_PLUS_1, requestId: REQUEST_ID })
    const firstAssistant = makeMessage({ role: 'assistant', messageType: 'text', seq: 0, createdAt: T_PLUS_5, requestId: REQUEST_ID })

    // 同 requestId 同 role 且 seq 相等 → 不命中纯 seq 分支 → 比较 createdAt → divider 更早
    expect(compareMessagesForRender(divider, firstAssistant)).toBeLessThan(0)
  })

  it('divider 排在同回合后续 assistant（seq≥1）之前', () => {
    const divider = makeMessage({ role: 'assistant', messageType: 'work_divider', seq: 0, createdAt: T_PLUS_1, requestId: REQUEST_ID })
    const laterAssistant = makeMessage({ role: 'assistant', messageType: 'text', seq: 1, createdAt: T_PLUS_5, requestId: REQUEST_ID })

    // 二者 seq 不同 → 命中纯 seq 分支 → 0 - 1 < 0
    expect(compareMessagesForRender(divider, laterAssistant)).toBeLessThan(0)
  })

  it('一个完整回合乱序排序后为 [user, divider, assistant#0, assistant#1]', () => {
    const user = makeMessage({ role: 'user', messageType: 'text', seq: 0, createdAt: T, requestId: REQUEST_ID })
    const divider = makeMessage({ role: 'assistant', messageType: 'work_divider', seq: 0, createdAt: T_PLUS_1, requestId: REQUEST_ID })
    const assistant0 = makeMessage({ role: 'assistant', messageType: 'text', seq: 0, createdAt: T_PLUS_5, requestId: REQUEST_ID })
    const assistant1 = makeMessage({ role: 'assistant', messageType: 'thinking', seq: 1, createdAt: T_PLUS_5, requestId: REQUEST_ID })

    const sorted = [assistant1, divider, assistant0, user].sort(compareMessagesForRender)
    expect(sorted.map(m => m.messageType)).toEqual([
      'text' /* user */,
      'work_divider',
      'text' /* assistant#0 */,
      'thinking' /* assistant#1 */
    ])
    expect(sorted[0]).toBe(user)
    expect(sorted[1]).toBe(divider)
    expect(sorted[2]).toBe(assistant0)
    expect(sorted[3]).toBe(assistant1)
  })
})
