/** usePetView — 桌面宠物悬浮窗视图的 composable，管理宠物精灵图、动作切换、聊天模拟与窗口生命周期。 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '@/stores/settings'
import { useDesktopPetStore } from '@/stores/desktopPet'
import { useWindowManagerStore } from '@/stores/windowManager'
import { getPetSpritesheetUrl, listLocalPets, setPetAlwaysOnTop } from '@/services/desktopPet'
import { createPetApp, PET_ACTIONS } from '@/modules/desktopPet/engine'
import type { PetApp } from '@/modules/desktopPet/engine'
import type { LocalPetInfo } from '@/types/desktopPet'
import { chunkMessage, pickCannedMessage } from '@/modules/desktopPet/chatSim'

/**
 * 桌面宠物悬浮窗视图 composable。
 *
 * 职责：在透明窗口中 bootstrap Pixi 引擎；加载激活宠物的精灵图；监听切换事件实时换宠物；
 * 画布拖拽移动窗口（OS 级）；左键单击宠物弹出动作菜单（定位在宠物右侧，靠边时自动翻转）；
 * 右键打开自定义菜单（切换下一只 / 动作 / 打开设置 / 隐藏）；鼠标悬停宠物时触发模拟 SSE 对话气泡。
 *
 * 透明窗口默认 setIgnoreCursorEvents(true) 整窗穿透（不阻挡背后软件点击），仅当光标在宠物
 * 精灵包围盒内时切换为可交互，由 click-through 轮询（~60ms）驱动。
 *
 * 注意：本视图运行在独立的 "pet" 窗口（windowManager.isPetWindow 为 true），不应触发主窗口
 * 的启动逻辑。设置 store 仍需加载以读取 desktopPetActiveId / desktopPetAlwaysOnTop。
 */

// 点击 vs 拖拽阈值（CSS px）。按下后位移超过该值即判定为拖拽，不再视为单击。
const DRAG_THRESHOLD_PX = 5
// click-through 轮询间隔（ms）。穿透态下窗口收不到 pointermove，故用轮询检测光标位置。
const CLICKTHROUGH_POLL_MS = 60
// 模拟 SSE 节奏（ms/token）。
const SIM_TOKEN_INTERVAL_MS = 70
// 移出宠物后对话气泡停留时间再淡出（ms）。
const SIM_LINGER_MS = 600

// 菜单位置估算（与 CSS min-width 对齐）。
const MENU_WIDTH = 140
const MENU_GAP = 12

export function usePetView() {
  const settingsStore = useSettingsStore()
  const desktopPetStore = useDesktopPetStore()
  const windowManagerStore = useWindowManagerStore()

  const hostRef = ref<HTMLElement | null>(null)
  const petApp = ref<PetApp | null>(null)
  const loadError = ref<string | null>(null)
  const isLoading = ref(true)

  // 本地宠物快照（用于"切换下一只"菜单），激活 id 来自 settings。
  const localPets = ref<LocalPetInfo[]>([])

  // 右键菜单
  const contextMenuVisible = ref(false)
  const contextMenuX = ref(0)
  const contextMenuY = ref(0)

  // 动作菜单（单击宠物打开）
  const actionMenuVisible = ref(false)
  const actionMenuX = ref(0)
  const actionMenuY = ref(0)

  const actions = PET_ACTIONS

  const activePetId = computed(() => settingsStore.settings.desktopPetActiveId)

  // --- 点击 / 拖拽状态机 ------------------------------------------------
  // 按下时不立即 startDragging；移动超过阈值才拖。抬起时若未拖拽 = 干净单击 → 命中宠物才开菜单。
  // Tauri 的 startDragging() 是 OS 模态拖拽，调用后 webview 通常收不到 pointerup ——
  // 这正是我们要的：一旦进入拖拽，"单击"分支永不会被触发。
  const pointerArmed = ref(false)
  const dragging = ref(false)
  let downX = 0
  let downY = 0

  // --- click-through 状态 ----------------------------------------------
  const win = getCurrentWindow()
  let clickThroughTimer: ReturnType<typeof setInterval> | null = null
  let currentIgnoreState: boolean | null = null
  let hovering = false

  // --- 模拟 SSE 状态 ----------------------------------------------------
  let chatTimer: ReturnType<typeof setInterval> | null = null
  let chatLingerTimer: ReturnType<typeof setTimeout> | null = null

  /** 解析当前激活宠物的精灵图 URL。 */
  async function resolveActiveSrc(): Promise<{ id: string; src: string } | null> {
    const id = activePetId.value
    if (!id) return null
    try {
      const src = await getPetSpritesheetUrl(id)
      return { id, src }
    } catch (error) {
      console.error('[PetView] resolve active spritesheet failed:', error)
      return null
    }
  }

  /** bootstrap 引擎并加载初始宠物。 */
  async function bootPetApp(): Promise<void> {
    if (!hostRef.value) return
    isLoading.value = true
    loadError.value = null

    const resolved = await resolveActiveSrc()
    if (!resolved) {
      // 没有激活宠物：尝试加载本地列表并选第一只。
      localPets.value = await listLocalPets()
      if (localPets.value.length === 0) {
        loadError.value = 'NO_PET_INSTALLED'
        isLoading.value = false
        return
      }
      settingsStore.settings.desktopPetActiveId = localPets.value[0].id
    }

    const again = await resolveActiveSrc()
    if (!again) {
      loadError.value = 'NO_PET_INSTALLED'
      isLoading.value = false
      return
    }

    try {
      petApp.value = await createPetApp(hostRef.value, {
        initialPetId: again.id,
        initialSpritesheetSrc: again.src
      })

      // 鼠标进入宠物 → 触发模拟对话；离开宠物 → 停止流式并淡出隐藏。
      petApp.value.onPetHoverChange = (inside) => {
        if (inside) {
          startSimulatedChat()
        } else {
          stopSimulatedChat()
        }
      }
      isLoading.value = false
    } catch (error) {
      console.error('[PetView] boot pet app failed:', error)
      loadError.value = error instanceof Error ? error.message : String(error)
      isLoading.value = false
    }
  }

  /** 切换到指定宠物 id（运行时换精灵图）。 */
  async function switchToPet(petId: string): Promise<void> {
    if (!petApp.value || petId === petApp.value.currentPetId) return
    settingsStore.settings.desktopPetActiveId = petId
    try {
      const src = await getPetSpritesheetUrl(petId)
      await petApp.value.switchPet(petId, src)
    } catch (error) {
      console.error('[PetView] switch pet failed:', error)
    }
  }

  /** 切换到下一只本地宠物（右键菜单"下一只"）。 */
  async function switchToNextPet(): Promise<void> {
    if (localPets.value.length === 0) {
      localPets.value = await listLocalPets()
    }
    if (localPets.value.length === 0) return
    const currentId = activePetId.value ?? localPets.value[0].id
    const currentIndex = localPets.value.findIndex((pet) => pet.id === currentId)
    const nextIndex = (currentIndex + 1) % localPets.value.length
    const next = localPets.value[nextIndex]
    if (next) {
      await switchToPet(next.id)
    }
  }

  // --- 菜单 --------------------------------------------------------------

  /**
   * 计算菜单位置：默认在宠物右侧，右侧放不下则翻到左侧，两侧都不够则居中钳制。
   * 垂直对齐宠物顶部，钳制在窗口可见区内。
   */
  function computeMenuPosition(
    petBounds: { minX: number; minY: number; maxX: number; maxY: number },
    winW: number,
    winH: number,
    menuHeight: number
  ): { x: number; y: number } {
    const rightX = petBounds.maxX + MENU_GAP
    const fitsRight = rightX + MENU_WIDTH <= winW - 8

    let x: number
    if (fitsRight) {
      x = rightX
    } else {
      // 右侧放不下 → 尝试左侧。
      const leftX = petBounds.minX - MENU_GAP - MENU_WIDTH
      if (leftX >= 8) {
        x = leftX
      } else {
        // 两侧都不够 → 居中钳制。
        x = Math.max(8, Math.min(winW - MENU_WIDTH - 8, (winW - MENU_WIDTH) / 2))
      }
    }

    const y = Math.max(8, Math.min(winH - menuHeight - 8, petBounds.minY))
    return { x, y }
  }

  function openActionMenu(): void {
    const app = petApp.value
    if (!app) return
    const bounds = app.getPetBounds()
    // 动作菜单 7 项，每项 ~26px + padding ~8px ≈ 190px。
    const pos = computeMenuPosition(bounds, window.innerWidth, window.innerHeight, 190)
    actionMenuX.value = pos.x
    actionMenuY.value = pos.y
    actionMenuVisible.value = true
    contextMenuVisible.value = false
    // 菜单可见时窗口必须可交互（用户要点击菜单项）。
    void setIgnoreCursorEvents(false)
  }

  function openContextMenu(): void {
    const app = petApp.value
    if (!app) return
    const bounds = app.getPetBounds()
    // 右键菜单 3 项 ≈ 90px。
    const pos = computeMenuPosition(bounds, window.innerWidth, window.innerHeight, 90)
    contextMenuX.value = pos.x
    contextMenuY.value = pos.y
    contextMenuVisible.value = true
    actionMenuVisible.value = false
    void setIgnoreCursorEvents(false)
  }

  function closeAllMenus(): void {
    actionMenuVisible.value = false
    contextMenuVisible.value = false
  }

  /** 执行一个动作（动作菜单点击）。 */
  function handleAction(actionId: string): void {
    petApp.value?.playAction(actionId)
    actionMenuVisible.value = false
  }

  /** 隐藏宠物窗口。 */
  async function handleHide(): Promise<void> {
    closeAllMenus()
    await invoke('hide_pet_window')
  }

  /** 打开设置（聚焦主窗口并跳到桌面宠物设置）。需要主窗口可见。 */
  async function handleOpenSettings(): Promise<void> {
    closeAllMenus()
    try {
      const { emit } = await import('@tauri-apps/api/event')
      // 主窗口监听 desktop-pet:open-settings 事件并打开设置页。
      await emit('desktop-pet:open-settings', { tab: 'desktopPet' })
    } catch (error) {
      console.error('[PetView] open settings failed:', error)
    }
  }

  // --- 拖拽 / 单击 / 右键 ------------------------------------------------

  function handlePointerDown(event: PointerEvent): void {
    // 右键 → 打开上下文菜单（不拖拽）。
    if (event.button === 2) {
      event.preventDefault()
      openContextMenu()
      return
    }
    // 左键按下 → 进入"待定"状态：记录起点，但不立即拖拽。是否拖拽由 pointermove 判定，
    // 是否开菜单由 pointerup 在"未拖拽"时按命中宠物判定。
    if (event.button === 0) {
      pointerArmed.value = true
      dragging.value = false
      downX = event.clientX
      downY = event.clientY
    }
  }

  // window 级 pointermove：左键按下且位移超阈值 → 进入 OS 拖拽（只触发一次）。
  function handleWindowPointerMove(event: PointerEvent): void {
    if (!pointerArmed.value || dragging.value) return
    if (event.buttons !== 1) return
    const dx = event.clientX - downX
    const dy = event.clientY - downY
    if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
      dragging.value = true
      // 进入 OS 模态拖拽后，后续 pointerup 可能不再到达 webview —— 这正是我们期望的：
      // 拖拽期间绝不触发"单击 → 开菜单"。
      void getCurrentWindow().startDragging()
    }
  }

  // window 级 pointerup：若全程未拖拽 = 干净单击 → 命中宠物才开动作菜单，否则关菜单。
  function handleWindowPointerUp(event: PointerEvent): void {
    if (!pointerArmed.value) return
    const wasDragging = dragging.value
    pointerArmed.value = false
    dragging.value = false
    if (wasDragging) return

    const app = petApp.value
    if (!app) return
    const hit = app.hitTest(event.clientX, event.clientY)
    if (hit) {
      openActionMenu()
    } else {
      closeAllMenus()
    }
  }

  function handleContextMenu(event: MouseEvent): void {
    // 阻止浏览器默认右键菜单，统一用自定义菜单。
    event.preventDefault()
    openContextMenu()
  }

  // --- 透明窗口穿透控制 --------------------------------------------------

  /** 设置窗口是否忽略鼠标事件（穿透）。带去重，避免重复 IPC 调用。 */
  async function setIgnoreCursorEvents(ignore: boolean): Promise<void> {
    if (currentIgnoreState === ignore) return
    currentIgnoreState = ignore
    try {
      await win.setIgnoreCursorEvents(ignore)
    } catch (error) {
      console.error('[PetView] setIgnoreCursorEvents failed:', error)
      // 失败时重置缓存以便下次重试。
      currentIgnoreState = null
    }
  }

  /**
   * click-through 轮询：每 ~60ms 检测光标是否在宠物包围盒内。
   * 穿透态下窗口收不到 pointermove，只能用 Tauri 的 cursorPosition + outerPosition 计算。
   * - 在宠物内 → setIgnoreCursorEvents(false)（可交互）+ onPetHoverChange(true)
   * - 不在宠物内 → setIgnoreCursorEvents(true)（穿透）+ onPetHoverChange(false)
   * - 拖拽中或菜单打开 → 保持可交互，不切换。
   */
  async function pollClickThrough(): Promise<void> {
    const app = petApp.value
    if (!app) return
    // 保护态：拖拽中或菜单可见时窗口必须可交互。
    if (pointerArmed.value || dragging.value || actionMenuVisible.value || contextMenuVisible.value) {
      await setIgnoreCursorEvents(false)
      return
    }

    try {
      const [cursor, origin, scale] = await Promise.all([
        // cursorPosition / outerPosition 返回物理像素。
        import('@tauri-apps/api/window').then((m) => m.cursorPosition()),
        win.outerPosition(),
        win.scaleFactor(),
      ])
      if (scale <= 0) return

      // 光标相对窗口原点的逻辑坐标（CSS px）。
      const localX = (cursor.x - origin.x) / scale
      const localY = (cursor.y - origin.y) / scale

      const b = app.getPetBounds()
      const inside = localX >= b.minX && localX <= b.maxX && localY >= b.minY && localY <= b.maxY

      await setIgnoreCursorEvents(!inside)
      if (inside !== hovering) {
        hovering = inside
        app.onPetHoverChange?.(inside)
      }
    } catch {
      // 光标位置获取失败（如权限问题）时默认可交互，确保宠物不会卡死不可点。
      await setIgnoreCursorEvents(false)
    }
  }

  function startClickThroughLoop(): void {
    if (clickThroughTimer) return
    clickThroughTimer = setInterval(() => {
      void pollClickThrough()
    }, CLICKTHROUGH_POLL_MS)
  }

  function stopClickThroughLoop(): void {
    if (clickThroughTimer) {
      clearInterval(clickThroughTimer)
      clickThroughTimer = null
    }
  }

  // --- 模拟 SSE 对话 -----------------------------------------------------

  /** 鼠标悬停到宠物时启动一段模拟流式对话（打字机）。每次悬停都触发。 */
  function startSimulatedChat(): void {
    const app = petApp.value
    if (!app) return
    stopChatTimers()
    app.showChat()

    const chunks = chunkMessage(pickCannedMessage())
    let index = 0
    chatTimer = setInterval(() => {
      if (index >= chunks.length) {
        finishStreaming()
        return
      }
      app.appendChatToken(chunks[index])
      index += 1
    }, SIM_TOKEN_INTERVAL_MS)
  }

  /** 鼠标移出宠物：停止流式，短暂停留后淡出隐藏。 */
  function stopSimulatedChat(): void {
    const app = petApp.value
    if (!app) return
    if (chatTimer) {
      clearInterval(chatTimer)
      chatTimer = null
    }
    app.endChat()
    chatLingerTimer = setTimeout(() => {
      petApp.value?.hideChat()
      chatLingerTimer = null
    }, SIM_LINGER_MS)
  }

  function finishStreaming(): void {
    if (chatTimer) {
      clearInterval(chatTimer)
      chatTimer = null
    }
    petApp.value?.endChat()
  }

  function stopChatTimers(): void {
    if (chatTimer) {
      clearInterval(chatTimer)
      chatTimer = null
    }
    if (chatLingerTimer) {
      clearTimeout(chatLingerTimer)
      chatLingerTimer = null
    }
  }

  // --- 生命周期 ----------------------------------------------------------

  onMounted(async () => {
    // 标记 body 为透明窗口，覆盖全局不透明背景，让桌面透出。
    document.body.classList.add('pet-window-transparent')

    // pet 窗口仍需加载设置（读取激活宠物 / 置顶）与窗口上下文。
    await settingsStore.loadSettings()
    await windowManagerStore.initWindowContext()

    // 同步置顶状态到窗口（设置可能在外部被改过）。
    await setPetAlwaysOnTop(settingsStore.settings.desktopPetAlwaysOnTop)

    // 监听主窗口发出的切换事件。
    await desktopPetStore.startPetSwitchListener((payload) => {
      void switchToPet(payload.petId)
    })

    // 点击/拖拽判定用 window 级监听（捕获阶段），保证拖拽途中也能感知。
    window.addEventListener('pointermove', handleWindowPointerMove, true)
    window.addEventListener('pointerup', handleWindowPointerUp, true)

    await bootPetApp()

    // 引擎就绪后启动穿透轮询：默认穿透，光标到宠物上才可交互。
    startClickThroughLoop()
  })

  // settings.desktopPetActiveId 被外部（设置页）改写时，若引擎已就绪则切换。
  watch(activePetId, (id) => {
    if (id && petApp.value && id !== petApp.value.currentPetId) {
      void switchToPet(id)
    }
  })

  onUnmounted(() => {
    document.body.classList.remove('pet-window-transparent')
    window.removeEventListener('pointermove', handleWindowPointerMove, true)
    window.removeEventListener('pointerup', handleWindowPointerUp, true)
    stopClickThroughLoop()
    stopChatTimers()
    desktopPetStore.stopPetSwitchListener()
    // 卸载前恢复窗口可交互，避免卡在穿透态。
    void setIgnoreCursorEvents(false)
    void petApp.value?.destroy()
    petApp.value = null
  })

  return {
    // refs
    hostRef,
    petApp,
    loadError,
    isLoading,
    localPets,
    contextMenuVisible,
    contextMenuX,
    contextMenuY,
    actionMenuVisible,
    actionMenuX,
    actionMenuY,
    actions,
    activePetId,
    // handlers
    handlePointerDown,
    handleContextMenu,
    handleAction,
    switchToNextPet,
    handleHide,
    handleOpenSettings,
    closeAllMenus
  }
}
