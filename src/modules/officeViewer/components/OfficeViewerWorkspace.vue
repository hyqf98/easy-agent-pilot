<script setup lang="ts">
import { defineAsyncComponent, computed, onMounted, onBeforeUnmount } from 'vue'
import { EaButton, EaIcon } from '@/components/common'
import { useOfficeViewerStore } from '../stores/officeViewer'
import { useUIStore } from '@/stores/ui'
import { OFFICE_FILE_TYPE_LABELS } from '../types'

const PdfViewer = defineAsyncComponent(() => import('../components/PdfViewer.vue'))
const SheetEditor = defineAsyncComponent(() => import('../components/SheetEditor.vue'))
const DocxEditor = defineAsyncComponent(() => import('../components/DocxEditor.vue'))
const SlideEditor = defineAsyncComponent(() => import('../components/SlideEditor.vue'))

withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false
})

const store = useOfficeViewerStore()
const uiStore = useUIStore()

const typeLabel = computed(() => OFFICE_FILE_TYPE_LABELS[store.fileType])

const viewerComponent = computed(() => {
  switch (store.fileType) {
    case 'pdf':
      return PdfViewer
    case 'xlsx':
      return SheetEditor
    case 'docx':
      return DocxEditor
    case 'pptx':
      return SlideEditor
    default:
      return null
  }
})

const isDirty = computed(() => {
  if (!store.fileBuffer || !store.originalBuffer) return false
  if (store.fileBuffer.length !== store.originalBuffer.length) return true
  for (let i = 0; i < store.fileBuffer.length; i++) {
    if (store.fileBuffer[i] !== store.originalBuffer[i]) return true
  }
  return false
})

const isEditable = computed(() => store.fileType === 'xlsx' || store.fileType === 'docx')

const saveStatusText = computed(() => {
  if (store.isLoading) return '正在加载文件...'
  if (store.isSaving) return '正在保存...'
  if (isDirty.value) return '未保存'
  if (!store.hasActiveFile) return '未打开文件'
  return '已保存'
})

const handleBack = (): void => {
  store.switchBackToChat()
}

const handleSave = async (): Promise<void> => {
  await store.saveFile()
}

const handleLoading = (loading: boolean): void => {
  void loading
}

const handleKeydown = (event: KeyboardEvent) => {
  if (uiStore.mainContentMode !== 'officeViewer') return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
    handleSave()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown, true)
})
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
