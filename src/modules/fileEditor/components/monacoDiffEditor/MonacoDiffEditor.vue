<script setup lang="ts">
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
