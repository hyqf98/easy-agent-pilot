<script setup lang="ts">
/** MonacoDiffEditor 组件：基于 Monaco 的 diff 对比编辑器（逻辑见 useMonacoDiffEditor.ts） */
import {
  useMonacoDiffEditor,
  type MonacoDiffEditorProps
} from './useMonacoDiffEditor'

const props = withDefaults(defineProps<MonacoDiffEditorProps>(), {
  renderSideBySide: true,
  readOnly: true
})

const { containerRef } = useMonacoDiffEditor(props)
</script>

<template>
  <div
    ref="containerRef"
    class="monaco-diff-editor"
  />
</template>

<style scoped src="./MonacoDiffEditor.css"></style>
