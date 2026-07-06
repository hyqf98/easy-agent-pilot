/** usePanelResizer — PanelResizer 面板拖拽分隔条组件的 composable，计算拖拽过程中宽度变化并约束在最小/最大范围内。 */
import { ref, onUnmounted } from 'vue'

export interface PanelResizerProps {
  direction?: 'left' | 'right'
  minWidth?: number
  maxWidth?: number
  disabled?: boolean
  currentWidth?: number
}

export interface PanelResizerEmits {
  (event: 'resize', delta: number): void
  (event: 'resizeEnd', width: number): void
  (event: 'resizeStart'): void
}

export function usePanelResizer(props: PanelResizerProps, emit: PanelResizerEmits) {
  const isDragging = ref(false)
  const startX = ref(0)
  const startWidth = ref(0)
  let rafId = 0
  let pendingDelta = 0
  let hasPending = false

  function flushDelta() {
    if (hasPending) {
      emit('resize', pendingDelta)
      hasPending = false
    }
  }

  const handleMouseDown = (e: MouseEvent) => {
    if (props.disabled) return

    e.preventDefault()
    isDragging.value = true
    startX.value = e.clientX
    startWidth.value = props.currentWidth ?? 0
    emit('resizeStart')
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.value) return

    const delta = props.direction === 'right'
      ? e.clientX - startX.value
      : startX.value - e.clientX

    pendingDelta = delta
    if (!hasPending) {
      hasPending = true
      rafId = requestAnimationFrame(flushDelta)
    }
  }

  const handleMouseUp = (e: MouseEvent) => {
    if (!isDragging.value) return

    cancelAnimationFrame(rafId)
    hasPending = false
    isDragging.value = false

    const delta = props.direction === 'right'
      ? e.clientX - startX.value
      : startX.value - e.clientX

    emit('resizeEnd', startWidth.value + delta)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  onUnmounted(() => {
    cancelAnimationFrame(rafId)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  })

  return {
    isDragging,
    handleMouseDown
  }
}
