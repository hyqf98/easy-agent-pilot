<script setup lang="ts">
import {
  useProviderConnectionInfoCard,
  type ProviderConnectionInfoCardProps,
  type ProviderConnectionInfoCardEmits
} from './useProviderConnectionInfoCard'

defineProps<ProviderConnectionInfoCardProps>()
const emit = defineEmits<ProviderConnectionInfoCardEmits>()

const { EaIcon, t } = useProviderConnectionInfoCard()
</script>

<template>
  <div class="cli-connection section">
    <h3 class="section-title">
      {{ t('settings.providerSwitch.currentFileConfig') }}
    </h3>
    <div
      v-if="loading"
      class="loading"
    >
      <EaIcon
        name="loading"
        spin
        :size="20"
      />
      <span>{{ t('common.loading') }}</span>
    </div>
    <div
      v-else-if="connection"
      class="connection-card"
    >
      <div class="connection-header">
        <div class="connection-name">
          {{ connection.displayName }}
        </div>
        <button
          class="connection-open-btn"
          @click="emit('openConfigEditor')"
        >
          <EaIcon
            name="file-text"
            :size="14"
          />
          {{ t('settings.providerSwitch.openDefaultConfig') }}
        </button>
      </div>
      <div class="connection-body">
        <div class="connection-row">
          <span class="connection-label">{{ t('settings.providerSwitch.configFile') }}</span>
          <span class="connection-value mono">{{ connection.configFile }}</span>
        </div>
        <div class="connection-row">
          <span class="connection-label">{{ t('settings.providerSwitch.settingsFile') }}</span>
          <span class="connection-value mono">{{ connection.settingsFile }}</span>
        </div>
        <div class="connection-row">
          <span class="connection-label">{{ connection.cliType === 'opencode' ? t('settings.providerSwitch.form.providerName') : t('settings.providerSwitch.form.baseUrl') }}</span>
          <span class="connection-value mono">{{ connection.cliType === 'opencode' ? (connection.providerName || '-') : (connection.baseUrl || '-') }}</span>
        </div>
        <div
          v-if="connection.mainModel"
          class="connection-row"
        >
          <span class="connection-label">{{ t('settings.providerSwitch.form.mainModel') }}</span>
          <span class="connection-value mono">{{ connection.mainModel }}</span>
        </div>
        <div class="connection-row">
          <span class="connection-label">{{ t('settings.providerSwitch.form.apiKey') }}</span>
          <div class="connection-value-with-action">
            <template v-if="connection.apiKeyMasked">
              <span class="connection-value mono masked">{{ showApiKey ? connection.apiKey : connection.apiKeyMasked }}</span>
              <button
                class="toggle-visibility-btn"
                :title="showApiKey ? '隐藏 API Key' : '显示 API Key'"
                @click="emit('toggleApiKey')"
              >
                <EaIcon
                  :name="showApiKey ? 'eye-off' : 'eye'"
                  :size="14"
                />
              </button>
            </template>
            <span
              v-else
              class="connection-value mono"
            >
              -
            </span>
          </div>
        </div>
        <div
          v-if="connection.errorMessage"
          class="connection-error"
        >
          <EaIcon
            name="alert-triangle"
            :size="14"
          />
          <span>{{ connection.errorMessage }}</span>
        </div>
      </div>
    </div>
    <div
      v-else
      class="no-connection"
    >
      <EaIcon
        name="info"
        :size="16"
      />
      <span>{{ t('settings.providerSwitch.noConnectionInfo') }}</span>
    </div>
  </div>
</template>
<style scoped src="./ProviderConnectionInfoCard.css"></style>
