import { markRaw, type Component } from 'vue'
import type { SettingsTab } from '@/stores/ui'
import GeneralSettings from './tabs/GeneralSettings.vue'
import AgentSettings from './tabs/AgentSettings.vue'
import AgentManagementSettings from './agent-management/AgentManagementSettings.vue'
import ThemeSettings from './tabs/ThemeSettings.vue'
import LogSettings from './tabs/LogSettings.vue'
import AppUpdateSettings from './tabs/AppUpdateSettings.vue'
import UnattendedSettings from './tabs/UnattendedSettings/UnattendedSettings.vue'
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
    id: 'theme',
    labelKey: 'settings.nav.theme',
    descriptionKey: 'settings.desc.theme',
    icon: 'palette',
    component: markRaw(ThemeSettings),
    layout: 'wide',
    group: 'workspace'
  },
  {
    id: 'agents',
    labelKey: 'settings.nav.agents',
    descriptionKey: 'settings.desc.agents',
    icon: 'bot',
    component: markRaw(AgentSettings),
    layout: 'full',
    group: 'agents'
  },
  {
    id: 'agentManagement',
    labelKey: 'settings.nav.agentManagement',
    descriptionKey: 'settings.desc.agentManagement',
    icon: 'sliders-horizontal',
    component: markRaw(AgentManagementSettings),
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
