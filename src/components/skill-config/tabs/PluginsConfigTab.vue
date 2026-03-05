<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { UnifiedPluginConfig } from '@/stores/skillConfig'
import PluginConfigItem from '../items/PluginConfigItem.vue'
import { EaButton, EaIcon } from '@/components/common'

defineProps<{
  configs: UnifiedPluginConfig[]
  isReadOnly: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'detail', config: UnifiedPluginConfig): void
  (e: 'edit', config: UnifiedPluginConfig): void
  (e: 'delete', config: UnifiedPluginConfig): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="plugins-config-tab">
    <div class="plugins-config-tab__header">
      <h3 class="plugins-config-tab__title">{{ t('settings.sdkConfig.plugins.title') }}</h3>
      <div v-if="!isReadOnly" class="plugins-config-tab__actions">
        <EaButton size="small" @click="emit('add')">
          <EaIcon name="lucide:plus" />
          {{ t('settings.sdkConfig.plugins.add') }}
        </EaButton>
      </div>
    </div>

    <div v-if="isLoading" class="plugins-config-tab__loading">
      <EaIcon name="lucide:loader-2" class="plugins-config-tab__spinner" />
      {{ t('common.loading') }}
    </div>

    <div v-else-if="configs.length === 0" class="plugins-config-tab__empty">
      <EaIcon name="lucide:puzzle" class="plugins-config-tab__empty-icon" />
      <p>{{ t('settings.sdkConfig.plugins.noConfigs') }}</p>
    </div>

    <div v-else class="plugins-config-tab__list">
      <PluginConfigItem
        v-for="config in configs"
        :key="config.id"
        :config="config"
        :is-read-only="isReadOnly"
        @detail="emit('detail', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.plugins-config-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.plugins-config-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-4);
}

.plugins-config-tab__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.plugins-config-tab__actions {
  display: flex;
  gap: var(--spacing-2);
}

.plugins-config-tab__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-8);
  color: var(--color-text-tertiary);
}

.plugins-config-tab__spinner {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.plugins-config-tab__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-8);
  color: var(--color-text-tertiary);
}

.plugins-config-tab__empty-icon {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.plugins-config-tab__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}
</style>
