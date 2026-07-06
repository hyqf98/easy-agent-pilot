<script setup lang="ts">
/** KanbanCard 组件：看板任务卡片，展示任务信息与启动/停止/重试等操作（逻辑见 useKanbanCard.ts） */
import { useKanbanCard, type KanbanCardEmits, type KanbanCardProps } from './useKanbanCard'

const props = defineProps<KanbanCardProps>()
const emit = defineEmits<KanbanCardEmits>()

const {
  t,
  isRunning,
  isStopped,
  isWaitingInput,
  queuePosition,
  executionStatusText,
  showStopButton,
  showResumeButton,
  showStartButton,
  showRetryButton,
  showDeleteButton,
  showEditButton,
  getPriorityLabel,
  getPriorityColor,
  handleClick,
  handleStop,
  handleStart,
  handleResume,
  handleRetry,
  handleEdit,
  handleDelete
} = useKanbanCard(props, emit)
</script>

<template>
  <div
    class="kanban-card"
    :class="{
      active: false,
      'is-blocked': task.status === 'blocked',
      'is-failed': task.status === 'failed',
      'is-waiting-input': isWaitingInput,
      'is-running': isRunning,
      'is-queued': queuePosition > 0,
      'is-stopped': isStopped
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

    <!-- 等待输入状态提示 -->
    <div
      v-if="isWaitingInput"
      class="waiting-input-badge"
    >
      <span class="badge-icon">填</span>
      <span class="badge-text">{{ t('task.execution.waitingInput') }}</span>
    </div>

    <div
      v-if="executionStatusText && !isWaitingInput"
      class="execution-status"
      :class="{ 'is-running': isRunning, 'is-queued': queuePosition > 0 }"
    >
      <span class="status-indicator" />
      <span class="status-text">{{ executionStatusText }}</span>
    </div>

    <!-- 重试信息 -->
    <div
      v-if="task.retryCount > 0 || task.status === 'failed'"
      class="retry-info"
    >
      <span
        v-if="task.retryCount > 0"
        class="retry-count"
      >
        {{ t('task.retryCount', { current: task.retryCount, max: task.maxRetries }) }}
      </span>
      <span
        v-if="task.errorMessage"
        class="error-hint"
        :title="task.errorMessage"
      >
        ⚠ {{ t('task.errorHint') }}
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
          {{ t('task.dependenciesCount', { count: task.dependencies.length }) }}
        </span>
      </div>

      <div class="card-actions">
        <!-- 停止按钮 -->
        <button
          v-if="showStartButton"
          class="btn-action btn-start"
          :title="t('task.actions.start')"
          @click="handleStart"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>

        <button
          v-if="showStopButton"
          class="btn-action btn-stop"
          :title="t('task.actions.stop')"
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
              rx="2"
            />
          </svg>
        </button>

        <button
          v-if="showResumeButton"
          class="btn-action btn-resume"
          :title="t('task.actions.resume')"
          @click="handleResume"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>

        <!-- 重试按钮 -->
        <button
          v-if="showRetryButton"
          class="btn-action btn-retry"
          :title="t('task.actions.retry')"
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

        <button
          v-if="showEditButton"
          class="btn-action btn-edit"
          :title="t('task.actions.edit')"
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

        <button
          v-if="showDeleteButton"
          class="btn-action btn-delete"
          :title="t('task.actions.delete')"
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

<style scoped src="./styles.css"></style>
