/** useUnifiedPanel — UnifiedPanel 统一侧边栏组件的 composable，聚合项目/会话列表、新建入口与子代理委派编排。 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore, type Project } from '@/stores/project'
import { useSessionStore, type Session } from '@/stores/session'
import { useLayoutStore } from '@/stores/layout'
import { useUIStore } from '@/stores/ui'
import { useAgentStore } from '@/stores/agent'
import { useSubAgentStore } from '@/stores/subAgent'
import { useSplitPaneStore } from '@/stores/splitPane'
import { useSessionView } from '@/composables'
import { EaIcon, EaButton } from '@/components/common'
import { ProjectCreateModal } from '@/components/project'
import UnifiedPanelConfirmDialog from '../UnifiedPanelConfirmDialog/UnifiedPanelConfirmDialog.vue'
import UnifiedPanelProjectEntry from '../UnifiedPanelProjectEntry/UnifiedPanelProjectEntry.vue'
import { resolveSubAgentExecutionWithFallback } from '@/services/subAgent/runtime'
import { syncSubAgentFiles } from '@/services/subAgent/syncService'


export interface UnifiedPanelProps {
  collapsed?: boolean
  showHeaderToggle?: boolean
}

export interface UnifiedPanelEmits {
  (event: 'toggle'): void
  (event: 'openProjectFiles', project: Project): void
  (event: 'requestHide'): void
}

export function useUnifiedPanel(_props: UnifiedPanelProps, emit: UnifiedPanelEmits) {
const { t } = useI18n()

const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const layoutStore = useLayoutStore()
const uiStore = useUIStore()
const agentStore = useAgentStore()
const agentTeamsStore = useSubAgentStore()
const splitPaneStore = useSplitPaneStore()
const {
  openSessionTarget,
} = useSessionView()

// 项目相关状态
const editingProject = ref<Project | null>(null)
const showDeleteConfirm = ref(false)
const deletingProject = ref<Project | null>(null)

// 会话相关状态
const showDeleteSessionConfirm = ref(false)
const deletingSession = ref<Session | null>(null)
const deletingSessions = ref<Session[]>([])

// 编辑会话名称状态
const editingSessionId = ref<string | null>(null)
const editingSessionName = ref('')

// 按项目筛选的会话列表
const getSessionsByProject = (projectId: string) => {
  return sessionStore.sessionsByProject(projectId, layoutStore.sessionSortBy)
}

// 切换排序方式
const toggleSessionSort = () => {
  const newSortBy = layoutStore.sessionSortBy === 'updatedAt' ? 'createdAt' : 'updatedAt'
  layoutStore.setSessionSortBy(newSortBy)
}

// 项目是否有展开的会话

// 格式化导入时间
const formatImportTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return t('unified.today')
  if (days === 1) return t('unified.yesterday')
  if (days < 7) return t('unified.daysAgo', { days })
  if (days < 30) return t('unified.weeksAgo', { weeks: Math.floor(days / 7) })
  if (days < 365) return t('unified.monthsAgo', { months: Math.floor(days / 30) })
  return t('unified.yearsAgo', { years: Math.floor(days / 365) })
}

// 点击项目卡片切换展开/收起
const handleProjectCardClick = async (project: Project) => {
  projectStore.toggleProjectExpand(project.id)

  if (!projectStore.isProjectExpanded(project.id)) {
    return
  }

  await sessionStore.loadSessions(project.id)
}

// 启动恢复：当存在当前会话且其项目未展开时，自动展开并加载会话，
// 使左侧面板与中间打开的会话保持同步（项目展开、会话可见并选中）。
// 用 watch(immediate) 兼容两种时序：App.vue 在面板挂载前/后恢复会话。
let startupAutoExpandDone = false
const autoExpandForActiveSession = async (sessionId: string | null) => {
  if (startupAutoExpandDone || !sessionId) {
    return
  }
  const session = sessionStore.sessions.find(item => item.id === sessionId)
  const targetProjectId = session?.projectId ?? projectStore.currentProjectId
  if (!targetProjectId || projectStore.isProjectExpanded(targetProjectId)) {
    return
  }
  startupAutoExpandDone = true
  projectStore.expandProject(targetProjectId)
  await sessionStore.loadSessions(targetProjectId).catch(() => {})
}

// 生命周期
onMounted(async () => {
  await projectStore.loadProjects()
  await autoExpandForActiveSession(sessionStore.currentSessionId)
  document.addEventListener('keydown', handleModalKeydown)
})

watch(() => sessionStore.currentSessionId, (sessionId) => {
  void autoExpandForActiveSession(sessionId)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleModalKeydown)
})

// ESC 键关闭模态框
const handleModalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (showDeleteSessionConfirm.value) {
      closeDeleteSessionConfirm()
    } else if (showDeleteConfirm.value) {
      closeDeleteProjectConfirm()
    } else if (uiStore.projectCreateModalVisible) {
      uiStore.closeProjectCreateModal()
    } else if (uiStore.sessionCreateModalVisible) {
      uiStore.closeSessionCreateModal()
    }
  }
}

// ========== 项目操作 ==========
const handleRefresh = async () => {
  await projectStore.loadProjects()

  const expandedProjectIds = Array.from(projectStore.expandedProjects)
  const expandedProjects = projectStore.projects.filter(project => expandedProjectIds.includes(project.id))
  await Promise.all(expandedProjects.map(project => sessionStore.loadSessions(project.id, { force: true })))

  // 异步从 ACP 同步 CLI 会话（不阻塞 UI 刷新）
  await Promise.all(
    expandedProjects.map(project => sessionStore.syncSessionsFromAcp(project.id).catch(() => {}))
  )
}

const handleAddProject = () => {
  editingProject.value = null
  uiStore.openProjectCreateModal()
}

const handleEditProject = (project: Project) => {
  editingProject.value = project
  uiStore.openProjectCreateModal()
}

const handleCreateProject = async (data: { name: string; path: string; description?: string; memoryLibraryIds: string[] }) => {
  if (editingProject.value) {
    await projectStore.updateProject(editingProject.value.id, data)
    editingProject.value = null
  } else {
    await projectStore.createProject(data)
  }
  uiStore.closeProjectCreateModal()
}

const handleDeleteProject = (project: Project) => {
  deletingProject.value = project
  showDeleteConfirm.value = true
}

const closeDeleteProjectConfirm = () => {
  showDeleteConfirm.value = false
  deletingProject.value = null
}

const confirmDeleteProject = () => {
  if (deletingProject.value) {
    projectStore.deleteProject(deletingProject.value.id)
  }
  closeDeleteProjectConfirm()
}

// ========== 会话操作 ==========
const handleAddSession = async (projectId: string) => {
  try {
    projectStore.setCurrentProject(projectId)
    await Promise.all([
      agentStore.loadAgents(),
      agentTeamsStore.loadSubAgents(true)
    ])
    const expert = agentTeamsStore.builtinGeneralSubAgent || agentTeamsStore.enabledSubAgents[0] || null
    const runtime = resolveSubAgentExecutionWithFallback(expert, agentStore.agents)
    const newSession = await sessionStore.createSession({
      projectId,
      name: t('session.unnamedSession'),
      expertId: expert?.id,
      agentId: runtime?.agent.id,
      agentType: runtime?.agent.provider || runtime?.agent.type || 'claude',
      status: 'idle'
    })
    projectStore.incrementSessionCount(projectId)
    uiStore.setAppMode('chat')
    uiStore.setMainContentMode('chat')
    // 子代理定义写盘到选定执行器的 CLI 配置目录（仅 claude/opencode 生效）
    if (runtime?.agent) {
      const projectPath = projectStore.projects.find(p => p.id === projectId)?.path
      await syncSubAgentFiles(runtime.agent, agentTeamsStore.subAgents, projectPath).catch(error => {
        console.warn('Sub-agent sync failed:', error)
      })
    }

    // 分屏模式：新会话进入当前聚焦的分屏窗口；否则走全局 tab
    if (splitPaneStore.isSplitActive && splitPaneStore.focusedPaneId) {
      splitPaneStore.addSessionToPane(splitPaneStore.focusedPaneId, newSession.id)
    } else {
      await sessionStore.openSession(newSession.id)
    }
  } catch (error) {
    console.error('[UnifiedPanel] 创建会话失败:', error)
  }
}

// 头部“+”新建会话：落到当前项目，无项目则打开导入弹窗
const handleCreateSession = async () => {
  const projectId = projectStore.currentProjectId || projectStore.projects[0]?.id
  if (!projectId) {
    uiStore.openProjectCreateModal()
    return
  }
  await handleAddSession(projectId)
}

// 头部“隐藏”按钮：请求外层收起侧栏
const handleRequestHide = () => {
  emit('requestHide')
}

const handleSelectSession = async (id: string) => {
  await openSessionTarget(id, {
    onBeforeOpen: () => {
      uiStore.setMainContentMode('chat')
    }
  })
}

const handleTogglePin = (id: string) => {
  sessionStore.togglePin(id)
}

const handleDeleteSession = (session: Session) => {
  deletingSessions.value = [session]
  deletingSession.value = session
  showDeleteSessionConfirm.value = true
}

const handleDeleteSessions = (sessions: Session[]) => {
  if (!sessions.length) {
    return
  }

  deletingSessions.value = [...sessions]
  deletingSession.value = sessions.length === 1 ? sessions[0] : null
  showDeleteSessionConfirm.value = true
}

const closeDeleteSessionConfirm = () => {
  showDeleteSessionConfirm.value = false
  deletingSession.value = null
  deletingSessions.value = []
}

const confirmDeleteSession = async () => {
  for (const session of deletingSessions.value) {
    await sessionStore.deleteSession(session.id)
    projectStore.decrementSessionCount(session.projectId)
  }
  closeDeleteSessionConfirm()
}

// 编辑会话名称
const startEditSessionName = (session: Session, event: Event) => {
  event.stopPropagation()
  editingSessionId.value = session.id
  editingSessionName.value = session.name
}

const cancelEditSessionName = () => {
  editingSessionId.value = null
  editingSessionName.value = ''
}

const saveSessionName = async (session: Session) => {
  if (editingSessionName.value.trim() && editingSessionName.value !== session.name) {
    await sessionStore.updateSession(session.id, { name: editingSessionName.value.trim() })
  }
  cancelEditSessionName()
}

const handleOpenProjectFiles = (project: Project) => {
  projectStore.setCurrentProject(project.id)
  emit('openProjectFiles', project)
}

  return {
    t,
    EaIcon,
    EaButton,
    ProjectCreateModal,
    UnifiedPanelConfirmDialog,
    UnifiedPanelProjectEntry,
    projectStore,
    sessionStore,
    layoutStore,
    uiStore,
    splitPaneStore,
    editingProject,
    showDeleteConfirm,
    deletingProject,
    showDeleteSessionConfirm,
    deletingSession,
    deletingSessions,
    editingSessionId,
    editingSessionName,
    getSessionsByProject,
    toggleSessionSort,
    formatImportTime,
    handleProjectCardClick,
    handleRefresh,
    handleAddProject,
    handleEditProject,
    handleCreateProject,
    handleDeleteProject,
    closeDeleteProjectConfirm,
    confirmDeleteProject,
    handleAddSession,
    handleCreateSession,
    handleRequestHide,
    handleSelectSession,
    handleTogglePin,
    handleDeleteSession,
    handleDeleteSessions,
    closeDeleteSessionConfirm,
    confirmDeleteSession,
    startEditSessionName,
    cancelEditSessionName,
    saveSessionName,
    handleOpenProjectFiles
  }
}
