import { watch } from 'vue'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'

export interface EaModalProps {
  visible: boolean
  contentClass?: string
  overlayClass?: string
}

export interface EaModalEmits {
  (event: 'update:visible', value: boolean): void
}

export function useEaModal(props: EaModalProps, emit: EaModalEmits) {
  // 控制 body 滚动
  watch(() => props.visible, (newVal) => {
    if (newVal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  })

  function close() {
    emit('update:visible', false)
  }

  const { handleOverlayPointerDown, handleOverlayClick } = useOverlayDismiss(close)

  return {
    handleOverlayPointerDown,
    handleOverlayClick
  }
}
