import { onBeforeUnmount, onMounted, ref } from 'vue'
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

export function useUnifiedPanelSessionList(props: UnifiedPanelSessionListProps, emit: UnifiedPanelSessionListEmits) {
  const { t } = useI18n()
  const sessionExecutionStore = useSessionExecutionStore()
  const {
    formatRelativeTime,
    formatSessionCreatedAt
  } = useSessionView()
  const sessionListRef = ref<HTMLElement | null>(null)
  const openMenuSessionId = ref<string | null>(null)

  function closeCompactMenu(event: Event) {
    const details = (event.currentTarget as HTMLElement | null)?.closest('details')
    if (details instanceof HTMLDetailsElement) {
      details.open = false
    }
    openMenuSessionId.value = null
  }

  function closeAllCompactMenus() {
    const root = sessionListRef.value
    if (!root) {
      openMenuSessionId.value = null
      return
    }

    root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((details) => {
      details.open = false
    })
    openMenuSessionId.value = null
  }

  function closeOtherMenus(currentDetails: HTMLDetailsElement) {
    const root = sessionListRef.value
    if (!root) {
      return
    }

    root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((details) => {
      if (details !== currentDetails) {
        details.open = false
      }
    })
  }

  function handleMenuToggle(sessionId: string, event: Event) {
    const details = event.currentTarget as HTMLDetailsElement | null
    if (!details) {
      return
    }

    if (details.open) {
      closeOtherMenus(details)
      openMenuSessionId.value = sessionId
      return
    }

    if (openMenuSessionId.value === sessionId) {
      openMenuSessionId.value = null
    }
  }

  function handleDocumentMouseDown(event: MouseEvent) {
    const root = sessionListRef.value
    const target = event.target
    if (!(root && target instanceof Node)) {
      return
    }

    const clickedMenu = target instanceof Element
      ? target.closest('.session-item__menu')
      : null

    if (!clickedMenu || !root.contains(clickedMenu)) {
      closeAllCompactMenus()
    }
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeAllCompactMenus()
    }
  }

  function handleCompactAction(
    action: 'togglePin' | 'startEdit' | 'delete',
    session: Session,
    event: Event
  ) {
    event.stopPropagation()
    closeCompactMenu(event)

    if (action === 'togglePin') {
      emit('togglePin', session.id)
      return
    }

    if (action === 'startEdit') {
      emit('startEdit', session, event)
      return
    }

    emit('delete', session)
  }

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
    if (props.selectionMode) {
      emit('toggleSelect', session.id)
      return
    }

    emit('select', session.id)
  }

  onMounted(() => {
    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleDocumentKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentMouseDown)
    document.removeEventListener('keydown', handleDocumentKeydown)
  })

  return {
    t,
    EaIcon,
    formatRelativeTime,
    formatSessionCreatedAt,
    sessionListRef,
    openMenuSessionId,
    closeCompactMenu,
    handleMenuToggle,
    handleCompactAction,
    getStatusBadgeClass,
    shouldShowSessionStatusIcon,
    isSessionExecuting,
    handleSessionClick
  }
}
