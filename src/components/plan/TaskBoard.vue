<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import KanbanColumn from './KanbanColumn.vue'
import TaskEditModal from './TaskEditModal.vue'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import { useAgentTeamsStore } from '@/stores/agentTeams'
import { useNotificationStore } from '@/stores/notification'
import { useConfirmDialog } from '@/composables'
import type { Task, TaskStatus, TaskOrderItem } from '@/types/plan'
import type { PlanExecutionProgress, PlanExecutionTaskProgress } from '@/types/taskExecution'
import { groupTaskResultFiles } from '@/utils/taskExecutionResult'

const planStore = usePlanStore()
const taskStore = useTaskStore()
const taskExecutionStore = useTaskExecutionStore()
const agentTeamsStore = useAgentTeamsStore()
const notificationStore = useNotificationStore()
const confirmDialog = useConfirmDialog()
const { t } = useI18n()
const emit = defineEmits<{
  (e: 'task-click', task: Task): void
}>()

const showEditModal = ref(false)
const editingTask = ref<Task | null>(null)

const showCreateModal = ref(false)
const createMode = ref<'create' | 'edit'>('create')

const planProgress = ref<PlanExecutionProgress | null>(null)
const showPlanOverview = ref(true)

const currentPlanId = computed(() => planStore.currentPlanId)

const currentPlan = computed(() => planStore.currentPlan)

const currentExecutionQueue = computed(() => {
  if (!currentPlanId.value) return undefined
  return taskExecutionStore.getExecutionQueue(currentPlanId.value)
})

const hasInterruptedTasksAwaitingResume = computed(() => {
  if (!currentPlan.value || tasksByStatus.value.in_progress.length === 0) {
    return false
  }

  const queue = currentExecutionQueue.value
  const hasActiveQueueWork = Boolean(queue?.currentTaskId) || (queue?.pendingTaskIds.length ?? 0) > 0
  return !hasActiveQueueWork
    && (
      currentPlan.value.executionStatus === 'paused'
      || currentPlan.value.executionStatus === 'running'
    )
})

const isCurrentPlanPaused = computed(() =>
  currentExecutionQueue.value?.isPaused
  ?? hasInterruptedTasksAwaitingResume.value
)

// 是否为手动模式
const isManualMode = computed(() => currentPlan.value?.splitMode === 'manual')

// 新建任务模板
const newTaskTemplate = reactive<Partial<Task>>({
  planId: '',
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
  order: 0,
  retryCount: 0,
  maxRetries: 3
})

const emptyTasksByStatus: Record<TaskStatus, Task[]> = {
  pending: [],
  in_progress: [],
  completed: [],
  blocked: [],
  failed: [],
  cancelled: []
}

const tasks = computed(() => {
  if (!currentPlanId.value) return []
  return taskStore.tasks.filter(t => t.planId === currentPlanId.value)
})

const tasksByStatus = computed(() => {
  if (!currentPlanId.value) return emptyTasksByStatus

  const result: Record<TaskStatus, Task[]> = {
    pending: [],
    in_progress: [],
    completed: [],
    blocked: [],
    failed: [],
    cancelled: []
  }

  tasks.value.forEach(t => {
    if (result[t.status]) {
      result[t.status].push(t)
    }
  })

  Object.keys(result).forEach(status => {
    if (status === 'in_progress') {
      // 执行中列：正在执行的任务在顶部，其余按 order 排在底部
      result[status as TaskStatus].sort((a, b) => {
        const aRunning = taskExecutionStore.isTaskRunning(a.id) ? 0 : 1
        const bRunning = taskExecutionStore.isTaskRunning(b.id) ? 0 : 1
        if (aRunning !== bRunning) return aRunning - bRunning
        return a.order - b.order
      })
    } else if (status === 'completed') {
      // 已完成列：按完成时间降序（最近完成在顶部，最早完成在底部）
      result[status as TaskStatus].sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } else {
      result[status as TaskStatus].sort((a, b) => a.order - b.order)
    }
  })

  return result
})

// 统计信息
const taskStats = computed(() => ({
  total: tasks.value.length,
  pending: tasks.value.filter(t => t.status === 'pending').length,
  inProgress: tasks.value.filter(t => t.status === 'in_progress').length,
  completed: tasks.value.filter(t => t.status === 'completed').length,
  blocked: tasks.value.filter(t => t.status === 'blocked').length,
  failed: tasks.value.filter(t => t.status === 'failed').length
}))

// 计划概览数据
interface PlanOverviewTask {
  title: string
  status: string
  expertName: string
  summary: string
  files: string[]
  failReason: string
}

const planOverviewTasks = computed<PlanOverviewTask[]>(() => {
  if (!planProgress.value) return []
  return planProgress.value.tasks.map((task: PlanExecutionTaskProgress) => {
    const expert = agentTeamsStore.experts.find(e => e.id === task.expert_id)
    const fileGroups = groupTaskResultFiles(task.last_result_files ?? [])
    const allFiles = [...fileGroups.generatedFiles, ...fileGroups.modifiedFiles, ...fileGroups.changedFiles, ...fileGroups.deletedFiles]
    return {
      title: task.title,
      status: task.status,
      expertName: expert?.name || task.expert_id || '',
      summary: task.last_result_summary || '',
      files: allFiles,
      failReason: task.last_fail_reason || ''
    }
  })
})

const hasPlanResults = computed(() =>
  planOverviewTasks.value.some(task => task.summary || task.files.length > 0 || task.failReason)
)

function resolveTaskStatusClass(status: string): string {
  switch (status) {
    case 'completed': return 'status-completed'
    case 'failed': return 'status-failed'
    case 'in_progress': return 'status-running'
    case 'blocked': return 'status-blocked'
    default: return 'status-pending'
  }
}

function resolveTaskStatusLabel(status: string): string {
  switch (status) {
    case 'completed': return t('taskBoard.planOverview.statusCompleted')
    case 'failed': return t('taskBoard.planOverview.statusFailed')
    case 'in_progress': return t('taskBoard.planOverview.statusRunning')
    case 'blocked': return t('taskBoard.planOverview.statusBlocked')
    default: return t('taskBoard.planOverview.statusPending')
  }
}

const columns = computed<Array<{ status: TaskStatus; label: string; color: string }>>(() => [
  { status: 'pending', label: t('taskBoard.columns.pending'), color: 'gray' },
  { status: 'in_progress', label: t('taskBoard.columns.in_progress'), color: 'blue' },
  { status: 'completed', label: t('taskBoard.columns.completed'), color: 'green' },
  { status: 'blocked', label: t('taskBoard.columns.blocked'), color: 'yellow' },
  { status: 'failed', label: t('taskBoard.columns.failed'), color: 'red' }
])

function isTaskTrackedByExecution(taskId: string): boolean {
  const state = taskExecutionStore.getExecutionState(taskId)
  if (state && state.status !== 'idle' && state.status !== 'completed' && state.status !== 'failed') {
    return true
  }

  const queue = currentExecutionQueue.value
  return Boolean(
    queue
    && (
      queue.currentTaskId === taskId
      || queue.lastInterruptedTaskId === taskId
      || queue.pendingTaskIds.includes(taskId)
    )
  )
}

async function showUnmetDependencyDialog(task: Task) {
  const dependencyNames = taskStore.getUnmetDependencyTitles(task.id)
  const firstDependency = dependencyNames[0] ?? ''
  const dependencyList = dependencyNames.join('、')

  await confirmDialog.show({
    type: 'info',
    title: t('taskBoard.dependencyBlockedTitle'),
    message: dependencyNames.length > 0
      ? t('taskBoard.dependencyBlockedMessage', {
        task: task.title,
        dependencies: dependencyList,
        nextTask: firstDependency
      })
      : t('taskBoard.dependencyBlockedFallback', { task: task.title }),
    confirmLabel: t('common.gotIt'),
    cancelLabel: t('common.close'),
    confirmButtonType: 'primary'
  })
}

async function loadTasks() {
  if (currentPlanId.value) {
    await taskStore.loadTasks(currentPlanId.value)
    await loadPlanProgress()
  }
}

async function loadPlanProgress() {
  if (!currentPlanId.value) {
    planProgress.value = null
    return
  }
  try {
    await agentTeamsStore.loadExperts()
    planProgress.value = await taskExecutionStore.getPlanExecutionProgress(currentPlanId.value)
  } catch {
    planProgress.value = null
  }
}

watch(currentPlanId, (newPlanId) => {
  if (newPlanId) {
    loadTasks()
  }
}, { immediate: true })

// 任务状态变化时刷新概览
watch(() => tasks.value.map(t => `${t.id}:${t.status}`).join(','), () => {
  if (currentPlanId.value && hasPlanResults.value) {
    void loadPlanProgress()
  }
})

async function handleTaskDrop(taskId: string, newStatus: TaskStatus) {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task || task.status === newStatus) return

  const oldStatus = task.status
  const oldOrder = task.order

  if (taskExecutionStore.isTaskRunning(taskId)) {
    return
  }

  if (newStatus === 'in_progress' && oldStatus === 'pending' && !taskStore.areDependenciesMet(taskId)) {
    await showUnmetDependencyDialog(task)
    return
  }

  const targetColumnTasks = tasksByStatus.value[newStatus]
  // 使用最大 order + 1 确保新任务始终排在目标列底部
  const maxOrder = targetColumnTasks.reduce((max, t) => Math.max(max, t.order), -1)
  const newOrder = maxOrder + 1

  task.status = newStatus
  task.order = newOrder

  if (newStatus === 'pending' && oldStatus !== 'pending') {
    try {
      await taskExecutionStore.clearTaskLogs(taskId)
    } catch (error) {
      console.warn('Failed to clear task logs:', error)
    }
  }

  if (newStatus === 'in_progress' && oldStatus === 'pending') {
    try {
      await taskStore.updateTask(taskId, {
        status: newStatus,
        order: newOrder,
        errorMessage: undefined,
        blockReason: undefined
      })

      if (currentPlanId.value) {
        await taskExecutionStore.startTaskExecution(taskId)
      }
    } catch (error) {
      task.status = oldStatus
      task.order = oldOrder
      await loadTasks()
      console.error('Failed to start task execution:', error)
    }
    return
  }

  try {
    if (isTaskTrackedByExecution(taskId)) {
      await taskExecutionStore.detachTaskFromExecution(taskId)
    }

    await taskStore.updateTask(taskId, {
      status: newStatus,
      order: newOrder
    })

    if (currentPlanId.value) {
      await taskExecutionStore.synchronizePlanExecutionQueue(currentPlanId.value)
    }
  } catch (error) {
    task.status = oldStatus
    task.order = oldOrder
    await loadTasks()
    console.error('Failed to update task:', error)
  }
}

function collectTaskAndDescendantIds(taskId: string): string[] {
  const ids = new Set<string>([taskId])
  let changed = true

  while (changed) {
    changed = false
    tasks.value.forEach((task) => {
      if (task.parentId && ids.has(task.parentId) && !ids.has(task.id)) {
        ids.add(task.id)
        changed = true
      }
    })
  }

  return Array.from(ids)
}

async function handleTaskReorder(taskId: string, targetIndex: number) {
  const movedTask = tasks.value.find(t => t.id === taskId)
  if (!movedTask) return

  const sameStatusTasks = tasksByStatus.value[movedTask.status] as Task[]
  if (sameStatusTasks.length <= 1) return

  const currentIndex = sameStatusTasks.findIndex(t => t.id === taskId)
  if (currentIndex === -1 || currentIndex === targetIndex) return

  const newTaskList = sameStatusTasks.filter(t => t.id !== taskId)
  const insertIndex = Math.max(0, Math.min(targetIndex, newTaskList.length))
  newTaskList.splice(insertIndex, 0, movedTask)

  // 重新计算排序
  const orderUpdates: TaskOrderItem[] = newTaskList.map((task, index) => ({
    id: task.id,
    order: index
  }))

  newTaskList.forEach((task, index) => {
    task.order = index
  })

  try {
    await taskStore.reorderTasks(orderUpdates)
    if (currentPlanId.value && movedTask.status === 'in_progress') {
      await taskExecutionStore.synchronizePlanExecutionQueue(currentPlanId.value)
    }
  } catch (error) {
    loadTasks()
    console.error('Failed to reorder tasks:', error)
  }
}

function selectTask(task: Task) {
  taskStore.setCurrentTask(task.id)
  taskExecutionStore.setCurrentViewingTask(task.id)
  void taskExecutionStore.loadTaskLogs(task.id)
  emit('task-click', task)
}

function handleTaskEdit(task: Task) {
  editingTask.value = task
  showEditModal.value = true
}

async function handleTaskStop(task: Task) {
  try {
    // 单个任务停止：不暂停队列，允许自动推进到下一个可执行任务
    await taskExecutionStore.stopTaskExecution(task.id, {
      pauseQueue: false,
      autoAdvance: true
    })

    if (currentPlanId.value) {
      await taskExecutionStore.synchronizePlanExecutionQueue(currentPlanId.value)
    }
  } catch (error) {
    console.error('Failed to stop task:', error)
  }
}

async function handleTaskStart(task: Task) {
  if (!taskStore.areDependenciesMet(task.id)) {
    await showUnmetDependencyDialog(task)
    return
  }

  try {
    await taskExecutionStore.startTaskExecution(task.id)
  } catch (error) {
    notificationStore.warning('无法开始任务', error instanceof Error ? error.message : String(error))
  }
}

async function handleTaskResume(task: Task) {
  try {
    await taskExecutionStore.resumeTaskExecution(task.id)
    if (currentPlanId.value) {
      await taskExecutionStore.synchronizePlanExecutionQueue(currentPlanId.value)
    }
  } catch (error) {
    console.error('Failed to resume task:', error)
  }
}

async function handleTaskRetry(task: Task) {
  try {
    if (currentPlanId.value) {
      // 先清除持久化日志
      await taskExecutionStore.clearTaskLogs(task.id)

      await taskStore.updateTask(task.id, {
        status: 'in_progress',
        errorMessage: undefined
      })

      await taskExecutionStore.startTaskExecution(task.id)
    }
  } catch (error) {
    console.error('Failed to retry task:', error)
  }
}

async function handleTaskDelete(task: Task) {
  const confirmed = await confirmDialog.danger(
    t('taskBoard.deleteTaskMessage', { name: task.title }),
    t('taskBoard.deleteTaskTitle')
  )

  if (confirmed) {
    try {
      const deletedTaskIds = collectTaskAndDescendantIds(task.id)
      const trackedTaskIds = deletedTaskIds.filter(isTaskTrackedByExecution)

      for (const trackedTaskId of trackedTaskIds) {
        await taskExecutionStore.detachTaskFromExecution(trackedTaskId)
      }

      await taskStore.deleteTask(task.id)

      if (currentPlanId.value) {
        await taskExecutionStore.synchronizePlanExecutionQueue(currentPlanId.value)
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }
}

async function handleExecuteAll() {
  if (!currentPlanId.value) return

  const pendingTasks = [...tasksByStatus.value.pending]
  if (pendingTasks.length === 0) return

  try {
    await planStore.startPlanExecution(currentPlanId.value)

    for (const task of pendingTasks) {
      await taskExecutionStore.enqueueTask(currentPlanId.value, task.id)
    }
    await taskExecutionStore.synchronizePlanExecutionQueue(currentPlanId.value)
  } catch (error) {
    console.error('Failed to execute all tasks:', error)
  }
}

// 从“执行中且暂停”状态恢复整条执行流
async function handleStartExecution() {
  if (!currentPlanId.value) return

  try {
    await taskExecutionStore.resumePlanExecutionFlow(currentPlanId.value)
  } catch (error) {
    console.error('Failed to start execution:', error)
  }
}

async function handleToggleGlobalExecution() {
  if (!currentPlanId.value) return

  try {
    if (isCurrentPlanPaused.value) {
      await taskExecutionStore.resumePlanExecutionFlow(currentPlanId.value)
    } else {
      await taskExecutionStore.pausePlanExecutionFlow(currentPlanId.value)
    }
  } catch (error) {
    console.error('Failed to toggle global execution:', error)
  }
}

function handleEditSaved() {
  showEditModal.value = false
  editingTask.value = null
}

function openCreateTaskModal() {
  if (!currentPlanId.value) return

  Object.assign(newTaskTemplate, {
    planId: currentPlanId.value,
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    order: tasks.value.length,
    retryCount: 0,
    maxRetries: 3,
    implementationSteps: [],
    testSteps: [],
    acceptanceCriteria: []
  })

  createMode.value = 'create'
  showCreateModal.value = true
}

async function handleTaskCreated(taskData: Partial<Task>) {
  if (!currentPlanId.value) return

  try {
    await taskStore.createTask({
      planId: currentPlanId.value,
      title: taskData.title || '',
      description: taskData.description,
      priority: taskData.priority,
      expertId: taskData.expertId,
      agentId: taskData.agentId,
      modelId: taskData.modelId,
      order: tasks.value.length,
      maxRetries: taskData.maxRetries || 3,
      implementationSteps: taskData.implementationSteps,
      testSteps: taskData.testSteps,
      acceptanceCriteria: taskData.acceptanceCriteria
    })
    showCreateModal.value = false
  } catch (error) {
    console.error('Failed to create task:', error)
  }
}

async function markPlanAsReady() {
  if (!currentPlanId.value) return

  try {
    await planStore.markPlanAsReady(currentPlanId.value)
  } catch (error) {
    console.error('Failed to mark plan as ready:', error)
  }
}
</script>

<template>
  <div class="task-board">
    <div class="board-header">
      <div class="header-left">
        <h3 class="title">
          {{ t('taskBoard.title') }}
        </h3>
      </div>
      <div class="header-right">
        <button
          v-if="isManualMode && currentPlan?.status === 'planning' && tasks.length > 0"
          class="btn btn-secondary"
          @click="markPlanAsReady"
        >
          {{ t('taskBoard.actions.markSplitReady') }}
        </button>

        <div class="task-stats">
          <span class="stat-item completed">{{ t('taskBoard.stats.completed', { count: taskStats.completed }) }}</span>
          <span class="stat-item in-progress">{{ t('taskBoard.stats.inProgress', { count: taskStats.inProgress }) }}</span>
          <span class="stat-item blocked">{{ t('taskBoard.stats.blocked', { count: taskStats.blocked }) }}</span>
          <span class="stat-item pending">{{ t('taskBoard.stats.pending', { count: taskStats.pending }) }}</span>
          <span class="stat-item failed">{{ t('taskBoard.stats.failed', { count: taskStats.failed }) }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="!currentPlanId"
      class="empty-state"
    >
      <span>{{ t('taskBoard.emptyNoPlan') }}</span>
    </div>

    <template v-else>
      <div v-if="hasPlanResults" class="plan-overview">
        <div
          class="plan-overview-header"
          @click="showPlanOverview = !showPlanOverview"
        >
          <span class="plan-overview-title">{{ t('taskBoard.planOverview.title') }}</span>
          <div class="plan-overview-stats">
            <span class="ov-stat ov-stat-completed">{{ t('taskBoard.planOverview.completedCount', { count: taskStats.completed }) }}</span>
            <span v-if="taskStats.failed > 0" class="ov-stat ov-stat-failed">{{ t('taskBoard.planOverview.failedCount', { count: taskStats.failed }) }}</span>
            <span class="ov-stat ov-stat-pending">{{ t('taskBoard.planOverview.pendingCount', { count: taskStats.pending + taskStats.inProgress }) }}</span>
          </div>
          <span class="plan-overview-toggle">{{ showPlanOverview ? '▲' : '▼' }}</span>
        </div>
        <div
          v-if="showPlanOverview"
          class="plan-overview-body"
        >
          <div
            v-for="(task, index) in planOverviewTasks"
            :key="index"
            class="plan-overview-task"
          >
            <div class="ov-task-header">
              <span :class="['ov-task-status', resolveTaskStatusClass(task.status)]">{{ resolveTaskStatusLabel(task.status) }}</span>
              <span class="ov-task-title">{{ task.title }}</span>
              <span v-if="task.expertName" class="ov-task-expert">{{ task.expertName }}</span>
            </div>
            <div v-if="task.summary" class="ov-task-summary">{{ task.summary }}</div>
            <div v-if="task.files.length > 0" class="ov-task-files">
              <span class="ov-files-label">{{ t('taskBoard.planOverview.files') }}:</span>
              <span
                v-for="file in task.files.slice(0, 5)"
                :key="file"
                class="ov-file-tag"
              >{{ file }}</span>
              <span v-if="task.files.length > 5" class="ov-file-more">+{{ task.files.length - 5 }}</span>
            </div>
            <div v-if="task.failReason" class="ov-task-fail">{{ t('taskBoard.planOverview.failReason') }}: {{ task.failReason }}</div>
          </div>
        </div>
      </div>

      <div class="board-columns">
      <KanbanColumn
        v-for="column in columns"
        :key="column.status"
        :status="column.status"
        :title="column.label"
        :color="column.color"
        :tasks="tasksByStatus[column.status] || []"
        :global-paused="column.status === 'in_progress' ? isCurrentPlanPaused : false"
        @task-drop="handleTaskDrop"
        @task-click="selectTask"
        @task-reorder="handleTaskReorder"
        @task-edit="handleTaskEdit"
        @task-start="handleTaskStart"
        @task-stop="handleTaskStop"
        @task-resume="handleTaskResume"
        @task-retry="handleTaskRetry"
        @task-delete="handleTaskDelete"
        @execute-all="handleExecuteAll"
        @start-execution="handleStartExecution"
        @toggle-global-execution="handleToggleGlobalExecution"
        @add-task="openCreateTaskModal"
      />
    </div>
    </template>

    <TaskEditModal
      v-if="editingTask"
      v-model:visible="showEditModal"
      :task="editingTask"
      @saved="handleEditSaved"
    />

    <TaskEditModal
      v-if="showCreateModal"
      v-model:visible="showCreateModal"
      :task="newTaskTemplate as Task"
      mode="create"
      @saved="handleTaskCreated"
    />
  </div>
</template>

<style scoped>
.task-board {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-secondary, #f8fafc);
}

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-surface, #fff);
  gap: var(--spacing-3, 0.75rem);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-3, 0.75rem);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-4, 1rem);
}

.title {
  margin: 0;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
}
.task-stats {
  display: flex;
  align-items: center;
  gap: var(--spacing-3, 0.75rem);
  font-size: var(--font-size-xs, 12px);
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.stat-item.completed { color: #16a34a; }
.stat-item.in-progress { color: #2563eb; }
.stat-item.blocked { color: #f59e0b; }
.stat-item.pending { color: #64748b; }
.stat-item.failed { color: #ef4444; }
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: var(--font-size-sm, 13px);
}

/* Plan Overview Card */
.plan-overview {
  margin: 0.5rem 0.75rem 0;
  background-color: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 6px);
  overflow: hidden;
  flex-shrink: 0;
}
.plan-overview-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  user-select: none;
  background-color: var(--color-bg-tertiary, #f1f5f9);
}
.plan-overview-header:hover {
  background-color: var(--color-bg-secondary, #f8fafc);
}
.plan-overview-title {
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-secondary, #475569);
}
.plan-overview-stats {
  display: flex;
  gap: 0.5rem;
  flex: 1;
}
.ov-stat {
  font-size: 11px;
  font-weight: 500;
}
.ov-stat-completed { color: #16a34a; }
.ov-stat-failed { color: #ef4444; }
.ov-stat-pending { color: #64748b; }
.plan-overview-toggle {
  font-size: 10px;
  color: var(--color-text-tertiary, #94a3b8);
}
.plan-overview-body {
  padding: 0.5rem 0.75rem;
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.plan-overview-task {
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}
.plan-overview-task:last-child {
  border-bottom: none;
}
.ov-task-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: var(--font-size-xs, 12px);
}
.ov-task-status {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  flex-shrink: 0;
}
.status-completed { background: #dcfce7; color: #15803d; }
.status-failed { background: #fee2e2; color: #b91c1c; }
.status-running { background: #dbeafe; color: #1d4ed8; }
.status-blocked { background: #fef3c7; color: #b45309; }
.status-pending { background: #f1f5f9; color: #64748b; }
.ov-task-title {
  color: var(--color-text-primary, #1e293b);
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ov-task-expert {
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 11px;
  flex-shrink: 0;
}
.ov-task-summary {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-secondary, #475569);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ov-task-files {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.ov-files-label {
  font-size: 11px;
  color: var(--color-text-tertiary, #94a3b8);
  flex-shrink: 0;
}
.ov-file-tag {
  display: inline-block;
  padding: 0 4px;
  background: var(--color-bg-tertiary, #f1f5f9);
  border-radius: 3px;
  font-size: 10px;
  color: var(--color-text-secondary, #475569);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ov-file-more {
  font-size: 10px;
  color: var(--color-text-tertiary, #94a3b8);
}
.ov-task-fail {
  margin-top: 2px;
  font-size: 11px;
  color: #b91c1c;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-columns {
  flex: 1;
  display: flex;
  gap: var(--spacing-3, 0.75rem);
  padding: var(--spacing-3, 0.75rem);
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb, var(--color-border, #e2e8f0)) var(--scrollbar-track, transparent);
}
.board-columns::-webkit-scrollbar {
  height: var(--scrollbar-size, 6px);
}
.board-columns::-webkit-scrollbar-track {
  background: var(--scrollbar-track, transparent);
}
.board-columns::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb, var(--color-border, #e2e8f0));
  border-radius: var(--radius-full, 9999px);
  border: 1px solid transparent;
  background-clip: padding-box;
}
</style>
