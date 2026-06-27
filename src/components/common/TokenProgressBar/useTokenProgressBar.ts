import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatTokenCount, useTokenStore, type TokenLevel } from '@/stores/token'
import { useSessionStore } from '@/stores/session'

export interface TokenProgressBarProps {
  sessionId?: string | null
}

export interface TokenProgressBarEmits {
  (event: 'compress'): void
}

export function useTokenProgressBar(props: TokenProgressBarProps) {
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

  return {
    triggerRef,
    popoverRef,
    showPopover,
    popoverPosition,
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
  }
}
