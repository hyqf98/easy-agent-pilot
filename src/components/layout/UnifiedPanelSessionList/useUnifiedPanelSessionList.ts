/** useUnifiedPanelSessionList — UnifiedPanelSessionList 会话列表组件的 composable，负责会话选择、勾选、置顶、内联重命名等交互。 */
import { useI18n } from 'vue-i18n'
import type { Session } from '@/stores/session'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useSessionView } from '@/composables'
import { EaIcon } from '@/components/common'

export interface UnifiedPanelSessionListProps {
  sessions: Session[]
  currentSessionId: string | null
  editingSessionId: string | null
  editingSessionName: string
  selectedSessionIds: string[]
  selectionMode?: boolean
}

export interface UnifiedPanelSessionListEmits {
  (event: 'select', id: string): void
  (event: 'toggleSelect', id: string): void
  (event: 'togglePin', id: string): void
  (event: 'startEdit', session: Session, ev: Event): void
  (event: 'saveEdit', session: Session): void
  (event: 'cancelEdit'): void
  (event: 'delete', session: Session): void
  (event: 'updateEditingName', value: string): void
}

export function useUnifiedPanelSessionList(_props: UnifiedPanelSessionListProps, _emit: UnifiedPanelSessionListEmits) {
  const { t } = useI18n()
  const sessionExecutionStore = useSessionExecutionStore()
  const {
    formatRelativeTime,
    formatSessionCreatedAt
  } = useSessionView()

  function getStatusBadgeClass(status: Session['status']) {
    return `session-item__status-text--${status}`
  }

  function shouldShowSessionStatusIcon(session: Session) {
    return session.status === 'running' || session.status === 'error' || isSessionExecuting(session.id)
  }

  // 实时执行状态：AI 正在响应时左侧显示加载动画
  function isSessionExecuting(sessionId: string) {
    return sessionExecutionStore.getIsBusy(sessionId) || sessionExecutionStore.getIsStreaming(sessionId)
  }

  function handleSessionClick(session: Session) {
    if (_props.selectionMode) {
      _emit('toggleSelect', session.id)
      return
    }

    _emit('select', session.id)
  }

  /** 会话活跃时间（相对格式：刚刚 / N分钟前 / N小时前 / N天前 / N周前 / N月前 / N年前） */
  function getSessionTime(session: Session) {
    return formatRelativeTime(session.updatedAt)
  }

  return {
    t,
    EaIcon,
    formatRelativeTime,
    formatSessionCreatedAt,
    getStatusBadgeClass,
    shouldShowSessionStatusIcon,
    isSessionExecuting,
    handleSessionClick,
    getSessionTime
  }
}
