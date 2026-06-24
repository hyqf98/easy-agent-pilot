import { markRaw, type Component } from 'vue'
import type { SettingsTab } from '@/stores/ui'
import GeneralSettings from './tabs/GeneralSettings.vue'
import AgentSettings from './tabs/AgentSettings.vue'
import AgentTeamsSettings from './tabs/AgentTeamsSettings.vue'
import SkillConfigPage from '@/components/skill-config/SkillConfigPage.vue'
import ProviderSwitch from './tabs/ProviderSwitch.vue'
import ThemeSettings from './tabs/ThemeSettings.vue'
import DataSettings from './tabs/DataSettings.vue'
import LogSettings from './tabs/LogSettings.vue'
import LspSettings from './tabs/LspSettings.vue'
import SessionManagementSettings from './tabs/SessionManagementSettings.vue'
import AppUpdateSettings from './tabs/AppUpdateSettings.vue'
import UnattendedSettings from './tabs/UnattendedSettings.vue'
import AgentCliUsageSettings from './tabs/agentCliUsageSettings/AgentCliUsageSettings.vue'

/**
 * 设置项所属分组。
 * 分组仅影响导航菜单的视觉聚合，不改变功能边界。
 */
export type SettingsTabGroup = 'workspace' | 'agents' | 'system'

export interface SettingsTabDescriptor {
  id: SettingsTab
  labelKey: string
  descriptionKey: string
  icon: string
  component: Component
  layout: 'default' | 'wide' | 'full'
  group: SettingsTabGroup
}

/**
 * 导航分组顺序与标题，由 SettingsNav 渲染。
 */
export const SETTINGS_TAB_GROUPS: Array<{ id: SettingsTabGroup; labelKey: string }> = [
  { id: 'workspace', labelKey: 'settings.group.workspace' },
  { id: 'agents', labelKey: 'settings.group.agents' },
  { id: 'system', labelKey: 'settings.group.system' }
]

export const SETTINGS_TAB_DESCRIPTORS: SettingsTabDescriptor[] = [
  {
    id: 'general',
    labelKey: 'settings.nav.general',
    descriptionKey: 'settings.desc.general',
    icon: 'settings',
    component: markRaw(GeneralSettings),
    layout: 'wide',
    group: 'workspace'
  },
  {
    id: 'providerSwitch',
    labelKey: 'settings.nav.providerSwitch',
    descriptionKey: 'settings.desc.providerSwitch',
    icon: 'repeat',
    component: markRaw(ProviderSwitch),
    layout: 'wide',
    group: 'workspace'
  },
  {
    id: 'theme',
    labelKey: 'settings.nav.theme',
    descriptionKey: 'settings.desc.theme',
    icon: 'palette',
    component: markRaw(ThemeSettings),
    layout: 'wide',
    group: 'workspace'
  },
  {
    id: 'sessions',
    labelKey: 'settings.nav.sessions',
    descriptionKey: 'settings.desc.sessions',
    icon: 'history',
    component: markRaw(SessionManagementSettings),
    layout: 'wide',
    group: 'workspace'
  },
  {
    id: 'agents',
    labelKey: 'settings.nav.agents',
    descriptionKey: 'settings.desc.agents',
    icon: 'bot',
    component: markRaw(AgentSettings),
    layout: 'wide',
    group: 'agents'
  },
  {
    id: 'agentTeams',
    labelKey: 'settings.nav.agentTeams',
    descriptionKey: 'settings.desc.agentTeams',
    icon: 'users',
    component: markRaw(AgentTeamsSettings),
    layout: 'full',
    group: 'agents'
  },
  {
    id: 'agentConfig',
    labelKey: 'settings.nav.agentConfig',
    descriptionKey: 'settings.desc.agentConfig',
    icon: 'settings-2',
    component: markRaw(SkillConfigPage),
    layout: 'full',
    group: 'agents'
  },
  {
    id: 'unattended',
    labelKey: 'settings.nav.unattended',
    descriptionKey: 'settings.desc.unattended',
    icon: 'satellite',
    component: markRaw(UnattendedSettings),
    layout: 'full',
    group: 'agents'
  },
  {
    id: 'lsp',
    labelKey: 'settings.nav.lsp',
    descriptionKey: 'settings.desc.lsp',
    icon: 'languages',
    component: markRaw(LspSettings),
    layout: 'wide',
    group: 'system'
  },
  {
    id: 'data',
    labelKey: 'settings.nav.data',
    descriptionKey: 'settings.desc.data',
    icon: 'database',
    component: markRaw(DataSettings),
    layout: 'wide',
    group: 'system'
  },
  {
    id: 'logs',
    labelKey: 'settings.nav.logs',
    descriptionKey: 'settings.desc.logs',
    icon: 'scroll-text',
    component: markRaw(LogSettings),
    layout: 'full',
    group: 'system'
  },
  {
    id: 'usageStats',
    labelKey: 'settings.nav.usageStats',
    descriptionKey: 'settings.desc.usageStats',
    icon: 'chart-column',
    component: markRaw(AgentCliUsageSettings),
    layout: 'full',
    group: 'system'
  },
  {
    id: 'appUpdate',
    labelKey: 'settings.nav.appUpdate',
    descriptionKey: 'settings.desc.appUpdate',
    icon: 'download',
    component: markRaw(AppUpdateSettings),
    layout: 'wide',
    group: 'system'
  }
]

const settingsTabDescriptorMap = new Map(
  SETTINGS_TAB_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor])
)

export function getSettingsTabDescriptor(tab: SettingsTab): SettingsTabDescriptor {
  return settingsTabDescriptorMap.get(tab) ?? SETTINGS_TAB_DESCRIPTORS[0]
}
