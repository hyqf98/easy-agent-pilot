<script setup lang="ts">
import {
  useDocxEditor,
  type DocxEditorProps,
  type DocxEditorEmits
} from './useDocxEditor'

const props = defineProps<DocxEditorProps>()
const emit = defineEmits<DocxEditorEmits>()

const { containerRef, viewMode, switchMode } = useDocxEditor(props, emit)

defineExpose({ viewMode, switchMode })
</script>

<template>
  <div class="docx-editor">
    <div class="docx-editor__mode-bar">
      <button
        class="docx-editor__mode-btn"
        :class="{ 'docx-editor__mode-btn--active': viewMode === 'preview' }"
        @click="switchMode('preview')"
      >
        预览
      </button>
      <button
        class="docx-editor__mode-btn"
        :class="{ 'docx-editor__mode-btn--active': viewMode === 'edit' }"
        @click="switchMode('edit')"
      >
        编辑
      </button>
    </div>
    <div
      ref="containerRef"
      class="docx-editor__container"
    />
  </div>
</template>
<style scoped src="./DocxEditor.css"></style>
