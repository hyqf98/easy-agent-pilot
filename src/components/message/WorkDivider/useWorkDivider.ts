import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import type { Message } from '@/stores/message'

function toTimeMs(value?: string): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function formatWorkDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export interface WorkDividerProps {
  requestId: string
  messages: Message[]
}

export function useWorkDivider(props: WorkDividerProps) {
  const { t } = useI18n()

  const requestAssistantMessages = computed(() =>
    props.messages.filter(
      message =>
        message.requestId === props.requestId
        && message.role === 'assistant'
        && message.messageType !== 'usage'
        && message.messageType !== 'context_window'
        && message.messageType !== 'system'
    )
  )

  // 等待 AI 首个事件：本回合尚无任何 assistant 消息
  const isAwaitingFirstResponse = computed(() => requestAssistantMessages.value.length === 0)

  const isRequestActive = computed(() =>
    requestAssistantMessages.value.some(message => message.status === 'streaming')
  )

  type RequestTerminalStatus = 'active' | 'completed' | 'interrupted' | 'failed'
  const requestTerminalStatus = computed<RequestTerminalStatus>(() => {
    if (isRequestActive.value) return 'active'
    const assistantMsgs = requestAssistantMessages.value
    if (assistantMsgs.length > 0) {
      if (assistantMsgs.some(message => message.status === 'error')) return 'failed'
      if (assistantMsgs.some(message => message.status === 'interrupted')) return 'interrupted'
      return 'completed'
    }
    return 'active'
  })

  const nowTick = ref(Date.now())
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const workDurationLabel = computed(() => {
    const times = requestAssistantMessages.value
      .flatMap(message => [toTimeMs(message.createdAt), toTimeMs(message.updatedAt)])
      .filter((value): value is number => value !== null)

    if (times.length === 0) {
      return '0:00'
    }

    const start = Math.min(...times)
    const end = isRequestActive.value ? nowTick.value : Math.max(...times)
    return formatWorkDuration(end - start)
  })

  const workDividerLabel = computed(() => {
    if (isAwaitingFirstResponse.value) return t('message.workDivider.awaiting')
    switch (requestTerminalStatus.value) {
      case 'active': return t('message.workDivider.working')
      case 'interrupted': return t('message.workDivider.interrupted')
      case 'failed': return t('message.workDivider.failed')
      default: return t('message.workDivider.completed')
    }
  })

  const workDividerIcon = computed(() => {
    if (isAwaitingFirstResponse.value) return 'loader-circle'
    switch (requestTerminalStatus.value) {
      case 'active': return 'loader-circle'
      case 'interrupted': return 'square'
      case 'failed': return 'triangle-alert'
      default: return 'check'
    }
  })

  const workDividerStatusClass = computed(() => {
    if (isAwaitingFirstResponse.value) return 'work-divider--awaiting'
    return `work-divider--${requestTerminalStatus.value}`
  })

  watch(isRequestActive, (active) => {
    if (active && !tickTimer) {
      tickTimer = setInterval(() => {
        nowTick.value = Date.now()
      }, 1000)
    } else if (!active && tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
      nowTick.value = Date.now()
    }
  }, { immediate: true })

  onUnmounted(() => {
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  })

  return {
    t,
    EaIcon,
    isAwaitingFirstResponse,
    workDurationLabel,
    workDividerLabel,
    workDividerIcon,
    workDividerStatusClass
  }
}