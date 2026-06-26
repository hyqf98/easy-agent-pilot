<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedPluginConfig } from '@/stores/skillConfig'
import PluginConfigItem from '../items/PluginConfigItem.vue'
import { EaButton, EaIcon, EaStateBlock, EaActionMenu, type ActionMenuItem } from '@/components/common'

const props = defineProps<{
  configs: UnifiedPluginConfig[]
  isReadOnly: boolean
  isLoading: boolean
  canRefresh?: boolean
  canOpenFile?: boolean
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'refresh'): void
  (e: 'open-file'): void
  (e: 'detail', config: UnifiedPluginConfig): void
  (e: 'edit', config: UnifiedPluginConfig): void
  (e: 'delete', config: UnifiedPluginConfig): void
}>()

const { t } = useI18n()

// 次要操作收入溢出菜单（刷新 / CLI 配置），主操作「添加」常驻
const overflowItems = computed<ActionMenuItem[]>(() => {
  const items: ActionMenuItem[] = []
  if (props.canRefresh) {
    items.push({ key: 'refresh', label: t('common.refresh'), icon: 'refresh-cw' })
  }
  if (props.canOpenFile) {
    items.push({ key: 'open-file', label: t('settings.agentConfig.cliConfigCardTitle'), icon: 'external-link' })
  }
  return items
})

function handleOverflowSelect(key: string) {
  if (key === 'refresh') emit('refresh')
  else if (key === 'open-file') emit('open-file')
}
</script>

<template>
  <div class="plugins-config-tab">
    <div class="plugins-config-tab__header">
      <h3 class="plugins-config-tab__title">
        {{ t('settings.sdkConfig.plugins.title') }}
      </h3>
      <div class="plugins-config-tab__actions">
        <EaButton
          v-if="!isReadOnly"
          size="medium"
          @click="emit('add')"
        >
          <EaIcon
            name="plus"
            :size="14"
          />
          {{ t('settings.sdkConfig.plugins.add') }}
        </EaButton>
        <EaActionMenu
          v-if="overflowItems.length"
          :items="overflowItems"
          @select="handleOverflowSelect"
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
      icon="puzzle"
      :description="t('settings.sdkConfig.plugins.noConfigs')"
    />

    <div
      v-else
      class="plugins-config-tab__list"
    >
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

.plugins-config-tab__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}
</style>
