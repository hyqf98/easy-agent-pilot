import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui'
import { EaIcon } from '@/components/common'
import { getSettingsTabDescriptor } from '../settingsTabs'

export function useSettingsContent() {
  const { t } = useI18n()
  const uiStore = useUIStore()

  const activeTabDescriptor = computed(() => getSettingsTabDescriptor(uiStore.activeSettingsTab))

  return {
    t,
    uiStore,
    EaIcon,
    activeTabDescriptor
  }
}
