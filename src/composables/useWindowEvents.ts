import { onMounted, onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'

export function useWindowEvents() {
  const projectStore = useProjectStore()
  const sessionStore = useSessionStore()

  const unlisteners: UnlistenFn[] = []

  onMounted(async () => {
    // 监听项目更新事件
    const unlistenProject = await listen('project:updated', async () => {
      await projectStore.loadProjects()
    })
    unlisteners.push(unlistenProject)

    // 监听会话锁定事件
    const unlistenSessionLock = await listen<string>('session:locked', (event) => {
      const sessionId = event.payload
      // 如果当前窗口打开了该会话，需要关闭
      if (sessionStore.openSessionIds.includes(sessionId)) {
        sessionStore.closeSession(sessionId)
      }
    })
    unlisteners.push(unlistenSessionLock)

    // 监听项目访问更新事件
    const unlistenAccess = await listen('project-access:updated', async () => {
      await projectStore.getRecentProjectIds()
    })
    unlisteners.push(unlistenAccess)
  })

  onUnmounted(() => {
    unlisteners.forEach(unlisten => unlisten())
  })
}
