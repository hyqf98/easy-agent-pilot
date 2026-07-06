<script setup lang="ts">
/** PluginsConfigTab 组件：插件配置标签页，展示插件列表与添加/同步等（逻辑见 usePluginsConfigTab.ts） */
import { usePluginsConfigTab, type PluginsConfigTabProps, type PluginsConfigTabEmits } from './usePluginsConfigTab'

const props = defineProps<PluginsConfigTabProps>()
const emit = defineEmits<PluginsConfigTabEmits>()

const {
  EaButton,
  EaIcon,
  EaStateBlock,
  EaActionMenu,
  PluginConfigItem,
  t,
  overflowItems,
  handleOverflowSelect,
} = usePluginsConfigTab(props, emit)
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
<style scoped src="./PluginsConfigTab.css"></style>
