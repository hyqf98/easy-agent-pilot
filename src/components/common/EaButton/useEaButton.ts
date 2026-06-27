import { computed } from 'vue'

/**
 * EaButton - 通用按钮组件
 * 支持 primary/secondary/ghost/danger 四种类型
 */

export type ButtonType = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'small' | 'medium' | 'large'

export interface EaButtonProps {
  type?: ButtonType
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  block?: boolean
  icon?: string
  iconPosition?: 'left' | 'right'
  nativeType?: 'button' | 'submit' | 'reset'
}

export interface EaButtonEmits {
  (event: 'click', value: MouseEvent): void
}

export function useEaButton(props: EaButtonProps, emit: EaButtonEmits) {
  const buttonClasses = computed(() => [
    'ea-button',
    `ea-button--${props.type}`,
    `ea-button--${props.size}`,
    {
      'ea-button--disabled': props.disabled,
      'ea-button--loading': props.loading,
      'ea-button--block': props.block,
      'ea-button--icon-right': props.iconPosition === 'right'
    }
  ])

  const handleClick = (event: MouseEvent) => {
    if (!props.disabled && !props.loading) {
      emit('click', event)
    }
  }

  return {
    buttonClasses,
    handleClick
  }
}
