<script setup lang="ts">
import {
  useRichMarkdownEditor,
  type RichMarkdownEditorEmits,
  type RichMarkdownEditorProps
} from './useRichMarkdownEditor'

const props = withDefaults(defineProps<RichMarkdownEditorProps>(), {
  placeholder: '',
  readOnly: false
})

const emit = defineEmits<RichMarkdownEditorEmits>()

const {
  editorRef,
  handleEditorInput,
  handleEditorKeydown,
  handleEditorPaste,
  handleCompositionStart,
  handleCompositionEnd,
  handleEditorFocusOut
} = useRichMarkdownEditor(props, emit)
</script>

<template>
  <div class="rich-markdown-editor-shell">
    <div
      ref="editorRef"
      class="rich-markdown-editor"
      :contenteditable="!readOnly"
      spellcheck="false"
      :data-placeholder="placeholder"
      :data-readonly="String(readOnly)"
      @input="handleEditorInput"
      @keydown="handleEditorKeydown"
      @paste="handleEditorPaste"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
      @focusout="handleEditorFocusOut"
    />
  </div>
</template>
<style scoped src="./RichMarkdownEditor.css"></style>
