import { computed } from 'vue'

/**
 * EaLoading - 加载指示器组件
 */

export type EaLoadingSize = 'sm' | 'md' | 'lg'

export interface EaLoadingProps {
  message?: string
  size?: EaLoadingSize
}

export function useEaLoading(props: EaLoadingProps) {
  const loadingClasses = computed(() => [
    'ea-loading',
    `ea-loading--${props.size}`
  ])

  return {
    loadingClasses
  }
}
