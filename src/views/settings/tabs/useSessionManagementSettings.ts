/** useSessionManagementSettings — 会话管理设置组件的 composable，负责 CLI 会话列表加载、查看详情与删除。 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore, type AgentConfig } from '@/stores/agent'
import { useNotificationStore } from '@/stores/notification'
import { useProjectStore } from '@/stores/project'
import { listSessions, readSessionDetail, deleteSession } from '@/services/cliSession'
import type {
  AcpSessionInfo,
  AcpSessionHistoryResult
} from '@/types/cliSessionManager'

type UpdatedRange = 'all' | '24h' | '7d' | '30d'

/** 从 AgentConfig 提取 agentCmd */
function getAgentCmd(agent: AgentConfig | undefined): string {
  return agent?.acpCommand || agent?.cliPath || ''
}

/** 从 AgentConfig 提取 cliName（用于 delete 接口） */
function getCliName(agent: AgentConfig | undefined): string {
  return agent?.provider || agent?.name || agent?.acpCommand || ''
}

export function useSessionManagementSettings() {
  const { t } = useI18n()
  const agentStore = useAgentStore()
  const projectStore = useProjectStore()
  const notificationStore = useNotificationStore()

  // --- 响应式状态 ---
  const selectedAgentId = ref('')
  const selectedProjectPath = ref('')
  const selectedUpdatedRange = ref<UpdatedRange>('all')

  const sessions = ref<AcpSessionInfo[]>([])
  const availableProjects = ref<string[]>([])

  const isLoadingSessions = ref(false)
  const isLoadingProjects = ref(false)
  const sessionsError = ref('')

  const showDetailModal = ref(false)
  const detailLoading = ref(false)
  const detailError = ref('')
  const currentDetail = ref<AcpSessionHistoryResult | null>(null)

  const showDeleteModal = ref(false)
  const deleting = ref(false)
  const pendingDeleteSessions = ref<AcpSessionInfo[]>([])
  const deleteError = ref('')
  const selectedSessionIds = ref<string[]>([])
  const isPreparingCurrentProjectDelete = ref(false)

  // --- 防抖 / 竞态控制 ---
  let projectListRequestId = 0
  let sessionLoadRequestId = 0
  let suppressProjectPathWatch = false

  // --- Computed ---
  const cliAgents = computed(() => agentStore.agents)
  const hasCliAgents = computed(() => cliAgents.value.length > 0)

  const selectedAgent = computed(() =>
    cliAgents.value.find(a => a.id === selectedAgentId.value)
  )
  const agentCmd = computed(() => getAgentCmd(selectedAgent.value))
  const cliName = computed(() => getCliName(selectedAgent.value))

  const currentProjectPath = computed(() => projectStore.currentProject?.path ?? '')
  const selectedSessionIdSet = computed(() => new Set(selectedSessionIds.value))

  const updatedRangeOptions = computed(() => [
    { value: 'all', label: t('settings.sessionManager.updatedRangeAll') },
    { value: '24h', label: t('settings.sessionManager.updatedRange24h') },
    { value: '7d', label: t('settings.sessionManager.updatedRange7d') },
    { value: '30d', label: t('settings.sessionManager.updatedRange30d') }
  ])

  const getUpdatedRangeCutoff = (range: UpdatedRange): number | null => {
    if (range === 'all') return null
    const now = Date.now()
    const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30
    return now - hours * 60 * 60 * 1000
  }

  const filteredSessions = computed(() => {
    const cutoff = getUpdatedRangeCutoff(selectedUpdatedRange.value)
    if (cutoff === null) {
      return sessions.value
    }

    return sessions.value.filter(session => {
      if (!session.updatedAt) return false
      const updatedAt = new Date(session.updatedAt).getTime()
      return Number.isFinite(updatedAt) && updatedAt >= cutoff
    })
  })

  const selectedSessions = computed(() =>
    filteredSessions.value.filter(session => selectedSessionIdSet.value.has(session.sessionId))
  )
  const selectedCount = computed(() => selectedSessions.value.length)
  const allVisibleSelected = computed(() =>
    filteredSessions.value.length > 0 && selectedCount.value === filteredSessions.value.length
  )
  const sessionListLoading = computed(() => isLoadingProjects.value || isLoadingSessions.value)

  const agentOptions = computed(() =>
    cliAgents.value.map(agent => ({
      value: agent.id,
      label: `${agent.name} (${agent.provider?.toUpperCase() || 'CLI'})`
    }))
  )

  const projectOptions = computed(() => {
    const options = [{ value: '', label: t('settings.sessionManager.allProjects') }]
    const seen = new Set<string>()
    const projectPaths = [...availableProjects.value]

    if (selectedProjectPath.value && !projectPaths.includes(selectedProjectPath.value)) {
      projectPaths.unshift(selectedProjectPath.value)
    }

    for (const path of projectPaths) {
      if (seen.has(path)) continue
      seen.add(path)
      const name = path.split('/').pop() || path.split('\\').pop() || path
      options.push({ value: path, label: name })
    }

    return options
  })

  const groupedSessions = computed(() => {
    const groups: Record<string, AcpSessionInfo[]> = {}

    for (const session of filteredSessions.value) {
      const key = session.cwd || t('settings.sessionManager.noProject')
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(session)
    }

    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return tb - ta
      })
    }

    return groups
  })

  // --- 内部辅助 ---
  const resolveNextProjectPath = (projectPaths: string[], preferredProjectPath?: string | null): string => {
    if (preferredProjectPath === null) return ''
    if (typeof preferredProjectPath === 'string' && preferredProjectPath.trim()) return preferredProjectPath

    if (
      selectedProjectPath.value &&
      (projectPaths.includes(selectedProjectPath.value) || selectedProjectPath.value === currentProjectPath.value)
    ) {
      return selectedProjectPath.value
    }

    if (currentProjectPath.value && projectPaths.includes(currentProjectPath.value)) {
      return currentProjectPath.value
    }

    return projectPaths[0] || ''
  }

  // --- 数据加载 ---
  const loadProjectPaths = async (preferredProjectPath?: string | null): Promise<boolean> => {
    sessionsError.value = ''

    if (!selectedAgentId.value || !agentCmd.value) {
      availableProjects.value = []
      selectedProjectPath.value = ''
      return false
    }

    const requestId = ++projectListRequestId
    isLoadingProjects.value = true

    try {
      const result = await listSessions(agentCmd.value)

      if (requestId !== projectListRequestId) return false

      availableProjects.value = result.projectPaths

      const nextProjectPath = resolveNextProjectPath(result.projectPaths, preferredProjectPath)
      const changed = nextProjectPath !== selectedProjectPath.value
      selectedProjectPath.value = nextProjectPath
      return changed
    } catch (error) {
      if (requestId !== projectListRequestId) return false

      availableProjects.value = []
      selectedProjectPath.value = ''
      sessions.value = []
      selectedSessionIds.value = []
      sessionsError.value = String(error)
      return false
    } finally {
      if (requestId === projectListRequestId) {
        isLoadingProjects.value = false
      }
    }
  }

  const loadSessions = async (): Promise<void> => {
    sessionsError.value = ''
    sessions.value = []
    selectedSessionIds.value = []

    if (!selectedAgentId.value || !agentCmd.value) return

    const requestId = ++sessionLoadRequestId
    isLoadingSessions.value = true

    try {
      const result = await listSessions(agentCmd.value, selectedProjectPath.value || undefined)

      if (requestId !== sessionLoadRequestId) return

      sessions.value = result.sessions

      if (result.projectPaths.length > 0) {
        availableProjects.value = result.projectPaths
      }
    } catch (error) {
      if (requestId !== sessionLoadRequestId) return
      sessionsError.value = String(error)
    } finally {
      if (requestId === sessionLoadRequestId) {
        isLoadingSessions.value = false
      }
    }
  }

  const handleRefresh = async (): Promise<void> => {
    if (!selectedAgentId.value) return

    const preserveSelection = selectedProjectPath.value || null
    suppressProjectPathWatch = true
    try {
      const selectionChanged = await loadProjectPaths(preserveSelection)
      if (!selectionChanged) {
        await loadSessions()
      }
    } finally {
      suppressProjectPathWatch = false
    }
  }

  // --- 详情 ---
  const openDetail = async (session: AcpSessionInfo): Promise<void> => {
    showDetailModal.value = true
    detailLoading.value = true
    detailError.value = ''
    currentDetail.value = null

    try {
      const result = await readSessionDetail(agentCmd.value, session.sessionId, session.cwd)
      currentDetail.value = result
    } catch (error) {
      detailError.value = String(error)
    } finally {
      detailLoading.value = false
    }
  }

  // --- 删除 ---
  const requestDelete = (session: AcpSessionInfo): void => {
    pendingDeleteSessions.value = [session]
    deleteError.value = ''
    showDeleteModal.value = true
  }

  const requestDeleteSelected = (): void => {
    if (!selectedSessions.value.length) return
    pendingDeleteSessions.value = [...selectedSessions.value]
    deleteError.value = ''
    showDeleteModal.value = true
  }

  const requestDeleteCurrentProjectSessions = async (): Promise<void> => {
    if (!selectedAgentId.value || !currentProjectPath.value || !agentCmd.value) return

    isPreparingCurrentProjectDelete.value = true
    deleteError.value = ''

    try {
      const result = await listSessions(agentCmd.value, currentProjectPath.value)

      if (!result.sessions.length) {
        notificationStore.info(t('settings.sessionManager.noCurrentProjectSessions'))
        return
      }

      pendingDeleteSessions.value = result.sessions
      showDeleteModal.value = true
    } catch (error) {
      notificationStore.error(
        t('settings.sessionManager.loadCurrentProjectSessionsFailed'),
        String(error)
      )
    } finally {
      isPreparingCurrentProjectDelete.value = false
    }
  }

  const closeDeleteModal = (): void => {
    showDeleteModal.value = false
    pendingDeleteSessions.value = []
    deleteError.value = ''
  }

  // --- 选择 ---
  const toggleSessionSelection = (sessionId: string, checked?: boolean): void => {
    const next = new Set(selectedSessionIds.value)
    const shouldSelect = checked ?? !next.has(sessionId)

    if (shouldSelect) {
      next.add(sessionId)
    } else {
      next.delete(sessionId)
    }

    selectedSessionIds.value = Array.from(next)
  }

  const handleSessionSelectionChange = (sessionId: string, event: Event): void => {
    const target = event.target as HTMLInputElement | null
    toggleSessionSelection(sessionId, target?.checked ?? false)
  }

  const toggleSelectAllSessions = (): void => {
    if (allVisibleSelected.value) {
      selectedSessionIds.value = []
      return
    }
    selectedSessionIds.value = filteredSessions.value.map(session => session.sessionId)
  }

  // --- 确认删除（逐个调用 deleteSession） ---
  const confirmDelete = async (): Promise<void> => {
    if (!pendingDeleteSessions.value.length) return

    deleting.value = true
    deleteError.value = ''

    const toDelete = [...pendingDeleteSessions.value]
    const failedSessions: AcpSessionInfo[] = []
    const cmd = agentCmd.value
    const name = cliName.value

    const shouldCloseDetail = (sid: string) =>
      !!currentDetail.value && currentDetail.value.sessionId === sid

    try {
      for (const session of toDelete) {
        try {
          await deleteSession(cmd, name, session.sessionId, session.cwd)
        } catch {
          failedSessions.push(session)
        }
      }

      if (shouldCloseDetail(toDelete[0]?.sessionId || '')) {
        showDetailModal.value = false
        currentDetail.value = null
      }

      if (failedSessions.length > 0) {
        deleteError.value = t('settings.sessionManager.partialDeleteFailed', { n: failedSessions.length })
        await loadSessions()
        return
      }

      closeDeleteModal()
      await loadProjectPaths(selectedProjectPath.value || null)
      await loadSessions()
    } catch (error) {
      deleteError.value = String(error)
    } finally {
      deleting.value = false
    }
  }

  // --- Watchers ---
  watch(cliAgents, (agents) => {
    if (!agents.length) {
      selectedAgentId.value = ''
      sessions.value = []
      return
    }

    if (!agents.some(agent => agent.id === selectedAgentId.value)) {
      selectedAgentId.value = agents[0].id
    }
  }, { immediate: true })

  watch(selectedAgentId, async () => {
    selectedProjectPath.value = ''
    sessions.value = []
    selectedSessionIds.value = []
    availableProjects.value = []

    if (!selectedAgentId.value) return

    suppressProjectPathWatch = true
    try {
      await loadProjectPaths()
      await loadSessions()
    } finally {
      suppressProjectPathWatch = false
    }
  })

  watch(selectedProjectPath, async (next, prev) => {
    if (suppressProjectPathWatch || !selectedAgentId.value || next === prev) return
    await loadSessions()
  })

  watch(filteredSessions, nextSessions => {
    if (selectedSessionIds.value.length === 0) return
    const visibleIds = new Set(nextSessions.map(session => session.sessionId))
    selectedSessionIds.value = selectedSessionIds.value.filter(id => visibleIds.has(id))
  }, { deep: true })

  // --- Lifecycle ---
  onMounted(async () => {
    if (!agentStore.agents.length) {
      await agentStore.loadAgents()
    }

    if (cliAgents.value.length && !selectedAgentId.value) {
      selectedAgentId.value = cliAgents.value[0].id
      return
    }

    if (selectedAgentId.value) {
      await handleRefresh()
    }
  })

  return {
    // 状态
    selectedAgentId,
    selectedProjectPath,
    selectedUpdatedRange,
    cliName,
    sessions,
    isLoadingSessions,
    isLoadingProjects,
    sessionsError,
    showDetailModal,
    detailLoading,
    detailError,
    currentDetail,
    showDeleteModal,
    deleting,
    pendingDeleteSessions,
    deleteError,
    selectedSessionIds,
    isPreparingCurrentProjectDelete,
    // computed
    hasCliAgents,
    agentCmd,
    currentProjectPath,
    selectedCount,
    allVisibleSelected,
    sessionListLoading,
    agentOptions,
    projectOptions,
    updatedRangeOptions,
    filteredSessions,
    groupedSessions,
    // 方法
    handleRefresh,
    openDetail,
    requestDelete,
    requestDeleteSelected,
    requestDeleteCurrentProjectSessions,
    closeDeleteModal,
    handleSessionSelectionChange,
    toggleSelectAllSessions,
    confirmDelete
  }
}