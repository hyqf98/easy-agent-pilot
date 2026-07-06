<script setup lang="ts">
import {
  useSheetEditor,
  type SheetEditorProps,
  type SheetEditorEmits
} from './useSheetEditor'

const props = defineProps<SheetEditorProps>()
const emit = defineEmits<SheetEditorEmits>()

const { containerRef } = useSheetEditor(props, emit)
</script>

<template>
  <div class="sheet-editor">
    <div
      ref="containerRef"
      class="sheet-editor__container"
    />
  </div>
</template>
<style scoped src="./SheetEditor.css"></style>
