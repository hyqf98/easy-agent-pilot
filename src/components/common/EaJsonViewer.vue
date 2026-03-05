<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'

// 注册 JSON 语言
hljs.registerLanguage('json', json)

interface Props {
  data: unknown
  expanded?: boolean
  maxDepth?: number
  showCopy?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  expanded: true,
  maxDepth: 4,
  showCopy: true,
})

const emit = defineEmits<{
  (e: 'copy', text: string): void
}>()

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
</script>

<template>
  <div class="ea-json-viewer">
    <!-- 工具栏 -->
    <div class="json-viewer__toolbar">
      <button
        class="json-viewer__toggle"
        @click="toggleExpand"
        :title="isExpanded ? '折叠' : '展开'"
      >
        <svg
          :class="['toggle-icon', { 'toggle-icon--expanded': isExpanded }]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        <span>{{ isExpanded ? '折叠' : '展开' }}</span>
      </button>

      <button
        v-if="showCopy"
        class="json-viewer__copy"
        @click="copyToClipboard"
        :title="copied ? '已复制' : '复制'"
      >
        <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>{{ copied ? '已复制' : '复制' }}</span>
      </button>
    </div>

    <!-- JSON 内容 -->
    <div class="json-viewer__content" v-show="isExpanded">
      <pre class="json-viewer__pre"><code ref="codeRef" class="language-json"></code></pre>
    </div>
  </div>
</template>

<style scoped>
.ea-json-viewer {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.json-viewer__toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
}

.json-viewer__toggle,
.json-viewer__copy {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  padding: var(--spacing-1) var(--spacing-2);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.json-viewer__toggle:hover,
.json-viewer__copy:hover {
  background: var(--color-background);
  color: var(--color-text);
}

.json-viewer__toggle svg,
.json-viewer__copy svg {
  width: 14px;
  height: 14px;
}

.toggle-icon {
  transition: transform 0.2s;
}

.toggle-icon--expanded {
  transform: rotate(90deg);
}

.json-viewer__content {
  max-height: 400px;
  overflow: auto;
}

.json-viewer__pre {
  margin: 0;
  padding: var(--spacing-3);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  line-height: 1.6;
  background: var(--color-background);
  overflow-x: auto;
}

.json-viewer__pre code {
  background: transparent;
  padding: 0;
}

/* Highlight.js 主题适配 */
:deep(.hljs) {
  background: transparent;
  color: var(--color-text);
}

:deep(.hljs-attr) {
  color: #7dd3fc;
}

:deep(.hljs-string) {
  color: #86efac;
}

:deep(.hljs-number) {
  color: #fbbf24;
}

:deep(.hljs-literal) {
  color: #f472b6;
}

:deep(.hljs-punctuation) {
  color: var(--color-text-secondary);
}

:deep(.hljs-comment) {
  color: var(--color-text-tertiary);
  font-style: italic;
}
</style>
