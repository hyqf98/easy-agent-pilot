<script setup lang="ts">
/** EaTooltip 组件：通用悬浮提示，按 placement 定位并支持延迟（逻辑见 useEaTooltip.ts） */
import { useEaTooltip, type EaTooltipProps } from './useEaTooltip'

const props = withDefaults(defineProps<EaTooltipProps>(), {
  placement: 'top',
  delay: 200,
  disabled: false,
  maxWidth: 250
})

const {
  triggerRef,
  tooltipRef,
  isVisible,
  tooltipStyle,
  handleMouseEnter,
  handleMouseLeave
} = useEaTooltip(props)
</script>

<template>
  <div
    ref="triggerRef"
    class="ea-tooltip-trigger"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @focus="handleMouseEnter"
    @blur="handleMouseLeave"
  >
    <slot />
    <Teleport to="body">
      <Transition name="ea-tooltip">
        <div
          v-if="isVisible"
          ref="tooltipRef"
          :class="['ea-tooltip', `ea-tooltip--${placement}`]"
          :style="tooltipStyle"
          role="tooltip"
        >
          <div class="ea-tooltip__content">
            {{ content }}
          </div>
          <div class="ea-tooltip__arrow" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped src="./styles.css"></style>
