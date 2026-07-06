<script setup lang="ts">
/** PdfViewer 组件：PDF 查看器，支持页码导航与缩放（逻辑见 usePdfViewer.ts） */
import {
  usePdfViewer,
  type PdfViewerProps,
  type PdfViewerEmits
} from './usePdfViewer'

const props = defineProps<PdfViewerProps>()
const emit = defineEmits<PdfViewerEmits>()

const {
  sidebarRef,
  contentAreaRef,
  currentPage,
  totalPages,
  scale,
  zoomIn,
  zoomOut
} = usePdfViewer(props, emit)
</script>

<template>
  <div class="pdf-viewer">
    <div class="pdf-viewer__toolbar">
      <span class="pdf-viewer__page-info">
        {{ currentPage }} / {{ totalPages }}
      </span>

      <span class="pdf-viewer__divider" />

      <button
        type="button"
        class="pdf-viewer__btn"
        @click="zoomOut"
      >
        −
      </button>
      <span class="pdf-viewer__scale">{{ Math.round(scale * 100) }}%</span>
      <button
        type="button"
        class="pdf-viewer__btn"
        @click="zoomIn"
      >
        +
      </button>
    </div>

    <div class="pdf-viewer__body">
      <div class="pdf-viewer__sidebar">
        <div
          ref="sidebarRef"
          class="pdf-viewer__thumbnails"
        />
      </div>

      <div
        ref="contentAreaRef"
        class="pdf-viewer__content"
      >
        <div
          v-if="totalPages === 0"
          class="pdf-viewer__empty"
        >
          加载中...
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="./PdfViewer.css"></style>
