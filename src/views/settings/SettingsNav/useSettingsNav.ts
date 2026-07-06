/** useSettingsNav — 设置左侧导航组件的 composable，聚合 tab 分组与描述符并提供切换入口。 */
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
