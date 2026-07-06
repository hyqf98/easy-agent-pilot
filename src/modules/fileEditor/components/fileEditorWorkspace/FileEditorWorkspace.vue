<script setup lang="ts">
import {
  useFileEditorWorkspace,
  type FileEditorWorkspaceProps
} from './useFileEditorWorkspace'

const props = withDefaults(defineProps<FileEditorWorkspaceProps>(), {
  compact: false
})

const {
  fileEditorStore,
  settingsStore,
  markdownModeText,
  saveStatusText,
  editorFontSize,
  unsupportedExtension,
  imageContainerRef,
  handleMarkdownModeChange,
  handleSave,
  handleSendSelectionToSession,
  EaButton,
  EaIcon,
  MonacoCodeEditor,
  RichMarkdownEditor
} = useFileEditorWorkspace(props)
</script>

<template>
  <div
    class="file-editor-workspace"
    :class="{ 'file-editor-workspace--compact': compact }"
  >
    <div class="file-editor-workspace__toolbar">
      <div class="file-editor-workspace__toolbar-left">
        <div class="file-editor-workspace__file-meta">
          <span class="file-editor-workspace__file-name">{{ fileEditorStore.fileName || '未选择文件' }}</span>
          <span
            class="file-editor-workspace__status"
            :class="{ 'file-editor-workspace__status--dirty': fileEditorStore.isDirty }"
          >
            {{ saveStatusText }}
          </span>
          <span
            v-if="fileEditorStore.isLargeFile"
            class="file-editor-workspace__badge"
          >
            大文件模式
          </span>
        </div>
      </div>

      <div class="file-editor-workspace__toolbar-right">
        <div
          v-if="fileEditorStore.isMarkdownFile"
          class="file-editor-workspace__mode-switch"
        >
          <button
            type="button"
            :class="[
              'file-editor-workspace__mode-btn',
              { 'file-editor-workspace__mode-btn--active': fileEditorStore.effectiveMarkdownMode === 'rich' }
            ]"
            :disabled="fileEditorStore.isLargeFile"
            @click="handleMarkdownModeChange('rich')"
          >
            <EaIcon
              name="lucide:book-open"
              :size="13"
            />
            预览
          </button>
          <button
            type="button"
            :class="[
              'file-editor-workspace__mode-btn',
              { 'file-editor-workspace__mode-btn--active': fileEditorStore.effectiveMarkdownMode === 'source' }
            ]"
            @click="handleMarkdownModeChange('source')"
          >
            <EaIcon
              name="file-code"
              :size="13"
            />
            编辑
          </button>
        </div>

        <EaButton
          v-if="fileEditorStore.previewMode === 'editor'"
          type="secondary"
          size="small"
          :loading="fileEditorStore.isSaving"
          :disabled="!fileEditorStore.hasActiveFile || !fileEditorStore.isDirty"
          @click="handleSave"
        >
          <EaIcon
            name="save"
            :size="14"
          />
          保存 (Ctrl/Cmd+S)
        </EaButton>
      </div>
    </div>

    <div
      v-if="fileEditorStore.loadError"
      class="file-editor-workspace__error"
    >
      <EaIcon
        name="alert-circle"
        :size="48"
      />
      <span class="file-editor-workspace__unsupported-title">无法打开文件</span>
      <span>{{ fileEditorStore.loadError }}</span>
    </div>

    <div
      v-if="fileEditorStore.previewMode === 'image' && fileEditorStore.imageUrl"
      ref="imageContainerRef"
      class="file-editor-workspace__image-preview"
    >
      <img
        :src="fileEditorStore.imageUrl"
        :alt="fileEditorStore.fileName"
        class="file-editor-workspace__image"
      >
    </div>

    <div
      v-else-if="fileEditorStore.previewMode === 'image' && !fileEditorStore.imageUrl"
      class="file-editor-workspace__unsupported"
    >
      <EaIcon
        name="image-off"
        :size="48"
      />
      <span class="file-editor-workspace__unsupported-title">图片加载失败</span>
      <span class="file-editor-workspace__unsupported-hint">无法读取或解码此图片文件</span>
    </div>

    <div
      v-else-if="fileEditorStore.previewMode === 'unsupported'"
      class="file-editor-workspace__unsupported"
    >
      <EaIcon
        name="file-x"
        :size="48"
      />
      <span class="file-editor-workspace__unsupported-title">不支持预览当前文件</span>
      <span
        v-if="unsupportedExtension"
        class="file-editor-workspace__unsupported-detail"
      >{{ unsupportedExtension }} 文件无法以文本形式预览</span>
      <span class="file-editor-workspace__unsupported-hint">仅支持 UTF-8 文本文件和常见图片格式</span>
    </div>

    <div
      v-else-if="fileEditorStore.hasActiveFile && fileEditorStore.previewMode === 'editor'"
      class="file-editor-workspace__content"
    >
      <RichMarkdownEditor
        v-if="fileEditorStore.effectiveMarkdownMode === 'rich'"
        :model-value="fileEditorStore.content"
        :read-only="fileEditorStore.isLoading"
        :placeholder="`开始编辑 ${markdownModeText} Markdown...`"
        @update:model-value="fileEditorStore.updateContent"
        @save-shortcut="handleSave"
      />
      <MonacoCodeEditor
        v-else
        :model-value="fileEditorStore.content"
        :language="fileEditorStore.languageId"
        :font-size="editorFontSize"
        :tab-size="settingsStore.settings.editorTabSize"
        :word-wrap="compact ? false : settingsStore.settings.editorWordWrap"
        :completions="fileEditorStore.completionEntries"
        :performance-mode="fileEditorStore.isLargeFile ? 'large' : 'default'"
        :read-only="fileEditorStore.isLoading"
        @update:model-value="fileEditorStore.updateContent"
        @selection-change="fileEditorStore.updateSelection"
        @send-selection="handleSendSelectionToSession"
        @save-shortcut="handleSave"
      />
    </div>

    <div
      v-else-if="fileEditorStore.previewMode === 'editor'"
      class="file-editor-workspace__empty"
    >
      <EaIcon
        name="file-text"
        :size="22"
      />
      <span>请选择左侧文件开始编辑</span>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>
