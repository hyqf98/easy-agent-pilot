<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatTokenCount, useTokenStore, type TokenLevel } from '@/stores/token'
import { useSessionStore } from '@/stores/session'

const props = withDefaults(defineProps<{
  sessionId?: string | null
}>(), {
  sessionId: null
})

defineEmits<{
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

const ringProgressStyle = computed(() => ({
  '--token-progress-ring-value': `${Math.min(100, Math.max(0, tokenUsage.value.percentage)) * 3.6}deg`
}))

const levelClass = computed(() => `token-progress--${tokenUsage.value.level}`)

const summaryText = computed(() => `${formatTokenCount(tokenUsage.value.used)} / ${formatTokenCount(tokenUsage.value.limit)}`)

const usageSegments = computed(() => {
  const knownToolTokens = (tokenUsage.value.cacheReadInputTokens ?? 0) + (tokenUsage.value.cacheCreationInputTokens ?? 0)
  const knownMessageTokens = (tokenUsage.value.inputTokens ?? 0) + (tokenUsage.value.outputTokens ?? 0)
  const otherTokens = Math.max(0, usageBasis.value - knownMessageTokens - knownToolTokens)
  const rawSegments = [
    {
      key: 'input',
      label: '消息',
      value: knownMessageTokens
    },
    {
      key: 'output',
      label: 'MCP 工具',
      value: tokenUsage.value.cacheReadInputTokens
    },
    {
      key: 'cache-read',
      label: '系统工具',
      value: tokenUsage.value.cacheCreationInputTokens
    },
    {
      key: 'cache-write',
      label: '其他',
      value: otherTokens
    },
    {
      key: 'context',
      label: '系统提示词',
      value: 0
    },
    {
      key: 'skill',
      label: '技能',
      value: 0
    }
  ]

  return rawSegments.map(segment => ({
    ...segment,
    value: segment.value ?? 0,
    valueLabel: formatTokenCount(segment.value ?? 0),
    percent: usageBasis.value > 0 ? Math.min(100, Math.max(0, ((segment.value ?? 0) / usageBasis.value) * 100)) : 0,
    width: usageBasis.value > 0 && (segment.value ?? 0) > 0 ? `${Math.max(1, ((segment.value ?? 0) / usageBasis.value) * 100)}%` : '0%'
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
  transform: 'translate(-50%, -100%)'
}))

function updatePopoverPosition() {
  if (!triggerRef.value) {
    return
  }

  const rect = triggerRef.value.getBoundingClientRect()
  const popoverWidth = Math.min(340, Math.max(0, window.innerWidth - 24))
  const halfWidth = popoverWidth / 2
  const center = rect.left + rect.width / 2
  popoverPosition.value = {
    top: Math.max(12 + 1, rect.top - 10),
    left: Math.min(window.innerWidth - halfWidth - 12, Math.max(halfWidth + 12, center))
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

<style scoped>
.token-progress {
  --token-progress-size: 32px;
  --token-progress-ring-value: 0deg;
  --token-progress-ring-track: color-mix(in srgb, var(--workspace-border, rgba(38, 38, 38, 0.1)) 62%, transparent);
  --token-progress-ring-color: #60a5fa;
  --token-progress-width: var(--token-progress-size);
  --token-progress-gap: 0;
  --token-progress-padding: 0;
  --token-progress-radius: 999px;
  --token-progress-border-color: var(--workspace-border, rgba(38, 38, 38, 0.1));
  --token-progress-bg: transparent;
  --token-progress-shadow: none;
  --token-progress-hover-shadow: none;
  --token-progress-label-size: 11px;
  --token-progress-summary-size: 11px;
  --token-progress-percent-size: 12px;
  --token-progress-bar-height: 5px;
  --token-progress-popover-width: min(340px, calc(100vw - 24px));
  --token-progress-popover-radius: 18px;
  --token-progress-popover-shadow: 0 24px 48px rgba(15, 23, 42, 0.16);
  --token-progress-action-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--token-progress-size);
  height: var(--token-progress-size);
  min-width: var(--token-progress-size);
  min-height: var(--token-progress-size);
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  color: var(--workspace-text-primary, var(--color-text-primary, #20201e));
  gap: var(--token-progress-gap);
  cursor: pointer;
  user-select: none;
  appearance: none;
  text-align: center;
  transition: transform 0.16s ease;
}

.token-progress:hover,
.token-progress--open {
  transform: translateY(-1px);
}

.token-progress:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary, #2563eb) 18%, transparent);
}

.token-progress--safe {
  --token-progress-ring-color: #38bdf8;
}

.token-progress--warning {
  --token-progress-ring-color: #f59e0b;
}

.token-progress--danger {
  --token-progress-ring-color: #fb7185;
}

.token-progress--critical {
  --token-progress-ring-color: #ef4444;
}

.token-progress__ring {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--token-progress-size);
  height: var(--token-progress-size);
  border-radius: 999px;
  background:
    conic-gradient(
      var(--token-progress-ring-color) 0deg,
      var(--token-progress-ring-color) var(--token-progress-ring-value),
      var(--token-progress-ring-track) var(--token-progress-ring-value),
      var(--token-progress-ring-track) 360deg
    );
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--workspace-border, rgba(38, 38, 38, 0.1)) 74%, transparent);
}

.token-progress__ring-core {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--token-progress-size) - 8px);
  height: calc(var(--token-progress-size) - 8px);
  border-radius: 999px;
  background: var(--workspace-panel-bg, #ffffff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--workspace-border, rgba(38, 38, 38, 0.1)) 62%, transparent);
}

.token-progress__ring-value {
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--workspace-text-primary, var(--color-text-primary, #20201e));
}

.token-progress__header,
.token-progress__meta,
.token-progress__popover-header,
.token-progress__row {
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
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
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
  gap: 0;
  padding: 0;
  border-radius: 0;
  border: 0;
  background: transparent;
}

.token-progress__segment-bar {
  display: none;
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

.token-progress__segment-fill--skill,
.token-progress__segment-dot--skill {
  background: #64748b;
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
  color: var(--workspace-text-secondary, #b8b8b8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-progress__segment-value {
  color: var(--workspace-text-primary, #f3f4f6);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.token-progress__popover {
  position: fixed;
  width: var(--token-progress-popover-width, min(340px, calc(100vw - 24px)));
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: var(--token-progress-popover-radius, 10px);
  border: 1px solid color-mix(in srgb, var(--workspace-border, rgba(255, 255, 255, 0.16)) 88%, transparent);
  background: color-mix(in srgb, var(--workspace-panel-bg, #2b2b2b) 92%, #1f1f1f);
  box-shadow: var(--token-progress-popover-shadow, 0 24px 48px rgba(15, 23, 42, 0.16));
  color: var(--workspace-text-primary, #f3f4f6);
  z-index: 9999;
}

.token-progress__popover-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.token-progress__popover-title {
  font-size: 14px;
  font-weight: 700;
}

.token-progress__popover-summary {
  font-size: 12px;
  color: var(--workspace-text-secondary, #b8b8b8);
  font-weight: 600;
}

.token-progress__popover-percent {
  flex-shrink: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.token-progress__rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 11px;
  border-top: 1px solid color-mix(in srgb, var(--workspace-border, rgba(255, 255, 255, 0.16)) 82%, transparent);
}

.token-progress__row {
  gap: 16px;
}

.token-progress__row-label {
  font-size: 12px;
  color: var(--workspace-text-secondary, #b8b8b8);
}

.token-progress__row-value {
  min-width: 0;
  text-align: right;
  font-size: 12px;
  color: var(--workspace-text-primary, #f3f4f6);
  font-weight: 700;
}

.token-progress__row-value--mono {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 720px) {
  .token-progress {
    width: var(--token-progress-size);
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
