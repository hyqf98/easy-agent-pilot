/** 记忆库仓库（Memory Repo）文件树与读写的 Pinia store。 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useNotificationStore } from './notification'
import { getErrorMessage } from '@/utils/api'
import * as repoService from '@/services/memoryRepo'
import type {
  CreateMemoryRepoInput,
  MemoryRepo,
  MemoryRepoSource,
  UpdateMemoryRepoInput,
  UpsertMemoryRepoSourceInput
} from '@/types/memoryRepo'

/**
 * 记忆库仓库 Store（组合式）。
 *
 * 与旧 useMemoryStore 解耦：新功能基于仓库，旧库可一次性迁移进来。
 * 文件树读取/编辑通过 service 走通用 read/write_file_content。
 */
export const useMemoryRepoStore = defineStore('memoryRepo', () => {
  const notificationStore = useNotificationStore()

  const repos = ref<MemoryRepo[]>([])
  const activeRepoId = ref<string | null>(null)
  const sources = ref<MemoryRepoSource[]>([])

  const isLoadingRepos = ref(false)
  const isLoadingSources = ref(false)
  const isSavingRepo = ref(false)

  const activeRepo = computed(
    () => repos.value.find((repo) => repo.id === activeRepoId.value) ?? null
  )

  /** 按 updatedAt 倒序的仓库列表。 */
  const sortedRepos = computed(() =>
    [...repos.value].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  )

  function upsertRepo(repo: MemoryRepo) {
    const index = repos.value.findIndex((entry) => entry.id === repo.id)
    if (index === -1) {
      repos.value.unshift(repo)
      return
    }
    repos.value[index] = repo
  }

  /** 初始化：加载仓库列表，选中第一个。 */
  async function initialize() {
    isLoadingRepos.value = true
    try {
      repos.value = await repoService.listMemoryRepos()
      if (!activeRepoId.value && repos.value.length > 0) {
        activeRepoId.value = sortedRepos.value[0].id
      }
      if (activeRepoId.value) {
        await loadSources(activeRepoId.value)
      }
    } catch (error) {
      notificationStore.networkError('加载记忆库仓库', getErrorMessage(error), initialize)
    } finally {
      isLoadingRepos.value = false
    }
  }

  async function loadRepos() {
    isLoadingRepos.value = true
    try {
      repos.value = await repoService.listMemoryRepos()
    } catch (error) {
      notificationStore.networkError('加载记忆库仓库', getErrorMessage(error), loadRepos)
    } finally {
      isLoadingRepos.value = false
    }
  }

  /** 切换激活仓库并加载数据源。文件树由 filesTab 的 FileTree 自行懒加载。 */
  async function setActiveRepo(repoId: string | null) {
    activeRepoId.value = repoId
    sources.value = []
    if (!repoId) return
    await loadSources(repoId)
  }

  async function loadSources(repoId: string) {
    isLoadingSources.value = true
    try {
      sources.value = await repoService.listMemoryRepoSources(repoId)
    } catch (error) {
      notificationStore.networkError('加载数据源', getErrorMessage(error), () => loadSources(repoId))
    } finally {
      isLoadingSources.value = false
    }
  }

  async function createRepo(input: CreateMemoryRepoInput) {
    isSavingRepo.value = true
    try {
      const repo = await repoService.createMemoryRepo(input)
      upsertRepo(repo)
      await setActiveRepo(repo.id)
      notificationStore.success('创建记忆库仓库成功')
      return repo
    } catch (error) {
      notificationStore.databaseError('创建记忆库仓库失败', getErrorMessage(error), async () => {
        await createRepo(input)
      })
      throw error
    } finally {
      isSavingRepo.value = false
    }
  }

  async function updateRepo(id: string, input: UpdateMemoryRepoInput) {
    isSavingRepo.value = true
    try {
      const repo = await repoService.updateMemoryRepo(id, input)
      upsertRepo(repo)
      return repo
    } catch (error) {
      notificationStore.databaseError('更新记忆库仓库失败', getErrorMessage(error), async () => {
        await updateRepo(id, input)
      })
      throw error
    } finally {
      isSavingRepo.value = false
    }
  }

  async function deleteRepo(id: string) {
    try {
      await repoService.deleteMemoryRepo(id)
      repos.value = repos.value.filter((repo) => repo.id !== id)
      if (activeRepoId.value === id) {
        const next = sortedRepos.value[0]?.id ?? null
        await setActiveRepo(next)
      }
      notificationStore.success('已删除记忆库仓库')
    } catch (error) {
      notificationStore.databaseError('删除记忆库仓库失败', getErrorMessage(error), async () => {
        await deleteRepo(id)
      })
      throw error
    }
  }

  async function upsertSource(input: UpsertMemoryRepoSourceInput) {
    try {
      const source = await repoService.upsertMemoryRepoSource(input)
      const index = sources.value.findIndex(
        (entry) => entry.repoId === source.repoId && entry.sourceType === source.sourceType
      )
      if (index === -1) {
        sources.value.push(source)
      } else {
        sources.value[index] = source
      }
      return source
    } catch (error) {
      notificationStore.databaseError('保存数据源失败', getErrorMessage(error), async () => {
        await upsertSource(input)
      })
      throw error
    }
  }

  return {
    // state
    repos,
    activeRepoId,
    sources,
    isLoadingRepos,
    isLoadingSources,
    isSavingRepo,
    // computed
    activeRepo,
    sortedRepos,
    // actions
    initialize,
    loadRepos,
    setActiveRepo,
    loadSources,
    createRepo,
    updateRepo,
    deleteRepo,
    upsertSource
  }
})
