import { onMounted, onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import { useTaskExecutionStore } from '@/stores/taskExecution'

export function useWindowEvents() {
  const projectStore = useProjectStore()
  const sessionStore = useSessionStore()
  const planStore = usePlanStore()
  const taskStore = useTaskStore()
  const taskExecutionStore = useTaskExecutionStore()

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

    // 监听定时计划触发事件
    // 后端已经处理了：更新计划状态为 executing，更新任务状态为 in_progress
    const unlistenScheduledTrigger = await listen<string>('plan:scheduled-trigger', async (event) => {
      const planId = event.payload
      console.log('Scheduled plan triggered:', planId)

      try {
        // 重新加载计划数据以同步状态
        const plan = await planStore.getPlan(planId)
        if (!plan) {
          console.error('Plan not found:', planId)
          return
        }

        // 设置当前计划
        planStore.setCurrentPlan(planId)

        // 重新加载任务列表以同步状态（后端已将 pending 改为 in_progress）
        await taskStore.loadTasks(planId)

        // 获取所有进行中的任务
        const inProgressTasks = taskStore.tasks.filter(t => t.status === 'in_progress')
        console.log(`Plan ${planId} triggered with ${inProgressTasks.length} tasks in progress`)

        // 获取执行进度
        await taskExecutionStore.getPlanExecutionProgress(planId)

        // 如果有进行中的任务，触发任务执行
        if (inProgressTasks.length > 0) {
          // 获取第一个无依赖的任务开始执行
          const readyTasks = inProgressTasks.filter(task => {
            if (!task.dependencies || task.dependencies.length === 0) return true
            return task.dependencies.every(depId => {
            const depTask = taskStore.tasks.find(t => t.id === depId)
              return depTask && depTask.status === 'completed'
            })
          })

          if (readyTasks.length > 0) {
            console.log(`Starting execution with ${readyTasks.length} ready tasks for plan ${planId}`)
            // 这里可以触发任务执行器开始执行
            // taskExecutionStore.executeTask(planId, readyTasks[0].id)
          }
        }
      } catch (error) {
        console.error('Failed to handle scheduled plan trigger:', error)
      }
    })
    unlisteners.push(unlistenScheduledTrigger)
  })

  onUnmounted(() => {
    unlisteners.forEach(unlisten => unlisten())
  })
}
