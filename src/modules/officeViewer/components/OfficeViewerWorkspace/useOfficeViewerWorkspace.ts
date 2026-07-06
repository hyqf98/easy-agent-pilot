/**
 * useOfficeViewerWorkspace — Office 文件查看工作区的全部业务逻辑。
 *
 * 职责：
 * 1. 依据 store.fileType 选择对应查看器组件（Pdf / Sheet / Docx / Slide），
 *    通过 defineAsyncComponent 懒加载，避免一次性打包所有重型库；
 * 2. 计算工具栏展示状态：文件类型标签、保存状态（dirty 判定）、是否可编辑；
 * 3. 处理返回聊天、保存（含 Ctrl/Cmd+S 全局快捷键）等交互；
 * 4. 把 loading 事件透传给外部（占位 handleLoading）。
 *
 * 该 composable 不直接渲染模板，store / 计算属性 / 事件处理函数 / 子组件通过返回值暴露给模板使用。
 */
import { defineAsyncComponent, computed, onMounted, onBeforeUnmount } from 'vue'
import { EaButton, EaIcon } from '@/components/common'
import { useOfficeViewerStore } from '../../stores/officeViewer'
import { useUIStore } from '@/stores/ui'
import { OFFICE_FILE_TYPE_LABELS } from '../../types'

/** OfficeViewerWorkspace 组件 Props */
export interface OfficeViewerWorkspaceProps {
  compact?: boolean
}

/** OfficeViewerWorkspace 组件 Emits（当前无自定义事件） */
export interface OfficeViewerWorkspaceEmits {}

export function useOfficeViewerWorkspace(_props?: OfficeViewerWorkspaceProps) {
  const PdfViewer = defineAsyncComponent(() => import('../PdfViewer/PdfViewer.vue'))
  const SheetEditor = defineAsyncComponent(() => import('../SheetEditor/SheetEditor.vue'))
  const DocxEditor = defineAsyncComponent(() => import('../DocxEditor/DocxEditor.vue'))
  const SlideEditor = defineAsyncComponent(() => import('../SlideEditor/SlideEditor.vue'))

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

  return {
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
  }
}
