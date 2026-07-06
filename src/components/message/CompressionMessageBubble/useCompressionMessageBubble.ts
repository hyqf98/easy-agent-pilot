/** useCompressionMessageBubble — CompressionMessageBubble 压缩消息气泡组件的 composable，负责气泡宽度锁定与展开/折叠。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type Message } from '@/stores/message'

export interface CompressionMessageBubbleProps {
  message: Message
}

export function useCompressionMessageBubble(props: CompressionMessageBubbleProps) {
  const { t, locale } = useI18n()
  const bubbleRef = ref<HTMLElement | null>(null)
  const lockedWidth = ref<number | null>(null)
  let resizeObserver: ResizeObserver | null = null

  // 新结构下压缩元数据（原始消息数/token/策略等）不再折叠进 message.compressionMetadata。
  // 当前仅依赖消息自身的 content 与时间戳；展开状态由组件本地维护。
  const isExpanded = ref(false)
  const bubbleStyle = computed(() => {
    if (!lockedWidth.value) {
      return undefined
    }

    return {
      width: `min(${lockedWidth.value}px, 100%)`
    }
  })

  // 格式化时间
  const formattedTime = computed(() => {
    const stamp = props.message.createdAt
    if (!stamp) return ''
    const date = new Date(stamp)
    return date.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  })

  const syncCollapsedWidth = () => {
    const element = bubbleRef.value
    if (!element) {
      return
    }

    const nextWidth = Math.ceil(element.getBoundingClientRect().width)
    if (nextWidth > 0) {
      lockedWidth.value = nextWidth
    }
  }

  // 切换展开状态
  const toggleExpand = () => {
    isExpanded.value = !isExpanded.value
  }

  onMounted(async () => {
    await nextTick()
    syncCollapsedWidth()

    if (typeof ResizeObserver === 'undefined' || !bubbleRef.value) {
      return
    }

    resizeObserver = new ResizeObserver(() => {
      if (!isExpanded.value) {
        syncCollapsedWidth()
      }
    })
    resizeObserver.observe(bubbleRef.value)
  })

  watch(isExpanded, async (expanded) => {
    if (expanded) {
      if (!lockedWidth.value) {
        await nextTick()
        syncCollapsedWidth()
      }
      return
    }

    await nextTick()
    syncCollapsedWidth()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return {
    t,
    bubbleRef,
    bubbleStyle,
    formattedTime,
    isExpanded,
    toggleExpand
  }
}
