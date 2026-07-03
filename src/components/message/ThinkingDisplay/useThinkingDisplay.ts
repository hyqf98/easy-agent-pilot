import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export interface ThinkingDisplayProps {
  thinking: string
  live?: boolean
  defaultExpanded?: boolean
  autoCollapseOnComplete?: boolean
}

export function useThinkingDisplay(props: ThinkingDisplayProps) {
  const { t } = useI18n()

  const displayedText = computed(() => props.thinking)

  const isExpanded = ref(props.live ? true : (props.defaultExpanded ?? true))
  const scrollRef = ref<HTMLElement | null>(null)
  const hasUserToggled = ref(false)
  const placeholderText = computed(() => props.live ? '正在思考...' : '')
  const titleText = computed(() => props.live ? '正在思考' : '思考过程')

  watch(
    () => props.live,
    (live, wasLive) => {
      if (live && !hasUserToggled.value) {
        isExpanded.value = true
        return
      }

      if (!live && wasLive && (props.autoCollapseOnComplete ?? true) && !hasUserToggled.value) {
        isExpanded.value = false
      }
    },
    { immediate: true }
  )

  const toggleExpand = () => {
    hasUserToggled.value = true
    isExpanded.value = !isExpanded.value
  }

  function scrollToLatest() {
    const element = scrollRef.value
    if (!element || !isExpanded.value) return
    element.scrollTop = element.scrollHeight
  }

  watch(
    [displayedText, isExpanded],
    () => {
      void nextTick(scrollToLatest)
    },
    { flush: 'post' }
  )

  return {
    t,
    displayedText,
    isExpanded,
    scrollRef,
    placeholderText,
    titleText,
    toggleExpand
  }
}
