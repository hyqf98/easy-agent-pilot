<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import SkillConfigItem from '../items/SkillConfigItem.vue'
import { EaButton, EaIcon } from '@/components/common'

defineProps<{
  configs: UnifiedSkillConfig[]
  isReadOnly: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'detail', config: UnifiedSkillConfig): void
  (e: 'edit', config: UnifiedSkillConfig): void
  (e: 'delete', config: UnifiedSkillConfig): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="skills-config-tab">
    <div class="skills-config-tab__header">
      <h3 class="skills-config-tab__title">{{ t('settings.sdkConfig.skills.title') }}</h3>
      <div v-if="!isReadOnly" class="skills-config-tab__actions">
        <EaButton size="small" @click="emit('add')">
          <EaIcon name="lucide:plus" />
          {{ t('settings.sdkConfig.skills.add') }}
        </EaButton>
      </div>
    </div>

    <div v-if="isLoading" class="skills-config-tab__loading">
      <EaIcon name="lucide:loader-2" class="skills-config-tab__spinner" />
      {{ t('common.loading') }}
    </div>

    <div v-else-if="configs.length === 0" class="skills-config-tab__empty">
      <EaIcon name="lucide:book-open" class="skills-config-tab__empty-icon" />
      <p>{{ t('settings.sdkConfig.skills.noConfigs') }}</p>
    </div>

    <div v-else class="skills-config-tab__list">
      <SkillConfigItem
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
.skills-config-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-4);
}

.skills-config-tab__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.skills-config-tab__actions {
  display: flex;
  gap: var(--spacing-2);
}

.skills-config-tab__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-8);
  color: var(--color-text-tertiary);
}

.skills-config-tab__spinner {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.skills-config-tab__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-8);
  color: var(--color-text-tertiary);
}

.skills-config-tab__empty-icon {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.skills-config-tab__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}
</style>
