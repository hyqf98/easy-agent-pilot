import { computed, nextTick, onBeforeUnmount, ref, watch, type StyleValue } from 'vue'

export interface ImageHoverPreviewProps {
  src: string
  alt: string
  title?: string
  wrapperClass?: string
  imageClass?: string
  wrapperStyle?: StyleValue
  imageStyle?: StyleValue
  previewMaxWidth?: number
  previewMaxHeight?: number
  disabled?: boolean
}

export function useImageHoverPreview(props: ImageHoverPreviewProps) {
  const triggerRef = ref<HTMLElement | null>(null)
  const previewRef = ref<HTMLElement | null>(null)
  const isPreviewVisible = ref(false)
  const previewPosition = ref({ top: 0, left: 0 })

  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  const previewStyle = computed(() => ({
    top: `${previewPosition.value.top}px`,
    left: `${previewPosition.value.left}px`,
    maxWidth: `${props.previewMaxWidth}px`,
    maxHeight: `${props.previewMaxHeight}px`
  }))

  const displayTitle = computed(() => (props.title ?? '').trim() || props.alt.trim())

  function clearShowTimer() {
    if (!showTimer) return
    clearTimeout(showTimer)
    showTimer = null
  }

  function clearHideTimer() {
    if (!hideTimer) return
    clearTimeout(hideTimer)
    hideTimer = null
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
  }

  function updatePreviewPosition() {
    if (!triggerRef.value || !previewRef.value) return

    const triggerRect = triggerRef.value.getBoundingClientRect()
    const previewRect = previewRef.value.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const gap = 14

    const canPlaceRight = triggerRect.right + gap + previewRect.width <= viewportWidth - gap
    const canPlaceLeft = triggerRect.left - gap - previewRect.width >= gap

    const left = canPlaceRight
      ? triggerRect.right + gap
      : canPlaceLeft
        ? triggerRect.left - previewRect.width - gap
        : clamp(
            triggerRect.left + (triggerRect.width - previewRect.width) / 2,
            gap,
            viewportWidth - previewRect.width - gap
          )

    const top = clamp(
      triggerRect.top + (triggerRect.height - previewRect.height) / 2,
      gap,
      viewportHeight - previewRect.height - gap
    )

    previewPosition.value = { top, left }
  }

  function showPreview() {
    if (props.disabled || !props.src) return

    clearHideTimer()
    clearShowTimer()
    showTimer = setTimeout(() => {
      isPreviewVisible.value = true
    }, 110)
  }

  function hidePreview() {
    clearShowTimer()
    clearHideTimer()
    hideTimer = setTimeout(() => {
      isPreviewVisible.value = false
    }, 90)
  }

  function handleViewportChange() {
    if (!isPreviewVisible.value) return
    updatePreviewPosition()
  }

  watch(isPreviewVisible, async visible => {
    if (!visible) return

    await nextTick()
    updatePreviewPosition()
  })

  watch(
    () => props.src,
    () => {
      isPreviewVisible.value = false
      clearShowTimer()
      clearHideTimer()
    }
  )

  watch(isPreviewVisible, visible => {
    if (visible) {
      window.addEventListener('scroll', handleViewportChange, true)
      window.addEventListener('resize', handleViewportChange)
      return
    }

    window.removeEventListener('scroll', handleViewportChange, true)
    window.removeEventListener('resize', handleViewportChange)
  })

  onBeforeUnmount(() => {
    clearShowTimer()
    clearHideTimer()
    window.removeEventListener('scroll', handleViewportChange, true)
    window.removeEventListener('resize', handleViewportChange)
  })

  return {
    triggerRef,
    previewRef,
    isPreviewVisible,
    previewStyle,
    displayTitle,
    showPreview,
    hidePreview
  }
}
