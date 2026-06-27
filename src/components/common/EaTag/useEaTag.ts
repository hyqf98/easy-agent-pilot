import { computed } from 'vue'

export type EaTagVariant = 'default' | 'primary' | 'success' | 'info' | 'warning' | 'danger'
export type EaTagSize = 'sm' | 'md'

export interface EaTagProps {
  variant?: EaTagVariant
  size?: EaTagSize
  rounded?: boolean
}

export function useEaTag(props: EaTagProps) {
  const tagClasses = computed(() => [
    'ea-tag',
    `ea-tag--${props.variant}`,
    `ea-tag--${props.size}`,
    {
      'ea-tag--rounded': props.rounded
    }
  ])

  return {
    tagClasses
  }
}
