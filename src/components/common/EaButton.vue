<script setup lang="ts">
/**
 * EaButton - 通用按钮组件
 * 支持 primary/secondary/ghost 三种类型
 */
import { computed } from 'vue'

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

const props = withDefaults(defineProps<EaButtonProps>(), {
  type: 'primary',
  size: 'medium',
  disabled: false,
  loading: false,
  block: false,
  iconPosition: 'left',
  nativeType: 'button'
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

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
</script>

<template>
  <button
    :class="buttonClasses"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span
      v-if="loading"
      class="ea-button__spinner"
    >
      <svg
        viewBox="0 0 24 24"
        class="animate-spin"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="3"
          fill="none"
          stroke-dasharray="31.416"
          stroke-dashoffset="10"
        />
      </svg>
    </span>
    <slot />
  </button>
</template>

<style scoped>
.ea-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  font-family: var(--font-family-sans);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  white-space: nowrap;
  user-select: none;
}

/* 尺寸 */
.ea-button--small {
  height: 28px;
  padding: 0 var(--spacing-2);
  font-size: var(--font-size-xs);
}

.ea-button--medium {
  height: var(--button-height);
  padding: 0 var(--spacing-4);
  font-size: var(--font-size-sm);
}

.ea-button--large {
  height: 44px;
  padding: 0 var(--spacing-6);
  font-size: var(--font-size-base);
}

/* Primary 类型 */
.ea-button--primary {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.ea-button--primary:hover:not(.ea-button--disabled) {
  background-color: var(--color-primary-hover);
}

.ea-button--primary:active:not(.ea-button--disabled) {
  background-color: var(--color-primary-active);
}

/* Secondary 类型 */
.ea-button--secondary {
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.ea-button--secondary:hover:not(.ea-button--disabled) {
  background-color: var(--color-surface-hover);
  border-color: var(--color-border-dark);
}

.ea-button--secondary:active:not(.ea-button--disabled) {
  background-color: var(--color-surface-active);
}

/* Ghost 类型 */
.ea-button--ghost {
  background-color: transparent;
  color: var(--color-text-primary);
}

.ea-button--ghost:hover:not(.ea-button--disabled) {
  background-color: var(--color-surface-hover);
}

.ea-button--ghost:active:not(.ea-button--disabled) {
  background-color: var(--color-surface-active);
}

/* Danger 类型 */
.ea-button--danger {
  background-color: var(--color-error);
  color: var(--color-text-inverse);
}

.ea-button--danger:hover:not(.ea-button--disabled) {
  background-color: var(--color-error-hover, #dc2626);
}

.ea-button--danger:active:not(.ea-button--disabled) {
  background-color: var(--color-error-active, #b91c1c);
}

/* 禁用状态 */
.ea-button--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 加载状态 */
.ea-button--loading {
  cursor: wait;
}

.ea-button__spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.ea-button__spinner svg {
  width: 100%;
  height: 100%;
}

/* 块级按钮 */
.ea-button--block {
  width: 100%;
}

/* 图标位置 */
.ea-button--icon-right {
  flex-direction: row-reverse;
}

/* 焦点样式 */
.ea-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
