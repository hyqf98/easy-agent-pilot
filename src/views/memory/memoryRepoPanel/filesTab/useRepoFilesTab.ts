/** useRepoFilesTab — 记忆库仓库「文件」Tab 的 composable，复用主会话 FileTree/FileEditorWorkspace 以仓库目录为根进行文件管理。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import { useFileEditorStore, openProjectFileInWorkspace } from '@/modules/fileEditor'

const MIN_TREE_WIDTH = 180
const MAX_TREE_WIDTH = 420
const DEFAULT_TREE_WIDTH = 240

/**
 * 仓库文件 Tab 逻辑。
 *
 * 直接复用主会话的 FileTree（新建/重命名/删除/拖拽/搜索）与 FileEditorWorkspace
 * （Monaco / 富文本 Markdown / 图片预览），以仓库目录为根，做到与主会话文件管理一致。
 * 文件结构不再由创建时预置，而由 AI（归纳/任务）或用户在文件树中按需创建。
 */
export function useRepoFilesTab() {
  const memoryRepoStore = useMemoryRepoStore()
  const fileEditorStore = useFileEditorStore()

  const activeRepo = computed(() => memoryRepoStore.activeRepo)
  const treeWidth = ref(DEFAULT_TREE_WIDTH)
  const isResizing = ref(false)

  /** 选中文件 → 在右侧编辑器中打开（以仓库目录为 project 根）。 */
  async function handleFileSelect(filePath: string): Promise<void> {
    const repo = activeRepo.value
    if (!repo) return
    await openProjectFileInWorkspace({
      projectId: repo.id,
      projectPath: repo.repoPath,
      filePath
    })
  }

  /** 拖拽分隔条调整文件树宽度。 */
  function startResize(event: MouseEvent): void {
    isResizing.value = true
    const startX = event.clientX
    const startWidth = treeWidth.value

    const onMove = (e: MouseEvent): void => {
      const delta = e.clientX - startX
      treeWidth.value = Math.min(MAX_TREE_WIDTH, Math.max(MIN_TREE_WIDTH, startWidth + delta))
    }
    const onUp = (): void => {
      isResizing.value = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // 切换仓库时重置编辑器，避免残留上一个仓库的文件内容
  watch(
    () => activeRepo.value?.id,
    () => {
      fileEditorStore.resetEditorState()
    }
  )

  onBeforeUnmount(() => {
    fileEditorStore.resetEditorState()
  })

  return {
    activeRepo,
    treeWidth,
    isResizing,
    startResize,
    handleFileSelect
  }
}
