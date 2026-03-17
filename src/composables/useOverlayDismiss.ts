import { ref } from 'vue'

export function useOverlayDismiss(onDismiss: () => void) {
  const pointerDownOnOverlay = ref(false)

  const handleOverlayPointerDown = (event: PointerEvent) => {
    pointerDownOnOverlay.value = event.target === event.currentTarget
  }

  const handleOverlayClick = (event: MouseEvent) => {
    const shouldDismiss = pointerDownOnOverlay.value && event.target === event.currentTarget
    pointerDownOnOverlay.value = false

    if (shouldDismiss) {
      onDismiss()
    }
  }

  return {
    handleOverlayPointerDown,
    handleOverlayClick
  }
}
