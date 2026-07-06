/** useTaskDetail — 任务详情面板组件的 composable，聚合任务字段、依赖关系、代理选择与编辑弹窗。 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '@/stores/agent'
import { useSubAgentStore } from '@/stores/subAgent'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import type { Task } from '@/types/plan'
import { resolvePlanTaskAgentSelection } from '@/utils/planExecutionProgress'
import AgentRoleBadge from '../AgentRoleBadge/AgentRoleBadge.vue'
import TaskEditModal from '../taskEditModal/TaskEditModal.vue'

export function useTaskDetail() {
  const agentStore = useAgentStore()
  const agentTeamsStore = useSubAgentStore()
  const planStore = usePlanStore()
  const taskStore = useTaskStore()
  const taskExecutionStore = useTaskExecutionStore()
  const { t, locale } = useI18n()

  // 当前任务
  const currentTask = computed(() => taskStore.currentTask)

  // 编辑弹窗状态
  const isEditModalVisible = ref(false)

  // 是否显示停止按钮
  const showStopButton = computed(() => {
    return currentTask.value?.status === 'in_progress'
  })

  // 是否显示重试按钮
  const showRetryButton = computed(() => {
    return currentTask.value?.status === 'failed'
  })

  // 打开编辑弹窗
  function openEditModal() {
    isEditModalVisible.value = true
  }

  // 停止任务
  async function stopTask() {
    if (!currentTask.value) return
    try {
      const shouldPauseQueue = taskExecutionStore.getCurrentRunningTaskId(currentTask.value.planId) === currentTask.value.id
      await taskExecutionStore.stopTaskExecution(
        currentTask.value.id,
        shouldPauseQueue ? { pauseQueue: true, autoAdvance: false } : undefined
      )
    } catch (error) {
      console.error('Failed to stop task:', error)
    }
  }

  // 重试任务
  async function retryTask() {
    if (!currentTask.value) return
    try {
      await taskExecutionStore.clearTaskLogs(currentTask.value.id)
      await taskStore.updateTask(currentTask.value.id, {
        status: 'in_progress',
        errorMessage: undefined
      })
      await taskExecutionStore.startTaskExecution(currentTask.value.id)
    } catch (error) {
      console.error('Failed to retry task:', error)
    }
  }

  // 格式化日期
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 获取依赖任务
  const dependencies = computed(() => {
    if (!currentTask.value?.dependencies) return []
    return currentTask.value.dependencies
      .map(id => taskStore.tasks.find(t => t.id === id))
      .filter((t): t is Task => t !== undefined)
  })

  const currentPlan = computed(() => {
    if (!currentTask.value) return null
    return planStore.plans.find(plan => plan.id === currentTask.value?.planId) || null
  })

  const executionConfig = computed(() => {
    if (!currentTask.value) {
      return {
        agentLabel: t('taskDetail.unspecified'),
        modelLabel: t('taskDetail.useDefaultModel'),
        sourceLabel: ''
      }
    }

    const selection = resolvePlanTaskAgentSelection(
      {
        expert_id: currentTask.value.expertId ?? null,
        agent_id: currentTask.value.agentId ?? null,
        model_id: currentTask.value.modelId ?? null
      },
      currentPlan.value
    )

    const agent = selection.agentId
      ? agentStore.agents.find(item => item.id === selection.agentId)
      : null
    const expert = selection.expertId
      ? agentTeamsStore.getSubAgentById(selection.expertId)
      : null

    return {
      agentLabel: expert?.name || agent?.name || selection.agentId || t('taskDetail.unspecified'),
      modelLabel: taskExecutionStore.getExecutionState(currentTask.value.id)?.tokenUsage.model
        || selection.modelId
        || agent?.modelId
        || t('taskDetail.useDefaultModel'),
      sourceLabel: selection.source === 'plan' ? t('taskDetail.executionConfigFromPlan') : ''
    }
  })

  function getStatusLabel(status: string): string {
    return t(`taskDetail.statuses.${status}`) || status
  }

  // 点击依赖任务跳转
  function goToDependency(task: Task) {
    taskStore.setCurrentTask(task.id)
  }

  return {
    t,
    locale,
    currentTask,
    isEditModalVisible,
    showStopButton,
    showRetryButton,
    dependencies,
    currentPlan,
    executionConfig,
    AgentRoleBadge,
    TaskEditModal,
    openEditModal,
    stopTask,
    retryTask,
    formatDate,
    getStatusLabel,
    goToDependency
  }
}
