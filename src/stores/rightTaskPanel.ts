import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useWindowStateStore } from './windowState'

// 任务面板 dock 标识（用于 windowState 物理加宽窗口，与文件面板 'file' 独立）
const TASK_DOCK_KEY = 'task'

/**
 * 右侧任务管理面板（main-layout__right-task-dock）全局开关态。
 *
 * 镜像 rightFilePanel：用于在应用级右侧新增独立的「任务管理」Dock，
 * 承载计划拆分实时预览与确认后的持久化任务列表管理。
 * 与文件面板完全独立：各自开合、各自物理加宽窗口（windowState key 不同），可共存。
 */
export const useRightTaskPanelStore = defineStore('rightTaskPanel', () => {
  const windowStateStore = useWindowStateStore()

  const rightTaskPlanId = ref<string | null>(null)
  const isRightTaskPanelOpen = ref(false)
  const rightTaskDockWidth = ref(440)
  // 是否正在拖拽调整 dock 宽度（拖拽期间不同步窗口物理宽度，避免抖动）
  const isDockResizing = ref(false)

  /** 打开任务面板并绑定计划（首次打开物理加宽窗口，追加面板宽度） */
  async function openForPlan(planId: string) {
    rightTaskPlanId.value = planId
    const wasOpen = isRightTaskPanelOpen.value
    isRightTaskPanelOpen.value = true
    if (!wasOpen) {
      await windowStateStore.expandForDock(TASK_DOCK_KEY, rightTaskDockWidth.value).catch((error) => {
        console.error('Failed to expand window for task dock:', error)
      })
    }
  }

  /** 关闭面板：缩回窗口到打开前的基础宽度 */
  async function close() {
    const wasOpen = isRightTaskPanelOpen.value
    isRightTaskPanelOpen.value = false
    if (wasOpen) {
      await windowStateStore.collapseDock(TASK_DOCK_KEY).catch((error) => {
        console.error('Failed to collapse window for task dock:', error)
      })
    }
  }

  function setDockWidth(width: number) {
    rightTaskDockWidth.value = width
    // 面板已打开且非拖拽中时，宽度变化同步到窗口物理宽度
    if (isRightTaskPanelOpen.value && !isDockResizing.value) {
      windowStateStore.expandForDock(TASK_DOCK_KEY, width).catch((error) => {
        console.error('Failed to sync window width for task dock:', error)
      })
    }
  }

  /** 拖拽调整 dock 宽度：开始/结束时调用，结束时一次性同步窗口物理宽度 */
  function setDockResizing(resizing: boolean) {
    isDockResizing.value = resizing
    if (!resizing && isRightTaskPanelOpen.value) {
      windowStateStore.expandForDock(TASK_DOCK_KEY, rightTaskDockWidth.value).catch((error) => {
        console.error('Failed to sync window width for task dock:', error)
      })
    }
  }

  return {
    rightTaskPlanId,
    isRightTaskPanelOpen,
    rightTaskDockWidth,
    openForPlan,
    close,
    setDockWidth,
    setDockResizing
  }
})
