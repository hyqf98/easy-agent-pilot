<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

defineProps<{
  config: UnifiedSkillConfig
  isReadOnly: boolean
}>()

const emit = defineEmits<{
  (e: 'detail', config: UnifiedSkillConfig): void
  (e: 'edit', config: UnifiedSkillConfig): void
  (e: 'delete', config: UnifiedSkillConfig): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="skill-config-item" :class="{ 'skill-config-item--disabled': !config.enabled }">
    <div class="skill-config-item__header">
      <div class="skill-config-item__name">
        <EaIcon name="lucide:book-open" class="skill-config-item__icon" />
        <span>{{ config.name }}</span>
      </div>
      <div class="skill-config-item__actions">
        <EaButton size="small" variant="ghost" @click="emit('detail', config)">
          <EaIcon name="lucide:info" />
          {{ t('common.view') }}
        </EaButton>
        <EaButton
          v-if="!isReadOnly"
          size="small"
          variant="ghost"
          @click="emit('edit', config)"
        >
          <EaIcon name="lucide:pencil" />
          {{ t('common.edit') }}
        </EaButton>
        <EaButton
          v-if="!isReadOnly"
          size="small"
          variant="ghost"
          danger
          @click="emit('delete', config)"
        >
          <EaIcon name="lucide:trash-2" />
          {{ t('common.delete') }}
        </EaButton>
      </div>
    </div>

    <div v-if="config.description" class="skill-config-item__description">
      {{ config.description }}
    </div>

    <div class="skill-config-item__path">
      <EaIcon name="lucide:folder" />
      {{ config.skillPath }}
    </div>

    <div v-if="config.scriptsPath || config.referencesPath || config.assetsPath" class="skill-config-item__subdirs">
      <span v-if="config.scriptsPath" class="skill-config-item__subdir">
        <EaIcon name="lucide:file-code" />
        {{ t('settings.agent.scan.hasScripts') }}
      </span>
      <span v-if="config.referencesPath" class="skill-config-item__subdir">
        <EaIcon name="lucide:book" />
        {{ t('settings.agent.scan.hasReferences') }}
      </span>
      <span v-if="config.assetsPath" class="skill-config-item__subdir">
        <EaIcon name="lucide:image" />
        {{ t('settings.agent.scan.hasAssets') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.skill-config-item {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-4);
  transition: border-color 0.2s;
}

.skill-config-item:hover {
  border-color: var(--color-border-hover);
}

.skill-config-item--disabled {
  opacity: 0.6;
}

.skill-config-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-2);
}

.skill-config-item__name {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-base);
}

.skill-config-item__icon {
  width: 16px;
  height: 16px;
  color: var(--color-success);
}

.skill-config-item__actions {
  display: flex;
  gap: var(--spacing-1);
}

.skill-config-item__description {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.skill-config-item__path {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  background: var(--color-background-secondary);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-2);
}

.skill-config-item__path svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.skill-config-item__subdirs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
}

.skill-config-item__subdir {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.skill-config-item__subdir svg {
  width: 12px;
  height: 12px;
}
</style>
