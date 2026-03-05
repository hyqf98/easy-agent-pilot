<script setup lang="ts">
/**
 * EaTooltip - 工具提示组件
 * 支持 placement 和 delay 配置
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface EaTooltipProps {
  content: string
  placement?: TooltipPlacement
  delay?: number
  disabled?: boolean
  maxWidth?: number | string
}

const props = withDefaults(defineProps<EaTooltipProps>(), {
  placement: 'top',
  delay: 200,
  disabled: false,
  maxWidth: 250
})

const isVisible = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const tooltipRef = ref<HTMLElement | null>(null)
const tooltipPosition = ref({ top: 0, left: 0 })

let showTimeout: ReturnType<typeof setTimeout> | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null

const tooltipStyle = computed(() => ({
  position: 'fixed' as const,
  top: `${tooltipPosition.value.top}px`,
  left: `${tooltipPosition.value.left}px`,
  maxWidth: typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth
}))

const calculatePosition = () => {
  if (!triggerRef.value || !tooltipRef.value) return

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const tooltipRect = tooltipRef.value.getBoundingClientRect()
  const gap = 8

  let top = 0
  let left = 0

  switch (props.placement) {
    case 'top':
      top = triggerRect.top - tooltipRect.height - gap
      left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
      break
    case 'bottom':
      top = triggerRect.bottom + gap
      left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
      break
    case 'left':
      top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
      left = triggerRect.left - tooltipRect.width - gap
      break
    case 'right':
      top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
      left = triggerRect.right + gap
      break
  }

  // 边界检测
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  if (left < 0) left = gap
  if (left + tooltipRect.width > viewportWidth) {
    left = viewportWidth - tooltipRect.width - gap
  }
  if (top < 0) top = gap
  if (top + tooltipRect.height > viewportHeight) {
    top = viewportHeight - tooltipRect.height - gap
  }

  tooltipPosition.value = { top, left }
}

const show = () => {
  if (props.disabled || props.content === '') return

  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  showTimeout = setTimeout(() => {
    isVisible.value = true
    // 等待 DOM 更新后计算位置
    requestAnimationFrame(() => {
      calculatePosition()
    })
  }, props.delay)
}

const hide = () => {
  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }

  hideTimeout = setTimeout(() => {
    isVisible.value = false
  }, 100)
}

const handleMouseEnter = () => show()
const handleMouseLeave = () => hide()

// 监听窗口滚动和大小变化
const handleUpdate = () => {
  if (isVisible.value) {
    calculatePosition()
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleUpdate, true)
  window.addEventListener('resize', handleUpdate)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleUpdate, true)
  window.removeEventListener('resize', handleUpdate)
  if (showTimeout) clearTimeout(showTimeout)
  if (hideTimeout) clearTimeout(hideTimeout)
})

// 监听 disabled 变化
watch(() => props.disabled, (disabled) => {
  if (disabled && isVisible.value) {
    isVisible.value = false
  }
})
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

<style scoped>
.ea-tooltip-trigger {
  display: inline-flex;
}

.ea-tooltip {
  z-index: var(--z-tooltip);
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  pointer-events: none;
}

.ea-tooltip__content {
  word-wrap: break-word;
}

.ea-tooltip__arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background-color: var(--color-bg-elevated);
  transform: rotate(45deg);
}

.ea-tooltip--top .ea-tooltip__arrow {
  bottom: -4px;
  left: 50%;
  margin-left: -4px;
}

.ea-tooltip--bottom .ea-tooltip__arrow {
  top: -4px;
  left: 50%;
  margin-left: -4px;
}

.ea-tooltip--left .ea-tooltip__arrow {
  right: -4px;
  top: 50%;
  margin-top: -4px;
}

.ea-tooltip--right .ea-tooltip__arrow {
  left: -4px;
  top: 50%;
  margin-top: -4px;
}

/* 过渡动画 */
.ea-tooltip-enter-active,
.ea-tooltip-leave-active {
  transition: opacity var(--transition-fast) var(--easing-default),
              transform var(--transition-fast) var(--easing-default);
}

.ea-tooltip-enter-from,
.ea-tooltip-leave-to {
  opacity: 0;
}

.ea-tooltip--top.ea-tooltip-enter-from,
.ea-tooltip--top.ea-tooltip-leave-to {
  transform: translateY(4px);
}

.ea-tooltip--bottom.ea-tooltip-enter-from,
.ea-tooltip--bottom.ea-tooltip-leave-to {
  transform: translateY(-4px);
}

.ea-tooltip--left.ea-tooltip-enter-from,
.ea-tooltip--left.ea-tooltip-leave-to {
  transform: translateX(4px);
}

.ea-tooltip--right.ea-tooltip-enter-from,
.ea-tooltip--right.ea-tooltip-leave-to {
  transform: translateX(-4px);
}
</style>
