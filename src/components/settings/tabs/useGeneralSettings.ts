import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import { EaSelect } from '@/components/common'
import SettingsSectionCard from '@/components/settings/common/SettingsSectionCard.vue'
import MiniPanelShortcutRecorder from '@/components/settings/general/MiniPanelShortcutRecorder.vue'
import { SUPPORTS_NATIVE_SHORTCUT_OVERRIDE } from '@/utils/shortcut'

export function useGeneralSettings() {
const { t } = useI18n()
const settingsStore = useSettingsStore()
const supportsNativeShortcutOverride = SUPPORTS_NATIVE_SHORTCUT_OVERRIDE

// 语言选项
const languageOptions = computed(() => [
  { value: 'zh-CN', label: t('languages.zhCN') },
  { value: 'en-US', label: t('languages.enUS') }
])

// 压缩策略选项
const compressionStrategyOptions = computed(() => [
  { value: 'simple', label: t('settings.general.compressionStrategySimple') },
  { value: 'smart', label: t('settings.general.compressionStrategySmart') },
  { value: 'summary', label: t('settings.general.compressionStrategySummary') }
])

// 压缩阈值选项
const compressionThresholdOptions = computed(() => [
  { value: 50, label: '50%' },
  { value: 60, label: '60%' },
  { value: 70, label: '70%' },
  { value: 80, label: '80%' },
  { value: 90, label: '90%' }
])

const acpPermissionModeOptions = computed(() => [
  { value: 'ask', label: '每次询问' },
  { value: 'allow_always', label: '自动允许' },
  { value: 'reject_always', label: '自动拒绝' }
])

  return {
    EaSelect,
    MiniPanelShortcutRecorder,
    SettingsSectionCard,
    acpPermissionModeOptions,
    compressionStrategyOptions,
    compressionThresholdOptions,
    languageOptions,
    settingsStore,
    supportsNativeShortcutOverride,
    t,
  }
}
