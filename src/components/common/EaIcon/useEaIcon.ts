import { computed } from 'vue'
import * as LucideIcons from 'lucide-vue-next'

/**
 * EaIcon - 图标组件
 * 基于 lucide-vue-next 封装
 */

export interface EaIconProps {
  name: string
  size?: number | string
  color?: string
  strokeWidth?: number
  spin?: boolean
}

export function useEaIcon(props: EaIconProps) {
  // 动态获取图标组件
  const iconComponent = computed(() => {
    // 移除 lucide: 前缀（如果存在）
    let iconName = props.name
    if (iconName.startsWith('lucide:')) {
      iconName = iconName.slice(7)
    }

    // 转换图标名称：kebab-case -> PascalCase
    const pascalCase = iconName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')

    const icons = LucideIcons as Record<string, unknown>
    return icons[pascalCase] || icons[`${pascalCase}Icon`] || null
  })

  const iconStyle = computed(() => ({
    width: typeof props.size === 'number' ? `${props.size}px` : props.size,
    height: typeof props.size === 'number' ? `${props.size}px` : props.size,
    color: props.color || 'currentColor'
  }))

  const parsedSize = computed(() =>
    typeof props.size === 'number' ? props.size : parseInt(props.size as string)
  )

  return {
    iconComponent,
    iconStyle,
    parsedSize
  }
}
