<script setup lang="ts">
/** McpConfigItem 组件：MCP 配置列表条目，展示名称/传输/作用域并提供测试/编辑/删除（逻辑见 useMcpConfigItem.ts） */
import { useMcpConfigItem, type McpConfigItemProps, type McpConfigItemEmits } from './useMcpConfigItem'

const props = defineProps<McpConfigItemProps>()
const emit = defineEmits<McpConfigItemEmits>()

const {
  EaButton,
  EaIcon,
  t,
  isBuiltin,
  getTransportIcon,
  getTransportLabel,
  getScopeLabel,
  getCommandDisplay,
} = useMcpConfigItem(props)
</script>

<template>
  <div
    class="mcp-config-item"
    :class="{ 'mcp-config-item--disabled': !config.enabled }"
  >
    <div class="mcp-config-item__header">
      <div class="mcp-config-item__name">
        <EaIcon
          :name="isBuiltin ? 'lucide:cpu' : 'lucide:folder'"
          class="mcp-config-item__icon"
        />
        <span>{{ config.name }}</span>
      </div>
      <div
        v-if="!isBuiltin"
        class="mcp-config-item__actions"
      >
        <EaButton
          size="small"
          variant="ghost"
          class="btn-test"
          @click="emit('test', config)"
        >
          <EaIcon name="lucide:play" />
          {{ t('settings.mcp.testConnection') }}
        </EaButton>
        <EaButton
          size="small"
          variant="ghost"
          class="btn-edit"
          @click="emit('edit', config)"
        >
          <EaIcon name="lucide:pencil" />
          {{ t('common.edit') }}
        </EaButton>
        <EaButton
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

    <div class="mcp-config-item__command">
      {{ getCommandDisplay() }}
    </div>

    <div class="mcp-config-item__meta">
      <span class="mcp-config-item__tag">
        <EaIcon :name="getTransportIcon(config.transportType)" />
        {{ getTransportLabel(config.transportType) }}
      </span>
      <span
        v-if="!isBuiltin"
        class="mcp-config-item__tag"
      >
        <EaIcon name="lucide:map-pin" />
        {{ getScopeLabel(config.scope) }}
      </span>
      <span
        v-if="config.source === 'file'"
        class="mcp-config-item__tag mcp-config-item__tag--file"
      >
        <EaIcon name="lucide:file-text" />
        CLI
      </span>
    </div>
  </div>
</template>
<style scoped src="./McpConfigItem.css"></style>
