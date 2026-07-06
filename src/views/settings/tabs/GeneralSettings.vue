<script setup lang="ts">
/** GeneralSettings 组件：通用设置页，含语言、字号、压缩策略、ACP 权限等（逻辑见 useGeneralSettings.ts） */
import { useGeneralSettings } from './useGeneralSettings'

const {
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
} = useGeneralSettings()
</script>

<template>
  <div class="settings-page">
    <h3 class="settings-page__title">
      {{ t('settings.general.title') }}
    </h3>

    <SettingsSectionCard :title="t('settings.general.appSettings')">
      <div class="settings-item settings-item--language">
        <span class="settings-item__label">{{ t('settings.general.language') }}</span>
        <EaSelect
          v-model="settingsStore.settings.language"
          :options="languageOptions"
        />
      </div>

      <div class="settings-item settings-item--font">
        <span class="settings-item__label">{{ t('settings.general.fontSize') }}</span>
        <div class="font-size-slider">
          <span class="font-size-slider__label">12px</span>
          <input
            v-model.number="settingsStore.settings.fontSize"
            type="range"
            min="12"
            max="24"
            step="1"
            class="font-size-slider__input"
          >
          <span class="font-size-slider__label">24px</span>
        </div>
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard :title="t('settings.general.miniPanelTitle')">
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.general.miniPanelEnabled') }}</span>
          <span class="settings-item__desc">{{ t('settings.general.miniPanelEnabledDesc') }}</span>
        </div>
        <label class="settings-toggle">
          <input
            v-model="settingsStore.settings.miniPanelEnabled"
            type="checkbox"
          >
          <span class="settings-toggle__slider" />
        </label>
      </div>

      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.general.miniPanelShortcut') }}</span>
          <span class="settings-item__desc">{{ t('settings.general.miniPanelShortcutDesc') }}</span>
        </div>
        <MiniPanelShortcutRecorder
          v-model="settingsStore.settings.miniPanelShortcut"
          :windows-override-enabled="settingsStore.settings.miniPanelShortcutOverride"
          :disabled="!settingsStore.settings.miniPanelEnabled"
          @update:windows-override-enabled="settingsStore.settings.miniPanelShortcutOverride = $event"
        />
      </div>

      <div
        v-if="supportsNativeShortcutOverride"
        class="settings-item"
      >
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.general.miniPanelShortcutForceOverride') }}</span>
          <span class="settings-item__desc">{{ t('settings.general.miniPanelShortcutOverrideDesc') }}</span>
        </div>
        <label class="settings-toggle">
          <input
            v-model="settingsStore.settings.miniPanelShortcutOverride"
            type="checkbox"
            :disabled="!settingsStore.settings.miniPanelEnabled"
          >
          <span class="settings-toggle__slider" />
        </label>
      </div>

      <div
        v-if="supportsNativeShortcutOverride && settingsStore.settings.miniPanelShortcutOverride"
        class="settings-warning"
      >
        <span class="settings-warning__icon">⚠️</span>
        <span class="settings-warning__text">{{ t('settings.general.miniPanelShortcutForceOverrideWarning') }}</span>
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard :title="t('settings.general.compressionSettings')">
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.general.autoCompression') }}</span>
          <span class="settings-item__desc">{{ t('settings.general.autoCompressionDesc') }}</span>
        </div>
        <label class="settings-toggle">
          <input
            v-model="settingsStore.settings.autoCompressionEnabled"
            type="checkbox"
          >
          <span class="settings-toggle__slider" />
        </label>
      </div>

      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.general.compressionStrategy') }}</span>
          <span class="settings-item__desc">{{ t(`settings.general.compressionStrategy${settingsStore.settings.compressionStrategy.charAt(0).toUpperCase() + settingsStore.settings.compressionStrategy.slice(1)}Desc`) }}</span>
        </div>
        <EaSelect
          v-model="settingsStore.settings.compressionStrategy"
          :options="compressionStrategyOptions"
          :disabled="!settingsStore.settings.autoCompressionEnabled"
        />
      </div>

      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.general.compressionThreshold') }}</span>
          <span class="settings-item__desc">{{ t('settings.general.compressionThresholdDesc') }}</span>
        </div>
        <EaSelect
          v-model="settingsStore.settings.compressionThreshold"
          :options="compressionThresholdOptions"
          :disabled="!settingsStore.settings.autoCompressionEnabled"
        />
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard :title="t('settings.general.retrySettings')">
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.general.cliFailureMaxRetries') }}</span>
          <span class="settings-item__desc">{{ t('settings.general.cliFailureMaxRetriesDesc') }}</span>
        </div>
        <input
          v-model.number="settingsStore.settings.cliFailureMaxRetries"
          type="number"
          class="settings-input settings-input--small"
          min="0"
          max="10"
        >
      </div>

      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.general.retryIntervalMinutes') }}</span>
          <span class="settings-item__desc">{{ t('settings.general.retryIntervalMinutesDesc') }}</span>
        </div>
        <input
          v-model.number="settingsStore.settings.retryIntervalMinutes"
          type="number"
          class="settings-input settings-input--small"
          min="1"
          max="30"
        >
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard title="ACP 工具权限">
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">ACP 工具权限</span>
          <span class="settings-item__desc">控制 ACP 工具调用时的默认权限策略</span>
        </div>
        <EaSelect
          v-model="settingsStore.settings.acpPermissionMode"
          :options="acpPermissionModeOptions"
        />
      </div>
    </SettingsSectionCard>
  </div>
</template>
<style scoped src="./GeneralSettings.css"></style>
