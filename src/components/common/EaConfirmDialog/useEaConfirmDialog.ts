/** useEaConfirmDialog — EaConfirmDialog 确认对话框组件的 composable，负责危险/警告操作的确认交互、ESC/遮罩关闭与按钮聚焦。 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import EaButton from '../EaButton/EaButton.vue'
import EaIcon from '../EaIcon/EaIcon.vue'

/**
 * EaConfirmDialog - 确认对话框组件
 * 用于危险操作的警告提示，需要用户确认
 */

export type ConfirmDialogType = 'warning' | 'danger' | 'info'

export interface EaConfirmDialogProps {
  visible?: boolean
  type?: ConfirmDialogType
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmButtonType?: 'primary' | 'danger'
}

export interface EaConfirmDialogEmits {
  (event: 'update:visible', value: boolean): void
  (event: 'confirm'): void
  (event: 'cancel'): void
}

export function useEaConfirmDialog(
  props: EaConfirmDialogProps,
  emit: EaConfirmDialogEmits
) {
  const { t } = useI18n()

  const iconMap: Record<ConfirmDialogType, string> = {
    warning: 'alert-triangle',
    danger: 'circle-alert',
    info: 'info'
  }

  const dialogRef = ref<HTMLElement | null>(null)
  const cancelButtonRef = ref<InstanceType<typeof EaButton> | null>(null)

  // Generate a unique ID for accessibility
  const dialogId = `dialog-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  const handleConfirm = () => {
    emit('confirm')
  }

  const handleCancel = () => {
    emit('cancel')
    emit('update:visible', false)
  }

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel()
    }
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (!props.visible) return

    if (e.key === 'Escape') {
      handleCancel()
    } else if (e.key === 'Enter') {
      const activeElement = document.activeElement
      if (activeElement?.tagName !== 'BUTTON') {
        handleConfirm()
      }
    }
  }

  // Focus management - focus cancel button when dialog opens
  watch(() => props.visible, async (visible) => {
    document.body.style.overflow = visible ? 'hidden' : ''

    if (visible) {
      await nextTick()
      // Focus the cancel button for safety (less destructive action)
      if (cancelButtonRef.value?.$el) {
        cancelButtonRef.value.$el.focus()
      }
    }
  })

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return {
    t,
    iconMap,
    dialogRef,
    cancelButtonRef,
    dialogId,
    handleConfirm,
    handleCancel,
    handleOverlayClick,
    EaButton,
    EaIcon
  }
}
