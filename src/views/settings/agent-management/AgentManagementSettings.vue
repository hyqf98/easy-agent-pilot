<script setup lang="ts">
/**
 * Agent 管理：合并「配置切换 / 会话管理 / 技能配置」三个原菜单，
 * 通过内部 Tab 切换显示，组件自身不承载业务逻辑，仅负责装配。
 */
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import ProviderSwitch from '@/views/settings/tabs/ProviderSwitch.vue'
import SessionManagementSettings from '@/views/settings/tabs/SessionManagementSettings.vue'
import SkillConfigPage from '@/views/settings/skill-config/SkillConfigPage.vue'
import SubAgentConfigPage from './SubAgentConfigPage.vue'

type AgentManagementTab = 'subAgents' | 'provider' | 'sessions' | 'skills'

interface TabItem {
  key: AgentManagementTab
  labelKey: string
  icon: string
}

const { t } = useI18n()

const TABS: TabItem[] = [
  { key: 'subAgents', labelKey: 'settings.agentManagement.tabs.subAgents', icon: 'users' },
  { key: 'provider', labelKey: 'settings.agentManagement.tabs.provider', icon: 'repeat' },
  { key: 'sessions', labelKey: 'settings.agentManagement.tabs.sessions', icon: 'history' },
  { key: 'skills', labelKey: 'settings.agentManagement.tabs.skills', icon: 'sparkles' }
]

const activeTab = ref<AgentManagementTab>('subAgents')

// 内容区引用，切换 Tab 时重置滚动位置
const contentRef = ref<HTMLElement | null>(null)

function handleTabChange(tab: AgentManagementTab) {
  if (tab === activeTab.value) {
    return
  }

  activeTab.value = tab

  nextTick(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = 0
    }
  })
}
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
