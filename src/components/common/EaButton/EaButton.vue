<script setup lang="ts">
/** EaButton 组件：通用按钮的展示与点击交互（逻辑见 useEaButton.ts） */
import {
  useEaButton,
  type EaButtonEmits,
  type EaButtonProps
} from './useEaButton'

const props = withDefaults(defineProps<EaButtonProps>(), {
  type: 'primary',
  size: 'medium',
  disabled: false,
  loading: false,
  block: false,
  iconPosition: 'left',
  nativeType: 'button'
})
const emit = defineEmits<EaButtonEmits>()

const { buttonClasses, handleClick } = useEaButton(props, emit)
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

<style scoped src="./styles.css"></style>
