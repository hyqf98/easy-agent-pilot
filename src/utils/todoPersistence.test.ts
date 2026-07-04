import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveTodoSnapshot, loadTodoSnapshot, clearTodoSnapshot } from './todoPersistence'
import type { TodoSnapshot } from './todoToolCall'

// node 环境无 localStorage，提供内存 mock
function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (index: number) => Array.from(store.keys())[index] ?? null
  }
}

vi.stubGlobal('localStorage', createLocalStorageMock())

describe('todoPersistence (localStorage fallback)', () => {
  const sessionId = 'test-session-persist'

  beforeEach(() => {
    localStorage.clear()
  })

  const sampleSnapshot: TodoSnapshot = {
    items: [
      { id: '1', content: '搭建项目骨架', status: 'completed' },
      { id: '2', content: '实现用户登录', status: 'in_progress' },
      { id: '3', content: '编写单元测试', status: 'pending' }
    ],
    updatedAt: '2026-07-04T00:00:00.000Z'
  }

  it('saveTodoSnapshot writes to localStorage', () => {
    saveTodoSnapshot(sessionId, sampleSnapshot)
    const raw = localStorage.getItem('ea:todo:test-session-persist')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.snapshot.items).toHaveLength(3)
    expect(parsed.savedAt).toBeTruthy()
  })

  it('loadTodoSnapshot reads back the saved snapshot', () => {
    saveTodoSnapshot(sessionId, sampleSnapshot)
    const loaded = loadTodoSnapshot(sessionId)
    expect(loaded).not.toBeNull()
    expect(loaded!.items).toHaveLength(3)
    expect(loaded!.items[0].content).toBe('搭建项目骨架')
  })

  it('loadTodoSnapshot returns null when nothing saved', () => {
    expect(loadTodoSnapshot(sessionId)).toBeNull()
  })

  it('saveTodoSnapshot ignores empty/null snapshots', () => {
    saveTodoSnapshot(sessionId, null)
    expect(localStorage.getItem('ea:todo:test-session-persist')).toBeNull()

    saveTodoSnapshot(sessionId, { items: [], updatedAt: '' })
    expect(localStorage.getItem('ea:todo:test-session-persist')).toBeNull()
  })

  it('saveTodoSnapshot overwrites previous snapshot for same session', () => {
    saveTodoSnapshot(sessionId, sampleSnapshot)
    const updated: TodoSnapshot = {
      items: [{ id: '1', content: 'done', status: 'completed' }],
      updatedAt: '2026-07-04T01:00:00.000Z'
    }
    saveTodoSnapshot(sessionId, updated)
    const loaded = loadTodoSnapshot(sessionId)
    expect(loaded!.items).toHaveLength(1)
    expect(loaded!.items[0].content).toBe('done')
  })

  it('clearTodoSnapshot removes the entry', () => {
    saveTodoSnapshot(sessionId, sampleSnapshot)
    expect(loadTodoSnapshot(sessionId)).not.toBeNull()
    clearTodoSnapshot(sessionId)
    expect(loadTodoSnapshot(sessionId)).toBeNull()
  })

  it('persists per-session (different sessions do not collide)', () => {
    saveTodoSnapshot('session-a', sampleSnapshot)
    saveTodoSnapshot('session-b', { items: [{ id: 'x', content: 'other', status: 'pending' }], updatedAt: '' })
    expect(loadTodoSnapshot('session-a')!.items).toHaveLength(3)
    expect(loadTodoSnapshot('session-b')!.items).toHaveLength(1)
  })

  it('handles empty sessionId gracefully', () => {
    saveTodoSnapshot('', sampleSnapshot)
    expect(loadTodoSnapshot('')).toBeNull()
    clearTodoSnapshot('') // should not throw
  })
})
