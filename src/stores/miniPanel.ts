import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore } from '@/stores/session'
import { DEFAULT_MINI_PANEL_SHORTCUT } from '@/utils/shortcut'

interface MiniPanelStatePayload {
  projectId: string
  sessionId: string
  workingDirectory: string
  defaultShortcut: string
}

interface MiniPanelDirectoryResult {
  workingDirectory: string
}

export const useMiniPanelStore = defineStore('miniPanel', () => {
  const projectId = ref<string | null>(null)
  const sessionId = ref<string | null>(null)
  const workingDirectory = ref<string>('')
  const defaultShortcut = ref(DEFAULT_MINI_PANEL_SHORTCUT)
  const isLoading = ref(false)
  const isReady = ref(false)

  const hasSessionContext = computed(() => Boolean(projectId.value && sessionId.value))

  async function ensureState() {
    isLoading.value = true

    try {
      const state = await invoke<MiniPanelStatePayload>('ensure_mini_panel_state')
      projectId.value = state.projectId
      sessionId.value = state.sessionId
      workingDirectory.value = state.workingDirectory
      defaultShortcut.value = state.defaultShortcut
      isReady.value = true
      return state
    } finally {
      isLoading.value = false
    }
  }

  async function initSessionContext() {
    const state = isReady.value ? {
      projectId: projectId.value,
      sessionId: sessionId.value
    } : await ensureState()

    if (!state.projectId || !state.sessionId) {
      return
    }

    const sessionStore = useSessionStore()
    await sessionStore.loadSessions(state.projectId)
    sessionStore.setCurrentSession(state.sessionId)
  }

  async function setWorkingDirectory(nextPath: string) {
    const result = await invoke<MiniPanelDirectoryResult>('set_mini_panel_working_directory', {
      path: nextPath,
      currentDirectory: workingDirectory.value || null
    })
    workingDirectory.value = result.workingDirectory
    return result.workingDirectory
  }

  return {
    projectId,
    sessionId,
    workingDirectory,
    defaultShortcut,
    isLoading,
    isReady,
    hasSessionContext,
    ensureState,
    initSessionContext,
    setWorkingDirectory
  }
})
