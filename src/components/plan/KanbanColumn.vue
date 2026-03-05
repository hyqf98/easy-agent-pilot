<script setup lang="ts">
import { computed } from 'vue'
import KanbanCard from './KanbanCard.vue'
import type { Task, TaskStatus } from '@/types/plan'

const props = defineProps<{
  status: TaskStatus
  title: string
  color: string
  tasks: Task[]
  canDrop?: boolean
  showBatchStart?: boolean
}>()

const emit = defineEmits<{
  (e: 'taskDrop', taskId: string, status: TaskStatus): void
  (e: 'taskClick', task: Task): void
  (e: 'taskStop', task: Task): void
  (e: 'taskRetry', task: Task): void
  (e: 'taskEdit', task: Task): void
  (e: 'batchStart'): void
}>()

// 是否正在拖拽到此列
const isDragOver = computed(() => false)

// 处理拖拽进入
function handleDragOver(event: DragEvent) {
  event.preventDefault()
}

// 处理拖拽进入
function handleDragEnter(event: DragEvent) {
  event.preventDefault()
}

// 处理拖拽离开
function handleDragLeave(event: DragEvent) {
  // 检查是否真的离开了列区域
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = event.clientX
  const y = event.clientY
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    // 真的离开了
  }
}

// 处理放下
function handleDrop(event: DragEvent) {
  event.preventDefault()
  // 从 dataTransfer 获取任务 ID
  const taskId = event.dataTransfer?.getData('text/plain')
  if (taskId) {
    emit('taskDrop', taskId, props.status)
  }
}

// 处理任务拖拽开始
function handleTaskDragStart(task: Task) {
  // KanbanCard 已经处理了 dataTransfer 设置
  // 此处仅用于通知父组件,无需额外操作
  console.log('Task drag started:', task.id)
}

// 处理任务点击
function handleTaskClick(task: Task) {
  emit('taskClick', task)
}

// 处理停止任务
function handleTaskStop(task: Task) {
  emit('taskStop', task)
}

// 处理重试任务
function handleTaskRetry(task: Task) {
  emit('taskRetry', task)
}

// 处理编辑任务
function handleTaskEdit(task: Task) {
  emit('taskEdit', task)
}

// 处理批量启动
function handleBatchStart() {
  emit('batchStart')
}
</script>

<template>
  <div
    class="kanban-column"
    :class="{ 'drag-over': isDragOver }"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="column-header">
      <div class="header-left">
        <span class="column-dot" :class="color"></span>
        <span class="column-label">{{ title }}</span>
        <span class="column-count">{{ tasks.length }}</span>
      </div>

      <!-- 批量启动按钮 - 仅待办列显示 -->
      <button
        v-if="showBatchStart && tasks.length > 0"
        class="btn-batch-start"
        title="批量启动所有待办任务"
        @click="handleBatchStart"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        全部启动
      </button>
    </div>

    <div class="column-body">
      <KanbanCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :draggable="task.status !== 'in_progress'"
        @drag-start="handleTaskDragStart"
        @click="handleTaskClick"
        @stop="handleTaskStop"
        @retry="handleTaskRetry"
        @edit="handleTaskEdit"
      />

      <div v-if="tasks.length === 0" class="empty-column">
        <span>暂无任务</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-column {
  flex: 1;
  min-width: 280px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-tertiary, #f1f5f9);
  border-radius: var(--radius-lg, 12px);
  transition: background-color var(--transition-fast, 150ms);
  border: 2px solid transparent;
}

.kanban-column.drag-over {
  background-color: var(--color-primary-light, #dbeafe);
  border-color: var(--color-primary, #3b82f6);
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3, 0.75rem);
  font-weight: var(--font-weight-semibold, 600);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.column-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.column-dot.gray { background-color: #94a3b8; }
.column-dot.blue { background-color: #3b82f6; }
.column-dot.green { background-color: #10b981; }
.column-dot.red { background-color: #ef4444; }
.column-dot.orange { background-color: #f59e0b; }

.column-label {
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
}

.column-count {
  padding: 0.125rem 0.5rem;
  background-color: var(--color-surface, #fff);
  border-radius: var(--radius-full, 9999px);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
  box-shadow: var(--shadow-xs, 0 1px 2px 0 rgb(0 0 0 / 0.05));
}

.btn-batch-start {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background-color: var(--color-primary, #3b82f6);
  color: white;
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-batch-start:hover {
  background-color: var(--color-primary-hover, #2563eb);
}

.column-body {
  flex: 1;
  padding: var(--spacing-2, 0.5rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border, #e2e8f0) transparent;
}

.column-body::-webkit-scrollbar {
  width: 6px;
}

.column-body::-webkit-scrollbar-track {
  background: transparent;
}

.column-body::-webkit-scrollbar-thumb {
  background-color: var(--color-border, #e2e8f0);
  border-radius: var(--radius-full, 9999px);
}

.empty-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4, 1rem);
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-tertiary, #94a3b8);
  min-height: 80px;
  border: 2px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  margin: var(--spacing-2, 0.5rem);
}
</style>
