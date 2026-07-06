import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui'
import { EaIcon } from '@/components/common'
import {
  SETTINGS_TAB_GROUPS,
  SETTINGS_TAB_DESCRIPTORS,
  type SettingsTabGroup
} from '../settingsTabs'

export interface SettingsNavEmits {
  hide: []
}

export function useSettingsNav(emit: (event: 'hide') => void) {
  const { t } = useI18n()
  const uiStore = useUIStore()

  // 按分组聚合导航项，保持 SETTINGS_TAB_GROUPS 定义的顺序
  const groupedTabs = computed(() => (
    SETTINGS_TAB_GROUPS.map((group) => ({
      id: group.id as SettingsTabGroup,
      labelKey: group.labelKey,
      items: SETTINGS_TAB_DESCRIPTORS.filter((descriptor) => descriptor.group === group.id)
    }))
  ))

  function handleHide() {
    emit('hide')
  }

  return {
    t,
    uiStore,
    EaIcon,
    groupedTabs,
    handleHide
  }
}
