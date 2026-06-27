import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'

export interface UnifiedPanelConfirmDialogProps {
  visible: boolean
  title: string
  message: string
}

export interface UnifiedPanelConfirmDialogEmits {
  (event: 'update:visible', value: boolean): void
  (event: 'cancel'): void
  (event: 'confirm'): void
}

export function useUnifiedPanelConfirmDialog(
  props: UnifiedPanelConfirmDialogProps,
  emit: UnifiedPanelConfirmDialogEmits
) {
  const { t } = useI18n()

  const dialogVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value)
  })

  function handleClose() {
    emit('update:visible', false)
    emit('cancel')
  }

  return {
    t,
    dialogVisible,
    handleClose,
    EaButton,
    EaIcon
  }
}
