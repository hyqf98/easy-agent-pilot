/** useEaStateBlock — EaStateBlock 状态占位组件的 composable，根据 loading/error/empty/success 变体派生展示图标。 */
import { computed } from 'vue'
import EaIcon from '../EaIcon/EaIcon.vue'

type StateVariant = 'loading' | 'error' | 'empty' | 'success'

export interface EaStateBlockProps {
  variant?: StateVariant
  title?: string
  description?: string
  icon?: string
}

export function useEaStateBlock(props: EaStateBlockProps) {
  const resolvedIcon = computed(() => {
    if (props.icon) {
      return props.icon
    }

    if (props.variant === 'loading') {
      return 'loader'
    }

    if (props.variant === 'error') {
      return 'alert-circle'
    }

    if (props.variant === 'success') {
      return 'check-circle'
    }

    return 'inbox'
  })

  return {
    resolvedIcon,
    EaIcon
  }
}
