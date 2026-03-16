<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { UnifiedPluginConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

defineProps<{
  config: UnifiedPluginConfig
  isReadOnly: boolean
}>()

const emit = defineEmits<{
  (e: 'detail', config: UnifiedPluginConfig): void
  (e: 'edit', config: UnifiedPluginConfig): void
  (e: 'delete', config: UnifiedPluginConfig): void
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="plugin-config-item"
    :class="{ 'plugin-config-item--disabled': !config.enabled }"
  >
    <div class="plugin-config-item__header">
      <div class="plugin-config-item__name">
        <EaIcon
          name="lucide:puzzle"
          class="plugin-config-item__icon"
        />
        <span>{{ config.name }}</span>
        <span
          v-if="config.version"
          class="plugin-config-item__version"
        >v{{ config.version }}</span>
      </div>
      <div class="plugin-config-item__actions">
        <EaButton
          size="small"
          variant="ghost"
          class="btn-view"
          @click="emit('detail', config)"
        >
          <EaIcon name="lucide:info" />
          {{ t('common.view') }}
        </EaButton>
        <EaButton
          v-if="!isReadOnly"
          size="small"
          variant="ghost"
          class="btn-edit"
          @click="emit('edit', config)"
        >
          <EaIcon name="lucide:pencil" />
          {{ t('common.edit') }}
        </EaButton>
        <EaButton
          v-if="!isReadOnly"
          size="small"
          variant="ghost"
          class="btn-delete"
          @click="emit('delete', config)"
        >
          <EaIcon name="lucide:trash-2" />
          {{ t('common.delete') }}
        </EaButton>
      </div>
    </div>

    <div
      v-if="config.description"
      class="plugin-config-item__description"
    >
      {{ config.description }}
    </div>

    <div class="plugin-config-item__path">
      <EaIcon name="lucide:folder" />
      {{ config.pluginPath }}
    </div>
  </div>
</template>

<style scoped>
.plugin-config-item {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-4);
  transition: border-color 0.2s;
}

.plugin-config-item:hover {
  border-color: var(--color-border-hover);
}

.plugin-config-item--disabled {
  opacity: 0.6;
}

.plugin-config-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-2);
}

.plugin-config-item__name {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-base);
}

.plugin-config-item__icon {
  width: 16px;
  height: 16px;
  color: var(--color-info);
}

.plugin-config-item__version {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: 2px 6px;
  background: var(--color-background-secondary);
  border-radius: var(--radius-sm);
}

.plugin-config-item__actions {
  display: flex;
  gap: var(--spacing-1);
}

.plugin-config-item__description {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.plugin-config-item__path {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  background: var(--color-background-secondary);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
}

.plugin-config-item__path svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.btn-view {
  background: rgba(16, 185, 129, 0.1) !important;
  color: #059669 !important;
  border: 1px solid rgba(16, 185, 129, 0.18) !important;
}

.btn-view:hover {
  background: rgba(16, 185, 129, 0.18) !important;
  border-color: rgba(16, 185, 129, 0.34) !important;
}

.btn-edit {
  background: rgba(59, 130, 246, 0.1) !important;
  color: #2563eb !important;
  border: 1px solid rgba(59, 130, 246, 0.2) !important;
}

.btn-edit:hover {
  background: rgba(59, 130, 246, 0.18) !important;
  border-color: rgba(59, 130, 246, 0.36) !important;
}

.btn-delete {
  background: rgba(239, 68, 68, 0.1) !important;
  color: #dc2626 !important;
  border: 1px solid rgba(239, 68, 68, 0.2) !important;
}

.btn-delete:hover {
  background: rgba(239, 68, 68, 0.18) !important;
  border-color: rgba(239, 68, 68, 0.36) !important;
}
</style>
