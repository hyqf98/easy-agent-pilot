<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import KanbanColumn from './KanbanColumn.vue'
import TaskEditModal from './TaskEditModal.vue'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import { useConfirmDialog } from '@/composables'
import type { Task, TaskStatus, TaskOrderItem } from '@/types/plan'

const planStore = usePlanStore()
const taskStore = useTaskStore()
const taskExecutionStore = useTaskExecutionStore()
const confirmDialog = useConfirmDialog()
const emit = defineEmits<{
  (e: 'task-click', task: Task): void
}>()

// 编辑对话框状态
const showEditModal = ref(false)
const editingTask = ref<Task | null>(null)

// 当前计划 ID
const currentPlanId = computed(() => planStore.currentPlanId)

// 当前计划的任务
const tasks = computed(() => {
  if (!currentPlanId.value) return []
  return taskStore.tasks.filter(t => t.planId === currentPlanId.value)
})

// 任务按状态分组
const tasksByStatus = computed(() => {
  if (!currentPlanId.value) return {}

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

  // 每个分组内按顺序排序
  Object.keys(result).forEach(status => {
    result[status as TaskStatus].sort((a, b) => a.order - b.order)
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

// 看板列配置
const columns: Array<{ status: TaskStatus; label: string; color: string }> = [
  { status: 'pending', label: '待办', color: 'gray' },
  { status: 'in_progress', label: '进行中', color: 'blue' },
  { status: 'completed', label: '已完成', color: 'green' },
  { status: 'blocked', label: '阻塞', color: 'yellow' },
  { status: 'failed', label: '执行失败', color: 'red' }
]

// 加载任务数据
async function loadTasks() {
  if (currentPlanId.value) {
    await taskStore.loadTasks(currentPlanId.value)
  }
}

// 监听计划变化，加载任务
watch(currentPlanId, (newPlanId) => {
  if (newPlanId) {
    loadTasks()
  }
}, { immediate: true })

// 组件挂载时加载任务
onMounted(() => {
  if (currentPlanId.value) {
    loadTasks()
  }
})

// 处理任务拖放（跨列）
async function handleTaskDrop(taskId: string, newStatus: TaskStatus) {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task || task.status === newStatus) return

  // 检查是否正在执行（禁止拖动执行中的任务）
  if (taskExecutionStore.isTaskExecuting(taskId)) {
    return
  }

  // 计算新位置
  const targetColumnTasks = tasksByStatus.value[newStatus]
  const newOrder = targetColumnTasks.length

  // 乐观更新本地状态
  const oldStatus = task.status
  task.status = newStatus
  task.order = newOrder

  // 移动到待办时，清除执行日志
  if (newStatus === 'pending' && oldStatus !== 'pending') {
    try {
      await taskExecutionStore.clearTaskLogs(taskId)
    } catch (error) {
      console.warn('Failed to clear task logs:', error)
    }
  }

  // 拖到 in_progress 时触发 AI 执行
  if (newStatus === 'in_progress' && oldStatus === 'pending') {
    try {
      // 先更新任务状态
      await taskStore.updateTask(taskId, {
        status: newStatus,
        order: newOrder
      })

      // 更新计划状态为执行中
      if (currentPlanId.value) {
        await planStore.startPlanExecution(currentPlanId.value)
        // 触发 AI 执行
        await taskExecutionStore.enqueueTask(currentPlanId.value, taskId)
      }
    } catch (error) {
      // 回滚
      task.status = oldStatus
      console.error('Failed to start task execution:', error)
    }
    return
  }

  try {
    // 更新后端
    await taskStore.updateTask(taskId, {
      status: newStatus,
      order: newOrder
    })
  } catch (error) {
    // 回滚
    task.status = oldStatus
    console.error('Failed to update task:', error)
  }
}

// 处理任务重排序（同列内）
async function handleTaskReorder(taskId: string, targetIndex: number) {
  const movedTask = tasks.value.find(t => t.id === taskId)
  if (!movedTask) return

  const sameStatusTasks = tasksByStatus.value[movedTask.status] as Task[]
  if (sameStatusTasks.length <= 1) return

  const currentIndex = sameStatusTasks.findIndex(t => t.id === taskId)
  if (currentIndex === -1 || currentIndex === targetIndex) return

  // 创建新的排序
  const newTaskList = sameStatusTasks.filter(t => t.id !== taskId)
  const insertIndex = Math.max(0, Math.min(targetIndex, newTaskList.length))
  newTaskList.splice(insertIndex, 0, movedTask)

  // 构建更新项
  const orderUpdates: TaskOrderItem[] = newTaskList.map((task, index) => ({
    id: task.id,
    order: index
  }))

  // 乐观更新本地状态
  newTaskList.forEach((task, index) => {
    task.order = index
  })

  try {
    // 更新后端
    await taskStore.reorderTasks(orderUpdates)
  } catch (error) {
    // 回滚：重新加载任务
    loadTasks()
    console.error('Failed to reorder tasks:', error)
  }
}

// 选择任务
function selectTask(task: Task) {
  taskStore.setCurrentTask(task.id)
  taskExecutionStore.setCurrentViewingTask(task.id)
  void taskExecutionStore.loadTaskLogs(task.id)
  emit('task-click', task)
}

// 编辑任务
function handleTaskEdit(task: Task) {
  editingTask.value = task
  showEditModal.value = true
}

// 停止任务
async function handleTaskStop(task: Task) {
  try {
    await taskExecutionStore.stopTaskExecution(task.id)
  } catch (error) {
    console.error('Failed to stop task:', error)
  }
}

// 重试任务
async function handleTaskRetry(task: Task) {
  try {
    if (currentPlanId.value) {
      // 先清除持久化日志
      await taskExecutionStore.clearTaskLogs(task.id)

      // 更新任务状态为 in_progress
      await taskStore.updateTask(task.id, {
        status: 'in_progress',
        errorMessage: undefined
      })

      // 加入执行队列
      await taskExecutionStore.enqueueTask(currentPlanId.value, task.id)
    }
  } catch (error) {
    console.error('Failed to retry task:', error)
  }
}

// 删除任务
async function handleTaskDelete(task: Task) {
  const confirmed = await confirmDialog.danger(
    `确定要删除任务「${task.title}」吗？`,
    '删除任务'
  )

  if (confirmed) {
    try {
      await taskStore.deleteTask(task.id)
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }
}

// 一键执行所有待办任务
async function handleExecuteAll() {
  if (!currentPlanId.value) return

  const pendingTasks = tasksByStatus.value.pending
  if (pendingTasks.length === 0) return

  try {
    // 1. 批量将待办任务状态更新为 in_progress
    await taskStore.batchStartTasks(currentPlanId.value)

    // 2. 更新计划状态为执行中
    await planStore.startPlanExecution(currentPlanId.value)

    // 3. 按顺序将任务加入执行队列（第一个任务会立即执行）
    for (const task of pendingTasks) {
      await taskExecutionStore.enqueueTask(currentPlanId.value, task.id)
    }
  } catch (error) {
    console.error('Failed to execute all tasks:', error)
  }
}

// 开始执行进行中的任务（程序异常退出后恢复）
async function handleStartExecution() {
  if (!currentPlanId.value) return

  const inProgressTasks = tasksByStatus.value.in_progress
  if (inProgressTasks.length === 0) return

  try {
    // 按顺序将进行中的任务加入执行队列
    for (const task of inProgressTasks) {
      await taskExecutionStore.enqueueTask(currentPlanId.value, task.id)
    }
  } catch (error) {
    console.error('Failed to start execution:', error)
  }
}

// 编辑保存后的回调
function handleEditSaved() {
  showEditModal.value = false
  editingTask.value = null
}
</script>

<template>
  <div class="task-board">
    <div class="board-header">
      <div class="header-left">
        <h3 class="title">
          任务看板
        </h3>
      </div>
      <div class="header-right">
        <!-- 任务统计 -->
        <div class="task-stats">
          <span class="stat-item completed">{{ taskStats.completed }} 完成</span>
          <span class="stat-item in-progress">{{ taskStats.inProgress }} 进行中</span>
          <span class="stat-item blocked">{{ taskStats.blocked }} 阻塞</span>
          <span class="stat-item pending">{{ taskStats.pending }} 待办</span>
          <span class="stat-item failed">{{ taskStats.failed }} 失败</span>
        </div>
      </div>
    </div>

    <div
      v-if="!currentPlanId"
      class="empty-state"
    >
      <span>请先选择一个计划</span>
    </div>

    <div
      v-else-if="tasks.length === 0"
      class="empty-state"
    >
      <span>暂无任务，请先进行任务拆分</span>
    </div>

    <div
      v-else
      class="board-columns"
    >
      <KanbanColumn
        v-for="column in columns"
        :key="column.status"
        :status="column.status"
        :title="column.label"
        :color="column.color"
        :tasks="tasksByStatus[column.status] || []"
        @task-drop="handleTaskDrop"
        @task-click="selectTask"
        @task-reorder="handleTaskReorder"
        @task-edit="handleTaskEdit"
        @task-stop="handleTaskStop"
        @task-retry="handleTaskRetry"
        @task-delete="handleTaskDelete"
        @execute-all="handleExecuteAll"
        @start-execution="handleStartExecution"
      />
    </div>

    <!-- 编辑任务对话框 -->
    <TaskEditModal
      v-if="editingTask"
      v-model:visible="showEditModal"
      :task="editingTask"
      @saved="handleEditSaved"
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
.board-columns {
  flex: 1;
  display: flex;
  gap: var(--spacing-3, 0.75rem);
  padding: var(--spacing-3, 0.75rem);
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border, #e2e8f0) transparent;
}
.board-columns::-webkit-scrollbar {
  height: 6px;
}
.board-columns::-webkit-scrollbar-track {
  background: transparent;
}
.board-columns::-webkit-scrollbar-thumb {
  background-color: var(--color-border, #e2e8f0);
  border-radius: var(--radius-full, 9999px);
}
</style>
