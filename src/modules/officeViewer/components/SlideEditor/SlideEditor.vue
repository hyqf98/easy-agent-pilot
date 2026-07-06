<script setup lang="ts">
import {
  useSlideEditor,
  type SlideEditorProps,
  type SlideEditorEmits
} from './useSlideEditor'

const props = defineProps<SlideEditorProps>()
const emit = defineEmits<SlideEditorEmits>()

const {
  sidebarRef,
  contentAreaRef,
  currentSlide,
  slideCount,
  scale,
  zoomIn,
  zoomOut
} = useSlideEditor(props, emit)
</script>

<template>
  <div class="slide-editor">
    <div class="slide-editor__toolbar">
      <span class="slide-editor__page-info">
        {{ currentSlide }} / {{ slideCount }}
      </span>
      <span class="slide-editor__divider" />
      <button
        type="button"
        class="slide-editor__btn"
        @click="zoomOut"
      >
        −
      </button>
      <span class="slide-editor__scale">{{ Math.round(scale * 100) }}%</span>
      <button
        type="button"
        class="slide-editor__btn"
        @click="zoomIn"
      >
        +
      </button>
      <span class="slide-editor__readonly-badge">只读</span>
    </div>

    <div class="slide-editor__body">
      <div class="slide-editor__sidebar">
        <div
          ref="sidebarRef"
          class="slide-editor__thumbnails"
        />
      </div>
      <div
        ref="contentAreaRef"
        class="slide-editor__content"
      >
        <div
          v-if="slideCount === 0"
          class="slide-editor__empty"
        >
          加载中...
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="./SlideEditor.css"></style>
