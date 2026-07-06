/** usePaneTabBar — PaneTabBar 分屏标签栏组件的 composable，负责标签列表、会话状态图标、关闭与拖拽分屏。 */
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore, type SessionStatus } from '@/stores/session'
import { useSplitPaneStore } from '@/stores/splitPane'
import { EaIcon } from '@/components/common'
import { useTabDrag } from '../useTabDrag'

export interface PaneTabBarProps {
  paneId: string
  isFocused: boolean
  isMini?: boolean
}

export interface PaneTabBarEmits {
  (event: 'focus', paneId: string): void
  (event: 'dragstart', paneId: string): void
}

export function usePaneTabBar(props: PaneTabBarProps, emit: PaneTabBarEmits) {

const { t } = useI18n()
const sessionStore = useSessionStore()
const splitPaneStore = useSplitPaneStore()
const { startTabDrag, endTabDrag } = useTabDrag()

const tabsContainerRef = ref<HTMLElement | null>(null)

const pane = computed(() => splitPaneStore.getPaneById(props.paneId))
const sessionIds = computed(() => pane.value?.sessionIds ?? [])
const activeSessionId = computed(() => pane.value?.activeSessionId ?? null)

// 溢出处理：测量容器宽度，超出时把多余的 tab 收进尾部下拉
const showOverflowMenu = ref(false)
const containerWidth = ref(0)
const TAB_MIN = 90 // 每个 tab 最小可见宽度

const visibleSessions = computed(() => {
  const all = sessionIds.value
    .map(id => sessionStore.sessions.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
  return all
})

const visibleTabs = computed(() => {
  if (!containerWidth.value) return visibleSessions.value
  const maxFit = Math.max(1, Math.floor(containerWidth.value / TAB_MIN))
  return visibleSessions.value.slice(0, maxFit)
})

const overflowTabs = computed(() => {
  if (!containerWidth.value) return []
  const maxFit = Math.max(1, Math.floor(containerWidth.value / TAB_MIN))
  return visibleSessions.value.slice(maxFit)
})

const hasOverflow = computed(() => overflowTabs.value.length > 0)

function measureContainer() {
  if (tabsContainerRef.value) {
    containerWidth.value = tabsContainerRef.value.clientWidth
  }
}

// ResizeObserver 在 PaneWrapper 中已观测宽度变化，这里通过 watch 容器尺寸自适应
let resizeObserver: ResizeObserver | null = null

watch(tabsContainerRef, (el) => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (el) {
    resizeObserver = new ResizeObserver(() => measureContainer())
    resizeObserver.observe(el)
    nextTick(measureContainer)
  }
})

// 会话变化时重新测量
watch([sessionIds, activeSessionId], () => {
  nextTick(measureContainer)
})

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

function handleSwitch(sessionId: string) {
  splitPaneStore.setActiveSessionInPane(props.paneId, sessionId)
  emit('focus', props.paneId)
}

function handleClose(sessionId: string, event: Event) {
  event.stopPropagation()
  splitPaneStore.removeSessionFromPane(props.paneId, sessionId)
}

function handleFocusPane() {
  emit('focus', props.paneId)
}

function handleTabDragStart(event: DragEvent, sessionId: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', sessionId)
  startTabDrag(props.paneId, sessionId)
  emit('focus', props.paneId)
}

function handleTabDragEnd() {
  endTabDrag()
}

// 整个 pane 的拖拽手柄（重排 pane）
function handlePaneDragMouseDown(event: MouseEvent) {
  // 仅 grip 区域触发，由 PaneWrapper 处理实际重排
  emit('dragstart', props.paneId)
  // 阻止冒泡到 pane header 点击聚焦
  event.stopPropagation()
}

function handleOverflowSwitch(sessionId: string) {
  handleSwitch(sessionId)
  showOverflowMenu.value = false
}

  return {
    t,
    EaIcon,
    pane,
    activeSessionId,
    tabsContainerRef,
    showOverflowMenu,
    visibleTabs,
    overflowTabs,
    hasOverflow,
    getStatusColor,
    getStatusIcon,
    handleSwitch,
    handleClose,
    handleFocusPane,
    handleTabDragStart,
    handleTabDragEnd,
    handlePaneDragMouseDown,
    handleOverflowSwitch
  }
}
