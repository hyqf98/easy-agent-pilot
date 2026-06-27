<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'

const props = withDefaults(defineProps<{
  beforeContent: string
  afterContent: string
  filePath?: string
  language?: string
  renderSideBySide?: boolean
  readOnly?: boolean
}>(), {
  renderSideBySide: true,
  readOnly: true
})

const containerRef = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneDiffEditor | null = null

function createEditor() {
  if (!containerRef.value) return
  editor = monaco.editor.createDiffEditor(containerRef.value, {
    renderSideBySide: props.renderSideBySide,
    readOnly: props.readOnly,
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'Cascadia Code, SFMono-Regular, Consolas, monospace',
    lineHeight: 1.5,
    scrollBeyondLastLine: false,
    minimap: { enabled: false }
  })
  const language = props.language || 'plaintext'
  editor.setModel({
    original: monaco.editor.createModel(props.beforeContent || '', language),
    modified: monaco.editor.createModel(props.afterContent || '', language)
  })
}

function updateModel() {
  if (!editor) return
  const language = props.language || 'plaintext'
  editor.setModel({
    original: monaco.editor.createModel(props.beforeContent || '', language),
    modified: monaco.editor.createModel(props.afterContent || '', language)
  })
}

onMounted(() => { createEditor() })
watch(() => [props.beforeContent, props.afterContent], () => { updateModel() })
watch(() => props.renderSideBySide, (val) => { editor?.updateOptions({ renderSideBySide: val }) })
onBeforeUnmount(() => { editor?.dispose(); editor = null })
</script>

<template>
  <div
    ref="containerRef"
    class="monaco-diff-editor"
  />
</template>

<style scoped src="./MonacoDiffEditor.css"></style>
