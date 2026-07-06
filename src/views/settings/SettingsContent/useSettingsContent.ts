/** useSettingsContent — 设置内容区组件的 composable，根据激活 tab 派生对应描述符与渲染组件。 */
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
