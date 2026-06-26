<script setup lang="ts">
/**
 * Agent 管理：合并「配置切换 / 会话管理 / 技能配置」三个原菜单，
 * 通过内部 Tab 切换显示，组件自身不承载业务逻辑，仅负责装配。
 */
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import ProviderSwitch from '@/components/settings/tabs/ProviderSwitch.vue'
import SessionManagementSettings from '@/components/settings/tabs/SessionManagementSettings.vue'
import SkillConfigPage from '@/components/skill-config/SkillConfigPage.vue'
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

<style scoped>
.agent-management {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  /* 随窗口动态缩放的内边距，避免与子页 padding 叠加过厚 */
  padding: clamp(6px, 0.8vw, 12px);
  max-width: var(--workspace-content-max-width, 960px);
  margin: 0 auto;
}

.agent-management__tabs {
  display: flex;
  gap: var(--spacing-1);
  padding: var(--spacing-1);
  background: var(--workspace-control-bg, var(--color-bg-secondary));
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-2);
  flex-shrink: 0;
}

.agent-management__tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-4);
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.agent-management__tab:hover {
  color: var(--workspace-text-primary, var(--color-text-primary));
  background: var(--workspace-list-hover-bg, var(--color-surface-hover));
}

.agent-management__tab--active {
  background: var(--workspace-list-active-bg, var(--color-surface));
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-weight: var(--font-weight-semibold);
  box-shadow: var(--shadow-sm);
}

/* 统一由该容器负责滚动，子页改为自然高度 */
.agent-management__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
</style>
