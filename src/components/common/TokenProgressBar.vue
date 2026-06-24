<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EaIcon } from '@/components/common'
import { formatTokenCount, useTokenStore, type TokenLevel } from '@/stores/token'
import { useSessionStore } from '@/stores/session'

const props = withDefaults(defineProps<{
  sessionId?: string | null
}>(), {
  sessionId: null
})

const emit = defineEmits<{
  (e: 'compress'): void
}>()

const tokenStore = useTokenStore()
const sessionStore = useSessionStore()

const triggerRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const showPopover = ref(false)
const isPinnedOpen = ref(false)
const popoverPosition = ref({ top: 0, left: 0 })

const targetSessionId = computed(() => props.sessionId ?? sessionStore.currentSessionId ?? null)

const tokenUsage = computed(() => {
  if (!targetSessionId.value) {
    return {
      used: 0,
      limit: 128000,
      percentage: 0,
      level: 'safe' as TokenLevel
    }
  }

  return tokenStore.getTokenUsageDetails(targetSessionId.value)
})

const displayPercentage = computed(() => {
  const percentage = tokenUsage.value.percentage
  if (percentage === 0) {
    return '0%'
  }

  return `${percentage < 10 ? percentage.toFixed(1) : Math.round(percentage)}%`
})

const usageBasis = computed(() => {
  const occupancy = tokenUsage.value.contextWindowOccupancy
  if (typeof occupancy === 'number' && occupancy > 0) {
    return occupancy
  }

  return tokenUsage.value.used
})

const progressStyle = computed(() => ({
  width: usageBasis.value > 0 && tokenUsage.value.percentage > 0 && tokenUsage.value.percentage < 1
    ? '1%'
    : `${Math.min(100, tokenUsage.value.percentage)}%`
}))

const levelClass = computed(() => `token-progress--${tokenUsage.value.level}`)

const summaryText = computed(() => `${formatTokenCount(tokenUsage.value.used)} / ${formatTokenCount(tokenUsage.value.limit)}`)

const segmentPalette = ['input', 'output', 'cache-read', 'cache-write', 'context'] as const

const usageSegments = computed(() => {
  const rawSegments = [
    {
      key: 'input',
      label: '输入',
      value: tokenUsage.value.inputTokens
    },
    {
      key: 'output',
      label: '输出',
      value: tokenUsage.value.outputTokens
    },
    {
      key: 'cache-read',
      label: '缓存读取',
      value: tokenUsage.value.cacheReadInputTokens
    },
    {
      key: 'cache-write',
      label: '缓存写入',
      value: tokenUsage.value.cacheCreationInputTokens
    }
  ]

  const knownTotal = rawSegments.reduce((total, segment) => (
    total + (typeof segment.value === 'number' && segment.value > 0 ? segment.value : 0)
  ), 0)
  const remainder = Math.max(0, usageBasis.value - knownTotal)
  const segments = rawSegments
    .filter((segment): segment is { key: typeof segmentPalette[number], label: string, value: number } => (
      typeof segment.value === 'number' && segment.value > 0
    ))

  if (remainder > 0) {
    segments.push({
      key: 'context',
      label: '上下文其他占用',
      value: remainder
    })
  }

  return segments.map(segment => ({
    ...segment,
    valueLabel: formatTokenCount(segment.value),
    percent: usageBasis.value > 0 ? Math.min(100, Math.max(0, (segment.value / usageBasis.value) * 100)) : 0,
    width: usageBasis.value > 0 ? `${Math.max(1, (segment.value / usageBasis.value) * 100)}%` : '0%'
  }))
})

const cacheHitRateLabel = computed(() => {
  const cacheRead = tokenUsage.value.cacheReadInputTokens
  const inputTokens = tokenUsage.value.inputTokens
  if (typeof cacheRead !== 'number' || typeof inputTokens !== 'number' || inputTokens <= 0) {
    return null
  }

  return `${Math.round((cacheRead / inputTokens) * 100)}%`
})

const detailRows = computed(() => {
  const rows: Array<{ label: string, value: string, mono?: boolean }> = [
    {
      label: '总占用',
      value: formatTokenCount(usageBasis.value),
      mono: true
    },
    {
      label: '上下文上限',
      value: formatTokenCount(tokenUsage.value.limit),
      mono: true
    },
    {
      label: '占比',
      value: displayPercentage.value,
      mono: true
    }
  ]

  if (cacheHitRateLabel.value) {
    rows.push({
      label: '平均缓存命中率',
      value: cacheHitRateLabel.value,
      mono: true
    })
  }

  if (tokenUsage.value.model) {
    rows.push({
      label: '模型',
      value: tokenUsage.value.model
    })
  }

  return rows
})

const popoverStyle = computed(() => ({
  top: `${popoverPosition.value.top}px`,
  left: `${popoverPosition.value.left}px`,
  transform: 'translateX(-100%)'
}))

function updatePopoverPosition() {
  if (!triggerRef.value) {
    return
  }

  const rect = triggerRef.value.getBoundingClientRect()
  popoverPosition.value = {
    top: rect.bottom + 10,
    left: rect.right
  }
}

function openPopover(pin: boolean = false) {
  updatePopoverPosition()
  showPopover.value = true
  isPinnedOpen.value = pin
}

function closePopover(force: boolean = false) {
  if (!force && isPinnedOpen.value) {
    return
  }

  showPopover.value = false
  if (force) {
    isPinnedOpen.value = false
  }
}

function handleMouseEnter() {
  openPopover(false)
}

function handleMouseLeave() {
  closePopover(false)
}

function handleTriggerClick() {
  if (showPopover.value && isPinnedOpen.value) {
    closePopover(true)
    return
  }

  openPopover(true)
}

function handlePopoverMouseLeave() {
  closePopover(false)
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (
    (triggerRef.value && target && triggerRef.value.contains(target))
    || (popoverRef.value && target && popoverRef.value.contains(target))
  ) {
    return
  }

  closePopover(true)
}

function handleWindowChange() {
  closePopover(true)
}

function handleCompress(event: MouseEvent) {
  event.stopPropagation()
  closePopover(true)
  emit('compress')
}

watch(targetSessionId, () => {
  closePopover(true)
})

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('resize', handleWindowChange)
  window.addEventListener('scroll', handleWindowChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('resize', handleWindowChange)
  window.removeEventListener('scroll', handleWindowChange, true)
})
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
    <div class="token-progress__header">
      <div class="token-progress__copy">
        <span class="token-progress__label">上下文容量</span>
        <span class="token-progress__summary">{{ summaryText }}</span>
      </div>
      <div class="token-progress__meta">
        <span class="token-progress__percent">{{ displayPercentage }}</span>
        <EaIcon
          :name="showPopover ? 'chevron-up' : 'chevron-down'"
          :size="12"
        />
      </div>
    </div>

    <div class="token-progress__bar">
      <div
        class="token-progress__fill"
        :style="progressStyle"
      />
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
                <span class="token-progress__segment-value">{{ segment.valueLabel }} · {{ Math.round(segment.percent) }}%</span>
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

          <button
            type="button"
            class="token-progress__action"
            @click="handleCompress"
          >
            <EaIcon
              name="archive"
              :size="13"
            />
            <span>压缩上下文</span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </button>
</template>

<style scoped>
.token-progress {
  --token-progress-width: min(100%, 240px);
  --token-progress-gap: 8px;
  --token-progress-padding: 10px 12px;
  --token-progress-radius: 14px;
  --token-progress-border-color: var(--workspace-border, rgba(38, 38, 38, 0.1));
  --token-progress-bg: color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 92%, var(--workspace-panel-bg, #ffffff));
  --token-progress-shadow: 0 8px 18px rgba(24, 24, 22, 0.05);
  --token-progress-hover-shadow: 0 12px 24px rgba(24, 24, 22, 0.08);
  --token-progress-label-size: 11px;
  --token-progress-summary-size: 11px;
  --token-progress-percent-size: 12px;
  --token-progress-bar-height: 5px;
  --token-progress-popover-width: min(340px, calc(100vw - 24px));
  --token-progress-popover-radius: 18px;
  --token-progress-popover-shadow: 0 24px 48px rgba(15, 23, 42, 0.16);
  --token-progress-action-height: 38px;
  display: flex;
  flex-direction: column;
  gap: var(--token-progress-gap);
  width: var(--token-progress-width);
  padding: var(--token-progress-padding);
  border-radius: var(--token-progress-radius);
  border: 1px solid var(--token-progress-border-color);
  background: var(--token-progress-bg);
  box-shadow: var(--token-progress-shadow);
  color: var(--workspace-text-primary, var(--color-text-primary, #20201e));
  cursor: pointer;
  user-select: none;
  appearance: none;
  text-align: inherit;
  transition: border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.token-progress:hover,
.token-progress--open {
  border-color: color-mix(in srgb, var(--color-primary, #2563eb) 22%, var(--workspace-border, rgba(38, 38, 38, 0.1)));
  box-shadow: var(--token-progress-hover-shadow);
  transform: translateY(-1px);
}

.token-progress:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--color-primary, #2563eb) 34%, var(--workspace-border, rgba(38, 38, 38, 0.1)));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--color-primary, #2563eb) 12%, transparent),
    0 18px 32px rgba(15, 23, 42, 0.12);
}

.token-progress__header,
.token-progress__meta,
.token-progress__popover-header,
.token-progress__row,
.token-progress__action {
  display: flex;
  align-items: center;
}

.token-progress__header,
.token-progress__popover-header,
.token-progress__row {
  justify-content: space-between;
}

.token-progress__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  text-align: left;
}

.token-progress__label {
  font-size: var(--token-progress-label-size);
  font-weight: 600;
  color: var(--workspace-text-primary, var(--color-text-primary, #20201e));
}

.token-progress__summary {
  font-size: var(--token-progress-summary-size);
  color: var(--color-text-secondary, rgba(100, 116, 139, 0.86));
  white-space: nowrap;
}

.token-progress__meta {
  gap: 8px;
  flex-shrink: 0;
  color: var(--color-text-secondary, rgba(100, 116, 139, 0.86));
}

.token-progress__percent {
  font-size: var(--token-progress-percent-size);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.token-progress__bar,
.token-progress__popover-bar {
  width: 100%;
  height: var(--token-progress-bar-height);
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 72%, var(--workspace-border, rgba(38, 38, 38, 0.1)));
}

.token-progress__fill {
  height: 100%;
  border-radius: inherit;
  transition: width 0.24s ease;
}

.token-progress--safe .token-progress__fill {
  background: linear-gradient(90deg, #38bdf8, #60a5fa);
}

.token-progress--warning .token-progress__fill {
  background: linear-gradient(90deg, #facc15, #f59e0b);
}

.token-progress--danger .token-progress__fill {
  background: linear-gradient(90deg, #fb7185, #f97316);
}

.token-progress--critical .token-progress__fill {
  background: linear-gradient(90deg, #f87171, #ef4444);
}

.token-progress__segments {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--workspace-border, rgba(38, 38, 38, 0.1)) 84%, transparent);
  background: color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 72%, transparent);
}

.token-progress__segment-bar {
  display: flex;
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--workspace-border, rgba(38, 38, 38, 0.1)) 45%, transparent);
}

.token-progress__segment-fill {
  min-width: 2px;
  height: 100%;
}

.token-progress__segment-fill--input,
.token-progress__segment-dot--input {
  background: #38bdf8;
}

.token-progress__segment-fill--output,
.token-progress__segment-dot--output {
  background: #34d399;
}

.token-progress__segment-fill--cache-read,
.token-progress__segment-dot--cache-read {
  background: #a78bfa;
}

.token-progress__segment-fill--cache-write,
.token-progress__segment-dot--cache-write {
  background: #f59e0b;
}

.token-progress__segment-fill--context,
.token-progress__segment-dot--context {
  background: #94a3b8;
}

.token-progress__segment-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.token-progress__segment-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.token-progress__segment-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.token-progress__segment-label,
.token-progress__segment-value {
  min-width: 0;
  font-size: 12px;
}

.token-progress__segment-label {
  color: var(--color-text-secondary, rgba(100, 116, 139, 0.86));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-progress__segment-value {
  color: var(--workspace-text-primary, var(--color-text-primary, #20201e));
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.token-progress__popover {
  position: fixed;
  width: var(--token-progress-popover-width);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: var(--token-progress-popover-radius);
  border: 1px solid var(--workspace-border, rgba(38, 38, 38, 0.1));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary, #2563eb) 12%, transparent), transparent 36%),
    color-mix(in srgb, var(--workspace-panel-bg, #ffffff) 98%, transparent);
  box-shadow: var(--token-progress-popover-shadow);
  color: var(--workspace-text-primary, var(--color-text-primary, #20201e));
  z-index: 9999;
}

.token-progress__popover-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.token-progress__popover-title {
  font-size: 15px;
  font-weight: 700;
}

.token-progress__popover-summary {
  font-size: 12px;
  color: var(--color-text-secondary, rgba(100, 116, 139, 0.86));
}

.token-progress__popover-percent {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 92%, transparent);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.token-progress__rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.token-progress__row {
  gap: 16px;
}

.token-progress__row-label {
  font-size: 12px;
  color: var(--color-text-secondary, rgba(100, 116, 139, 0.86));
}

.token-progress__row-value {
  min-width: 0;
  text-align: right;
  font-size: 12px;
  color: var(--workspace-text-primary, var(--color-text-primary, #20201e));
}

.token-progress__row-value--mono {
  font-variant-numeric: tabular-nums;
}

.token-progress__action {
  justify-content: center;
  gap: 8px;
  min-height: var(--token-progress-action-height);
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary, #2563eb) 18%, var(--workspace-border, rgba(38, 38, 38, 0.1)));
  background: color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 92%, var(--color-primary, #2563eb));
  color: var(--workspace-text-primary, var(--color-text-primary, #20201e));
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.token-progress__action:hover {
  border-color: color-mix(in srgb, var(--color-primary, #2563eb) 30%, var(--workspace-border, rgba(38, 38, 38, 0.1)));
  background: color-mix(in srgb, var(--workspace-control-bg, rgba(255, 255, 255, 0.68)) 84%, var(--color-primary, #2563eb));
}

@media (max-width: 720px) {
  .token-progress {
    width: 100%;
  }

  .token-progress__popover {
    width: min(320px, calc(100vw - 20px));
  }

  .token-progress__segment-row {
    grid-template-columns: 8px minmax(0, 1fr);
  }

  .token-progress__segment-value {
    grid-column: 2;
    text-align: left;
  }
}
</style>
