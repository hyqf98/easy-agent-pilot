/** 窗口物理状态（位置、尺寸、显示器）与右侧 Dock 加宽的 Pinia store。 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, currentMonitor, availableMonitors } from '@tauri-apps/api/window'
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'

// 窗口状态设置键
const WINDOW_STATE_KEY = 'windowState'

// 窗口状态版本号（修改比例时递增此版本号，强制重新计算窗口大小）
const WINDOW_STATE_VERSION = 6

// 窗口状态接口
export interface WindowState {
  version?: number  // 版本号，用于检测是否需要重新计算
  monitorIndex?: number  // 显示器索引（支持多显示器）
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

// 防抖保存延迟（毫秒）
const SAVE_DELAY = 500

// 固定默认窗口尺寸（不再按屏幕比例缩放）
const DEFAULT_WIDTH = 1200
const DEFAULT_HEIGHT = 900
const MIN_WIDTH = 640
const MIN_HEIGHT = 480

// 标记是否正在初始化窗口（初始化期间不保存状态）
let isInitializing = false
// 标记是否正在程序化调整窗口尺寸（dock 展开收缩期间不保存「加宽后」状态）
let isProgrammaticResize = false

// dock 展开收缩相关常量
const FILE_DOCK_DEFAULT_WIDTH = 720

export const useWindowStateStore = defineStore('windowState', () => {
  // State
  const isLoaded = ref(false)
  const saveTimeout: { value: ReturnType<typeof setTimeout> | null } = { value: null }

  // dock 物理加宽：记录 dock 打开前的「基础宽度」，关闭时缩回该宽度
  // key = dock 标识（便于多面板复用，当前仅 'file'）
  const dockBaseWidth = ref<Record<string, number>>({})
  const dockOpenWidth = ref<Record<string, number>>({})

  // 保存窗口状态到数据库
  async function saveWindowStateToDb(state: WindowState): Promise<void> {
    try {
      await invoke('save_app_setting', {
        key: WINDOW_STATE_KEY,
        value: JSON.stringify(state)
      })
    } catch (error) {
      console.error('Failed to save window state:', error)
    }
  }

  // 从数据库加载窗口状态
  async function loadWindowStateFromDb(): Promise<WindowState | null> {
    try {
      const savedState = await invoke<string | null>('get_app_setting', { key: WINDOW_STATE_KEY })
      if (savedState) {
        return JSON.parse(savedState) as WindowState
      }
    } catch (error) {
      console.error('Failed to load window state:', error)
    }
    return null
  }

  // 获取当前窗口状态（返回逻辑像素值）
  async function getCurrentWindowState(): Promise<WindowState> {
    const appWindow = getCurrentWindow()
    const monitor = await currentMonitor()
    const position = await appWindow.outerPosition()
    const size = await appWindow.outerSize()
    const isMaximized = await appWindow.isMaximized()

    // 获取缩放因子来转换物理像素到逻辑像素
    const scaleFactor = monitor?.scaleFactor || 1

    // 获取显示器索引
    const monitors = await availableMonitors()
    let monitorIndex = 0
    if (monitor) {
      const monitorPosition = monitor.position
      for (let i = 0; i < monitors.length; i++) {
        if (monitors[i].position.x === monitorPosition.x &&
            monitors[i].position.y === monitorPosition.y) {
          monitorIndex = i
          break
        }
      }
    }

    return {
      x: Math.floor(position.x / scaleFactor),
      y: Math.floor(position.y / scaleFactor),
      width: Math.floor(size.width / scaleFactor),
      height: Math.floor(size.height / scaleFactor),
      isMaximized,
      monitorIndex
    }
  }

  // 获取默认窗口大小（固定尺寸，不再按屏幕比例缩放）
  async function calculateDefaultWindowSize(): Promise<{ width: number; height: number }> {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  }

  // 应用窗口状态（使用逻辑像素）
  async function applyWindowState(state: WindowState): Promise<void> {
    const appWindow = getCurrentWindow()

    // 获取所有显示器
    const monitors = await availableMonitors()

    // 首先设置窗口大小
    await appWindow.setSize(new LogicalSize(state.width, state.height))

    // 如果之前是最大化状态，先设置大小，再最大化
    if (state.isMaximized) {
      // 居中窗口
      await appWindow.center()
      // 然后最大化
      await appWindow.maximize()
    } else {
      // 验证位置是否在屏幕范围内
      const isValidPosition = state.x >= 0 && state.y >= 0
      if (isValidPosition && state.monitorIndex !== undefined && state.monitorIndex < monitors.length) {
        // 尝试将窗口放置在之前保存的显示器上
        const targetMonitor = monitors[state.monitorIndex]
        const monitorPosition = targetMonitor.position
        const scaleFactor = targetMonitor.scaleFactor

        // 计算目标显示器上的逻辑位置
        const logicalX = Math.floor(monitorPosition.x / scaleFactor) + state.x
        const logicalY = Math.floor(monitorPosition.y / scaleFactor) + state.y

        await appWindow.setPosition(new LogicalPosition(logicalX, logicalY))
      } else if (isValidPosition) {
        // 没有显示器信息，使用保存的绝对位置
        await appWindow.setPosition(new LogicalPosition(state.x, state.y))
      } else {
        // 位置无效，居中显示
        await appWindow.center()
      }
    }
  }

  // 防抖保存窗口状态
  function debouncedSave(): void {
    // 初始化期间不保存状态
    if (isInitializing) {
      return
    }
    // dock 展开/收缩期间的程序化调整不保存（避免把「加宽后」状态持久化）
    if (isProgrammaticResize) {
      return
    }
    if (saveTimeout.value) {
      clearTimeout(saveTimeout.value)
    }
    saveTimeout.value = setTimeout(async () => {
      const currentState = await getCurrentWindowState()
      await saveWindowStateToDb(currentState)
    }, SAVE_DELAY)
  }

  // 初始化窗口状态
  async function initWindowState(): Promise<void> {
    // 设置初始化标记，防止在初始化期间保存状态
    isInitializing = true

    try {
      // 从数据库加载保存的状态
      const savedState = await loadWindowStateFromDb()
      const appWindow = getCurrentWindow()

      // 检查是否需要重新计算窗口大小（版本号不匹配时强制重新计算）
      const needsRecalculate = !savedState || savedState.version !== WINDOW_STATE_VERSION

      if (needsRecalculate) {
        // 版本不匹配或没有保存的状态，使用动态计算的默认尺寸
        const defaultSize = await calculateDefaultWindowSize()
        // 使用 LogicalSize 设置窗口大小（自动处理 DPI 缩放）
        await appWindow.setSize(new LogicalSize(defaultSize.width, defaultSize.height))
        await appWindow.center()

        // 等待一下确保窗口已经完全设置好
        await new Promise(resolve => setTimeout(resolve, 100))

        // 获取当前位置（居中后的位置）
        const currentState = await getCurrentWindowState()

        // 保存新的状态（带版本号）
        const newState: WindowState = {
          version: WINDOW_STATE_VERSION,
          monitorIndex: currentState.monitorIndex,
          x: currentState.x,
          y: currentState.y,
          width: defaultSize.width,
          height: defaultSize.height,
          isMaximized: false
        }
        await saveWindowStateToDb(newState)
      } else if (savedState) {
        // 版本匹配，验证保存的状态是否有效
        const isValidSize = savedState.width >= MIN_WIDTH && savedState.height >= MIN_HEIGHT
        if (isValidSize) {
          await applyWindowState(savedState)
        } else {
          // 保存的状态无效，使用动态计算的默认尺寸
          const defaultSize = await calculateDefaultWindowSize()
          await appWindow.setSize(new LogicalSize(defaultSize.width, defaultSize.height))
          await appWindow.center()
        }
      }

      isLoaded.value = true

      // 显示窗口
      await appWindow.show()
      await appWindow.setFocus()

      // 监听窗口大小变化
      await appWindow.onResized(() => {
        debouncedSave()
      })

      // 监听窗口移动
      await appWindow.onMoved(() => {
        debouncedSave()
      })
    } finally {
      // 初始化完成，清除标记
      isInitializing = false
    }
  }

  /**
   * 物理加宽窗口以容纳某个 dock（如文件预览面板）。
   * 打开时记录当前「基础宽度」，并将窗口宽度 += dockWidth；关闭时缩回基础宽度。
   * 展开收缩期间的 setSize 不触发持久化保存，避免把「加宽后」状态存库。
   * @param key dock 标识，便于后续多面板复用
   * @param dockWidth 该 dock 占用的逻辑像素宽度
   */
  async function expandForDock(key: string, dockWidth: number): Promise<void> {
    // 已展开过该 dock：仅更新目标宽度差量
    if (dockOpenWidth.value[key]) {
      const prevWidth = dockOpenWidth.value[key]
      if (prevWidth === dockWidth) return
      dockOpenWidth.value[key] = dockWidth
      await resizeBy(dockWidth - prevWidth)
      return
    }

    const appWindow = getCurrentWindow()
    const size = await appWindow.outerSize()
    const monitor = await currentMonitor()
    const scaleFactor = monitor?.scaleFactor || 1
    const currentLogicalWidth = Math.floor(size.width / scaleFactor)

    dockBaseWidth.value[key] = currentLogicalWidth
    dockOpenWidth.value[key] = dockWidth
    await resizeBy(dockWidth)
  }

  /** 关闭 dock 时把窗口缩回其打开前的基础宽度 */
  async function collapseDock(key: string): Promise<void> {
    const openWidth = dockOpenWidth.value[key]
    if (!openWidth) return
    delete dockOpenWidth.value[key]
    delete dockBaseWidth.value[key]
    await resizeBy(-openWidth)
  }

  /** 程序化增减窗口宽度（不触发持久化保存） */
  async function resizeBy(deltaWidth: number): Promise<void> {
    if (deltaWidth === 0) return
    const appWindow = getCurrentWindow()
    const size = await appWindow.outerSize()
    const monitor = await currentMonitor()
    const scaleFactor = monitor?.scaleFactor || 1
    const currentLogicalWidth = Math.floor(size.width / scaleFactor)
    const currentLogicalHeight = Math.floor(size.height / scaleFactor)

    isProgrammaticResize = true
    try {
      await appWindow.setSize(
        new LogicalSize(currentLogicalWidth + deltaWidth, currentLogicalHeight)
      )
    } finally {
      // 延迟清除标记，确保 onResized 回调已跳过
      setTimeout(() => { isProgrammaticResize = false }, 300)
    }
  }

  return {
    // State
    isLoaded,
    // Actions
    initWindowState,
    getCurrentWindowState,
    saveWindowStateToDb,
    expandForDock,
    collapseDock,
    FILE_DOCK_DEFAULT_WIDTH
  }
})
