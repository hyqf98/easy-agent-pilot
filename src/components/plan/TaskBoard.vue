<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTaskStore } from '@/stores/task'
import { usePlanStore } from '@/stores/plan'
import { useProjectStore } from '@/stores/project'
import KanbanColumn from './KanbanColumn.vue'
import type { Task, TaskStatus } from '@/types/plan'

const taskStore = useTaskStore()
const planStore = usePlanStore()
const projectStore = useProjectStore()

// 看板列配置
const columns: Array<{ status: TaskStatus; label: string; color: string }> = [
  { status: 'pending', label: '待办', color: 'gray' },
  { status: 'in_progress', label: '进行中', color: 'blue' },
  { status: 'completed', label: '已完成', color: 'green' },
  { status: 'blocked', label: '已阻塞', color: 'red' }
]

// 当前计划
const currentPlan = computed(() => planStore.currentPlan)

// 当前计划的任务按状态分组
const tasksByStatus = computed((): Record<TaskStatus, Task[]> => {
  if (!planStore.currentPlanId) {
    return {
      pending: [],
      in_progress: [],
      completed: [],
      blocked: [],
      cancelled: []
    }
  }
  return taskStore.tasksByStatus(planStore.currentPlanId)
})

// 统计信息
const taskStats = computed(() => {
  const tasks = taskStore.tasks.filter(t => t.planId === planStore.currentPlanId)
  return {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    blocked: tasks.filter(t => t.status === 'blocked').length
  }
})

// 是否可以开始执行（有任务且状态为 ready 或 planning）
const canStartExecution = computed(() => {
  const plan = currentPlan.value
  if (!plan) return false
  return (plan.status === 'ready' || plan.status === 'planning') && taskStats.value.total > 0
})

// 是否正在执行
const isExecuting = computed(() => {
  const plan = currentPlan.value
  return plan?.status === 'executing' && plan?.executionStatus === 'running'
})

// 是否已暂停
const isPaused = computed(() => {
  const plan = currentPlan.value
  return plan?.status === 'executing' && plan?.executionStatus === 'paused'
})

// 项目选择状态
const showProjectSelectDialog = ref(false)
const selectedProjectIdForExecution = ref<string | null>(null)

// 项目选项列表
const projectOptions = computed(() =>
  projectStore.projects.map(project => ({
    label: project.name,
    value: project.id,
    path: project.path
  }))
)

// 获取当前计划关联的项目
const currentPlanProject = computed(() => {
  const plan = currentPlan.value
  if (!plan) return null
  return projectStore.projects.find(p => p.id === plan.projectId) || null
})

// 开始执行 - 显示项目选择对话框
function handleStartExecution() {
  if (!planStore.currentPlanId) return
  // 默认选中当前计划关联的项目
  selectedProjectIdForExecution.value = currentPlanProject.value?.id || projectStore.currentProjectId
  showProjectSelectDialog.value = true
}

// 确认开始执行
async function confirmStartExecution() {
  if (!planStore.currentPlanId || !selectedProjectIdForExecution.value) return

  // 获取选中的项目路径
  const selectedProject = projectStore.projects.find(p => p.id === selectedProjectIdForExecution.value)
  if (!selectedProject) {
    console.error('Selected project not found')
    return
  }

  try {
    // TODO: 将项目路径传递给任务执行器
    // 目前先更新计划状态,后续需要在执行任务时使用这个路径
    await planStore.startPlanExecution(planStore.currentPlanId)
    showProjectSelectDialog.value = false
    console.log('开始执行,项目路径:', selectedProject.path)
  } catch (error) {
    console.error('Failed to start execution:', error)
  }
}

// 暂停执行
async function handlePauseExecution() {
  if (!planStore.currentPlanId) return
  try {
    await planStore.pausePlanExecution(planStore.currentPlanId)
  } catch (error) {
    console.error('Failed to pause execution:', error)
  }
}

// 恢复执行
async function handleResumeExecution() {
  if (!planStore.currentPlanId) return
  try {
    await planStore.resumePlanExecution(planStore.currentPlanId)
  } catch (error) {
    console.error('Failed to resume execution:', error)
  }
}

// 批量启动待办任务
async function handleBatchStart() {
  if (!planStore.currentPlanId) return
  try {
    await taskStore.batchStartTasks(planStore.currentPlanId)
  } catch (error) {
    console.error('Failed to batch start tasks:', error)
  }
}

// 停止任务
async function handleTaskStop(task: Task) {
  try {
    await taskStore.stopTask(task.id)
  } catch (error) {
    console.error('Failed to stop task:', error)
  }
}

// 重试任务
async function handleTaskRetry(task: Task) {
  try {
    await taskStore.retryTask(task.id)
  } catch (error) {
    console.error('Failed to retry task:', error)
  }
}

// 编辑任务
function handleTaskEdit(task: Task) {
  // TODO: 打开任务编辑对话框
  console.log('Edit task:', task.id)
}

// 处理任务拖放
async function handleTaskDrop(taskId: string, status: TaskStatus) {
  try {
    await taskStore.updateTask(taskId, { status })
  } catch (error) {
    console.error('Failed to update task status:', error)
  }
}

// 选择任务
function selectTask(task: Task) {
  taskStore.setCurrentTask(task.id)
}

// 加载任务
onMounted(() => {
  if (planStore.currentPlanId) {
    taskStore.loadTasks(planStore.currentPlanId)
  }
})

// 监听计划变化
watch(
  () => planStore.currentPlanId,
  (planId) => {
    if (planId) {
      taskStore.loadTasks(planId)
    }
  }
)
</script>

<template>
  <div class="task-board">
    <div class="board-header">
      <div class="header-left">
        <h3 class="title">任务看板</h3>
        <div v-if="currentPlan" class="plan-status-badge" :class="currentPlan.status">
          {{ currentPlan.status === 'ready' ? '待执行' :
             currentPlan.status === 'executing' ? '执行中' :
             currentPlan.status === 'planning' ? '规划中' :
             currentPlan.status === 'completed' ? '已完成' :
             currentPlan.status === 'paused' ? '已暂停' : currentPlan.status }}
        </div>
      </div>
      <div class="header-right">
        <!-- 任务统计 -->
        <div v-if="taskStats.total > 0" class="task-stats">
          <span class="stat-item completed">{{ taskStats.completed }} 完成</span>
          <span class="stat-item in-progress">{{ taskStats.inProgress }} 进行中</span>
          <span class="stat-item pending">{{ taskStats.pending }} 待办</span>
          <span class="stat-item blocked">{{ taskStats.blocked }} 阻塞</span>
        </div>

        <!-- 执行控制按钮 -->
        <div class="execution-controls">
          <!-- 开始执行按钮 -->
          <button
            v-if="canStartExecution"
            class="control-btn start-btn"
            @click="handleStartExecution"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            开始执行
          </button>

          <!-- 暂停按钮 -->
          <button
            v-if="isExecuting"
            class="control-btn pause-btn"
            @click="handlePauseExecution"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>
            暂停
          </button>

          <!-- 继续按钮 -->
          <button
            v-if="isPaused"
            class="control-btn resume-btn"
            @click="handleResumeExecution"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            继续
          </button>
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
        :show-batch-start="column.status === 'pending' && canStartExecution"
        @task-drop="handleTaskDrop"
        @task-click="selectTask"
        @task-stop="handleTaskStop"
        @task-retry="handleTaskRetry"
        @task-edit="handleTaskEdit"
        @batch-start="handleBatchStart"
      />
    </div>

    <!-- 开始执行对话框 -->
    <Teleport to="body">
      <div v-if="showProjectSelectDialog" class="dialog-overlay" @click.self="showProjectSelectDialog = false">
        <div class="dialog">
          <div class="dialog-header">
            <h4>
              <span class="dialog-icon">🚀</span>
              开始执行计划
            </h4>
            <button class="btn-close" @click="showProjectSelectDialog = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="dialog-body">
            <p class="dialog-hint">选择执行任务时的项目路径,Claude 将在该目录下执行操作。</p>
            <div class="form-field">
              <label>选择项目 <span class="required">*</span></label>
              <select v-model="selectedProjectIdForExecution" class="project-select">
                <option :value="null" disabled>请选择项目</option>
                <option v-for="option in projectOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <p v-if="selectedProjectIdForExecution" class="project-path-hint">
                {{ projectOptions.find(o => o.value === selectedProjectIdForExecution)?.path }}
              </p>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" @click="showProjectSelectDialog = false">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!selectedProjectIdForExecution"
              @click="confirmStartExecution"
            >
              开始执行
            </button>
          </div>
        </div>
      </div>
    </Teleport>
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

.plan-status-badge {
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full, 9999px);
  font-size: 0.625rem;
  font-weight: var(--font-weight-semibold, 600);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.plan-status-badge.ready {
  background-color: #fef3c7;
  color: #b45309;
}

.plan-status-badge.executing {
  background-color: #dbeafe;
  color: #2563eb;
}

.plan-status-badge.planning {
  background-color: #f3e8ff;
  color: #9333ea;
}

.plan-status-badge.completed {
  background-color: #dcfce7;
  color: #16a34a;
}

.plan-status-badge.paused {
  background-color: #fee2e2;
  color: #dc2626;
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

.stat-item.completed {
  color: #16a34a;
}

.stat-item.in-progress {
  color: #2563eb;
}

.stat-item.pending {
  color: #64748b;
}

.stat-item.blocked {
  color: #ef4444;
}

.execution-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.control-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
  border: none;
}

.control-btn svg {
  flex-shrink: 0;
}

.start-btn {
  background-color: var(--color-primary, #3b82f6);
  color: white;
}

.start-btn:hover {
  background-color: var(--color-primary-hover, #2563eb);
}

.pause-btn {
  background-color: #fef3c7;
  color: #b45309;
}

.pause-btn:hover {
  background-color: #fde68a;
}

.resume-btn {
  background-color: var(--color-primary, #3b82f6);
  color: white;
}

.resume-btn:hover {
  background-color: var(--color-primary-hover, #2563eb);
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

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-bg-overlay, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal-backdrop, 1040);
  backdrop-filter: blur(4px);
}

.dialog {
  background-color: var(--color-surface, #fff);
  border-radius: var(--radius-lg, 12px);
  width: 90%;
  max-width: 28rem;
  box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
  animation: dialogIn 0.2s var(--easing-out);
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.dialog-header h4 {
  margin: 0;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.dialog-icon {
  font-size: 1.125rem;
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1, 0.25rem);
  border: none;
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 150ms);
}

.btn-close:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  color: var(--color-text-primary, #1e293b);
}

.dialog-body {
  padding: var(--spacing-5, 1.25rem);
}

.dialog-hint {
  margin: 0 0 var(--spacing-4, 1rem);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #64748b);
  line-height: 1.5;
}

.form-field {
  margin-bottom: var(--spacing-4, 1rem);
}

.form-field label {
  display: block;
  margin-bottom: var(--spacing-2, 0.5rem);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
}

.required {
  color: var(--color-error, #ef4444);
}

.project-select {
  width: 100%;
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  font-size: var(--font-size-sm, 13px);
  transition: all var(--transition-fast, 150ms);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
}

.project-select:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.project-path-hint {
  margin-top: 0.25rem;
  font-size: 0.6875rem;
  color: var(--color-text-tertiary, #94a3b8);
  font-family: monospace;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3, 0.75rem);
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-bg-secondary, #f8fafc);
  border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
}

.btn {
  padding: var(--spacing-2, 0.5rem) var(--spacing-4, 1rem);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-primary {
  background-color: var(--color-primary, #3b82f6);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover, #2563eb);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  border: 1px solid var(--color-border, #e2e8f0);
}

.btn-secondary:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  border-color: var(--color-border-dark, #cbd5e1);
}
</style>
