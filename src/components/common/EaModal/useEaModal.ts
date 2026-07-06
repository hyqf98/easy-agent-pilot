/** useEaModal — EaModal 通用模态框组件的 composable，负责可见性驱动的 body 滚动锁定与遮罩/ESC 关闭交互。 */
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
