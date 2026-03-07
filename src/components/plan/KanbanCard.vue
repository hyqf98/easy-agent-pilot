<script setup lang="ts">
import { computed } from 'vue'
import type { Task, TaskPriority } from '@/types/plan'

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  (e: 'click', task: Task): void
  (e: 'stop', task: Task): void
  (e: 'retry', task: Task): void
  (e: 'edit', task: Task): void
  (e: 'delete', task: Task): void
}>()

// 是否显示停止按钮
const showStopButton = computed(() => {
  return props.task.status === 'in_progress'
})

// 是否显示重试按钮
const showRetryButton = computed(() => {
  return props.task.status === 'blocked'
})

// 是否显示删除按钮
const showDeleteButton = computed(() => {
  return props.task.status === 'pending'
})

// 优先级标签
const priorityLabels: Record<TaskPriority, string> = {
  low: '低',
  medium: '中',
  high: '高'
}

// 优先级颜色
const priorityColors: Record<TaskPriority, string> = {
  low: 'gray',
  medium: 'yellow',
  high: 'red'
}

// 获取优先级标签
function getPriorityLabel(priority: TaskPriority): string {
  return priorityLabels[priority] || priority
}

// 获取优先级颜色
function getPriorityColor(priority: TaskPriority): string {
  return priorityColors[priority] || 'gray'
}

// 点击卡片
function handleClick() {
  emit('click', props.task)
}

// 停止任务
function handleStop(event: Event) {
  event.stopPropagation()
  emit('stop', props.task)
}

// 重试任务
function handleRetry(event: Event) {
  event.stopPropagation()
  emit('retry', props.task)
}

// 编辑任务
function handleEdit(event: Event) {
  event.stopPropagation()
  emit('edit', props.task)
}

// 删除任务
function handleDelete(event: Event) {
  event.stopPropagation()
  emit('delete', props.task)
}
</script>

<template>
  <div
    class="kanban-card"
    :class="{
      active: false,
      'is-blocked': task.status === 'blocked',
      'is-running': task.status === 'in_progress'
    }"
    @click="handleClick"
  >
    <div class="card-header">
      <span class="task-title">{{ task.title }}</span>
      <span
        class="priority-badge"
        :class="getPriorityColor(task.priority)"
      >
        {{ getPriorityLabel(task.priority) }}
      </span>
    </div>

    <p
      v-if="task.description"
      class="task-desc"
    >
      {{ task.description }}
    </p>

    <!-- 重试信息 -->
    <div
      v-if="task.retryCount > 0 || task.status === 'blocked'"
      class="retry-info"
    >
      <span
        v-if="task.retryCount > 0"
        class="retry-count"
      >
        重试: {{ task.retryCount }}/{{ task.maxRetries }}
      </span>
      <span
        v-if="task.errorMessage"
        class="error-hint"
        :title="task.errorMessage"
      >
        ⚠️ 错误
      </span>
    </div>

    <div class="card-footer">
      <div class="footer-left">
        <span
          v-if="task.assignee"
          class="assignee"
        >
          {{ task.assignee }}
        </span>
        <span
          v-if="task.dependencies?.length"
          class="deps"
        >
          {{ task.dependencies.length }} 依赖
        </span>
      </div>

      <div class="card-actions">
        <!-- 停止按钮 -->
        <button
          v-if="showStopButton"
          class="btn-action btn-stop"
          title="停止执行"
          @click="handleStop"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect
              x="6"
              y="6"
              width="12"
              height="12"
            />
          </svg>
        </button>

        <!-- 重试按钮 -->
        <button
          v-if="showRetryButton"
          class="btn-action btn-retry"
          title="重试"
          @click="handleRetry"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M1 4v6h6" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>

        <!-- 编辑按钮 -->
        <button
          v-if="task.status !== 'in_progress'"
          class="btn-action btn-edit"
          title="编辑"
          @click="handleEdit"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        <!-- 删除按钮 -->
        <button
          v-if="showDeleteButton"
          class="btn-action btn-delete"
          title="删除"
          @click="handleDelete"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-card {
  padding: var(--spacing-3, 0.75rem);
  background-color: var(--color-surface, #fff);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-light, #f1f5f9);
  /* 移除 cursor: pointer，让父元素 .drag-item 的 cursor: grab 生效 */
  transition: all var(--transition-fast, 150ms) var(--easing-default);
  user-select: none;
}

.kanban-card:hover {
  border-color: var(--color-border, #e2e8f0);
  box-shadow: var(--shadow-sm, 0 1px 3px 0 rgb(0 0 0 / 0.1));
  transform: translateY(-1px);
}

.kanban-card.active {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.kanban-card.is-blocked {
  border-color: var(--color-error-light, #fecaca);
  background-color: #fef2f2;
}

.kanban-card.is-running {
  border-color: var(--color-primary-light, #bfdbfe);
  background-color: #eff6ff;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2, 0.5rem);
}

.task-title {
  flex: 1;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-primary, #1e293b);
  line-height: 1.4;
}

.priority-badge {
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm, 4px);
  font-size: 0.625rem;
  font-weight: var(--font-weight-semibold, 600);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.priority-badge.gray {
  background-color: #f1f5f9;
  color: #64748b;
}

.priority-badge.yellow {
  background-color: #fef3c7;
  color: #b45309;
}

.priority-badge.red {
  background-color: #fee2e2;
  color: #b91c1c;
}

.task-desc {
  margin: var(--spacing-2, 0.5rem) 0 0;
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.retry-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  margin-top: var(--spacing-2, 0.5rem);
  font-size: 0.6875rem;
}

.retry-count {
  color: var(--color-warning, #f59e0b);
}

.error-hint {
  color: var(--color-error, #ef4444);
  cursor: help;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2, 0.5rem);
  margin-top: var(--spacing-2, 0.5rem);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  font-size: 0.6875rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.assignee {
  padding: 0.125rem 0.375rem;
  background-color: var(--color-bg-tertiary, #f1f5f9);
  border-radius: var(--radius-sm, 4px);
  font-weight: var(--font-weight-medium, 500);
}

.deps {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.deps::before {
  content: '🔗';
  font-size: 0.625rem;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast, 150ms);
}

.kanban-card:hover .card-actions {
  opacity: 1;
}

.btn-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-action:hover {
  background-color: var(--color-bg-secondary, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
}

.btn-stop:hover {
  background-color: var(--color-warning-light, #fef3c7);
  color: var(--color-warning, #f59e0b);
}

.btn-retry:hover {
  background-color: var(--color-primary-light, #dbeafe);
  color: var(--color-primary, #3b82f6);
}

.btn-edit:hover {
  background-color: var(--color-success-light, #d1fae5);
  color: var(--color-success, #10b981);
}

.btn-delete:hover {
  background-color: var(--color-error-light, #fee2e2);
  color: var(--color-error, #ef4444);
}
</style>
