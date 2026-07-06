/** useRightTaskPanelContent — 右侧任务面板内容组件的 composable，按 planId 订阅任务并提供拆分预览入口。 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import { useTaskSplitStore } from '@/stores/taskSplit'
import type { Task, TaskStatus } from '@/types/plan'
import TaskSplitPreview from '../TaskSplitPreview/TaskSplitPreview.vue'

export interface RightTaskPanelContentProps {
  planId: string
}

export function useRightTaskPanelContent(props: RightTaskPanelContentProps) {
  const { t } = useI18n()
  const planStore = usePlanStore()
  const taskStore = useTaskStore()
  const taskSplitStore = useTaskSplitStore()

  /**
   * 拆分激活态：当前 Dock 绑定的计划正是活跃拆分计划，且已有（或正在产出）拆分结果。
   * 此时展示 TaskSplitPreview（实时预览，支持增删改）；否则展示持久化任务列表。
   */
  const isSplitActive = computed(() =>
    planStore.splitDialogVisible
    && planStore.activeSplitPlanId === props.planId
  )

  const splitTasks = computed(() => taskSplitStore.splitResult ?? [])

  // 持久化任务：按 order 排序
  const persistedTasks = computed<Task[]>(() =>
    [...taskStore.tasks]
      .filter(task => task.planId === props.planId)
      .sort((left, right) => left.order - right.order)
  )

  const planName = computed(() =>
    planStore.plans.find(plan => plan.id === props.planId)?.name ?? ''
  )

  const hasNoTasks = computed(() => !isSplitActive.value && persistedTasks.value.length === 0)

  const statusMeta: Record<TaskStatus, { color: string; labelKey: string }> = {
    pending: { color: 'gray', labelKey: 'taskDetail.statuses.pending' },
    in_progress: { color: 'blue', labelKey: 'taskDetail.statuses.in_progress' },
    completed: { color: 'green', labelKey: 'taskDetail.statuses.completed' },
    blocked: { color: 'yellow', labelKey: 'taskDetail.statuses.blocked' },
    failed: { color: 'red', labelKey: 'taskDetail.statuses.failed' },
    cancelled: { color: 'gray', labelKey: 'taskDetail.statuses.cancelled' }
  }

  function getStatusLabel(status: TaskStatus) {
    return t(statusMeta[status].labelKey)
  }

  function getStatusColor(status: TaskStatus) {
    return statusMeta[status].color
  }

  // 切换计划时加载持久化任务
  watch(
    () => props.planId,
    (planId) => {
      if (planId && !isSplitActive.value) {
        void taskStore.loadTasks(planId)
      }
    },
    { immediate: true }
  )

  // 拆分确认后（isSplitActive 变 false）刷新持久化任务列表
  watch(isSplitActive, (active) => {
    if (!active && props.planId) {
      void taskStore.loadTasks(props.planId)
    }
  })

  function handleTaskClick(task: Task) {
    // 复用 PlanModePanel 的任务详情入口：设置当前计划 + 当前任务，触发右侧详情面板
    planStore.setCurrentPlan(task.planId)
    taskStore.setCurrentTask(task.id)
  }

  return {
    t,
    TaskSplitPreview,
    isSplitActive,
    splitTasks,
    persistedTasks,
    planName,
    hasNoTasks,
    taskSplitStore,
    getStatusLabel,
    getStatusColor,
    handleTaskClick
  }
}
