<script setup lang="ts">
/** PluginConfigItem 组件：插件配置列表条目，展示名称并提供详情/编辑/删除 */
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
<style scoped src="./PluginConfigItem.css"></style>
