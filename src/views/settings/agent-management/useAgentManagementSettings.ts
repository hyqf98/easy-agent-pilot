/**
 * useAgentManagementSettings — 智能体管理设置页（AgentManagementSettings.vue）的全部逻辑。
 *
 * 职责：
 * 1. 维护当前激活的内部 Tab（subAgents / provider / sessions / skills）；
 * 2. 定义 Tab 元数据（标签 i18n key + 图标）；
 * 3. 切换 Tab 时重置内容区滚动位置（通过 nextTick 等待 DOM 更新后归零 scrollTop）；
 * 4. 暴露 i18n 的 `t` 翻译函数与四个子页面组件（SubAgentConfigPage / ProviderSwitch /
 *    SessionManagementSettings / SkillConfigPage）。
 *
 * 该组件本身不承载任何业务逻辑，仅做 Tab 装配；本 composable 只负责 Tab 切换的展示状态。
 */
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import ProviderSwitch from '@/views/settings/tabs/ProviderSwitch.vue'
import SessionManagementSettings from '@/views/settings/tabs/SessionManagementSettings.vue'
import SkillConfigPage from '@/views/settings/skill-config/SkillConfigPage.vue'
import SubAgentConfigPage from './SubAgentConfigPage.vue'

/** 智能体管理页内部 Tab 标识 */
type AgentManagementTab = 'subAgents' | 'provider' | 'sessions' | 'skills'

/** Tab 元数据：key + i18n 标签键 + 图标名 */
interface TabItem {
  key: AgentManagementTab
  labelKey: string
  icon: string
}

/**
 * AgentManagementSettings 页面 composable。
 * 无 props / emits，仅管理 Tab 切换展示状态。
 */
export function useAgentManagementSettings() {
  const { t } = useI18n()

  /** 全部 Tab 配置（顺序即展示顺序） */
  const TABS: TabItem[] = [
    { key: 'subAgents', labelKey: 'settings.agentManagement.tabs.subAgents', icon: 'users' },
    { key: 'provider', labelKey: 'settings.agentManagement.tabs.provider', icon: 'repeat' },
    { key: 'sessions', labelKey: 'settings.agentManagement.tabs.sessions', icon: 'history' },
    { key: 'skills', labelKey: 'settings.agentManagement.tabs.skills', icon: 'sparkles' }
  ]

  /** 当前激活的 Tab（默认子智能体配置） */
  const activeTab = ref<AgentManagementTab>('subAgents')

  /** 内容区引用，切换 Tab 时重置滚动位置 */
  const contentRef = ref<HTMLElement | null>(null)

  /**
   * 切换 Tab：相同 Tab 直接忽略；
   * 切换后等待 DOM 更新完成，将内容区滚动位置归零。
   */
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

  return {
    // 子组件
    EaIcon,
    SubAgentConfigPage,
    ProviderSwitch,
    SessionManagementSettings,
    SkillConfigPage,
    // i18n
    t,
    // Tab 元数据与状态
    TABS,
    activeTab,
    contentRef,
    handleTabChange
  }
}
