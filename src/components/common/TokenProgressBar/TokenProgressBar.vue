<script setup lang="ts">
/** TokenProgressBar 组件：会话 Token 用量环形进度条，悬停展示明细（逻辑见 useTokenProgressBar.ts） */
import { useTokenProgressBar, type TokenProgressBarEmits, type TokenProgressBarProps } from './useTokenProgressBar'

const props = withDefaults(defineProps<TokenProgressBarProps>(), {
  sessionId: null
})
defineEmits<TokenProgressBarEmits>()

const {
  triggerRef,
  popoverRef,
  showPopover,
  displayPercentage,
  progressStyle,
  ringProgressStyle,
  levelClass,
  summaryText,
  usageMetrics,
  popoverStyle,
  handleMouseEnter,
  handleMouseLeave,
  handleTriggerClick,
  handlePopoverMouseLeave
} = useTokenProgressBar(props)
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="token-progress"
    :class="[levelClass, { 'token-progress--open': showPopover }]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @click="handleTriggerClick"
  >
    <div
      class="token-progress__ring"
      :style="ringProgressStyle"
      aria-hidden="true"
    />

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showPopover"
          ref="popoverRef"
          class="token-progress__popover"
          :style="popoverStyle"
          @mouseenter="showPopover = true"
          @mouseleave="handlePopoverMouseLeave"
        >
          <div class="token-progress__popover-header">
            <div class="token-progress__popover-copy">
              <div class="token-progress__popover-title">
                上下文容量
              </div>
              <div class="token-progress__popover-summary">
                {{ summaryText }}
              </div>
            </div>
            <div class="token-progress__popover-percent">
              {{ displayPercentage }}
            </div>
          </div>

          <div class="token-progress__popover-bar">
            <div
              class="token-progress__fill"
              :style="progressStyle"
            />
          </div>

          <div class="token-progress__rows">
            <div class="token-progress__row">
              <span class="token-progress__row-label">输入 token</span>
              <span class="token-progress__row-value token-progress__row-value--mono">{{ usageMetrics.inputLabel }}</span>
            </div>
            <div class="token-progress__row">
              <span class="token-progress__row-label">输出 token</span>
              <span class="token-progress__row-value token-progress__row-value--mono">{{ usageMetrics.outputLabel }}</span>
            </div>
            <div class="token-progress__row">
              <span class="token-progress__row-label">缓存命中率</span>
              <span class="token-progress__row-value token-progress__row-value--mono">{{ usageMetrics.cacheHitRateLabel }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </button>
</template>

<style scoped src="./styles.css"></style>
