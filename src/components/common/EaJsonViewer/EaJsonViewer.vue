<script setup lang="ts">
/** EaJsonViewer 组件：JSON 查看器，支持折叠展开与复制（逻辑见 useEaJsonViewer.ts） */
import { useEaJsonViewer, type EaJsonViewerEmits, type EaJsonViewerProps } from './useEaJsonViewer'

const props = withDefaults(defineProps<EaJsonViewerProps>(), {
  expanded: true,
  maxDepth: 4,
  showCopy: true
})
const emit = defineEmits<EaJsonViewerEmits>()

const { isExpanded, copied, codeRef, toggleExpand, copyToClipboard } = useEaJsonViewer(props, emit)
</script>

<template>
  <div class="ea-json-viewer">
    <!-- 工具栏 -->
    <div class="json-viewer__toolbar">
      <button
        class="json-viewer__toggle"
        :title="isExpanded ? '折叠' : '展开'"
        @click="toggleExpand"
      >
        <svg
          :class="['toggle-icon', { 'toggle-icon--expanded': isExpanded }]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{{ isExpanded ? '折叠' : '展开' }}</span>
      </button>

      <button
        v-if="showCopy"
        class="json-viewer__copy"
        :title="copied ? '已复制' : '复制'"
        @click="copyToClipboard"
      >
        <svg
          v-if="!copied"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect
            x="9"
            y="9"
            width="13"
            height="13"
            rx="2"
            ry="2"
          />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{{ copied ? '已复制' : '复制' }}</span>
      </button>
    </div>

    <!-- JSON 内容 -->
    <div
      v-show="isExpanded"
      class="json-viewer__content"
    >
      <pre class="json-viewer__pre"><code
ref="codeRef"
                                          class="language-json"
      /></pre>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
