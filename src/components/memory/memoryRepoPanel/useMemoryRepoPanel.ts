import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import { useAgentStore } from '@/stores/agent'
import { useNotificationStore } from '@/stores/notification'
import { getErrorMessage } from '@/utils/api'
import { migrateLegacyMemoryLibraries } from '@/services/memoryRepo'
import { useRepoCreateModal, useRepoEditModal } from './useRepoModals'
import type { CreateMemoryRepoInput, UpdateMemoryRepoInput } from '@/types/memoryRepo'

/** 详情面板激活的 Tab。 */
export type RepoDetailTab = 'overview' | 'files' | 'sources' | 'run' | 'jobs'

/**
 * 记忆库仓库面板的共享逻辑：仓库列表、激活切换、创建/编辑/删除、详情 Tab。
 *
 * 文件树读写走 service（通用 read/write_file_content）；本 composable 仅持有 UI 态与编排。
 * 弹窗态复用 useRepoModals；归纳/任务执行在 Phase 2 接入。
 */
export function useMemoryRepoPanel() {
  const { t } = useI18n()
  const memoryRepoStore = useMemoryRepoStore()
  const agentStore = useAgentStore()
  const notificationStore = useNotificationStore()

  const activeTab = ref<RepoDetailTab>('overview')

  const createModal = useRepoCreateModal()
  const editModal = useRepoEditModal()

  const activeRepo = computed(() => memoryRepoStore.activeRepo)
  const sortedRepos = computed(() => memoryRepoStore.sortedRepos)

  function openCreateModal() {
    createModal.open()
  }

  function closeCreateModal() {
    createModal.close()
  }

  /** 选择激活仓库并回到概览 Tab。 */
  async function selectRepo(repoId: string) {
    await memoryRepoStore.setActiveRepo(repoId)
    activeTab.value = 'overview'
  }

  function openEditModal() {
    editModal.open()
  }

  function closeEditModal() {
    editModal.close()
  }

  async function handleCreate(input: CreateMemoryRepoInput) {
    await memoryRepoStore.createRepo(input)
    createModal.close()
  }

  async function handleEditSubmit(input: UpdateMemoryRepoInput) {
    if (!activeRepo.value) return
    await memoryRepoStore.updateRepo(activeRepo.value.id, input)
    editModal.close()
  }

  async function handleDelete() {
    if (!activeRepo.value) return
    if (!window.confirm(t('memoryRepo.confirmDelete'))) return
    await memoryRepoStore.deleteRepo(activeRepo.value.id)
  }

  /** 一键迁移旧 Markdown 记忆库为单文件仓库。 */
  async function handleMigrateLegacy() {
    try {
      const result = await migrateLegacyMemoryLibraries()
      await memoryRepoStore.loadRepos()
      notificationStore.success(
        t('memoryRepo.migrateDone'),
        `迁移 ${result.migrated} 个，跳过 ${result.skipped} 个`
      )
    } catch (error) {
      notificationStore.databaseError('迁移旧记忆库', getErrorMessage(error))
    }
  }

  onMounted(() => {
    void memoryRepoStore.initialize()
    if (agentStore.agents.length === 0) {
      void agentStore.loadAgents()
    }
  })

  return {
    t,
    memoryRepoStore,
    agentStore,
    // state
    activeTab,
    createModal,
    editModal,
    // computed
    activeRepo,
    sortedRepos,
    // actions
    openCreateModal,
    closeCreateModal,
    selectRepo,
    openEditModal,
    closeEditModal,
    handleCreate,
    handleEditSubmit,
    handleDelete,
    handleMigrateLegacy
  }
}
