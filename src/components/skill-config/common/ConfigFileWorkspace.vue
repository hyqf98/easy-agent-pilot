<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { EaIcon } from '@/components/common'
import { getLanguageStrategy } from '@/modules/fileEditor'
import MonacoCodeEditor from '@/modules/fileEditor/components/monacoCodeEditor/MonacoCodeEditor.vue'
import MarkdownRenderer from '@/components/message/MarkdownRenderer.vue'

interface WorkspaceFile {
  name: string
  path: string
  content: string
  fileType: string
}

const props = withDefaults(defineProps<{
  loading?: boolean
  editing?: boolean
  file: WorkspaceFile | null
  editContent: string
  editPlaceholder?: string
  emptyText: string
  maxWidth?: string
  padding?: string
}>(), {
  loading: false,
  editing: false,
  editPlaceholder: '',
  maxWidth: '960px',
  padding: 'var(--spacing-6)',
})

const emit = defineEmits<{
  (e: 'update:editContent', value: string): void
  (e: 'save'): void
}>()

const settingsStore = useSettingsStore()

const isMarkdown = computed(() => props.file?.fileType === 'markdown')

// 复用文件编辑器的语言策略，将文件路径解析为 Monaco 语言 id
const monacoLanguage = computed(() => {
  if (!props.file?.path) return 'plaintext'
  return getLanguageStrategy(props.file.path).monacoLanguageId
})

const contentStyle = computed(() => ({
  '--config-file-workspace-max-width': props.maxWidth,
  '--config-file-workspace-padding': props.padding,
}))

function handleInput(value: string): void {
  emit('update:editContent', value)
}

function handleSaveShortcut(): void {
  emit('save')
}
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

<style scoped>
.config-file-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.config-file-workspace__loading,
.config-file-workspace__empty {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-6);
  color: var(--color-text-tertiary);
}

.config-file-workspace__spinner {
  width: 20px;
  height: 20px;
  animation: config-file-workspace-spin 1s linear infinite;
}

/* Monaco 编辑器容器：撑满，编辑与只读共用 */
.config-file-workspace__editor {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
  max-width: var(--config-file-workspace-max-width);
  margin: 0 auto;
}

.config-file-workspace__markdown {
  flex: 1;
  min-height: 0;
  overflow: auto;
  width: 100%;
  max-width: var(--config-file-workspace-max-width);
  margin: 0 auto;
  padding: var(--config-file-workspace-padding);
}

.config-file-workspace__empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

@keyframes config-file-workspace-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
