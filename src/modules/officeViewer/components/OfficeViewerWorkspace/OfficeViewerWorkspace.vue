<script setup lang="ts">
import {
  useOfficeViewerWorkspace,
  type OfficeViewerWorkspaceProps
} from './useOfficeViewerWorkspace'

const props = withDefaults(defineProps<OfficeViewerWorkspaceProps>(), {
  compact: false
})

void props

const {
  EaButton,
  EaIcon,
  store,
  typeLabel,
  viewerComponent,
  isDirty,
  isEditable,
  saveStatusText,
  handleBack,
  handleSave,
  handleLoading
} = useOfficeViewerWorkspace()
</script>

<template>
  <div
    class="office-viewer-workspace"
    :class="{ 'office-viewer-workspace--compact': compact }"
  >
    <div class="office-viewer-workspace__toolbar">
      <div class="office-viewer-workspace__toolbar-left">
        <EaButton
          type="ghost"
          size="small"
          @click="handleBack"
        >
          <EaIcon
            name="arrow-left"
            :size="14"
          />
          返回聊天
        </EaButton>

        <div class="office-viewer-workspace__file-meta">
          <span class="office-viewer-workspace__file-name">{{ store.fileName || '未选择文件' }}</span>
          <span class="office-viewer-workspace__divider">•</span>
          <span class="office-viewer-workspace__type-badge">{{ typeLabel }}</span>
          <span class="office-viewer-workspace__divider">•</span>
          <span
            class="office-viewer-workspace__status"
            :class="{ 'office-viewer-workspace__status--dirty': isDirty }"
          >
            {{ saveStatusText }}
          </span>
        </div>
      </div>

      <div class="office-viewer-workspace__toolbar-right">
        <span
          v-if="!isEditable"
          class="office-viewer-workspace__readonly-badge"
        >
          只读预览
        </span>
        <EaButton
          v-if="isEditable"
          type="primary"
          size="small"
          :loading="store.isSaving"
          :disabled="!store.hasActiveFile"
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
      v-if="store.hasActiveFile && viewerComponent"
      class="office-viewer-workspace__content"
    >
      <component
        :is="viewerComponent"
        :buffer="store.fileBuffer"
        @loading="handleLoading"
      />
    </div>

    <div
      v-else-if="!store.hasActiveFile"
      class="office-viewer-workspace__empty"
    >
      <EaIcon
        name="file-text"
        :size="22"
      />
      <span>请选择左侧文件预览</span>
    </div>
  </div>
</template>
<style scoped src="./OfficeViewerWorkspace.css"></style>
