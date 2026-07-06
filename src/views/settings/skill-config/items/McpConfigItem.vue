<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import type { UnifiedMcpConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

const props = defineProps<{
  config: UnifiedMcpConfig
  isReadOnly: boolean
}>()

const emit = defineEmits<{
  (e: 'test', config: UnifiedMcpConfig): void
  (e: 'edit', config: UnifiedMcpConfig): void
  (e: 'delete', config: UnifiedMcpConfig): void
}>()

const { t } = useI18n()

const isBuiltin = computed(() => props.config.transportType === 'builtin')

function getTransportIcon(transport: string) {
  switch (transport) {
    case 'stdio': return 'lucide:terminal'
    case 'sse': return 'lucide:radio'
    case 'http': return 'lucide:globe'
    case 'builtin': return 'lucide:cpu'
    default: return 'lucide:plug'
  }
}

function getTransportLabel(transport: string) {
  if (transport === 'builtin') {
    return 'BUILT-IN'
  }
  return transport.toUpperCase()
}

function getScopeLabel(scope: string) {
  return t(`settings.agent.scan.scopeTypes.${scope}`)
}

function getCommandDisplay() {
  if (props.config.transportType === 'builtin') {
    return t('settings.mcp.builtinServer')
  }
  if (props.config.url) {
    return props.config.url
  }
  if (props.config.command) {
    const parts = [props.config.command]
    if (props.config.args?.length) {
      parts.push(...props.config.args)
    }
    return parts.join(' ')
  }
  return '-'
}
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
