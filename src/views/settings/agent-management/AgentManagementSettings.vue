<script setup lang="ts">
import { useAgentManagementSettings } from './useAgentManagementSettings'

const {
  EaIcon,
  SubAgentConfigPage,
  ProviderSwitch,
  SessionManagementSettings,
  SkillConfigPage,
  t,
  TABS,
  activeTab,
  contentRef,
  handleTabChange
} = useAgentManagementSettings()
</script>

<template>
  <div class="agent-management">
    <nav class="agent-management__tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        class="agent-management__tab"
        :class="{ 'agent-management__tab--active': activeTab === tab.key }"
        @click="handleTabChange(tab.key)"
      >
        <EaIcon
          :name="tab.icon"
          :size="16"
        />
        <span>{{ t(tab.labelKey) }}</span>
      </button>
    </nav>

    <div
      ref="contentRef"
      class="agent-management__content"
    >
      <SubAgentConfigPage v-if="activeTab === 'subAgents'" />
      <ProviderSwitch v-else-if="activeTab === 'provider'" />
      <SessionManagementSettings v-else-if="activeTab === 'sessions'" />
      <SkillConfigPage v-else-if="activeTab === 'skills'" />
    </div>
  </div>
</template>
<style scoped src="./AgentManagementSettings.css"></style>
