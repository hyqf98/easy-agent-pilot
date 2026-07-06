/** useAgentSettingsPage — Agent 设置页（代理列表）的 composable，负责代理分页、搜索、编辑/删除弹窗与模型管理编排。 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAgentStore, type AgentConfig } from '@/stores/agent'
import { useUIStore } from '@/stores/ui'

interface TestResultState {
  visible: boolean
  success: boolean
  message: string
}

const PAGE_SIZE = 10

export function useAgentSettingsPage() {
  const agentStore = useAgentStore()
  const uiStore = useUIStore()

  const currentPage = ref(1)
  const searchQuery = ref('')

  const showModal = ref(false)
  const editingAgent = ref<AgentConfig | null>(null)
  const showDeleteConfirm = ref(false)
  const deletingAgent = ref<AgentConfig | null>(null)

  const showModelManageModal = ref(false)
  const managingModelAgent = ref<AgentConfig | null>(null)

  const testResult = ref<TestResultState>({
    visible: false,
    success: false,
    message: ''
  })

  const filteredAgents = computed(() => {
    let result = [...agentStore.agents]

    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase().trim()
      result = result.filter(agent =>
        agent.name.toLowerCase().includes(query)
        || agent.provider?.toLowerCase().includes(query)
        || agent.modelId?.toLowerCase().includes(query)
      )
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return result
  })

  const totalPages = computed(() => Math.ceil(filteredAgents.value.length / PAGE_SIZE) || 1)

  const paginatedAgents = computed(() => {
    const start = (currentPage.value - 1) * PAGE_SIZE
    return filteredAgents.value.slice(start, start + PAGE_SIZE)
  })

  const pageNumbers = computed(() => {
    const pages: number[] = []
    const total = totalPages.value
    const current = currentPage.value

    if (total <= 7) {
      for (let i = 1; i <= total; i += 1) {
        pages.push(i)
      }
      return pages
    }

    if (current <= 4) {
      return [1, 2, 3, 4, 5, -1, total]
    }

    if (current >= total - 3) {
      pages.push(1, -1)
      for (let i = total - 4; i <= total; i += 1) {
        pages.push(i)
      }
      return pages
    }

    return [1, -1, current - 1, current, current + 1, -1, total]
  })

  function handleSearchChange() {
    currentPage.value = 1
  }

  function showTestToast(success: boolean, message: string) {
    testResult.value = { visible: true, success, message }
    setTimeout(() => {
      testResult.value.visible = false
    }, 3000)
  }

  function handleAdd() {
    editingAgent.value = null
    showModal.value = true
  }

  function handleEdit(agent: AgentConfig) {
    editingAgent.value = agent
    showModal.value = true
  }

  function handleDelete(agent: AgentConfig) {
    deletingAgent.value = agent
    showDeleteConfirm.value = true
  }

  async function confirmDelete() {
    if (deletingAgent.value) {
      await agentStore.deleteAgent(deletingAgent.value.id)
      if (paginatedAgents.value.length === 0 && currentPage.value > 1) {
        currentPage.value -= 1
      }
    }

    showDeleteConfirm.value = false
    deletingAgent.value = null
  }

  async function handleTest(id: string) {
    const result = await agentStore.testConnection(id)
    showTestToast(result.success, result.message)
  }

  async function handleSubmit(
    data: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt' | 'status'>
  ) {
    if (editingAgent.value) {
      await agentStore.updateAgent(editingAgent.value.id, data)
    } else {
      await agentStore.createAgent(data)
    }

    showModal.value = false
    editingAgent.value = null
  }

  function handleCancel() {
    showModal.value = false
    editingAgent.value = null
  }

  function handleOpenModelManage(agent: AgentConfig) {
    managingModelAgent.value = agent
    showModelManageModal.value = true
  }

  function handleCloseModelManage() {
    showModelManageModal.value = false
    managingModelAgent.value = null
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
    }
  }

  function clearSearch() {
    searchQuery.value = ''
    currentPage.value = 1
  }

  let initialized = false

  watch(
    () => [uiStore.appMode, uiStore.activeSettingsTab] as const,
    ([mode, activeTab], [previousMode, previousTab]) => {
      const visible = mode === 'settings'
      if (!visible || activeTab !== 'agents') {
        return
      }

      const wasVisible = previousMode === 'settings'
      if (visible === wasVisible && activeTab === previousTab) {
        return
      }

      if (initialized) {
        void agentStore.loadAgents()
      }
    }
  )

  onMounted(async () => {
    await agentStore.loadAgents()
    initialized = true
  })

  return {
    PAGE_SIZE,
    agentStore,
    currentPage,
    searchQuery,
    showModal,
    editingAgent,
    showDeleteConfirm,
    deletingAgent,
    showModelManageModal,
    managingModelAgent,
    testResult,
    filteredAgents,
    totalPages,
    paginatedAgents,
    pageNumbers,
    handleSearchChange,
    handleAdd,
    handleEdit,
    handleDelete,
    confirmDelete,
    handleTest,
    handleSubmit,
    handleCancel,
    handleOpenModelManage,
    handleCloseModelManage,
    goToPage,
    clearSearch
  }
}
