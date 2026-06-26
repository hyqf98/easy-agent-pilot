import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

vi.mock('@/utils/api', () => ({
  getErrorMessage: (_err: unknown, fallback?: string) => fallback ?? 'error'
}))

vi.mock('@/services/memory', () => ({
  memoryMergeService: { merge: vi.fn(), getStatus: vi.fn() }
}))

// 触发 store 加载需要的子 store，但避免真实网络/i18n 副作用
vi.mock('./notification', () => ({
  useNotificationStore: () => ({
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    smartError: vi.fn(),
    databaseError: vi.fn()
  })
}))

async function loadStore() {
  const mod = await import('../memory')
  return mod.useMemoryStore()
}

describe('useMemoryStore 记忆记录', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('captureUserMessage 成功且命中当前查询时 upsert 记录', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const record = {
      id: 'rec-1',
      sessionId: 'sess-1',
      messageId: 'msg-1',
      content: 'hello',
      sourceRole: 'user',
      createdAt: '2026-06-26T00:00:00.000Z'
    }
    ;(invoke as any).mockResolvedValue(record)

    const store = await loadStore()
    const result = await store.captureUserMessage({
      sessionId: 'sess-1',
      messageId: 'msg-1',
      content: 'hello'
    })

    expect(result).toEqual(record)
    // 默认空查询视为命中（matchesCurrentQuery 空查询通过）
    expect(store.rawRecords).toContainEqual(record)
  })

  it('captureUserMessage 后端失败时抛出而非静默返回 null', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const backendError = new Error('db locked')
    ;(invoke as any).mockRejectedValue(backendError)

    const store = await loadStore()

    await expect(
      store.captureUserMessage({
        sessionId: 'sess-1',
        messageId: 'msg-1',
        content: 'hello'
      })
    ).rejects.toThrow('db locked')
  })

  it('recordSessionMemoryReferences 空引用数组为 no-op', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const store = await loadStore()

    await store.recordSessionMemoryReferences({
      sessionId: 'sess-1',
      messageId: 'msg-1',
      references: []
    })

    expect(invoke).not.toHaveBeenCalled()
  })
})
