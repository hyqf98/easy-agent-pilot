<script setup lang="ts">
/** AppUpdateSettings 组件：应用更新设置页，展示版本状态并支持检查/下载/安装更新（逻辑见 useAppUpdateSettings.ts） */
import { useAppUpdateSettings } from './useAppUpdateSettings'

const {
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
} = useAppUpdateSettings()
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
