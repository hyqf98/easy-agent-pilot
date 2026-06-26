<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import SkillConfigItem from '../items/SkillConfigItem.vue'
import { EaButton, EaIcon, EaStateBlock, EaActionMenu, type ActionMenuItem } from '@/components/common'

const props = defineProps<{
  configs: UnifiedSkillConfig[]
  isReadOnly: boolean
  isLoading: boolean
  canSync?: boolean
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'sync'): void
  (e: 'detail', config: UnifiedSkillConfig): void
  (e: 'edit', config: UnifiedSkillConfig): void
  (e: 'delete', config: UnifiedSkillConfig): void
}>()

const { t } = useI18n()

// 次要操作收入溢出菜单（同步），主操作「添加」常驻
const overflowItems = computed<ActionMenuItem[]>(() => {
  return props.canSync
    ? [{ key: 'sync', label: t('settings.integration.sync.button'), icon: 'arrow-right-left' }]
    : []
})
</script>

<template>
  <div class="skills-config-tab">
    <div class="skills-config-tab__header">
      <h3 class="skills-config-tab__title">
        {{ t('settings.sdkConfig.skills.title') }}
      </h3>
      <div class="skills-config-tab__actions">
        <EaButton
          v-if="!isReadOnly"
          size="medium"
          @click="emit('add')"
        >
          <EaIcon
            name="plus"
            :size="14"
          />
          {{ t('settings.sdkConfig.skills.add') }}
        </EaButton>
        <EaActionMenu
          v-if="overflowItems.length"
          :items="overflowItems"
          @select="(key) => key === 'sync' && emit('sync')"
        />
      </div>
    </div>

    <EaStateBlock
      v-if="isLoading"
      variant="loading"
      :title="t('common.loading')"
    />

    <EaStateBlock
      v-else-if="configs.length === 0"
      icon="book-open"
      :description="t('settings.sdkConfig.skills.noConfigs')"
    />

    <div
      v-else
      class="skills-config-tab__list"
    >
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

.skills-config-tab__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}
</style>
