/**
 * useMemoryRepoPanel — 记忆库仓库面板（MemoryRepoPanel）的全部展示层逻辑。
 *
 * 职责：
 * 1. 仓库列表加载、激活切换、详情 Tab 状态；
 * 2. 创建/编辑/删除仓库的编排（弹窗可见性复用 useRepoModals）；
 * 3. 暴露模板所需的全部子组件、Tab 配置与操作方法。
 *
 * 文件树读写走 service；归纳/任务执行下沉到各 Tab 子组件。
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import { useAgentStore } from '@/stores/agent'
import { useRepoCreateModal, useRepoEditModal } from './useRepoModals'
import type { CreateMemoryRepoInput, UpdateMemoryRepoInput } from '@/types/memoryRepo'
import { EaButton, EaIcon, EaSidebarSectionHeader } from '@/components/common'
import WorkspaceShell from '@/components/layout/WorkspaceShell/WorkspaceShell.vue'
import RepoOverviewTab from './overviewTab/RepoOverviewTab.vue'
import RepoFilesTab from './filesTab/RepoFilesTab.vue'
import RepoRunTab from './runTab/RepoRunTab.vue'
import RepoSourcesTab from './sourcesTab/RepoSourcesTab.vue'
import RepoJobsTab from './jobsTab/RepoJobsTab.vue'
import RepoCreateModal from './repoCreateModal/RepoCreateModal.vue'
import RepoEditModal from './repoEditModal/RepoEditModal.vue'

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

  const activeTab = ref<RepoDetailTab>('overview')

  const createModal = useRepoCreateModal()
  const editModal = useRepoEditModal()

  /** 详情区 Tab 配置（顺序即渲染顺序）。 */
  const tabs: Array<{ key: RepoDetailTab; label: string }> = [
    { key: 'overview', label: '概览' },
    { key: 'files', label: '文件' },
    { key: 'sources', label: '数据源' },
    { key: 'run', label: '归纳' },
    { key: 'jobs', label: '任务' }
  ]

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

  onMounted(() => {
    void memoryRepoStore.initialize()
    if (agentStore.agents.length === 0) {
      void agentStore.loadAgents()
    }
  })

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaSidebarSectionHeader,
    WorkspaceShell,
    RepoOverviewTab,
    RepoFilesTab,
    RepoRunTab,
    RepoSourcesTab,
    RepoJobsTab,
    RepoCreateModal,
    RepoEditModal,
    // i18n / store
    t,
    memoryRepoStore,
    agentStore,
    // state
    activeTab,
    tabs,
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
    handleDelete
  }
}
