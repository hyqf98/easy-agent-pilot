import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useNotificationStore } from './notification'
import { getErrorMessage } from '@/utils/api'
import type { Plan, PlanStatus, PlanExecutionStatus, CreatePlanInput, UpdatePlanInput, AgentRole } from '@/types/plan'

// Rust 后端返回的 snake_case 结构
interface RustPlan {
  id: string
  project_id: string
  name: string
  description?: string
  status: string
  execution_status?: string
  current_task_id?: string
  agent_team?: string // JSON 字符串
  granularity: number
  max_retry_count: number
  created_at: string
  updated_at: string
}

// 将 Rust 返回的 snake_case 转换为 camelCase
function transformPlan(rustPlan: RustPlan): Plan {
  let agentTeam: AgentRole[] | undefined
  if (rustPlan.agent_team) {
    try {
      agentTeam = JSON.parse(rustPlan.agent_team)
    } catch {
      // ignore parse error
    }
  }

  return {
    id: rustPlan.id,
    projectId: rustPlan.project_id,
    name: rustPlan.name,
    description: rustPlan.description,
    status: rustPlan.status as PlanStatus,
    executionStatus: rustPlan.execution_status as PlanExecutionStatus | undefined,
    currentTaskId: rustPlan.current_task_id,
    agentTeam,
    granularity: rustPlan.granularity,
    maxRetryCount: rustPlan.max_retry_count,
    createdAt: rustPlan.created_at,
    updatedAt: rustPlan.updated_at
  }
}

export const usePlanStore = defineStore('plan', () => {
  // State
  const plans = ref<Plan[]>([])
  const currentPlanId = ref<string | null>(null)
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)
  const splitDialogVisible = ref(false)
  const splitDialogPlanId = ref<string | null>(null)

  // Getters
  const currentPlan = computed(() =>
    plans.value.find(p => p.id === currentPlanId.value)
  )

  const plansByProject = computed(() => {
    return (projectId: string) => {
      return plans.value
        .filter(p => p.projectId === projectId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
  })

  const plansByStatus = computed(() => {
    return (status: PlanStatus) => {
      return plans.value
        .filter(p => p.status === status)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
  })

  // Actions
  async function loadPlans(projectId: string) {
    isLoading.value = true
    loadError.value = null
    const notificationStore = useNotificationStore()
    try {
      const rustPlans = await invoke<RustPlan[]>('list_plans', { projectId })
      plans.value = rustPlans.map(transformPlan)
    } catch (error) {
      console.error('Failed to load plans:', error)
      plans.value = []
      loadError.value = getErrorMessage(error)
      notificationStore.networkError(
        '加载计划列表',
        getErrorMessage(error),
        () => loadPlans(projectId)
      )
    } finally {
      isLoading.value = false
    }
  }

  async function getPlan(id: string): Promise<Plan | null> {
    try {
      const rustPlan = await invoke<RustPlan>('get_plan', { id })
      return transformPlan(rustPlan)
    } catch (error) {
      console.error('Failed to get plan:', error)
      return null
    }
  }

  async function createPlan(input: CreatePlanInput): Promise<Plan> {
    const notificationStore = useNotificationStore()
    const rustInput = {
      project_id: input.projectId,
      name: input.name,
      description: input.description ?? null,
      agent_team: input.agentTeam ?? null,
      granularity: input.granularity ?? 20,
      max_retry_count: input.maxRetryCount ?? 3
    }

    try {
      const rustPlan = await invoke<RustPlan>('create_plan', { input: rustInput })
      const newPlan = transformPlan(rustPlan)
      plans.value.unshift(newPlan)
      return newPlan
    } catch (error) {
      console.error('Failed to create plan:', error)
      notificationStore.databaseError(
        '创建计划失败',
        getErrorMessage(error),
        async () => { await createPlan(input) }
      )
      throw error
    }
  }

  async function updatePlan(id: string, updates: UpdatePlanInput): Promise<Plan> {
    const notificationStore = useNotificationStore()
    const input = {
      name: updates.name ?? null,
      description: updates.description ?? null,
      status: updates.status ?? null,
      execution_status: updates.executionStatus ?? null,
      current_task_id: updates.currentTaskId ?? null,
      agent_team: updates.agentTeam ?? null,
      granularity: updates.granularity ?? null,
      max_retry_count: updates.maxRetryCount ?? null
    }

    try {
      const rustPlan = await invoke<RustPlan>('update_plan', { id, input })
      const updatedPlan = transformPlan(rustPlan)

      const index = plans.value.findIndex(p => p.id === id)
      if (index !== -1) {
        plans.value[index] = updatedPlan
      }

      return updatedPlan
    } catch (error) {
      console.error('Failed to update plan:', error)
      notificationStore.databaseError(
        '更新计划失败',
        getErrorMessage(error),
        async () => { await updatePlan(id, updates) }
      )
      throw error
    }
  }

  // 将计划状态设置为"就绪"（任务拆分完成，等待用户确认开始执行）
  async function markPlanAsReady(planId: string): Promise<Plan> {
    return updatePlan(planId, { status: 'ready' })
  }

  // 开始执行计划
  async function startPlanExecution(planId: string): Promise<Plan> {
    return updatePlan(planId, {
      status: 'executing',
      executionStatus: 'running'
    })
  }

  // 暂停计划执行
  async function pausePlanExecution(planId: string): Promise<Plan> {
    return updatePlan(planId, { executionStatus: 'paused' })
  }

  // 恢复计划执行
  async function resumePlanExecution(planId: string): Promise<Plan> {
    return updatePlan(planId, { executionStatus: 'running' })
  }

  // 完成计划执行
  async function completePlanExecution(planId: string): Promise<Plan> {
    return updatePlan(planId, {
      status: 'completed',
      executionStatus: 'completed'
    })
  }

  // 设置当前执行的任务
  async function setCurrentTask(planId: string, taskId: string | undefined): Promise<Plan> {
    return updatePlan(planId, { currentTaskId: taskId })
  }

  async function deletePlan(id: string): Promise<void> {
    const notificationStore = useNotificationStore()

    try {
      await invoke('delete_plan', { id })

      const index = plans.value.findIndex(p => p.id === id)
      if (index !== -1) {
        plans.value.splice(index, 1)
      }

      if (currentPlanId.value === id) {
        currentPlanId.value = null
      }
    } catch (error) {
      console.error('Failed to delete plan:', error)
      notificationStore.databaseError(
        '删除计划失败',
        getErrorMessage(error),
        async () => { await deletePlan(id) }
      )
      throw error
    }
  }

  function setCurrentPlan(id: string | null) {
    currentPlanId.value = id
  }

  // 根据状态分组获取计划
  function getPlansByStatus(status: PlanStatus): Plan[] {
    return plans.value
      .filter(p => p.status === status)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  // 打开任务拆分对话框
  function openSplitDialog(planId: string) {
    splitDialogPlanId.value = planId
    splitDialogVisible.value = true
  }

  // 关闭任务拆分对话框
  function closeSplitDialog() {
    splitDialogVisible.value = false
    splitDialogPlanId.value = null
  }

  return {
    // State
    plans,
    currentPlanId,
    isLoading,
    loadError,
    splitDialogVisible,
    splitDialogPlanId,
    // Getters
    currentPlan,
    plansByProject,
    plansByStatus,
    // Actions
    loadPlans,
    getPlan,
    createPlan,
    updatePlan,
    deletePlan,
    setCurrentPlan,
    getPlansByStatus,
    // 执行控制
    markPlanAsReady,
    startPlanExecution,
    pausePlanExecution,
    resumePlanExecution,
    completePlanExecution,
    setCurrentTask,
    // 拆分对话框
    openSplitDialog,
    closeSplitDialog
  }
})
