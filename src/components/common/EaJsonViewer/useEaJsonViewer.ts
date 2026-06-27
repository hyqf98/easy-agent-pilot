import { computed, ref, watch, onMounted, nextTick } from 'vue'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'

// 注册 JSON 语言
hljs.registerLanguage('json', json)

export interface EaJsonViewerProps {
  data: unknown
  expanded?: boolean
  maxDepth?: number
  showCopy?: boolean
}

export interface EaJsonViewerEmits {
  (event: 'copy', text: string): void
}

export function useEaJsonViewer(props: EaJsonViewerProps, emit: EaJsonViewerEmits) {
  // 本地状态
  const isExpanded = ref(props.expanded)
  const copied = ref(false)
  const codeRef = ref<HTMLElement | null>(null)

  // 格式化的 JSON 字符串
  const formattedJson = computed(() => {
    try {
      return JSON.stringify(props.data, null, 2)
    } catch {
      return String(props.data)
    }
  })

  // 高亮后的 HTML
  const highlightedHtml = computed(() => {
    try {
      return hljs.highlight(formattedJson.value, { language: 'json' }).value
    } catch {
      return formattedJson.value
    }
  })

  // 切换展开/折叠
  function toggleExpand() {
    isExpanded.value = !isExpanded.value
  }

  // 复制到剪贴板
  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(formattedJson.value)
      copied.value = true
      emit('copy', formattedJson.value)
      setTimeout(() => {
        copied.value = false
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // 监听数据变化，更新高亮
  watch(() => props.data, async () => {
    await nextTick()
    if (codeRef.value) {
      codeRef.value.innerHTML = highlightedHtml.value
    }
  }, { deep: true })

  onMounted(() => {
    if (codeRef.value) {
      codeRef.value.innerHTML = highlightedHtml.value
    }
  })

  return {
    isExpanded,
    copied,
    codeRef,
    toggleExpand,
    copyToClipboard
  }
}
