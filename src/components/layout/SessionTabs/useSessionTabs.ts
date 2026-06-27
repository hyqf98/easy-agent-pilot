import { computed, ref, onMounted, nextTick, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore, type SessionStatus } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { useLayoutStore } from '@/stores/layout'
import { useWindowManagerStore } from '@/stores/windowManager'
import { useSplitPaneStore } from '@/stores/splitPane'
import { EaIcon } from '@/components/common'
import { useMessage } from 'naive-ui'
import { useSessionView } from '@/composables'
import { useAgentStore } from '@/stores/agent'
import { useSubAgentStore } from '@/stores/subAgent'
import { resolveSubAgentExecutionWithFallback } from '@/services/subAgent/runtime'
import { syncSubAgentFiles } from '@/services/subAgent/syncService'

export function useSessionTabs() {
const { t } = useI18n()
const sessionStore = useSessionStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()
const windowManagerStore = useWindowManagerStore()
const splitPaneStore = useSplitPaneStore()
const agentStore = useAgentStore()
const agentTeamsStore = useSubAgentStore()
const message = useMessage()
const { openSessionTarget } = useSessionView()

// 标签栏容器引用
const tabsContainerRef = ref<HTMLElement | null>(null)
// 正在切换的标签 ID（用于视觉反馈）
const switchingTabId = ref<string | null>(null)

const contextMenuState = ref<{
  visible: boolean
  x: number
  y: number
  sessionId: string | null
}>({
  visible: false,
  x: 0,
  y: 0,
  sessionId: null
})

// 拖拽状态
const isDragging = ref(false)
const dragSessionId = ref<string | null>(null)

const contextTargetIndex = computed(() => {
  if (!contextMenuState.value.sessionId) {
    return -1
  }

  return sessionStore.openSessionIds.indexOf(contextMenuState.value.sessionId)
})

const canCloseOthers = computed(() =>
  contextTargetIndex.value !== -1 && sessionStore.openSessionIds.length > 1
)

const canCloseLeft = computed(() => contextTargetIndex.value > 0)

const canCloseRight = computed(() => (
  contextTargetIndex.value !== -1
  && contextTargetIndex.value < sessionStore.openSessionIds.length - 1
))

// 拖拽开始
function onDragStart(e: DragEvent, sessionId: string) {
  if (!e.dataTransfer) return

  isDragging.value = true
  dragSessionId.value = sessionId

  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', sessionId)

  // 设置拖拽图像（可选）
  const target = e.target as HTMLElement
  if (target) {
    const rect = target.getBoundingClientRect()
    e.dataTransfer.setDragImage(target, rect.width / 2, rect.height / 2)
  }
}

// 拖拽结束
function onDragEnd() {
  isDragging.value = false
  dragSessionId.value = null
}

// 拖拽离开窗口
async function onDragLeave(e: DragEvent) {
  // 检查是否离开窗口边界
  if (e.clientX < 0 || e.clientX > window.innerWidth ||
      e.clientY < 0 || e.clientY > window.innerHeight) {
    // 离开窗口边界，分离会话到新窗口
    if (dragSessionId.value) {
      await detachSessionToNewWindow(dragSessionId.value)
    }
  }
}

// 分离会话到新窗口
async function detachSessionToNewWindow(sessionId: string) {
  // 获取会话所属的项目
  const session = sessionStore.sessions.find(s => s.id === sessionId)
  if (!session) return

  try {
    // 在新窗口中打开项目
    await windowManagerStore.openProjectInNewWindow(session.projectId)
    // 关闭当前窗口的会话
    sessionStore.closeSession(sessionId)
    message.success('会话已分离到新窗口')
  } catch (error) {
    console.error('Failed to detach session:', error)
    message.error('分离会话失败')
  }
}

// 获取会话状态的颜色
const getStatusColor = (status: SessionStatus): string => {
  switch (status) {
    case 'running':
      return 'var(--color-success)'
    case 'paused':
      return 'var(--color-warning)'
    case 'error':
      return 'var(--color-danger)'
    case 'completed':
      return 'var(--color-primary)'
    default:
      return 'var(--color-text-tertiary)'
  }
}

// 获取会话状态的图标
const getStatusIcon = (status: SessionStatus): string => {
  switch (status) {
    case 'running':
      return 'loader'
    case 'paused':
      return 'pause-circle'
    case 'error':
      return 'alert-circle'
    case 'completed':
      return 'check-circle'
    default:
      return 'circle'
  }
}

const switchToSession = async (sessionId: string) => {
  if (sessionId === sessionStore.currentSessionId) return

  if (sessionStore.isSessionOpen(sessionId)) {
    sessionStore.setCurrentSession(sessionId)
    syncSidebarToSession(sessionId)
    return
  }

  switchingTabId.value = sessionId

  try {
    await openSessionTarget(sessionId)
  } finally {
    switchingTabId.value = null
  }
}

const syncSidebarToSession = (sessionId: string) => {
  const session = sessionStore.sessions.find(s => s.id === sessionId)
  if (!session?.projectId) return

  projectStore.setCurrentProject(session.projectId)
  if (!projectStore.isProjectExpanded(session.projectId)) {
    projectStore.expandProject(session.projectId)
  }
  layoutStore.setProjectTab(session.projectId, 'sessions')
  void sessionStore.loadSessions(session.projectId).catch(() => {})
}

// 关闭指定会话标签
const closeTab = (sessionId: string, event: MouseEvent) => {
  event.stopPropagation() // 阻止触发切换会话
  sessionStore.closeSession(sessionId)
  if (contextMenuState.value.sessionId === sessionId) {
    hideContextMenu()
  }
}

const hideContextMenu = () => {
  contextMenuState.value.visible = false
  contextMenuState.value.sessionId = null
}

const showContextMenu = (event: MouseEvent, sessionId: string) => {
  event.preventDefault()
  event.stopPropagation()

  contextMenuState.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    sessionId
  }
}

const handleContextMenuAction = (action: 'closeAll' | 'closeOthers' | 'closeLeft' | 'closeRight' | 'splitPane') => {
  const sessionId = contextMenuState.value.sessionId
  if (!sessionId) {
    return
  }

  switch (action) {
    case 'closeAll':
      sessionStore.closeAllSessions()
      break
    case 'closeOthers':
      sessionStore.closeOtherSessions(sessionId)
      break
    case 'closeLeft':
      sessionStore.closeSessionsToLeft(sessionId)
      break
    case 'closeRight':
      sessionStore.closeSessionsToRight(sessionId)
      break
    case 'splitPane':
      handleContextMenuSplit()
      return
  }

  hideContextMenu()
}

const handleGlobalPointer = () => {
  if (contextMenuState.value.visible) {
    hideContextMenu()
  }
}

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && contextMenuState.value.visible) {
    hideContextMenu()
  }
}

async function resolveDefaultExpertSession(projectId: string) {
  await Promise.all([
    agentStore.loadAgents(),
    agentTeamsStore.loadSubAgents(true)
  ])
  const expert = agentTeamsStore.builtinGeneralSubAgent || agentTeamsStore.enabledSubAgents[0] || null
  const runtime = resolveSubAgentExecutionWithFallback(expert, agentStore.agents)
  const newSession = await sessionStore.createSession({
    projectId,
    name: '',
    expertId: expert?.id,
    agentId: runtime?.agent.id,
    agentType: runtime?.agent.provider || runtime?.agent.type || 'cli',
    status: 'idle'
  })
  // 子代理定义写盘到选定执行器的 CLI 配置目录（仅 claude/opencode 生效）
  if (runtime?.agent) {
    const projectPath = projectStore.projects.find(p => p.id === projectId)?.path
    await syncSubAgentFiles(runtime.agent, agentTeamsStore.subAgents, projectPath).catch(error => {
      console.warn('Sub-agent sync failed:', error)
    })
  }
  return newSession
}

const handleSplitPane = async (sessionId?: string) => {
  const targetId = sessionId ?? sessionStore.currentSessionId
  if (!targetId) return

  if (splitPaneStore.isSplitActive) {
    splitPaneStore.addPane(targetId)
  } else {
    const session = sessionStore.sessions.find(s => s.id === targetId)
    const newSession = await resolveDefaultExpertSession(session?.projectId ?? '')
    splitPaneStore.enterSplitMode(targetId, newSession.id)
  }
  splitPaneStore.focusPane(splitPaneStore.focusedPaneId!)
}

const handleContextMenuSplit = () => {
  const sessionId = contextMenuState.value.sessionId
  if (sessionId) {
    handleSplitPane(sessionId)
  }
  hideContextMenu()
}

// 处理鼠标滚轮滚动（横向滚动）
const handleWheel = (event: WheelEvent) => {
  if (tabsContainerRef.value) {
    tabsContainerRef.value.scrollLeft += event.deltaY
  }
}

// 滚动到活动标签
const scrollToActiveTab = async () => {
  await nextTick()
  if (!tabsContainerRef.value) return

  const activeTab = tabsContainerRef.value.querySelector('.session-tabs__tab--active') as HTMLElement
  if (!activeTab) return

  const container = tabsContainerRef.value
  const containerRect = container.getBoundingClientRect()
  const tabRect = activeTab.getBoundingClientRect()

  // 如果标签在可视区域外，滚动到标签位置
  if (tabRect.left < containerRect.left) {
    container.scrollLeft -= containerRect.left - tabRect.left + 20
  } else if (tabRect.right > containerRect.right) {
    container.scrollLeft += tabRect.right - containerRect.right + 20
  }
}

// 监听当前会话变化，滚动到活动标签
onMounted(() => {
  // 加载保存的打开会话列表
  sessionStore.loadOpenSessions()
  window.addEventListener('click', handleGlobalPointer)
  window.addEventListener('blur', handleGlobalPointer)
  window.addEventListener('resize', handleGlobalPointer)
  window.addEventListener('keydown', handleGlobalKeydown)
  void scrollToActiveTab()
})

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalPointer)
  window.removeEventListener('blur', handleGlobalPointer)
  window.removeEventListener('resize', handleGlobalPointer)
  window.removeEventListener('keydown', handleGlobalKeydown)
})

watch(() => sessionStore.currentSessionId, () => {
  void scrollToActiveTab()
})

watch(() => sessionStore.openSessionIds.join(':'), () => {
  if (!contextMenuState.value.sessionId) {
    return
  }

  if (!sessionStore.openSessionIds.includes(contextMenuState.value.sessionId)) {
    hideContextMenu()
  }
})

  return {
    t,
    EaIcon,
    sessionStore,
    splitPaneStore,
    tabsContainerRef,
    switchingTabId,
    contextMenuState,
    isDragging,
    dragSessionId,
    canCloseOthers,
    canCloseLeft,
    canCloseRight,
    onDragStart,
    onDragEnd,
    onDragLeave,
    getStatusColor,
    getStatusIcon,
    switchToSession,
    closeTab,
    showContextMenu,
    handleContextMenuAction,
    handleSplitPane,
    handleWheel
  }
}
