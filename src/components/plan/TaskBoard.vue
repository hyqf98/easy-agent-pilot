<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import KanbanColumn from './KanbanColumn.vue'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import type { Task, TaskStatus, TaskOrderItem } from '@/types/plan'

const planStore = usePlanStore()
const taskStore = useTaskStore()

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
  cancelled: tasks.value.filter(t => t.status === 'blocked' || t.status === 'cancelled').length
}))

// 看板列配置
const columns: Array<{ status: TaskStatus; label: string; color: string }> = [
  { status: 'pending', label: '待办', color: 'gray' },
  { status: 'in_progress', label: '进行中', color: 'blue' },
  { status: 'completed', label: '已完成', color: 'green' },
  { status: 'blocked', label: '已取消', color: 'red' }
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

  // 计算新位置
  const targetColumnTasks = tasksByStatus.value[newStatus]
  const newOrder = targetColumnTasks.length

  // 乐观更新本地状态
  const oldStatus = task.status
  task.status = newStatus
  task.order = newOrder

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
          <span class="stat-item pending">{{ taskStats.pending }} 待办</span>
          <span class="stat-item cancelled">{{ taskStats.cancelled }} 已取消</span>
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
      />
    </div>
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
.stat-item.pending { color: #64748b; }
.stat-item.cancelled { color: #ef4444; }
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
