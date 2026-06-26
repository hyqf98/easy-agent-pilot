import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SettingsTab =
  | 'general'
  | 'agents'
  | 'agentManagement'
  | 'appUpdate'
  | 'theme'
  | 'logs'
  | 'usageStats'
  | 'unattended'

// 工作区模式：chat/plan/solo/memory/settings 均为主区域内的模式面板（顶部浮动导航在所有模式下常驻）
export type AppMode = 'chat' | 'plan' | 'solo' | 'memory' | 'settings'
// 排除 settings 后的纯工作模式，用于记录进入设置前的模式以便退出恢复
export type WorkspaceMode = Exclude<AppMode, 'settings'>
export type MainContentMode = 'chat' | 'fileEditor' | 'officeViewer'

export const useUIStore = defineStore('ui', () => {
  // State
  const activeSettingsTab = ref<SettingsTab>('general')
  const projectCreateModalVisible = ref(false)
  const sessionCreateModalVisible = ref(false)
  const appMode = ref<AppMode>('chat')
  const mainContentMode = ref<MainContentMode>('chat')
  // 进入设置前的最后工作模式，退出设置时恢复，默认 chat
  const previousAppMode = ref<WorkspaceMode>('chat')

  // Actions
  function openSettings(tab?: SettingsTab) {
    // 切入设置前记录当前工作模式（避免重复进入时覆盖）
    if (appMode.value !== 'settings') {
      previousAppMode.value = appMode.value
    }
    appMode.value = 'settings'
    if (tab) {
      activeSettingsTab.value = tab
    }
  }

  function exitSettings() {
    appMode.value = previousAppMode.value
  }

  function toggleSettings() {
    if (appMode.value === 'settings') {
      exitSettings()
    } else {
      openSettings()
    }
  }

  function setActiveSettingsTab(tab: SettingsTab) {
    activeSettingsTab.value = tab
  }

  function openProjectCreateModal() {
    projectCreateModalVisible.value = true
  }

  function closeProjectCreateModal() {
    projectCreateModalVisible.value = false
  }

  function openSessionCreateModal() {
    sessionCreateModalVisible.value = true
  }

  function closeSessionCreateModal() {
    sessionCreateModalVisible.value = false
  }

  // 切换工作模式：settings 仅通过 openSettings 进入，此处不接收 settings
  function setAppMode(mode: WorkspaceMode) {
    appMode.value = mode
  }

  function setMainContentMode(mode: MainContentMode) {
    mainContentMode.value = mode
  }

  function toggleAppMode() {
    // 循环切换工作模式（排除 settings）
    const modes: WorkspaceMode[] = ['chat', 'plan', 'solo', 'memory']
    const currentIndex = modes.indexOf(appMode.value as WorkspaceMode)
    if (currentIndex === -1) {
      appMode.value = 'chat'
      return
    }
    appMode.value = modes[(currentIndex + 1) % modes.length]
  }

  return {
    // State
    activeSettingsTab,
    projectCreateModalVisible,
    sessionCreateModalVisible,
    appMode,
    mainContentMode,
    previousAppMode,
    // Actions
    openSettings,
    exitSettings,
    toggleSettings,
    setActiveSettingsTab,
    openProjectCreateModal,
    closeProjectCreateModal,
    openSessionCreateModal,
    closeSessionCreateModal,
    setAppMode,
    setMainContentMode,
    toggleAppMode
  }
})
