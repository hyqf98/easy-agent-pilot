<script setup lang="ts">
/** MonacoCodeEditor 组件：基于 Monaco 的代码编辑器，支持补全、高亮与右键发送选区（逻辑见 useMonacoCodeEditor.ts） */
import {
  useMonacoCodeEditor,
  type MonacoCodeEditorEmits,
  type MonacoCodeEditorProps
} from './useMonacoCodeEditor'

const props = withDefaults(defineProps<MonacoCodeEditorProps>(), {
  performanceMode: 'default',
  completions: () => [],
  readOnly: false,
  highlightedRanges: () => [],
  focusRange: null,
  searchTarget: null
})

const emit = defineEmits<MonacoCodeEditorEmits>()

const {
  containerRef,
  contextMenuState,
  handleSendSelectionFromContextMenu
} = useMonacoCodeEditor(props, emit)
</script>

<template>
  <div class="monaco-editor-shell">
    <div
      ref="containerRef"
      class="monaco-editor-wrapper"
    />

    <Teleport to="body">
      <div
        v-if="contextMenuState"
        class="monaco-selection-context-menu"
        :style="{
          left: `${contextMenuState.x}px`,
          top: `${contextMenuState.y}px`
        }"
      >
        <button
          type="button"
          class="monaco-selection-context-menu__item"
          @click="handleSendSelectionFromContextMenu"
        >
          发送到会话
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped src="./styles.css"></style>
