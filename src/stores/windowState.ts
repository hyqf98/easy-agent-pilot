import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, currentMonitor, availableMonitors } from '@tauri-apps/api/window'
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'

// 窗口状态设置键
const WINDOW_STATE_KEY = 'windowState'

// 窗口状态版本号（修改比例时递增此版本号，强制重新计算窗口大小）
const WINDOW_STATE_VERSION = 5

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

// 默认窗口尺寸比例（相对于屏幕）
const DEFAULT_WIDTH_RATIO = 0.8   // 窗口宽度占屏幕宽度的80%
const DEFAULT_HEIGHT_RATIO = 0.8  // 窗口高度占屏幕高度的80%
const MIN_WIDTH = 1200
const MIN_HEIGHT = 720

// 标记是否正在初始化窗口（初始化期间不保存状态）
let isInitializing = false

export const useWindowStateStore = defineStore('windowState', () => {
  // State
  const isLoaded = ref(false)
  const saveTimeout: { value: ReturnType<typeof setTimeout> | null } = { value: null }

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

  // 获取屏幕尺寸并计算默认窗口大小（返回逻辑尺寸）
  async function calculateDefaultWindowSize(): Promise<{ width: number; height: number }> {
    try {
      // 获取当前窗口所在的显示器
      const monitor = await currentMonitor()
      console.log('[WindowState] 获取显示器信息:', monitor)
      if (monitor) {
        // 获取屏幕的逻辑尺寸（考虑 DPI 缩放）
        const screenSize = monitor.size
        const scaleFactor = monitor.scaleFactor
        console.log('[WindowState] 屏幕物理尺寸:', screenSize.width, 'x', screenSize.height, '缩放因子:', scaleFactor)

        // 计算逻辑尺寸（物理尺寸 / 缩放因子）
        const logicalWidth = Math.floor(screenSize.width / scaleFactor)
        const logicalHeight = Math.floor(screenSize.height / scaleFactor)
        console.log('[WindowState] 屏幕逻辑尺寸:', logicalWidth, 'x', logicalHeight)

        // 按比例计算窗口大小
        const width = Math.max(Math.floor(logicalWidth * DEFAULT_WIDTH_RATIO), MIN_WIDTH)
        const height = Math.max(Math.floor(logicalHeight * DEFAULT_HEIGHT_RATIO), MIN_HEIGHT)
        console.log('[WindowState] 计算的窗口尺寸:', width, 'x', height, '比例:', DEFAULT_WIDTH_RATIO, 'x', DEFAULT_HEIGHT_RATIO)
        return { width, height }
      }
    } catch (error) {
      console.error('[WindowState] 获取屏幕尺寸失败:', error)
    }
    // 如果无法获取屏幕尺寸，使用默认值
    console.log('[WindowState] 使用默认尺寸: 1400 x 900')
    return { width: 1400, height: 900 }
  }

  // 应用窗口状态（使用逻辑像素）
  async function applyWindowState(state: WindowState): Promise<void> {
    const appWindow = getCurrentWindow()

    // 获取所有显示器
    const monitors = await availableMonitors()
    console.log('[WindowState] 可用显示器数量:', monitors.length)

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

        console.log('[WindowState] 设置窗口位置到显示器', state.monitorIndex, '逻辑位置:', logicalX, logicalY)
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
      console.log('[WindowState] 初始化期间跳过保存')
      return
    }
    if (saveTimeout.value) {
      clearTimeout(saveTimeout.value)
    }
    saveTimeout.value = setTimeout(async () => {
      const currentState = await getCurrentWindowState()
      console.log('[WindowState] 保存窗口状态（逻辑像素）:', currentState)
      await saveWindowStateToDb(currentState)
    }, SAVE_DELAY)
  }

  // 初始化窗口状态
  async function initWindowState(): Promise<void> {
    // 设置初始化标记，防止在初始化期间保存状态
    isInitializing = true
    console.log('[WindowState] 开始初始化窗口状态...')

    try {
      // 从数据库加载保存的状态
      const savedState = await loadWindowStateFromDb()
      console.log('[WindowState] 保存的状态:', savedState)
      const appWindow = getCurrentWindow()

      // 检查是否需要重新计算窗口大小（版本号不匹配时强制重新计算）
      const needsRecalculate = !savedState || savedState.version !== WINDOW_STATE_VERSION
      console.log('[WindowState] 是否需要重新计算:', needsRecalculate, '当前版本:', WINDOW_STATE_VERSION, '保存版本:', savedState?.version)

      if (needsRecalculate) {
        // 版本不匹配或没有保存的状态，使用动态计算的默认尺寸
        console.log('[WindowState] 使用动态计算的默认尺寸')
        const defaultSize = await calculateDefaultWindowSize()
        console.log('[WindowState] 设置窗口大小（逻辑尺寸）:', defaultSize.width, 'x', defaultSize.height)
        // 使用 LogicalSize 设置窗口大小（自动处理 DPI 缩放）
        await appWindow.setSize(new LogicalSize(defaultSize.width, defaultSize.height))
        await appWindow.center()
        console.log('[WindowState] 窗口已居中')

        // 等待一下确保窗口已经完全设置好
        await new Promise(resolve => setTimeout(resolve, 100))

        // 获取当前位置（居中后的位置）
        const currentState = await getCurrentWindowState()
        console.log('[WindowState] 当前窗口状态:', currentState)

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
        console.log('[WindowState] 已保存新版本的窗口状态')
      } else if (savedState) {
        // 版本匹配，验证保存的状态是否有效
        const isValidSize = savedState.width >= MIN_WIDTH && savedState.height >= MIN_HEIGHT
        console.log('[WindowState] 保存的状态是否有效:', isValidSize, '最小尺寸:', MIN_WIDTH, 'x', MIN_HEIGHT)
        if (isValidSize) {
          console.log('[WindowState] 应用保存的窗口状态')
          await applyWindowState(savedState)
        } else {
          // 保存的状态无效，使用动态计算的默认尺寸
          console.log('[WindowState] 保存的状态无效，使用动态计算的默认尺寸')
          const defaultSize = await calculateDefaultWindowSize()
          await appWindow.setSize(new LogicalSize(defaultSize.width, defaultSize.height))
          await appWindow.center()
        }
      }

      isLoaded.value = true
      console.log('[WindowState] 窗口状态初始化完成')

      // 显示窗口
      await appWindow.show()
      await appWindow.setFocus()
      console.log('[WindowState] 窗口已显示')

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
      console.log('[WindowState] 初始化标记已清除')
    }
  }

  return {
    // State
    isLoaded,
    // Actions
    initWindowState,
    getCurrentWindowState,
    saveWindowStateToDb
  }
})
