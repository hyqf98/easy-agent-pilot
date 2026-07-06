<script setup lang="ts">
/** ConfigFileWorkspace 组件：配置文件查看/编辑工作区，支持 Markdown 渲染与 Monaco 编辑（逻辑见 useConfigFileWorkspace.ts） */
import {
  useConfigFileWorkspace,
  CONFIG_FILE_WORKSPACE_DEFAULTS,
  type ConfigFileWorkspaceProps,
  type ConfigFileWorkspaceEmits
} from './useConfigFileWorkspace'

const props = withDefaults(defineProps<ConfigFileWorkspaceProps>(), CONFIG_FILE_WORKSPACE_DEFAULTS)
const emit = defineEmits<ConfigFileWorkspaceEmits>()

const {
  EaIcon,
  MonacoCodeEditor,
  MarkdownRenderer,
  settingsStore,
  isMarkdown,
  monacoLanguage,
  contentStyle,
  handleInput,
  handleSaveShortcut,
} = useConfigFileWorkspace(props, emit)
</script>

<template>
  <div
    class="config-file-workspace"
    :style="contentStyle"
  >
    <div
      v-if="loading"
      class="config-file-workspace__loading"
    >
      <EaIcon
        name="lucide:loader-2"
        class="config-file-workspace__spinner"
      />
      <slot name="loading">
        Loading...
      </slot>
    </div>

    <!-- 只读 Markdown：用 MarkdownRenderer 渲染 -->
    <div
      v-else-if="!editing && file && isMarkdown"
      class="config-file-workspace__markdown"
    >
      <MarkdownRenderer :content="file.content" />
    </div>

    <!-- 编辑模式 或 非Markdown 代码文件：复用 Monaco 编辑器 -->
    <div
      v-else-if="file"
      class="config-file-workspace__editor"
    >
      <MonacoCodeEditor
        :model-value="editing ? editContent : file.content"
        :language="monacoLanguage"
        :font-size="settingsStore.settings.editorFontSize"
        :tab-size="settingsStore.settings.editorTabSize"
        :word-wrap="settingsStore.settings.editorWordWrap"
        :read-only="!editing"
        @update:model-value="handleInput"
        @save-shortcut="handleSaveShortcut"
      />
    </div>

    <div
      v-else
      class="config-file-workspace__empty"
    >
      <EaIcon
        name="lucide:file-x"
        class="config-file-workspace__empty-icon"
      />
      <p>{{ emptyText }}</p>
    </div>
  </div>
</template>
<style scoped src="./ConfigFileWorkspace.css"></style>
