import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { watchEffect } from 'vue'

// Mock @tauri-apps/api/core 的 invoke
const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}))

async function loadStore() {
  const mod = await import('../fileChange')
  return mod.useFileChangeStore()
}

/**
 * file_change_traces 行（后端 camelCase 序列化后的形状）
 */
function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'trace-1',
    sessionId: 'sess-1',
    requestId: 'req-1',
    toolCallId: 'call-1',
    filePath: '/abs/package.json',
    relativePath: 'package.json',
    changeType: 'create',
    beforeContent: null,
    afterContent: '{}',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

describe('useFileChangeStore 加载与回显', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load() 从后端加载 traces 并写入会话缓存', async () => {
    invokeMock.mockResolvedValueOnce([
      makeRow({ id: 't1', relativePath: 'package.json' }),
      makeRow({ id: 't2', relativePath: 'server.js', filePath: '/abs/server.js' })
    ])
    const store = await loadStore()
    await store.load('sess-1')

    const traces = store.getTracesForSession('sess-1')
    expect(traces).toHaveLength(2)
    expect(traces[0].relativePath).toBe('package.json')
    expect(traces[1].filePath).toBe('/abs/server.js')
  })

  it('load() 失败时缓存空数组，不抛错', async () => {
    invokeMock.mockRejectedValueOnce(new Error('db locked'))
    const store = await loadStore()
    await expect(store.load('sess-err')).resolves.toBeUndefined()
    expect(store.getTracesForSession('sess-err')).toEqual([])
  })

  it('getTracesForRequest 按 requestId 过滤', async () => {
    invokeMock.mockResolvedValueOnce([
      makeRow({ id: 't1', requestId: 'req-A' }),
      makeRow({ id: 't2', requestId: 'req-B' }),
      makeRow({ id: 't3', requestId: 'req-A' })
    ])
    const store = await loadStore()
    await store.load('sess-1')

    expect(store.getTracesForRequest('sess-1', 'req-A')).toHaveLength(2)
    expect(store.getTracesForRequest('sess-1', 'req-B')).toHaveLength(1)
    expect(store.getTracesForRequest('sess-1', 'req-C')).toHaveLength(0)
  })

  it('load() 后 tracesBySession 变更能被 computed 追踪（响应式）', async () => {
    invokeMock.mockResolvedValueOnce([makeRow({ id: 't1' })])
    const store = await loadStore()

    const observed: number[] = []
    // watchEffect 会立即执行并追踪响应式依赖
    const stop = watchEffect(() => {
      observed.push(store.tracesBySession.get('sess-1')?.length ?? 0)
    })
    // 初始执行：无数据
    expect(observed[observed.length - 1]).toBe(0)

    await store.load('sess-1')
    // 等待微任务让 watchEffect 重新执行
    await Promise.resolve()
    expect(observed[observed.length - 1]).toBe(1)

    stop()
  })

  it('ingestStreamEdit 同 toolCallId+filePath 覆盖（保留审查状态）', async () => {
    invokeMock.mockResolvedValueOnce([
      makeRow({ id: 't1', toolCallId: 'call-1', filePath: '/a.js', relativePath: 'a.js', status: 'accepted' })
    ])
    const store = await loadStore()
    await store.load('sess-1')

    // 流式覆盖同一文件：状态应保留为 accepted
    store.ingestStreamEdit('sess-1', {
      id: 'ignored',
      requestId: 'req-1',
      sessionId: 'sess-1',
      toolCallId: 'call-1',
      filePath: '/a.js',
      relativePath: 'a.js',
      changeType: 'modify',
      beforeContent: 'old',
      afterContent: 'new',
      status: 'pending',
      timestamp: '2026-01-02T00:00:00Z'
    })

    const traces = store.getTracesForSession('sess-1')
    expect(traces).toHaveLength(1)
    expect(traces[0].afterContent).toBe('new')
    expect(traces[0].status).toBe('accepted')
  })
})
