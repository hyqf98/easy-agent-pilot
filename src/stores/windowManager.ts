import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface WindowContext {
  label: string
  project_id: string | null
  window_type: 'main' | 'project' | 'mini-panel'
}

export const useWindowManagerStore = defineStore('windowManager', () => {
  // 状态
  const windowLabel = ref<string>('main')
  const projectId = ref<string | null>(null)
  const windowType = ref<'main' | 'project' | 'mini-panel'>('main')
  const isInitialized = ref(false)

  // 计算属性
  const isMainWindow = computed(() => windowLabel.value === 'main')
  const isProjectWindow = computed(() => windowLabel.value.startsWith('project-'))
  const isMiniPanelWindow = computed(() => windowType.value === 'mini-panel')

  // 初始化窗口上下文
  async function initWindowContext() {
    if (isInitialized.value) return

    try {
      const context = await invoke<WindowContext>('get_window_context')

      windowLabel.value = context.label
      projectId.value = context.project_id
      windowType.value = context.window_type

      // 监听窗口关闭事件，释放会话锁定
      const window = getCurrentWindow()
      window.onCloseRequested(async () => {
        await invoke('release_window_sessions', { windowLabel: context.label })
      })

      isInitialized.value = true
    } catch (error) {
      console.error('Failed to init window context:', error)
    }
  }

  // 在新窗口打开项目
  async function openProjectInNewWindow(targetProjectId: string): Promise<string> {
    const label = await invoke<string>('open_project_in_new_window', {
      projectId: targetProjectId
    })
    return label
  }

  // 锁定会话
  async function lockSession(sessionId: string): Promise<void> {
    await invoke('lock_session', {
      sessionId,
      windowLabel: windowLabel.value
    })
  }

  // 释放会话
  async function releaseSession(sessionId: string): Promise<void> {
    await invoke('release_session', { sessionId })
  }

  // 检查会话是否被锁定
  async function isSessionLocked(sessionId: string): Promise<string | null> {
    return await invoke<string | null>('is_session_locked', { sessionId })
  }

  return {
    // 状态
    windowLabel,
    projectId,
    windowType,
    isInitialized,
    // 计算属性
    isMainWindow,
    isProjectWindow,
    isMiniPanelWindow,
    // 方法
    initWindowContext,
    openProjectInNewWindow,
    lockSession,
    releaseSession,
    isSessionLocked
  }
})
