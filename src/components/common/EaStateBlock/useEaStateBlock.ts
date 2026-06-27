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
