import { useI18n } from 'vue-i18n'
import { useUIStore, type AppMode } from '@/stores/ui'
import { EaIcon } from '@/components/common'

export function useAppHeader() {
  const { t } = useI18n()
  const uiStore = useUIStore()

  const modeItems: Array<{ mode: AppMode; labelKey: string; icon: string }> = [
    { mode: 'chat', labelKey: 'navModes.agent', icon: 'bot' },
    { mode: 'plan', labelKey: 'navModes.plan', icon: 'clipboard-list' },
    { mode: 'solo', labelKey: 'navModes.solo', icon: 'sparkles' },
    { mode: 'memory', labelKey: 'navModes.memory', icon: 'database' },
    { mode: 'settings', labelKey: 'navModes.settings', icon: 'settings' }
  ]

  function setMode(mode: AppMode) {
    // settings 为接管主区域的超级模式，经 openSettings 进入以记录可恢复的上一工作模式
    if (mode === 'settings') {
      uiStore.openSettings()
      return
    }
    uiStore.setAppMode(mode)
    if (mode === 'chat') {
      uiStore.setMainContentMode('chat')
    }
  }

  return {
    t,
    uiStore,
    modeItems,
    setMode,
    EaIcon
  }
}
