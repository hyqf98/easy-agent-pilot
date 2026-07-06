<script setup lang="ts">
/** SheetEditor 组件：电子表格查看器（逻辑见 useSheetEditor.ts） */
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
