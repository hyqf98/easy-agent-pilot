import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTypewriterText } from '@/composables/useTypewriterText'

export interface ThinkingDisplayProps {
  thinking: string
  live?: boolean
  defaultExpanded?: boolean
}

export function useThinkingDisplay(props: ThinkingDisplayProps) {
  const { t } = useI18n()

  const { displayedText } = useTypewriterText(
    toRef(props, 'thinking'),
    () => props.live ?? false,
    { charsPerSecond: 120, maxChunkSize: 16 }
  )

  const isExpanded = ref(props.defaultExpanded ?? false)
  const placeholderText = computed(() => props.live ? '正在思考...' : '')
  const titleText = computed(() => props.live ? '正在思考' : '思考过程')

  // 切换展开状态
  const toggleExpand = () => {
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
