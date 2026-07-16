/** useUnifiedPanelProjectEntry — UnifiedPanelProjectEntry 项目条目组件的 composable，负责项目展开、会话列表懒加载与展示。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Project } from '@/stores/project'
import type { Session } from '@/stores/session'
import { EaIcon } from '@/components/common'
import UnifiedPanelSessionList from '../UnifiedPanelSessionList/UnifiedPanelSessionList.vue'

const SESSION_INITIAL_LIMIT = 5
const SESSION_LOAD_MORE_STEP = 10

export interface UnifiedPanelProjectEntryProps {
  project: Project
  isActive: boolean
  isExpanded: boolean
  sessionSortBy: 'updatedAt' | 'createdAt'
  sessions: Session[]
  currentSessionId: string | null
  editingSessionId: string | null
  editingSessionName: string
  importedTimeLabel: string
  /** 会话列表是否正在加载（首次拉取） */
  isSessionsLoading?: boolean
  /** 是否正在从 ACP 同步会话 */
  isAcpSyncing?: boolean
}

export interface UnifiedPanelProjectEntryEmits {
  (event: 'toggleProject', project: Project): void
  (event: 'editProject', project: Project): void
  (event: 'deleteProject', project: Project): void
  (event: 'openProjectFiles', project: Project): void
  (event: 'toggleSort'): void
  (event: 'addSession', projectId: string): void
  (event: 'selectSession', sessionId: string): void
  (event: 'togglePin', sessionId: string): void
  (event: 'startEditSession', session: Session, ev: Event): void
  (event: 'saveEditSession', session: Session): void
  (event: 'cancelEditSession'): void
  (event: 'deleteSession', session: Session): void
  (event: 'deleteSessions', sessions: Session[]): void
  (event: 'updateEditingName', value: string): void
}

export function useUnifiedPanelProjectEntry(props: UnifiedPanelProjectEntryProps, emit: UnifiedPanelProjectEntryEmits) {
  const { t } = useI18n()
  const projectItemRef = ref<HTMLElement | null>(null)
  const isCompactMenuOpen = ref(false)
  const visibleSessionCount = ref(SESSION_INITIAL_LIMIT)
  const isBatchSelectMode = ref(false)
  const selectedSessionIds = ref<string[]>([])
  const visibleSessions = computed(() => (
    props.sessions.slice(0, visibleSessionCount.value)
  ))
  const hiddenSessionCount = computed(() => Math.max(props.sessions.length - visibleSessionCount.value, 0))
  const hasHiddenSessions = computed(() => hiddenSessionCount.value > 0)

  /** 项目行左侧加载态：会话拉取或 ACP 同步 */
  const isProjectRowLoading = computed(() =>
    (props.isSessionsLoading ?? false) || (props.isAcpSyncing ?? false)
  )

  function loadMoreSessions() {
    visibleSessionCount.value = Math.min(
      visibleSessionCount.value + SESSION_LOAD_MORE_STEP,
      props.sessions.length
    )
  }

  /** 收起会话列表：回到初始显示数量 */
  function collapseSessions() {
    visibleSessionCount.value = SESSION_INITIAL_LIMIT
  }

  /** 是否已展开全部会话（用于切换按钮文案） */
  const isAllSessionsVisible = computed(() => visibleSessionCount.value >= props.sessions.length)

  function handleStartEditSession(session: Session, event: Event) {
    emit('startEditSession', session, event)
  }

  function toggleSessionSelection(sessionId: string) {
    if (!isBatchSelectMode.value) {
      return
    }

    selectedSessionIds.value = selectedSessionIds.value.includes(sessionId)
      ? selectedSessionIds.value.filter(id => id !== sessionId)
      : [...selectedSessionIds.value, sessionId]
  }

  function clearSelectedSessions() {
    selectedSessionIds.value = []
  }

  function toggleBatchSelectMode(event: Event) {
    event.stopPropagation()
    isBatchSelectMode.value = !isBatchSelectMode.value
    if (!isBatchSelectMode.value) {
      clearSelectedSessions()
    }
  }

  function closeCompactMenu(event: Event) {
    const details = (event.currentTarget as HTMLElement | null)?.closest('details')
    if (details instanceof HTMLDetailsElement) {
      details.open = false
    }
    isCompactMenuOpen.value = false
  }

  function closeProjectCompactMenu() {
    const root = projectItemRef.value
    if (!root) {
      isCompactMenuOpen.value = false
      return
    }

    root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((details) => {
      details.open = false
    })
    isCompactMenuOpen.value = false
  }

  function handleProjectMenuToggle(event: Event) {
    const details = event.currentTarget as HTMLDetailsElement | null
    if (!details) {
      return
    }

    isCompactMenuOpen.value = details.open
  }

  function handleDocumentMouseDown(event: MouseEvent) {
    const root = projectItemRef.value
    const target = event.target
    if (!(root && target instanceof Node)) {
      return
    }

    const clickedMenu = target instanceof Element
      ? target.closest('.project-item__menu')
      : null

    if (!clickedMenu || !root.contains(clickedMenu)) {
      closeProjectCompactMenu()
    }
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeProjectCompactMenu()
    }
  }

  function handleProjectCompactAction(action: 'edit' | 'delete' | 'files', project: Project, event: Event) {
    event.stopPropagation()
    closeCompactMenu(event)

    if (action === 'edit') {
      emit('editProject', project)
      return
    }

    if (action === 'files') {
      emit('openProjectFiles', project)
      return
    }

    emit('deleteProject', project)
  }

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentMouseDown)
    document.removeEventListener('keydown', handleDocumentKeydown)
  })

  watch(isCompactMenuOpen, (open) => {
    if (open) {
      document.addEventListener('mousedown', handleDocumentMouseDown)
      document.addEventListener('keydown', handleDocumentKeydown)
      return
    }

    document.removeEventListener('mousedown', handleDocumentMouseDown)
    document.removeEventListener('keydown', handleDocumentKeydown)
  })

  watch(
    () => props.sessions,
    (sessions) => {
      const visibleIds = new Set(sessions.map(session => session.id))
      selectedSessionIds.value = selectedSessionIds.value.filter(sessionId => visibleIds.has(sessionId))
      if (sessions.length <= SESSION_INITIAL_LIMIT) {
        visibleSessionCount.value = SESSION_INITIAL_LIMIT
      } else if (visibleSessionCount.value > sessions.length) {
        visibleSessionCount.value = sessions.length
      }
    },
    { deep: true }
  )

  watch(
    () => props.isExpanded,
    (expanded) => {
      if (!expanded) {
        visibleSessionCount.value = SESSION_INITIAL_LIMIT
      }
    }
  )

  return {
    t,
    EaIcon,
    UnifiedPanelSessionList,
    projectItemRef,
    isCompactMenuOpen,
    SESSION_INITIAL_LIMIT,
    visibleSessionCount,
    isBatchSelectMode,
    selectedSessionIds,
    visibleSessions,
    hiddenSessionCount,
    hasHiddenSessions,
    loadMoreSessions,
    collapseSessions,
    isAllSessionsVisible,
    isProjectRowLoading,
    isSessionsLoading: computed(() => props.isSessionsLoading ?? false),
    isAcpSyncing: computed(() => props.isAcpSyncing ?? false),
    handleStartEditSession,
    toggleSessionSelection,
    clearSelectedSessions,
    toggleBatchSelectMode,
    closeCompactMenu,
    handleProjectMenuToggle,
    handleProjectCompactAction
  }
}
