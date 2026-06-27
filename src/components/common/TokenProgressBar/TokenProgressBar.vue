<script setup lang="ts">
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
  usageSegments,
  detailRows,
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
    >
      <span class="token-progress__ring-core">
        <span class="token-progress__ring-value">{{ displayPercentage }}</span>
      </span>
    </div>

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

          <div
            v-if="usageSegments.length > 0"
            class="token-progress__segments"
          >
            <div class="token-progress__segment-bar">
              <span
                v-for="segment in usageSegments"
                :key="segment.key"
                class="token-progress__segment-fill"
                :class="`token-progress__segment-fill--${segment.key}`"
                :style="{ width: segment.width }"
              />
            </div>
            <div class="token-progress__segment-list">
              <div
                v-for="segment in usageSegments"
                :key="segment.key"
                class="token-progress__segment-row"
              >
                <span
                  class="token-progress__segment-dot"
                  :class="`token-progress__segment-dot--${segment.key}`"
                />
                <span class="token-progress__segment-label">{{ segment.label }}</span>
                <span class="token-progress__segment-value">{{ segment.percent < 1 && segment.percent > 0 ? segment.percent.toFixed(1) : Math.round(segment.percent) }}%</span>
              </div>
            </div>
          </div>

          <div class="token-progress__rows">
            <div
              v-for="row in detailRows"
              :key="row.label"
              class="token-progress__row"
            >
              <span class="token-progress__row-label">{{ row.label }}</span>
              <span
                class="token-progress__row-value"
                :class="{ 'token-progress__row-value--mono': row.mono }"
              >
                {{ row.value }}
              </span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </button>
</template>

<style scoped src="./styles.css"></style>
