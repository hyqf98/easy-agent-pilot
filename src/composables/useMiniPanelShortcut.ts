import { onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { useSettingsStore } from '@/stores/settings'
import { useWindowManagerStore } from '@/stores/windowManager'
import { IS_WINDOWS, migrateMiniPanelShortcut, validateShortcutForCurrentPlatform } from '@/utils/shortcut'

type MiniPanelShortcutRegistrationState = 'idle' | 'disabled' | 'registering' | 'registered' | 'error'
type MiniPanelShortcutRegistrationMode = 'standard' | 'windows-override' | null

const registrationState = ref<MiniPanelShortcutRegistrationState>('idle')
const registrationError = ref<string | null>(null)
const activeShortcut = ref<string | null>(null)
const registrationMode = ref<MiniPanelShortcutRegistrationMode>(null)

function normalizePermissionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('global-shortcut.register not allowed')) {
    return 'GLOBAL_SHORTCUT_PERMISSION_REQUIRED'
  }

  if (message.includes('global-shortcut.is_registered not allowed')) {
    return 'GLOBAL_SHORTCUT_PERMISSION_REQUIRED'
  }

  if (message.includes('global-shortcut.unregister not allowed')) {
    return 'GLOBAL_SHORTCUT_PERMISSION_REQUIRED'
  }

  if (message.includes('RegisterEventHotKey failed')) {
    return 'GLOBAL_SHORTCUT_CONFLICT'
  }

  if (message.includes('WINDOWS_SHORTCUT_OVERRIDE_UNSUPPORTED')) {
    return 'WINDOWS_SHORTCUT_OVERRIDE_UNSUPPORTED'
  }

  if (message.includes('WINDOWS_SHORTCUT_OVERRIDE_FAILED')) {
    return 'WINDOWS_SHORTCUT_OVERRIDE_FAILED'
  }

  return message
}

export function useMiniPanelShortcut() {
  const settingsStore = useSettingsStore()
  const windowManagerStore = useWindowManagerStore()
  let registeredShortcut: string | null = null

  function setRegistrationError(error: unknown) {
    registrationState.value = 'error'
    registrationError.value = normalizePermissionErrorMessage(error)
    activeShortcut.value = null
    registrationMode.value = null
  }

  async function unregisterCurrentShortcut() {
    if (!registeredShortcut) {
      return
    }

    try {
      if (await isRegistered(registeredShortcut)) {
        await unregister(registeredShortcut)
      }
    } catch (error) {
      console.error('Failed to unregister mini panel shortcut:', error)
    } finally {
      registeredShortcut = null
      activeShortcut.value = null
      if (registrationMode.value === 'standard') {
        registrationMode.value = null
      }
    }
  }

  async function unregisterWindowsOverrideShortcut() {
    if (!IS_WINDOWS) {
      return
    }

    try {
      await invoke('unregister_mini_panel_windows_shortcut')
    } catch (error) {
      console.error('Failed to unregister mini panel Windows override shortcut:', error)
    } finally {
      if (registrationMode.value === 'windows-override') {
        registrationMode.value = null
        activeShortcut.value = null
      }
    }
  }

  async function syncShortcutRegistration() {
    if (!windowManagerStore.isInitialized || !settingsStore.hasLoaded) {
      registrationState.value = 'idle'
      registrationError.value = null
      return
    }

    if (!windowManagerStore.isMainWindow) {
      await unregisterCurrentShortcut()
      await unregisterWindowsOverrideShortcut()
      registrationState.value = 'idle'
      registrationError.value = null
      return
    }

    const enabled = settingsStore.settings.miniPanelEnabled
    const shortcut = migrateMiniPanelShortcut(settingsStore.settings.miniPanelShortcut)
    const windowsOverrideEnabled = IS_WINDOWS && settingsStore.settings.miniPanelShortcutOverride

    if (settingsStore.settings.miniPanelShortcut !== shortcut) {
      settingsStore.settings.miniPanelShortcut = shortcut
      return
    }

    if (!enabled) {
      await unregisterCurrentShortcut()
      await unregisterWindowsOverrideShortcut()
      registrationState.value = 'disabled'
      registrationError.value = null
      registrationMode.value = null
      await invoke('hide_mini_panel').catch(console.error)
      return
    }

    registrationError.value = null

    const validationError = validateShortcutForCurrentPlatform(shortcut, {
      windowsOverrideEnabled
    })
    if (validationError === 'reserved-windows-alt-space') {
      registrationState.value = 'error'
      registrationError.value = 'GLOBAL_SHORTCUT_RESERVED_WINDOWS_ALT_SPACE'
      activeShortcut.value = null
      registrationMode.value = null
      return
    }

    if (windowsOverrideEnabled) {
      await unregisterCurrentShortcut()
      registrationState.value = 'registering'

      try {
        await invoke('register_mini_panel_windows_shortcut', { shortcut })
        activeShortcut.value = shortcut
        registrationMode.value = 'windows-override'
        registrationState.value = 'registered'
      } catch (error) {
        console.error('Failed to register mini panel Windows override shortcut:', error)
        setRegistrationError(error)
      }
      return
    }

    await unregisterWindowsOverrideShortcut()

    try {
      if (registeredShortcut === shortcut && await isRegistered(shortcut)) {
        registrationState.value = 'registered'
        activeShortcut.value = shortcut
        registrationMode.value = 'standard'
        return
      }
    } catch (error) {
      console.error('Failed to inspect mini panel shortcut registration:', error)
    }

    await unregisterCurrentShortcut()
    registrationState.value = 'registering'

    try {
      await register(shortcut, async (event) => {
        if (event.state !== 'Pressed') {
          return
        }

        await invoke('toggle_mini_panel')
      })
      registeredShortcut = shortcut
      activeShortcut.value = shortcut
      registrationMode.value = 'standard'
      registrationState.value = 'registered'
    } catch (error) {
      console.error('Failed to register mini panel shortcut:', error)
      setRegistrationError(error)
    }
  }

  onMounted(() => {
    watch(
      () => [
        windowManagerStore.isInitialized,
        windowManagerStore.windowType,
        settingsStore.hasLoaded,
        settingsStore.settings.miniPanelEnabled,
        settingsStore.settings.miniPanelShortcut
      ] as const,
      () => {
        void syncShortcutRegistration()
      },
      { immediate: true }
    )
  })

  onUnmounted(() => {
    void unregisterCurrentShortcut()
    void unregisterWindowsOverrideShortcut()
  })
}

export function useMiniPanelShortcutState() {
  return {
    registrationState,
    registrationError,
    activeShortcut,
    registrationMode
  }
}
