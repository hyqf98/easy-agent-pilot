/** 右侧文件审查面板全局开关与绑定的 Pinia store。 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useUIStore } from './ui'
import { useFileChangeStore } from './fileChange'
import { useWindowStateStore } from './windowState'

// 文件面板 dock 标识（用于 windowState 物理加宽窗口）
const FILE_DOCK_KEY = 'file'

/**
 * 右侧文件面板（main-layout__right-dock）全局开关态。
 *
 * 此前面板开合状态是 useMainLayout 内的局部 ref，外部（如 AI 消息中的文件链接点击）
 * 无法触发开面板，导致点击文件名时面板不出现。提升到 store 后，任意位置都能调用
 * openForProject 打开右侧面板并绑定项目。
 */
export const useRightFilePanelStore = defineStore('rightFilePanel', () => {
  const uiStore = useUIStore()
  const fileChangeStore = useFileChangeStore()
  const windowStateStore = useWindowStateStore()

  const rightFileProjectId = ref<string | null>(null)
  const isRightFilePanelOpen = ref(false)
  const rightDockWidth = ref(720)
  const rightTreeWidth = ref(220)
  // 是否正在拖拽调整 dock 宽度（拖拽期间不同步窗口物理宽度，避免抖动）
  const isDockResizing = ref(false)

  /** 打开右侧面板并绑定项目（不改变文件内容模式，保留由调用方按需切换） */
  async function openForProject(projectId: string) {
    rightFileProjectId.value = projectId
    const wasOpen = isRightFilePanelOpen.value
    isRightFilePanelOpen.value = true
    // 首次打开时物理加宽窗口，追加面板宽度，会话区维持默认宽度不被挤压
    if (!wasOpen) {
      await windowStateStore.expandForDock(FILE_DOCK_KEY, rightDockWidth.value).catch((error) => {
        console.error('Failed to expand window for file dock:', error)
      })
    }
  }

  /** 关闭面板：复位文件内容模式到 chat、并关闭文件变更审查 */
  async function close() {
    const wasOpen = isRightFilePanelOpen.value
    isRightFilePanelOpen.value = false
    const isFileWorkspaceActive =
      uiStore.mainContentMode === 'fileEditor'
      || uiStore.mainContentMode === 'officeViewer'
      || uiStore.mainContentMode === 'fileDiff'
    if (isFileWorkspaceActive) {
      uiStore.setMainContentMode('chat')
    }
    if (fileChangeStore.activeReviewRequestId) {
      fileChangeStore.closeReview()
    }
    // 关闭时缩回窗口到打开前的基础宽度
    if (wasOpen) {
      await windowStateStore.collapseDock(FILE_DOCK_KEY).catch((error) => {
        console.error('Failed to collapse window for file dock:', error)
      })
    }
  }

  function setDockWidth(width: number) {
    rightDockWidth.value = width
    // 面板已打开且非拖拽中时，宽度变化同步到窗口物理宽度
    if (isRightFilePanelOpen.value && !isDockResizing.value) {
      windowStateStore.expandForDock(FILE_DOCK_KEY, width).catch((error) => {
        console.error('Failed to sync window width for file dock:', error)
      })
    }
  }

  /** 拖拽调整 dock 宽度：开始/结束时调用，结束时一次性同步窗口物理宽度 */
  function setDockResizing(resizing: boolean) {
    isDockResizing.value = resizing
    if (!resizing && isRightFilePanelOpen.value) {
      windowStateStore.expandForDock(FILE_DOCK_KEY, rightDockWidth.value).catch((error) => {
        console.error('Failed to sync window width for file dock:', error)
      })
    }
  }

  function setTreeWidth(width: number) {
    rightTreeWidth.value = width
  }

  return {
    rightFileProjectId,
    isRightFilePanelOpen,
    rightDockWidth,
    rightTreeWidth,
    openForProject,
    close,
    setDockWidth,
    setDockResizing,
    setTreeWidth
  }
})
