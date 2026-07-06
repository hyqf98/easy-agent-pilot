/** usePaneHeader — PaneHeader 分屏窗格标题栏组件的 composable，负责标题展示、聚焦高亮、关闭与拖拽事件透传。 */
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
