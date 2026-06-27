import { computed } from 'vue'

/**
 * EaProgressBar - 进度条组件
 * 支持确定进度和不确定进度两种模式
 */

export interface EaProgressBarProps {
  /** 进度值 (0-100，-1 表示不确定进度) */
  value?: number
  /** 最大值 */
  max?: number
  /** 是否显示百分比文本 */
  showText?: boolean
  /** 尺寸 */
  size?: 'small' | 'medium' | 'large'
  /** 颜色主题 */
  variant?: 'primary' | 'success' | 'warning' | 'error'
  /** 是否带条纹动画 */
  striped?: boolean
  /** 是否动画（配合 striped 使用） */
  animated?: boolean
}

export function useEaProgressBar(props: EaProgressBarProps) {
  const value = () => props.value ?? -1
  const max = () => props.max ?? 100

  // 计算百分比
  const percentage = computed(() => {
    if (value() < 0) return 0
    return Math.min(100, Math.max(0, (value() / max()) * 100))
  })

  // 是否是不确定进度
  const isIndeterminate = computed(() => value() < 0)

  // 进度条样式
  const progressStyle = computed(() => ({
    width: isIndeterminate.value ? '100%' : `${percentage.value}%`
  }))

  // 容器类
  const containerClasses = computed(() => [
    'ea-progress-bar',
    `ea-progress-bar--${props.size}`,
    `ea-progress-bar--${props.variant}`,
    {
      'ea-progress-bar--indeterminate': isIndeterminate.value,
      'ea-progress-bar--striped': props.striped,
      'ea-progress-bar--animated': props.animated
    }
  ])

  return {
    percentage,
    isIndeterminate,
    progressStyle,
    containerClasses
  }
}
