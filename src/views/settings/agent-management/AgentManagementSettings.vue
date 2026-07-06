<script setup lang="ts">
/** AgentManagementSettings 组件：智能体管理设置页，按标签切换子代理/供应商/会话/技能等子页（逻辑见 useAgentManagementSettings.ts） */
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
