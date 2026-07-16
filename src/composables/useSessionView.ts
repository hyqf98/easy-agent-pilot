/** 会话视图操作（打开、切换、导航）的 composable。 */
import { useI18n } from 'vue-i18n'
import { useLayoutStore } from '@/stores/layout'
import { usePlanStore } from '@/stores/plan'
import { useProjectStore } from '@/stores/project'
import { useSessionStore, type SessionStatus } from '@/stores/session'
import { useTaskStore } from '@/stores/task'
import { useUIStore } from '@/stores/ui'
import { useSplitPaneStore } from '@/stores/splitPane'

interface OpenSessionTargetOptions {
  onBeforeOpen?: () => void
}

export function useSessionView() {
  const { t } = useI18n()
  const sessionStore = useSessionStore()
  const projectStore = useProjectStore()
  const layoutStore = useLayoutStore()
  const uiStore = useUIStore()
  const taskStore = useTaskStore()
  const planStore = usePlanStore()
  const splitPaneStore = useSplitPaneStore()

  async function openSessionTarget(id: string, options: OpenSessionTargetOptions = {}) {
    options.onBeforeOpen?.()

    const session = sessionStore.sessions.find(item => item.id === id)
    if (session?.projectId) {
      projectStore.setCurrentProject(session.projectId)
      projectStore.expandProject(session.projectId)
      layoutStore.setProjectTab(session.projectId, 'sessions')
    }

    if (session?.agentType === 'planner') {
      if (session.projectId) {
        await planStore.loadPlans(session.projectId)
      }
      uiStore.setAppMode('plan')
      return
    }

    const task = taskStore.getCachedTaskBySessionId(id)
    if (task?.planId) {
      if (session?.projectId && planStore.plansByProject(session.projectId).length === 0) {
        await planStore.loadPlans(session.projectId)
      }
      planStore.setCurrentPlan(task.planId)
      await taskStore.loadTasks(task.planId)
      uiStore.setAppMode('plan')
      return
    }

    uiStore.setAppMode('chat')
    uiStore.setMainContentMode('chat')

    // 分屏模式：会话进入当前聚焦的分屏窗口（各自管理 tab）
    if (splitPaneStore.isSplitActive && splitPaneStore.focusedPaneId) {
      splitPaneStore.addSessionToPane(splitPaneStore.focusedPaneId, id)
    } else {
      await sessionStore.openSession(id)
    }

    // 仅在项目尚未加载会话列表时补充加载；避免每次点击都用 force 重新拉取，
    // 触发 replaceProjectSessions 整体替换导致左侧列表瞬时闪烁/消失。
    if (session?.projectId && !sessionStore.loadedProjectIds.has(session.projectId)) {
      void sessionStore.loadSessions(session.projectId).catch(() => {})
    }
  }

  function getStatusIcon(status: SessionStatus) {
    switch (status) {
      case 'running': return 'loader'
      case 'completed': return 'check-circle'
      case 'error': return 'alert-circle'
      case 'paused': return 'pause-circle'
      default: return 'circle'
    }
  }

  function getStatusText(status: SessionStatus) {
    switch (status) {
      case 'running': return t('session.statusRunning')
      case 'completed': return t('session.statusCompleted')
      case 'error': return t('session.statusError')
      case 'paused': return t('session.statusPaused')
      default: return t('session.statusIdle')
    }
  }

  function getStatusClass(status: SessionStatus) {
    return `session-item__status--${status}`
  }

  function isRunningStatus(status: SessionStatus) {
    return status === 'running'
  }

  function formatRelativeTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)

    if (minutes < 1) return t('common.justNow')
    if (minutes < 60) return t('common.minutesAgo', { n: minutes })
    if (hours < 24) return t('common.hoursAgo', { n: hours })
    if (days < 7) return t('common.daysAgo', { n: days })
    if (weeks < 4) return t('common.weeksAgo', { n: weeks })
    if (months < 12) return t('common.monthsAgo', { n: months })
    return t('common.yearsAgo', { n: years })
  }

  function formatSessionCreatedAt(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()
    const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

    if (isToday) {
      return `${t('unified.today')} ${timeStr}`
    }
    if (isYesterday) {
      return `${t('unified.yesterday')} ${timeStr}`
    }
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ` ${timeStr}`
    }
    return date.toLocaleDateString('zh-CN') + ` ${timeStr}`
  }

  return {
    openSessionTarget,
    getStatusIcon,
    getStatusText,
    getStatusClass,
    isRunningStatus,
    formatRelativeTime,
    formatSessionCreatedAt
  }
}
