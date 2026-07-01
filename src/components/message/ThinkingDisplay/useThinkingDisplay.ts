import { computed, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTypewriterText } from '@/composables/useTypewriterText'

export interface ThinkingDisplayProps {
  thinking: string
  live?: boolean
  defaultExpanded?: boolean
  autoCollapseOnComplete?: boolean
}

export function useThinkingDisplay(props: ThinkingDisplayProps) {
  const { t } = useI18n()

  const { displayedText } = useTypewriterText(
    toRef(props, 'thinking'),
    () => props.live ?? false,
    { charsPerSecond: 120, maxChunkSize: 16 }
  )

  const isExpanded = ref(props.live ? true : (props.defaultExpanded ?? true))
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
    }
  )

  const toggleExpand = () => {
    hasUserToggled.value = true
    isExpanded.value = !isExpanded.value
  }

  return {
    t,
    displayedText,
    isExpanded,
    placeholderText,
    titleText,
    toggleExpand
  }
}
