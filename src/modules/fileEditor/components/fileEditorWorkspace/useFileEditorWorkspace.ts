/** 文件编辑工作区视图状态：聚合工具栏数据、图片预览（viewerjs）与选中代码发送到会话的行为。 */
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import Viewer from 'viewerjs'
import 'viewerjs/dist/viewer.css'
import { EaButton, EaIcon } from '@/components/common'
import MonacoCodeEditor from '../monacoCodeEditor/MonacoCodeEditor.vue'
import RichMarkdownEditor from '../richMarkdownEditor/RichMarkdownEditor.vue'
import { useSessionFileReference } from '@/composables'
import { useSettingsStore } from '@/stores/settings'
import { createFileLineRangeMention } from '@/utils/composerFileMention'
import { prewarmMonacoEditor } from '../../monaco/setup'
import { useFileEditorStore } from '../../stores/fileEditor'
import type { MarkdownEditorMode } from '../../types'

export interface FileEditorWorkspaceProps {
  compact?: boolean
}

/**
 * 文件编辑工作区状态机。
 * 负责聚合工具栏展示数据、图片预览（viewerjs）生命周期和选中代码发送到会话的行为。
 */
export function useFileEditorWorkspace(props: Readonly<FileEditorWorkspaceProps>) {
  const fileEditorStore = useFileEditorStore()
  const settingsStore = useSettingsStore()
  const { sendFileReferencesToSession } = useSessionFileReference()

  const saveStatusText = computed(() => {
    if (fileEditorStore.previewMode !== 'editor') {
      return fileEditorStore.previewMode === 'image' ? '图片预览' : '只读'
    }
    if (fileEditorStore.isLoading) return '正在加载文件...'
    if (fileEditorStore.isSaving) return '正在保存...'
    if (fileEditorStore.isDirty) return '未保存'
    if (!fileEditorStore.hasActiveFile) return '未打开文件'
    return '已保存'
  })

  const markdownModeText = computed(() => {
    if (fileEditorStore.effectiveMarkdownMode === 'rich') {
      return '预览'
    }

    return '编辑'
  })

  const editorFontSize = computed(() => {
    if (!props.compact) {
      return settingsStore.settings.editorFontSize
    }

    return Math.min(settingsStore.settings.editorFontSize, 12)
  })

  const unsupportedExtension = computed(() => {
    if (fileEditorStore.previewMode !== 'unsupported' || !fileEditorStore.activeFilePath) return ''
    const lastDot = fileEditorStore.activeFilePath.lastIndexOf('.')
    return lastDot >= 0 ? fileEditorStore.activeFilePath.slice(lastDot + 1).toUpperCase() : ''
  })

  const handleSave = async (): Promise<void> => {
    await fileEditorStore.saveFile()
  }

  const handleSendSelectionToSession = async (payload: { startLine: number; endLine: number }): Promise<void> => {
    if (!fileEditorStore.activeProjectId || !fileEditorStore.activeFilePath) {
      return
    }

    await sendFileReferencesToSession({
      sourceProjectId: fileEditorStore.activeProjectId,
      mentions: [createFileLineRangeMention({
        fullPath: fileEditorStore.activeFilePath,
        fileName: fileEditorStore.fileName,
        startLine: payload.startLine,
        endLine: payload.endLine
      })]
    })
  }

  const handleMarkdownModeChange = (mode: MarkdownEditorMode): void => {
    fileEditorStore.setMarkdownMode(mode)
  }

  const imageContainerRef = ref<HTMLElement | null>(null)
  let viewerInstance: Viewer | null = null

  function destroyViewer(): void {
    if (viewerInstance) {
      viewerInstance.destroy()
      viewerInstance = null
    }
  }

  watch(
    () => fileEditorStore.imageUrl,
    async (url) => {
      destroyViewer()
      if (!url || fileEditorStore.previewMode !== 'image') return

      await nextTick()
      if (!imageContainerRef.value) return

      const img = imageContainerRef.value.querySelector('img')
      if (!img) return

      viewerInstance = new Viewer(imageContainerRef.value, {
        inline: false,
        toolbar: {
          zoomIn: true,
          zoomOut: true,
          oneToOne: true,
          reset: true,
          prev: false,
          next: false,
          rotateLeft: true,
          rotateRight: true,
          flipHorizontal: true,
          flipVertical: true,
        },
        title: false,
        navbar: false,
        tooltip: true,
        scalable: true,
        transition: true,
      })
    }
  )

  onBeforeUnmount(() => {
    destroyViewer()
  })

  onMounted(() => {
    if (typeof window !== 'undefined') {
      const run = () => {
        void prewarmMonacoEditor()
      }

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => run(), { timeout: 240 })
      } else {
        globalThis.setTimeout(run, 60)
      }
    }
  })

  return {
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
  }
}
