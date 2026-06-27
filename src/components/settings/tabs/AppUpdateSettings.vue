<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaProgressBar } from '@/components/common'
import SettingsSectionCard from '@/components/settings/common/SettingsSectionCard.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useSettingsStore } from '@/stores/settings'

const { t, locale } = useI18n()
const appUpdateStore = useAppUpdateStore()
const settingsStore = useSettingsStore()

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
const progressValue = computed(() => appUpdateStore.progress?.percent ?? -1)

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

onMounted(async () => {
  await appUpdateStore.initialize()
})
</script>

<template>
  <div class="settings-page">
    <h3 class="settings-page__title">
      {{ t('settings.appUpdate.title') }}
    </h3>

    <SettingsSectionCard
      :title="t('settings.appUpdate.summaryTitle')"
      :description="t('settings.appUpdate.description')"
    >
      <div class="update-summary">
        <div class="update-summary__meta">
          <div class="summary-pill">
            <span class="summary-pill__label">{{ t('settings.appUpdate.currentVersion') }}</span>
            <strong class="summary-pill__value">v{{ appUpdateStore.currentVersion }}</strong>
          </div>
          <div class="summary-pill">
            <span class="summary-pill__label">{{ t('settings.appUpdate.latestStatus') }}</span>
            <strong class="summary-pill__value">{{ statusLabel }}</strong>
          </div>
          <div class="summary-pill">
            <span class="summary-pill__label">{{ t('settings.appUpdate.lastCheckedAt') }}</span>
            <strong class="summary-pill__value">{{ formattedLastCheckedAt }}</strong>
          </div>
        </div>

        <div class="update-summary__actions">
          <EaButton
            type="secondary"
            :loading="appUpdateStore.status === 'checking'"
            @click="appUpdateStore.checkForUpdates()"
          >
            {{ t('settings.appUpdate.checkNow') }}
          </EaButton>
          <EaButton
            v-if="appUpdateStore.availableUpdate"
            :loading="appUpdateStore.status === 'downloading' || appUpdateStore.status === 'installing'"
            @click="appUpdateStore.installUpdate()"
          >
            {{ t('settings.appUpdate.installNow') }}
          </EaButton>
        </div>
      </div>

      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.appUpdate.autoCheck') }}</span>
          <span class="settings-item__desc">{{ t('settings.appUpdate.autoCheckDesc') }}</span>
        </div>
        <label class="settings-toggle">
          <input
            v-model="settingsStore.settings.autoCheckAppUpdate"
            type="checkbox"
          >
          <span class="settings-toggle__slider" />
        </label>
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard :title="t('settings.appUpdate.statusTitle')">
      <div class="status-card">
        <div class="status-card__header">
          <span class="status-card__title">{{ statusLabel }}</span>
          <span class="status-card__subtitle">{{ statusDescription }}</span>
        </div>

        <EaProgressBar
          v-if="appUpdateStore.status === 'downloading' || appUpdateStore.status === 'installing'"
          :value="progressValue"
          :show-text="progressValue >= 0"
          size="large"
          striped
          animated
        />

        <div
          v-if="appUpdateStore.progress"
          class="status-grid"
        >
          <div class="status-grid__item">
            <span class="status-grid__label">{{ t('settings.appUpdate.downloadedBytes') }}</span>
            <strong class="status-grid__value">{{ appUpdateStore.progress.downloadedBytes }}</strong>
          </div>
          <div class="status-grid__item">
            <span class="status-grid__label">{{ t('settings.appUpdate.totalBytes') }}</span>
            <strong class="status-grid__value">{{ appUpdateStore.progress.contentLength ?? '-' }}</strong>
          </div>
        </div>
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard
      v-if="appUpdateStore.availableUpdate"
      :title="t('settings.appUpdate.releaseNotesTitle')"
    >
      <div class="status-grid">
        <div class="status-grid__item">
          <span class="status-grid__label">{{ t('settings.appUpdate.newVersion') }}</span>
          <strong class="status-grid__value">v{{ appUpdateStore.availableUpdate.version }}</strong>
        </div>
        <div class="status-grid__item">
          <span class="status-grid__label">{{ t('settings.appUpdate.publishedAt') }}</span>
          <strong class="status-grid__value">{{ formattedPublishedAt }}</strong>
        </div>
      </div>

      <pre class="release-notes">{{ appUpdateStore.availableUpdate.notes || t('settings.appUpdate.noReleaseNotes') }}</pre>
    </SettingsSectionCard>
  </div>
</template>
<style scoped src="./AppUpdateSettings.css"></style>
