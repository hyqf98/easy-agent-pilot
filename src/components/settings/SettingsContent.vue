<script setup lang="ts">
import { useUIStore } from '@/stores/ui'
import GeneralSettings from './tabs/GeneralSettings.vue'
import AgentSettings from './tabs/AgentSettings.vue'
import SkillConfigPage from '@/components/skill-config/SkillConfigPage.vue'
import ProviderSwitch from './tabs/ProviderSwitch.vue'
import ThemeSettings from './tabs/ThemeSettings.vue'
import DataSettings from './tabs/DataSettings.vue'

const uiStore = useUIStore()
</script>

<template>
  <div class="settings-content">
    <!-- SkillConfigPage 需要更大的空间 -->
    <SkillConfigPage v-if="uiStore.activeSettingsTab === 'agentConfig'" class="settings-content__full" />
    <!-- 其他设置页面使用固定宽度 -->
    <div v-else class="settings-content__inner">
      <GeneralSettings v-if="uiStore.activeSettingsTab === 'general'" />
      <AgentSettings v-else-if="uiStore.activeSettingsTab === 'agents'" />
      <ProviderSwitch v-else-if="uiStore.activeSettingsTab === 'providerSwitch'" />
      <ThemeSettings v-else-if="uiStore.activeSettingsTab === 'theme'" />
      <DataSettings v-else-if="uiStore.activeSettingsTab === 'data'" />
    </div>
  </div>
</template>

<style scoped>
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-6);
  display: flex;
  justify-content: center;
}

.settings-content__inner {
  max-width: 640px;
  width: 100%;
}

.settings-content__full {
  flex: 1;
  width: 100%;
  height: 100%;
}

/* 自定义滚动条 */
.settings-content::-webkit-scrollbar {
  width: 6px;
}

.settings-content::-webkit-scrollbar-track {
  background: transparent;
}

.settings-content::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: var(--radius-full);
}

.settings-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-border-dark);
}
</style>
