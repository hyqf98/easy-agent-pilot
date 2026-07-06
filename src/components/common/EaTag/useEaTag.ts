/** useEaTag — EaTag 标签组件的 composable，根据 variant / size / rounded 派生 class 集合。 */
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
