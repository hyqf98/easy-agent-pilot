/** 桌面宠物全局开关与设置同步的 composable（仅主窗口实例化）。 */
import { onMounted, onUnmounted, watch } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { useSettingsStore } from '@/stores/settings'
import { useWindowManagerStore } from '@/stores/windowManager'
import { useDesktopPetStore } from '@/stores/desktopPet'
import { useUIStore } from '@/stores/ui'

/**
 * 桌面宠物的全局开关 composable（仅在主窗口实例化，见 App.vue）。
 *
 * 职责：
 *   - 监听 settings.desktopPetEnabled：开启→显示宠物窗口；关闭→隐藏。
 *   - 监听 settings.desktopPetActiveId：切换激活宠物时通知宠物窗口重载精灵图。
 *   - 监听 settings.desktopPetAlwaysOnTop：同步窗口置顶状态。
 *   - 监听 `desktop-pet:open-settings` 事件：宠物右键"打开设置"时跳到桌面宠物设置页。
 *   - 应用启动时，若宠物已启用则显示窗口。
 *
 * 仿照 useMiniPanelShortcut 的结构（onMounted watch + onUnmounted 清理）。
 */
export function useDesktopPet() {
  const settingsStore = useSettingsStore()
  const windowManagerStore = useWindowManagerStore()
  const desktopPetStore = useDesktopPetStore()
  const uiStore = useUIStore()

  let unlistenOpenSettings: (() => void) | null = null

  async function syncPetWindowState(): Promise<void> {
    if (!windowManagerStore.isMainWindow || !settingsStore.hasLoaded) {
      return
    }

    if (settingsStore.settings.desktopPetEnabled) {
      // 开启：确保本地宠物已加载 + 窗口可见。
      await desktopPetStore.loadLocalPets()
      await desktopPetStore.showPet()
      await desktopPetStore.setAlwaysOnTop(settingsStore.settings.desktopPetAlwaysOnTop)
    } else {
      await desktopPetStore.hidePet()
    }
  }

  onMounted(async () => {
    // 监听设置变化（enabled / activeId / alwaysOnTop）。
    watch(
      () => [
        windowManagerStore.isInitialized,
        windowManagerStore.windowType,
        settingsStore.hasLoaded,
        settingsStore.settings.desktopPetEnabled
      ] as const,
      () => {
        void syncPetWindowState()
      },
      { immediate: true }
    )

    // 激活宠物变化 → 通知宠物窗口。store.setActivePet 已会 emit；这里兜底外部直接改 settings 的情况。
    watch(
      () => settingsStore.settings.desktopPetActiveId,
      async (id) => {
        if (!id || !settingsStore.settings.desktopPetEnabled) return
        try {
          const src = await import('@/services/desktopPet').then((m) =>
            m.getPetSpritesheetUrl(id)
          )
          const { emit } = await import('@tauri-apps/api/event')
          await emit('desktop-pet:switch', { petId: id, spritesheetSrc: src })
        } catch (error) {
          console.error('[useDesktopPet] emit switch failed:', error)
        }
      }
    )

    // 置顶变化 → 同步窗口。
    watch(
      () => settingsStore.settings.desktopPetAlwaysOnTop,
      (value) => {
        if (settingsStore.settings.desktopPetEnabled) {
          void desktopPetStore.setAlwaysOnTop(value)
        }
      }
    )

    // 监听宠物窗口"打开设置"事件 → 主窗口本身运行本 composable，直接打开设置页即可。
    // （宠物窗口是独立 OS 窗口，emit 跨窗口到主窗口触发此监听。）
    unlistenOpenSettings = await listen<{ tab?: string }>(
      'desktop-pet:open-settings',
      () => {
        uiStore.openSettings('desktopPet')
      }
    )
  })

  onUnmounted(() => {
    unlistenOpenSettings?.()
    unlistenOpenSettings = null
  })
}
