/**
 * useAppUpdateSettings — 应用更新设置页的全部逻辑。
 *
 * 职责：
 * 1. 绑定 appUpdateStore（检查/下载/安装状态）和 settingsStore（自动检查开关）；
 * 2. 将 store 原始状态映射为可展示的状态标签与描述（支持 i18n）；
 * 3. 格式化最后检查时间与发布时间为本地化字符串；
 * 4. 组件挂载时自动初始化更新检查。
 */
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaProgressBar } from '@/components/common'
import SettingsSectionCard from '@/views/settings/common/SettingsSectionCard.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useSettingsStore } from '@/stores/settings'

export function useAppUpdateSettings() {
  const { t, locale } = useI18n()
  const appUpdateStore = useAppUpdateStore()
  const settingsStore = useSettingsStore()

  /** 更新状态标签（checking / up-to-date / available / downloading ...） */
  const statusLabel = computed(() => {
    switch (appUpdateStore.status) {
      case 'checking':
        return t('settings.appUpdate.statusChecking')
      case 'up-to-date':
        return t('settings.appUpdate.statusUpToDate')
      case 'available':
        return t('settings.appUpdate.statusAvailable', {
          version: appUpdateStore.availableUpdate?.version ?? '-'
        })
      case 'downloading':
        return t('settings.appUpdate.statusDownloading')
      case 'installing':
        return t('settings.appUpdate.statusInstalling')
      case 'completed':
        return t('settings.appUpdate.statusCompleted')
      case 'error':
        return t('settings.appUpdate.statusError')
      case 'unsupported':
        return t('settings.appUpdate.statusUnsupported')
      default:
        return t('settings.appUpdate.statusIdle')
    }
  })

  /** 状态详细描述（含错误信息 / 版本号 / 默认说明） */
  const statusDescription = computed(() => {
    if (appUpdateStore.status === 'error') {
      return appUpdateStore.errorMessage || t('settings.appUpdate.checkFailed')
    }

    if (appUpdateStore.availableUpdate) {
      return t('settings.appUpdate.availableDescription', {
        current: appUpdateStore.currentVersion,
        latest: appUpdateStore.availableUpdate.version
      })
    }

    if (appUpdateStore.status === 'up-to-date') {
      return t('settings.appUpdate.upToDateDescription', {
        version: appUpdateStore.currentVersion
      })
    }

    return t('settings.appUpdate.description')
  })

  const formattedLastCheckedAt = computed(() => formatDateTime(appUpdateStore.lastCheckedAt))
  const formattedPublishedAt = computed(() => formatDateTime(appUpdateStore.availableUpdate?.publishedAt ?? null))
  /** 下载进度值（-1 表示未知） */
  const progressValue = computed(() => appUpdateStore.progress?.percent ?? -1)

  /**
   * 将 ISO 时间字符串格式化为本地化的 "yyyy-MM-dd HH:mm" 字符串。
   * 空值返回「从未检查」占位。
   */
  function formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return t('settings.appUpdate.neverChecked')
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }

    return new Intl.DateTimeFormat(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  // 挂载时初始化更新检查
  onMounted(async () => {
    await appUpdateStore.initialize()
  })

  return {
    EaButton,
    EaProgressBar,
    SettingsSectionCard,
    t,
    appUpdateStore,
    settingsStore,
    statusLabel,
    statusDescription,
    formattedLastCheckedAt,
    formattedPublishedAt,
    progressValue
  }
}
