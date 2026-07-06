import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore, presetThemeColors } from '@/stores/theme'
import { EaSelect } from '@/components/common'
import SettingsSectionCard from '@/views/settings/common/SettingsSectionCard.vue'

export function useThemeSettings() {
const { t } = useI18n()
const themeStore = useThemeStore()

// 主题选项
const themeOptions = computed(() => [
  { value: 'light', label: t('settings.theme.light') },
  { value: 'dark', label: t('settings.theme.dark') },
  { value: 'system', label: t('settings.theme.system') }
])

// 处理主题模式变化
const handleThemeChange = async (newMode: string | number) => {
  await themeStore.setTheme(newMode as 'light' | 'dark' | 'system')
}

// 处理主题色变化
const handleThemeColorChange = async (themeColorId: string) => {
  await themeStore.setThemeColor(themeColorId)
}

  return {
    EaSelect,
    SettingsSectionCard,
    handleThemeColorChange,
    t,
    themeOptions,
    themeStore,
    presetThemeColors,
    handleThemeChange,
  }
}
