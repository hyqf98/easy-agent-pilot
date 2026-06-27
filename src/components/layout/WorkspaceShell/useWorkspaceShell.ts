import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import AppHeader from '../AppHeader/AppHeader.vue'

export interface WorkspaceShellProps {
  /** 左侧栏初始宽度（px） */
  sidebarWidth?: number
  /** 左侧栏最小宽度（px） */
  sidebarMin?: number
  /** 左侧栏最大宽度（px） */
  sidebarMax?: number
}

export function useWorkspaceShell(props: WorkspaceShellProps) {
  const { t } = useI18n()

  const isSidebarVisible = ref(true)
  const sidebarWidth = ref(props.sidebarWidth ?? 280)
  const isResizing = ref(false)

  let resizeStartX = 0
  let resizeStartWidth = 0

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
  }

  function showSidebar() {
    isSidebarVisible.value = true
  }

  function hideSidebar() {
    isSidebarVisible.value = false
  }

  function handleResizeMove(event: MouseEvent) {
    if (!isResizing.value) {
      return
    }

    const deltaX = event.clientX - resizeStartX
    sidebarWidth.value = clamp(
      resizeStartWidth + deltaX,
      props.sidebarMin ?? 220,
      props.sidebarMax ?? 420
    )
  }

  function stopResize() {
    if (!isResizing.value) {
      return
    }

    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', stopResize)
  }

  function startResize(event: MouseEvent) {
    isResizing.value = true
    resizeStartX = event.clientX
    resizeStartWidth = sidebarWidth.value
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleResizeMove, { passive: true })
    document.addEventListener('mouseup', stopResize)
  }

  onMounted(() => {
    document.addEventListener('mousemove', handleResizeMove, { passive: true })
    document.addEventListener('mouseup', stopResize)
  })

  onUnmounted(() => {
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', stopResize)
  })

  return {
    t,
    EaIcon,
    AppHeader,
    isSidebarVisible,
    sidebarWidth,
    isResizing,
    showSidebar,
    hideSidebar,
    startResize
  }
}
