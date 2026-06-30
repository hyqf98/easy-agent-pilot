import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

vi.mock('@/utils/api', () => ({
  getErrorMessage: (_err: unknown, fallback?: string) => fallback ?? 'error'
}))

vi.mock('@/services/memoryRepo', () => ({
  listMemoryRepos: vi.fn(),
  getMemoryRepo: vi.fn(),
  createMemoryRepo: vi.fn(),
  updateMemoryRepo: vi.fn(),
  deleteMemoryRepo: vi.fn(),
  readRepoFile: vi.fn(),
  writeRepoFile: vi.fn(),
  listMemoryRepoSources: vi.fn(),
  upsertMemoryRepoSource: vi.fn(),
  migrateLegacyMemoryLibraries: vi.fn()
}))

vi.mock('./notification', () => ({
  useNotificationStore: () => ({
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    smartError: vi.fn(),
    databaseError: vi.fn(),
    networkError: vi.fn()
  })
}))

async function loadStore() {
  const mod = await import('../memoryRepo')
  return mod.useMemoryRepoStore()
}

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'repo-1',
    name: '协作记忆库',
    slug: 'collab-memory',
    description: 'desc',
    repoPath: '/tmp/memory_repos/collab-memory',
    format: 'skill',
    systemPrompt: '',
    agentId: undefined,
    modelId: undefined,
    internalToolsEnabled: true,
    enabled: true,
    createdAt: '2026-06-27T00:00:00.000Z',
    updatedAt: '2026-06-27T00:00:00.000Z',
    ...overrides
  }
}

describe('useMemoryRepoStore 仓库', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initialize 加载仓库并选中第一个、附带数据源', async () => {
    const svc = await import('@/services/memoryRepo')
    const repo = makeRepo()
    ;(svc.listMemoryRepos as any).mockResolvedValue([repo])
    ;(svc.listMemoryRepoSources as any).mockResolvedValue([])

    const store = await loadStore()
    await store.initialize()

    expect(store.repos).toHaveLength(1)
    expect(store.activeRepoId).toBe('repo-1')
    expect(store.activeRepo?.id).toBe('repo-1')
    expect(svc.listMemoryRepoSources).toHaveBeenCalledWith('repo-1')
  })

  it('createRepo 成功后 upsert 并切激活', async () => {
    const svc = await import('@/services/memoryRepo')
    const created = makeRepo({ id: 'repo-2', name: '新仓库' })
    ;(svc.createMemoryRepo as any).mockResolvedValue(created)
    ;(svc.listMemoryRepoSources as any).mockResolvedValue([])

    const store = await loadStore()
    const result = await store.createRepo({ name: '新仓库', format: 'skill' })

    expect(result.id).toBe('repo-2')
    expect(store.repos.find((r) => r.id === 'repo-2')).toBeTruthy()
    expect(store.activeRepoId).toBe('repo-2')
  })

  it('deleteRepo 后从列表移除并切到下一个', async () => {
    const svc = await import('@/services/memoryRepo')
    const repoA = makeRepo({ id: 'a', name: 'A', updatedAt: '2026-06-27T01:00:00.000Z' })
    const repoB = makeRepo({ id: 'b', name: 'B', updatedAt: '2026-06-27T00:00:00.000Z' })
    ;(svc.listMemoryRepos as any).mockResolvedValue([repoA, repoB])
    ;(svc.deleteMemoryRepo as any).mockResolvedValue(undefined)
    ;(svc.listMemoryRepoSources as any).mockResolvedValue([])

    const store = await loadStore()
    await store.initialize()
    await store.deleteRepo('a')

    expect(store.repos.find((r) => r.id === 'a')).toBeFalsy()
    expect(store.activeRepoId).toBe('b')
  })

  it('sortedRepos 按 updatedAt 倒序', async () => {
    const svc = await import('@/services/memoryRepo')
    const older = makeRepo({ id: 'old', updatedAt: '2026-06-01T00:00:00.000Z' })
    const newer = makeRepo({ id: 'new', updatedAt: '2026-06-27T00:00:00.000Z' })
    ;(svc.listMemoryRepos as any).mockResolvedValue([older, newer])

    const store = await loadStore()
    await store.loadRepos()

    expect(store.sortedRepos.map((r) => r.id)).toEqual(['new', 'old'])
  })
})
