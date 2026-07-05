import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import { useProjectStore } from '@/stores/project'
import { useAgentSchedulerStore } from '@/stores/agentScheduler'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import PlanList from '../planList/PlanList.vue'
import TaskBoard from '../taskBoard/TaskBoard.vue'
import PlanSplitConversation from '../planSplitConversation/PlanSplitConversation.vue'
import TaskExecutionLog from '../taskExecutionLog/TaskExecutionLog.vue'
import TaskDetail from '../TaskDetail/TaskDetail.vue'
import PlanProgressDetail from '../PlanProgressDetail/PlanProgressDetail.vue'
import AgentRoleBadge from '../AgentRoleBadge/AgentRoleBadge.vue'
import { EaIcon } from '@/components/common'
import WorkspaceShell from '@/components/layout/WorkspaceShell/WorkspaceShell.vue'
import type { Plan, Task } from '@/types/plan'

export function usePlanModePanel() {
  const planStore = usePlanStore()
  const taskStore = useTaskStore()
  const projectStore = useProjectStore()
  const agentSchedulerStore = useAgentSchedulerStore()
  const taskExecutionStore = useTaskExecutionStore()

  type RightPanelView = 'plan_progress' | 'task_detail' | 'task_log'

  const rightPanelOpen = ref(false)
  const rightPanelView = ref<RightPanelView>('plan_progress')
  const selectedPlanId = ref<string | null>(null)
  const selectedTaskId = ref<string | null>(null)

  // 右侧面板宽度拖拽相关
  const rightPanelWidth = ref(380)
  const isResizing = ref(false)
  const minPanelWidth = 280
  const maxPanelWidth = 600

  // 当前活动角色
  const activeRole = computed(() => agentSchedulerStore.activeRole)

  // 监听计划变化，加载任务
  watch(
    () => planStore.currentPlanId,
    (planId) => {
      if (planId) {
        void taskStore.loadTasks(planId)
        return
      }

      if (projectStore.currentProjectId) {
        void taskStore.loadProjectLooseTasks(projectStore.currentProjectId)
      }
    }
  )

  // 监听项目切换，清除选中状态
  watch(
    () => projectStore.currentProjectId,
    (projectId) => {
      planStore.setCurrentPlan(null)
      selectedPlanId.value = null
      selectedTaskId.value = null
      rightPanelOpen.value = false

      if (projectId) {
        void taskStore.loadProjectLooseTasks(projectId)
      }
    }
  )

  function handlePlanClick(plan: Plan) {
    planStore.setCurrentPlan(plan.id)
    rightPanelOpen.value = true
    rightPanelView.value = 'plan_progress'
    selectedPlanId.value = plan.id
    selectedTaskId.value = null
  }

  function handleTaskClick(task: Task) {
    const relatedPlan = planStore.plans.find(plan => plan.id === task.planId) || null
    planStore.setCurrentPlan(relatedPlan?.id ?? null)
    rightPanelOpen.value = true
    selectedTaskId.value = task.id
    selectedPlanId.value = relatedPlan?.id ?? null
    taskExecutionStore.setCurrentViewingTask(task.id)

    // 根据任务状态决定右侧面板视图
    if (task.status === 'pending') {
      rightPanelView.value = 'task_detail'
      taskStore.setCurrentTask(task.id)
    } else {
      // in_progress, completed, blocked 都显示执行日志
      rightPanelView.value = 'task_log'
      void taskExecutionStore.loadTaskLogs(task.id)
    }
  }

  function handlePlanTaskSelect(taskId: string) {
    const task = taskStore.tasks.find(item => item.id === taskId)
    if (!task) return
    handleTaskClick(task)
  }

  function closeRightPanel() {
    rightPanelOpen.value = false
  }

  // 开始拖拽调整宽度
  function startResize(e: MouseEvent) {
    isResizing.value = true
    e.preventDefault()
  }

  // 拖拽中
  function handleResize(e: MouseEvent) {
    if (!isResizing.value) return

    const containerRect = document.querySelector('.plan-content')?.getBoundingClientRect()
    if (!containerRect) return

    // 计算新的宽度（从右边缘到鼠标位置）
    const newWidth = containerRect.right - e.clientX

    // 限制在最小和最大宽度之间
    rightPanelWidth.value = Math.min(maxPanelWidth, Math.max(minPanelWidth, newWidth))
  }

  // 结束拖拽
  function stopResize() {
    isResizing.value = false
  }

  // 添加和移除全局事件监听
  onMounted(() => {
    if (!planStore.currentPlanId && projectStore.currentProjectId) {
      void taskStore.loadProjectLooseTasks(projectStore.currentProjectId)
    }
    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', stopResize)
  })

  onUnmounted(() => {
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
  })

  return {
    planStore,
    taskStore,
    activeRole,
    rightPanelOpen,
    rightPanelView,
    selectedPlanId,
    selectedTaskId,
    rightPanelWidth,
    isResizing,
    PlanList,
    TaskBoard,
    PlanSplitConversation,
    TaskExecutionLog,
    TaskDetail,
    PlanProgressDetail,
    AgentRoleBadge,
    EaIcon,
    WorkspaceShell,
    handlePlanClick,
    handleTaskClick,
    handlePlanTaskSelect,
    closeRightPanel,
    startResize
  }
}
