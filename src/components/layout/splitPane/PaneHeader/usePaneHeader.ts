import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'

export interface PaneHeaderProps {
  title: string
  isFocused: boolean
  canClose: boolean
}

export interface PaneHeaderEmits {
  (event: 'close'): void
  (event: 'focus'): void
  (event: 'dragstart', e: DragEvent): void
  (event: 'dragend'): void
}

export function usePaneHeader() {
  const { t } = useI18n()
  return { t, EaIcon }
}
