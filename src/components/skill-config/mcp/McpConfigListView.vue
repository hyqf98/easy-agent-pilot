<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedMcpConfig } from '@/stores/skillConfig'
import McpConfigItem from '../items/McpConfigItem.vue'
import { EaButton, EaIcon, EaStateBlock, EaActionMenu, type ActionMenuItem } from '@/components/common'

const props = defineProps<{
  configs: UnifiedMcpConfig[]
  isReadOnly: boolean
  isLoading: boolean
  canSync?: boolean
  canRefresh?: boolean
  canOpenFile?: boolean
}>()

const emit = defineEmits<{
  add: []
  refresh: []
  sync: []
  'open-file': []
  test: [config: UnifiedMcpConfig]
  edit: [config: UnifiedMcpConfig]
  delete: [config: UnifiedMcpConfig]
}>()

const { t } = useI18n()

// 次要操作收入溢出菜单（同步 / 刷新 / CLI 配置），主操作「添加」常驻
const overflowItems = computed<ActionMenuItem[]>(() => {
  const items: ActionMenuItem[] = []
  if (props.canSync) {
    items.push({ key: 'sync', label: t('settings.integration.sync.button'), icon: 'arrow-right-left' })
  }
  if (props.canRefresh) {
    items.push({ key: 'refresh', label: t('common.refresh'), icon: 'refresh-cw' })
  }
  if (props.canOpenFile) {
    items.push({ key: 'open-file', label: t('settings.agentConfig.cliConfigCardTitle'), icon: 'external-link' })
  }
  return items
})

function handleOverflowSelect(key: string) {
  if (key === 'sync') emit('sync')
  else if (key === 'refresh') emit('refresh')
  else if (key === 'open-file') emit('open-file')
}
</script>

<template>
  <div class="mcp-config-list">
    <div class="mcp-config-list__header">
      <h3 class="mcp-config-list__title">
        {{ t('settings.sdkConfig.mcp.title') }}
      </h3>
      <div class="mcp-config-list__actions">
        <EaButton
          size="medium"
          @click="emit('add')"
        >
          <EaIcon
            name="plus"
            :size="14"
          />
          {{ t('settings.sdkConfig.mcp.add') }}
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
      icon="lucide:server"
      :description="t('settings.sdkConfig.mcp.noConfigs')"
    />

    <div
      v-else
      class="mcp-config-list__items"
    >
      <McpConfigItem
        v-for="config in configs"
        :key="config.id"
        :config="config"
        :is-read-only="isReadOnly"
        @test="emit('test', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
      />
    </div>
  </div>
</template>
<style scoped src="./McpConfigListView.css"></style>
