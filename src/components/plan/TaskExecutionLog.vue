<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import { useTaskStore } from '@/stores/task'
import { usePlanStore } from '@/stores/plan'
import { useAgentStore } from '@/stores/agent'
import { useAgentConfigStore } from '@/stores/agentConfig'
import ExecutionTimeline from '@/components/message/ExecutionTimeline.vue'
import StructuredContentRenderer from '@/components/message/StructuredContentRenderer.vue'
import DynamicForm from '@/components/plan/DynamicForm.vue'
import { EaIcon } from '@/components/common'
import type { TimelineEntry } from '@/types/timeline'
import type { TaskExecutionResultRecord } from '@/types/taskExecution'
import { buildToolCallMapFromLogs } from '@/utils/toolCallLog'
import { containsFormSchema, extractExecutionResult } from '@/utils/structuredContent'
import { buildStructuredResultContentFromRecord } from '@/utils/taskExecutionResult'
import { getTaskExecutionStatusMeta, resolveTaskExecutionStatus } from '@/utils/taskExecutionStatus'
import {
  DEFAULT_CONTEXT_WINDOW,
  resolveConfiguredContextWindow
} from '@/utils/configuredModelContext'
import { formatTokenCount } from '@/stores/token'
import type { ToolCall } from '@/stores/message'

interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

interface TodoSnapshot {
  items: TodoItem[]
  updatedAt: string
}

function normalizeTodoStatus(value: unknown): TodoItem['status'] {
  if (value === 'completed') return 'completed'
  if (value === 'in_progress') return 'in_progress'
  return 'pending'
}

function parseClaudeTodos(toolCall: ToolCall): TodoItem[] {
  const todos = Array.isArray(toolCall.arguments?.todos) ? toolCall.arguments.todos : []
  return todos.flatMap((todo: unknown, index: number) => {
    if (!todo || typeof todo !== 'object') return []
    const entry = todo as Record<string, unknown>
    const content = typeof entry.content === 'string' ? entry.content.trim() : ''
    if (!content) return []
    return [{
      id: `${toolCall.id}-${index}`,
      content,
      status: normalizeTodoStatus(entry.status),
      activeForm: typeof entry.activeForm === 'string' ? entry.activeForm.trim() : undefined
    }]
  })
}

function parseCodexPlan(toolCall: ToolCall): TodoItem[] {
  const plan = Array.isArray(toolCall.arguments?.plan) ? toolCall.arguments.plan : []
  return plan.flatMap((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Record<string, unknown>
    const content = typeof entry.step === 'string' ? entry.step.trim() : ''
    if (!content) return []
    return [{
      id: `${toolCall.id}-${index}`,
      content,
      status: normalizeTodoStatus(entry.status)
    }]
  })
}

function parseTodoSnapshotFromToolCalls(toolCalls: ToolCall[], timestamp: string): TodoSnapshot | null {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const toolCall = toolCalls[i]
    const normalizedName = toolCall.name.trim().toLowerCase()
    if (normalizedName === 'todowrite') {
      const items = parseClaudeTodos(toolCall)
      if (items.length > 0) return { items, updatedAt: timestamp }
    }
    if (normalizedName === 'update_plan' || normalizedName === 'functions.update_plan') {
      const items = parseCodexPlan(toolCall)
      if (items.length > 0) return { items, updatedAt: timestamp }
    }
  }
  return null
}

function formatTodoStatusLabel(status: TodoItem['status']) {
  switch (status) {
    case 'in_progress': return '进行中'
    case 'completed': return '已完成'
    default: return '待办'
  }
}

const props = defineProps<{
  taskId: string
}>()

const taskExecutionStore = useTaskExecutionStore()
const taskStore = useTaskStore()
const planStore = usePlanStore()
const agentStore = useAgentStore()
const agentConfigStore = useAgentConfigStore()
const { t } = useI18n()

// 日志容器引用
const logContainerRef = ref<HTMLElement | null>(null)

const autoScroll = ref(true)
const resultRecord = ref<TaskExecutionResultRecord | null>(null)

const task = computed(() => {
  return taskStore.tasks.find(t => t.id === props.taskId)
})

const executionState = computed(() => {
  return taskExecutionStore.getExecutionState(props.taskId)
})

const tokenUsageWindow = computed(() => executionState.value?.tokenUsage ?? {
  inputTokens: 0,
  outputTokens: 0,
  resetCount: 0,
  lastUpdatedAt: null
})

const tokenContextLimit = computed(() => {
  const currentTask = task.value
  if (!currentTask) return DEFAULT_CONTEXT_WINDOW

  const plan = planStore.plans.find(item => item.id === currentTask.planId)
  const agentId = currentTask.agentId || plan?.splitAgentId
  const modelId = currentTask.modelId || plan?.splitModelId
  const runtimeModel = tokenUsageWindow.value.model?.trim()

  if (!agentId) {
    return DEFAULT_CONTEXT_WINDOW
  }

  const agent = agentStore.agents.find(item => item.id === agentId)
  return resolveConfiguredContextWindow(agentConfigStore.getModelsConfigs(agentId), {
    runtimeModelId: runtimeModel,
    selectedModelId: modelId,
    agentModelId: agent?.modelId
  })
})

const tokenUsageTotal = computed(() =>
  tokenUsageWindow.value.inputTokens + tokenUsageWindow.value.outputTokens
)

const tokenUsagePercentage = computed(() => {
  if (tokenContextLimit.value <= 0) return 0
  return Math.min(100, (tokenUsageTotal.value / tokenContextLimit.value) * 100)
})

const tokenUsageLevel = computed(() => {
  if (tokenUsagePercentage.value >= 95) return 'critical'
  if (tokenUsagePercentage.value >= 80) return 'danger'
  if (tokenUsagePercentage.value >= 60) return 'warning'
  return 'safe'
})

const tokenProgressStyle = computed(() => ({
  width: `${tokenUsagePercentage.value}%`
}))

const logs = computed(() => {
  return executionState.value?.logs ?? []
})

const isTodoCollapsed = ref(true)

const todoSnapshot = computed<TodoSnapshot | null>(() => {
  const allToolCalls = executionState.value?.toolCalls ?? []
  const lastTimestamp = logs.value.length > 0
    ? logs.value[logs.value.length - 1].timestamp
    : ''
  return parseTodoSnapshotFromToolCalls(allToolCalls, lastTimestamp)
})

const sortedTodoItems = computed(() => {
  const items = todoSnapshot.value?.items ?? []
  const weight = (status: TodoItem['status']) => {
    switch (status) {
      case 'in_progress': return 0
      case 'pending': return 1
      default: return 2
    }
  }
  return [...items].sort((left, right) => weight(left.status) - weight(right.status))
})

const todoCompletedCount = computed(() =>
  sortedTodoItems.value.filter(item => item.status === 'completed').length
)

const activeTodoItems = computed(() =>
  sortedTodoItems.value.filter(item => item.status === 'in_progress').slice(0, 2)
)

const hiddenActiveTodoCount = computed(() =>
  Math.max(0, sortedTodoItems.value.filter(item => item.status === 'in_progress').length - activeTodoItems.value.length)
)

const logActivity = computed(() => {
  const latestLog = logs.value[logs.value.length - 1]
  return [
    logs.value.length,
    latestLog?.id ?? '',
    latestLog?.type ?? '',
    latestLog?.content.length ?? 0,
    latestLog?.timestamp ?? ''
  ].join(':')
})

// 是否等待用户输入
const isWaitingInput = computed(() => {
  return task.value?.status === 'blocked' && task.value?.blockReason === 'waiting_input'
})

const effectiveStatus = computed(() => {
  const memoryStatus = executionState.value?.status
  if (memoryStatus && memoryStatus !== 'idle') {
    return memoryStatus
  }
  return resolveTaskExecutionStatus(task.value, memoryStatus)
})

const isRunning = computed(() => {
  return effectiveStatus.value === 'running'
})

const structuredResultContent = computed(() => {
  if (resultRecord.value) {
    return buildStructuredResultContentFromRecord(resultRecord.value)
  }

  // 当 resultRecord 尚未加载时，尝试从累积内容中提取 result_summary
  if (isRunning.value || !executionState.value?.accumulatedContent) return ''
  const extracted = extractExecutionResult(executionState.value.accumulatedContent)
  if (!extracted) return ''

  const hasFiles = extracted.generatedFiles.length > 0
    || extracted.modifiedFiles.length > 0
    || extracted.changedFiles.length > 0
    || extracted.deletedFiles.length > 0
  if (!extracted.summary && !hasFiles) return ''

  return JSON.stringify({
    result_summary: extracted.summary,
    generated_files: extracted.generatedFiles,
    modified_files: extracted.modifiedFiles,
    changed_files: extracted.changedFiles,
    deleted_files: extracted.deletedFiles
  }, null, 2)
})

const statusText = computed(() => {
  return getTaskExecutionStatusMeta(effectiveStatus.value).label
})

// 状态颜色
const statusColor = computed(() => {
  return getTaskExecutionStatusMeta(effectiveStatus.value).color
})

async function handleStop() {
  const currentTask = task.value
  const shouldPauseQueue = Boolean(
    currentTask
    && taskExecutionStore.getCurrentRunningTaskId(currentTask.planId) === props.taskId
  )

  await taskExecutionStore.stopTaskExecution(
    props.taskId,
    shouldPauseQueue ? { pauseQueue: true, autoAdvance: false } : undefined
  )
}

async function handleResume() {
  await taskExecutionStore.resumeTaskExecution(props.taskId)
}

// 清除日志
async function handleClearLogs() {
  await taskExecutionStore.clearTaskLogs(props.taskId)
}

// 提交表单输入
async function handleInputSubmit(values: Record<string, unknown>) {
  await taskExecutionStore.submitTaskInput(props.taskId, values)
}

async function handleSkip() {
  await taskExecutionStore.skipBlockedTask(props.taskId)
}

async function loadResultRecord(taskId: string) {
  const currentTask = taskStore.tasks.find(item => item.id === taskId)
  if (!currentTask) {
    resultRecord.value = null
    return
  }

  const records = await taskExecutionStore.listRecentPlanResults(currentTask.planId, 200)
  resultRecord.value = records.find(record => record.task_id === taskId) ?? null
}

function scrollToBottom() {
  if (logContainerRef.value && autoScroll.value) {
    nextTick(() => {
      logContainerRef.value!.scrollTop = logContainerRef.value!.scrollHeight
    })
  }
}

watch(logActivity, () => {
  scrollToBottom()
})

function handleScroll() {
  if (!logContainerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = logContainerRef.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 50
}

const timelineEntries = computed<TimelineEntry[]>(() => {
  const toolCallMap = buildToolCallMapFromLogs(logs.value, {
    fallbackStatus: isRunning.value ? 'running' : 'success'
  })
  let lastThinkingEntry: TimelineEntry | null = null
  let lastContentEntry: TimelineEntry | null = null

  return logs.value.reduce<TimelineEntry[]>((entries, log) => {
    if (log.type === 'tool_result' || log.type === 'tool_input_delta') {
      return entries
    }

    const activeFormId = task.value?.inputRequest?.formSchema.formId
    if (
      log.type === 'content'
      && isWaitingInput.value
      && containsFormSchema(log.content, activeFormId)
    ) {
      lastThinkingEntry = null
      lastContentEntry = null
      return entries
    }

    if (log.type === 'thinking_start') {
      if (!lastThinkingEntry) {
        lastThinkingEntry = {
          id: `entry-${log.id}`,
          type: 'thinking',
          content: '',
          timestamp: log.timestamp,
          animate: isRunning.value
        }
        entries.push(lastThinkingEntry)
      }
      return entries
    }

    if (log.type === 'thinking') {
      if (lastThinkingEntry) {
        lastThinkingEntry.content = `${lastThinkingEntry.content || ''}${log.content}`
        lastThinkingEntry.timestamp = log.timestamp
        lastThinkingEntry.animate = isRunning.value
      } else {
        lastThinkingEntry = {
          id: `entry-${log.id}`,
          type: 'thinking',
          content: log.content,
          timestamp: log.timestamp,
          animate: isRunning.value
        }
        entries.push(lastThinkingEntry)
      }
      lastContentEntry = null
      return entries
    }

    if (log.type === 'content') {
      if (lastContentEntry) {
        lastContentEntry.content = `${lastContentEntry.content || ''}${log.content}`
        lastContentEntry.timestamp = log.timestamp
        lastContentEntry.animate = isRunning.value
      } else {
        lastContentEntry = {
          id: `entry-${log.id}`,
          type: 'content',
          content: log.content,
          timestamp: log.timestamp,
          animate: isRunning.value
        }
        entries.push(lastContentEntry)
      }
      lastThinkingEntry = null
      return entries
    }

    lastThinkingEntry = null
    lastContentEntry = null

    if (log.type === 'tool_use') {
      const toolCall = toolCallMap.get(log.id)
      if (toolCall) {
        entries.push({
          id: `tool-${log.id}`,
          type: 'tool',
          toolCall,
          timestamp: log.timestamp,
          animate: isRunning.value
        })
      }
      return entries
    }

    entries.push({
      id: `entry-${log.id}`,
      type: log.type === 'error' ? 'error' : 'system',
      content: log.content,
      timestamp: log.timestamp,
      animate: isRunning.value,
      runtimeFallbackUsage: log.metadata?.model || log.metadata?.inputTokens !== undefined || log.metadata?.outputTokens !== undefined
        ? {
            model: typeof log.metadata?.model === 'string' ? log.metadata.model : undefined,
            inputTokens: typeof log.metadata?.inputTokens === 'number' ? log.metadata.inputTokens : undefined,
            outputTokens: typeof log.metadata?.outputTokens === 'number' ? log.metadata.outputTokens : undefined
          }
        : undefined
    })
    return entries
  }, [])
})

// 加载历史日志
let retryTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  await taskExecutionStore.loadTaskLogs(props.taskId)
  await loadResultRecord(props.taskId)
  scrollToBottom()

  // 兜底：如果首次加载后日志仍为空，延迟重试一次从后端加载
  if (logs.value.length === 0) {
    retryTimer = setTimeout(async () => {
      await taskExecutionStore.loadTaskLogs(props.taskId)
      await loadResultRecord(props.taskId)
      scrollToBottom()
    }, 1500)
  }
})

onUnmounted(() => {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
})

watch(
  () => props.taskId,
  async (taskId) => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    await taskExecutionStore.loadTaskLogs(taskId)
    await loadResultRecord(taskId)
    scrollToBottom()
  }
)

watch(
  () => `${task.value?.status || ''}:${task.value?.updatedAt || ''}`,
  async () => {
    await taskExecutionStore.loadTaskLogs(props.taskId)
    await loadResultRecord(props.taskId)
    scrollToBottom()
  }
)
</script>

<template>
  <div class="task-execution-log">
    <div class="log-header">
      <div class="header-left">
        <h4
          class="log-title"
          :title="task?.title || t('taskExecution.unnamedTask')"
        >
          {{ task?.title || t('taskExecution.unnamedTask') }}
        </h4>
        <span
          class="status-badge"
          :class="statusColor"
        >
          {{ statusText }}
        </span>
      </div>
      <div class="header-actions">
        <button
          v-if="isRunning"
          class="btn-stop"
          :title="t('taskExecution.stop')"
          @click="handleStop"
        >
          <svg
            width="14"
            height="14"
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
          <span class="btn-label">{{ t('taskExecution.stop') }}</span>
        </button>
        <button
          v-else-if="effectiveStatus === 'stopped'"
          class="btn-resume"
          :title="t('taskExecution.resume')"
          @click="handleResume"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span class="btn-label">{{ t('taskExecution.resume') }}</span>
        </button>
        <button
          v-if="logs.length > 0"
          class="btn-clear"
          :title="t('taskExecution.clearLogs')"
          @click="handleClearLogs"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span class="btn-label">{{ t('taskExecution.clearLogs') }}</span>
        </button>
      </div>
    </div>

    <div
      v-if="tokenUsageTotal > 0 || tokenUsageWindow.model"
      class="token-usage-panel"
    >
      <div class="token-usage-panel__meta">
        <div class="token-usage-panel__title">
          <span>{{ t('taskExecution.tokenUsage') }}</span>
          <span
            v-if="tokenUsageWindow.model"
            class="token-usage-panel__model"
          >
            {{ tokenUsageWindow.model }}
          </span>
        </div>
        <div class="token-usage-panel__stats">
          <span>{{ formatTokenCount(tokenUsageTotal) }} / {{ formatTokenCount(tokenContextLimit) }}</span>
          <span v-if="tokenUsageWindow.resetCount > 0">{{ t('taskExecution.tokenResetCount', { count: tokenUsageWindow.resetCount }) }}</span>
        </div>
      </div>
      <div
        class="token-usage-panel__bar"
        :class="`token-usage-panel__bar--${tokenUsageLevel}`"
      >
        <div
          class="token-usage-panel__fill"
          :style="tokenProgressStyle"
        />
      </div>
      <div class="token-usage-panel__breakdown">
        <span>{{ t('taskExecution.inputTokens', { count: formatTokenCount(tokenUsageWindow.inputTokens) }) }}</span>
        <span>{{ t('taskExecution.outputTokens', { count: formatTokenCount(tokenUsageWindow.outputTokens) }) }}</span>
        <span>{{ Math.round(tokenUsagePercentage) }}%</span>
      </div>
    </div>
    <!-- 待办列表面板 -->
    <section
      v-if="todoSnapshot && sortedTodoItems.length > 0"
      class="task-todo-panel"
      :class="{ 'task-todo-panel--expanded': !isTodoCollapsed }"
    >
      <button
        type="button"
        class="task-todo-panel__head"
        :aria-expanded="!isTodoCollapsed"
        @click="isTodoCollapsed = !isTodoCollapsed"
      >
        <div class="task-todo-panel__head-main">
          <div class="task-todo-panel__title">
            <EaIcon
              name="list-todo"
              :size="14"
            />
            <span>待办列表</span>
          </div>
          <div
            v-if="isTodoCollapsed && activeTodoItems.length > 0"
            class="task-todo-panel__active-strip"
          >
            <span
              v-for="item in activeTodoItems"
              :key="item.id"
              class="task-todo-panel__active-chip"
              :class="`task-todo-panel__active-chip--${item.status}`"
            >
              <span class="task-todo-panel__active-chip-dot" />
              <span class="task-todo-panel__active-chip-text">{{ item.content }}</span>
            </span>
            <span
              v-if="hiddenActiveTodoCount > 0"
              class="task-todo-panel__active-more"
            >
              +{{ hiddenActiveTodoCount }}
            </span>
          </div>
        </div>
        <div class="task-todo-panel__summary">
          {{ todoCompletedCount }}/{{ sortedTodoItems.length }}
          <EaIcon
            :name="isTodoCollapsed ? 'chevron-down' : 'chevron-up'"
            :size="14"
          />
        </div>
      </button>

      <div
        v-if="!isTodoCollapsed"
        class="task-todo-panel__items"
      >
        <div class="task-todo-panel__items-inner">
          <div
            v-for="(item, index) in sortedTodoItems"
            :key="item.id"
            class="task-todo-panel__item"
            :class="`task-todo-panel__item--${item.status}`"
            :style="{ '--todo-item-index': index }"
          >
            <span class="task-todo-panel__dot" />
            <div class="task-todo-panel__content">
              <div class="task-todo-panel__text">
                {{ item.content }}
              </div>
              <div
                v-if="item.activeForm"
                class="task-todo-panel__hint"
              >
                {{ item.activeForm }}
              </div>
            </div>
            <span class="task-todo-panel__status">
              {{ formatTodoStatusLabel(item.status) }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 等待用户输入表单区域 -->
    <div
      v-if="isWaitingInput && task?.inputRequest"
      class="input-form-section"
    >
      <h5 class="section-title">
        {{ task.inputRequest.question || t('taskExecution.defaultQuestion') }}
      </h5>
      <DynamicForm
        :schema="task.inputRequest.formSchema"
        @submit="handleInputSubmit"
      />
      <button
        class="btn-skip"
        @click="handleSkip"
      >
        {{ t('taskExecution.skipAndContinue') }}
      </button>
    </div>

    <!-- 日志内容 -->
    <div
      ref="logContainerRef"
      class="log-content"
      @scroll="handleScroll"
    >
      <div
        v-if="structuredResultContent"
        class="result-summary"
      >
        <StructuredContentRenderer :content="structuredResultContent" />
      </div>

      <div
        v-if="logs.length === 0"
        class="empty-state"
      >
        <span v-if="isRunning">{{ t('task.execution.running') }}</span>
        <span v-else>{{ t('taskExecution.noLogs') }}</span>
      </div>

      <div
        v-else
        class="log-entries"
      >
        <ExecutionTimeline :entries="timelineEntries" />
      </div>

      <!-- 运行指示器 -->
      <div
        v-if="isRunning"
        class="running-indicator"
      >
        <span class="indicator-dot" />
        <span class="indicator-text">{{ t('taskExecution.aiRunning') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-execution-log {
  --task-log-surface: var(--color-surface, #ffffff);
  --task-log-border: color-mix(in srgb, var(--color-border) 72%, transparent);
  --task-log-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
  --task-log-content-bg:
    linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--color-bg-secondary, #f8fafc) 56%, transparent) 100%
    );
  --task-log-width: min(100%, calc(var(--detail-panel-width, 380px) - 1.5rem));
  --timeline-panel-width: var(--task-log-width);
  --timeline-panel-max-width: var(--task-log-width);
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-surface-elevated, #fff) 96%, var(--task-log-surface)) 0%,
      color-mix(in srgb, var(--task-log-surface) 92%, var(--color-bg-secondary, #f8fafc)) 100%
    );
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  border: 1px solid var(--task-log-border);
  box-shadow: var(--task-log-shadow);
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-bg-secondary, #f8fafc) 94%, #ffffff),
      color-mix(in srgb, var(--color-surface, #ffffff) 90%, var(--color-bg-secondary, #f8fafc))
    );
  gap: var(--spacing-2, 0.5rem);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.log-title {
  margin: 0;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

.status-badge {
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full, 9999px);
  font-size: 0.6875rem;
  font-weight: var(--font-weight-medium, 500);
  white-space: nowrap;
  flex-shrink: 0;
}

.status-badge.primary {
  background-color: var(--color-primary-light, #dbeafe);
  color: var(--color-primary, #2563eb);
}

.status-badge.success {
  background-color: var(--color-success-light, #d1fae5);
  color: var(--color-success, #16a34a);
}

.status-badge.warning {
  background-color: var(--color-warning-light, #fef3c7);
  color: var(--color-warning, #d97706);
}

.status-badge.error {
  background-color: var(--color-error-light, #fee2e2);
  color: var(--color-error, #dc2626);
}

.status-badge.gray {
  background-color: var(--color-bg-tertiary, #f1f5f9);
  color: var(--color-text-tertiary, #94a3b8);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  flex-shrink: 0;
}

.token-usage-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-surface, #ffffff) 92%, #eff6ff),
      color-mix(in srgb, var(--color-bg-secondary, #f8fafc) 84%, #ffffff)
    );
}

.token-usage-panel__meta,
.token-usage-panel__breakdown,
.token-usage-panel__title,
.token-usage-panel__stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.token-usage-panel__title {
  justify-content: flex-start;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

.token-usage-panel__model {
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary-light, #dbeafe) 88%, white);
  color: var(--color-primary, #2563eb);
}

.token-usage-panel__stats,
.token-usage-panel__breakdown {
  font-size: 0.6875rem;
  color: var(--color-text-secondary, #64748b);
}

.token-usage-panel__bar {
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-tertiary, #e2e8f0) 88%, white);
}

.token-usage-panel__fill {
  height: 100%;
  border-radius: inherit;
  transition: width 0.25s ease;
}

.token-usage-panel__bar--safe .token-usage-panel__fill {
  background: var(--color-primary, #2563eb);
}

.token-usage-panel__bar--warning .token-usage-panel__fill {
  background: var(--color-warning, #d97706);
}

.token-usage-panel__bar--danger .token-usage-panel__fill {
  background: var(--color-orange-500, #f97316);
}

.token-usage-panel__bar--critical .token-usage-panel__fill {
  background: var(--color-error, #dc2626);
}

.btn-stop,
.btn-resume,
.btn-clear {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: var(--radius-sm, 4px);
  font-size: 0.6875rem;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-label {
  display: inline;
}

/* 窄宽度下隐藏按钮文字，只显示图标 */
@media (max-width: 480px) {
  .btn-label {
    display: none;
  }
}

/* 详情面板较窄时隐藏按钮文字（通过 container query 回退） */
@container (max-width: 420px) {
  .btn-label {
    display: none;
  }
}

.btn-stop {
  background-color: var(--color-error-light, #fee2e2);
  color: var(--color-error, #dc2626);
}

.btn-stop:hover {
  background-color: var(--color-error, #dc2626);
  color: white;
}

.btn-resume {
  background-color: #dcfce7;
  color: #15803d;
}

.btn-resume:hover {
  background-color: #16a34a;
  color: white;
}

.btn-clear {
  background-color: color-mix(in srgb, var(--color-bg-tertiary, #f1f5f9) 92%, #ffffff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
}

.btn-clear:hover {
  background-color: color-mix(in srgb, var(--color-bg-tertiary, #f1f5f9) 100%, var(--color-bg-secondary, #e2e8f0));
}

.log-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--spacing-3, 0.75rem);
  background: var(--task-log-content-bg);
}

.result-summary {
  margin-bottom: var(--spacing-3, 0.75rem);
  width: 100%;
  min-width: 0;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: var(--font-size-sm, 13px);
}

.log-entries {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3, 0.75rem);
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2, 0.5rem);
}

.log-entry--system {
  padding: var(--spacing-2, 0.5rem);
  background-color: var(--color-bg-tertiary, #f1f5f9);
  border-radius: var(--radius-sm, 4px);
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
}

.log-entry--error {
  padding: var(--spacing-2, 0.5rem);
  background-color: var(--color-error-light, #fef2f2);
  border-radius: var(--radius-sm, 4px);
  border-left: 3px solid var(--color-error, #dc2626);
}

.log-entry--error .log-content-text {
  color: var(--color-error, #dc2626);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs, 12px);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-entry--content {
  padding: var(--spacing-2, 0.5rem) 0;
}

.log-time {
  font-size: 0.625rem;
  color: var(--color-text-tertiary, #94a3b8);
  flex-shrink: 0;
}

.log-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.log-content-text {
  flex: 1;
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-primary, #1e293b);
}

.running-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  padding: var(--spacing-2, 0.5rem);
  margin-top: var(--spacing-3, 0.75rem);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-primary-light, #eff6ff) 90%, white),
      color-mix(in srgb, var(--color-primary-light, #eff6ff) 68%, transparent)
    );
  border-radius: var(--radius-sm, 4px);
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-primary, #3b82f6);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.indicator-text {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-primary, #3b82f6);
}

/* 待办列表面板 */
.task-todo-panel {
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary, #f8fafc) 92%, white 8%), var(--color-bg-primary, #fff));
}

.task-todo-panel--expanded {
  border-bottom-color: color-mix(in srgb, var(--color-border) 72%, transparent);
}

.task-todo-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 0;
  margin-bottom: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.task-todo-panel--expanded .task-todo-panel__head {
  margin-bottom: 10px;
}

.task-todo-panel__head-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.task-todo-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--color-text-primary, #1e293b);
  font-size: 13px;
  font-weight: 600;
}

.task-todo-panel__active-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.task-todo-panel__active-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: min(100%, 26rem);
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, white 8%);
  color: var(--color-text-secondary, #64748b);
  font-size: 11px;
  line-height: 1;
}

.task-todo-panel__active-chip--in_progress {
  border-color: color-mix(in srgb, #22c55e 28%, var(--color-border));
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.14), rgba(255, 255, 255, 0.92));
  color: #166534;
}

.task-todo-panel__active-chip--pending {
  border-color: color-mix(in srgb, #60a5fa 18%, var(--color-border));
}

.task-todo-panel__active-chip-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.72;
}

.task-todo-panel__active-chip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-todo-panel__active-more {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  color: var(--color-text-secondary, #64748b);
  font-size: 11px;
  font-weight: 600;
}

.task-todo-panel__summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
}

.task-todo-panel__items {
  display: flex;
  flex-direction: column;
  max-height: min(32vh, 280px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.task-todo-panel__items-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-todo-panel__items::-webkit-scrollbar {
  width: 6px;
}

.task-todo-panel__items::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 72%, transparent);
}

.task-todo-panel__item {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 84%, transparent);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}

.task-todo-panel__item:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}

.task-todo-panel__item--in_progress {
  border-color: color-mix(in srgb, #22c55e 22%, var(--color-border));
  background: color-mix(in srgb, #22c55e 10%, var(--color-bg-secondary));
}

.task-todo-panel__item--in_progress::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      transparent 0%,
      rgba(34, 197, 94, 0.04) 24%,
      rgba(134, 239, 172, 0.34) 50%,
      rgba(34, 197, 94, 0.04) 76%,
      transparent 100%
    );
  transform: translateX(-100%);
  animation: todo-progress-sweep 2.8s ease-in-out infinite;
  pointer-events: none;
}

.task-todo-panel__item--pending {
  border-color: color-mix(in srgb, #94a3b8 30%, var(--color-border));
  background: color-mix(in srgb, #cbd5e1 18%, var(--color-bg-secondary));
}

.task-todo-panel__item--completed {
  opacity: 0.86;
  border-color: color-mix(in srgb, var(--color-border) 56%, transparent);
}

.task-todo-panel__dot {
  position: relative;
  z-index: 1;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: #f59e0b;
  flex-shrink: 0;
}

.task-todo-panel__item--in_progress .task-todo-panel__dot {
  background: #22c55e;
  box-shadow: 0 0 0 4px color-mix(in srgb, #22c55e 20%, transparent);
}

.task-todo-panel__item--completed .task-todo-panel__dot {
  background: color-mix(in srgb, var(--color-text-secondary) 68%, transparent);
}

.task-todo-panel__content {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
}

.task-todo-panel__text {
  color: var(--color-text-primary, #1e293b);
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}

.task-todo-panel__item--completed .task-todo-panel__text {
  text-decoration: line-through;
  color: var(--color-text-secondary, #64748b);
}

.task-todo-panel__hint {
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
}

.task-todo-panel__status {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  position: relative;
  z-index: 1;
}

.task-todo-panel__item--in_progress .task-todo-panel__status {
  color: #15803d;
  background: rgba(34, 197, 94, 0.12);
}

.task-todo-panel__item--pending .task-todo-panel__status {
  color: var(--color-text-secondary, #64748b);
  background: rgba(148, 163, 184, 0.16);
}

.task-todo-panel__item--completed .task-todo-panel__status {
  color: var(--color-text-secondary, #64748b);
  background: rgba(148, 163, 184, 0.14);
}

@keyframes todo-progress-sweep {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(120%);
  }
}

/* 等待输入表单区域 */
.input-form-section {
  padding: var(--spacing-4, 1rem);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-warning-light, #fef3c7) 74%, #fff8eb),
      color-mix(in srgb, var(--color-surface, #fff) 90%, var(--color-warning-light, #fef3c7))
    );
}

.section-title {
  margin: 0 0 var(--spacing-3, 0.75rem);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
}

.btn-skip {
  display: block;
  width: 100%;
  margin-top: var(--spacing-3, 0.75rem);
  padding: var(--spacing-2, 0.5rem);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 4px);
  background-color: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-skip:hover {
  background-color: var(--color-bg-tertiary, #f1f5f9);
  border-color: var(--color-text-tertiary, #94a3b8);
}

.status-badge.warning {
  background-color: var(--color-warning-light, #fef3c7);
  color: var(--color-warning, #d97706);
}

[data-theme='dark'] .task-execution-log {
  --task-log-surface: rgba(15, 23, 42, 0.96);
  --task-log-border: rgba(96, 165, 250, 0.14);
  --task-log-shadow: 0 22px 38px rgba(2, 6, 23, 0.42);
  --task-log-content-bg:
    linear-gradient(
      180deg,
      rgba(15, 23, 42, 0.12),
      rgba(2, 6, 23, 0.22)
    );
  background:
    linear-gradient(
      180deg,
      rgba(15, 23, 42, 0.96) 0%,
      rgba(15, 23, 42, 0.9) 100%
    );
}

[data-theme='dark'] .log-header {
  background:
    linear-gradient(
      180deg,
      rgba(30, 41, 59, 0.92),
      rgba(15, 23, 42, 0.88)
    );
  border-bottom-color: rgba(148, 163, 184, 0.12);
}

[data-theme='dark'] .token-usage-panel {
  border-bottom-color: rgba(148, 163, 184, 0.14);
  background:
    linear-gradient(
      180deg,
      rgba(15, 23, 42, 0.88),
      rgba(30, 41, 59, 0.78)
    );
}

[data-theme='dark'] .token-usage-panel__title {
  color: #f8fafc;
}

[data-theme='dark'] .token-usage-panel__model {
  background: rgba(37, 99, 235, 0.2);
  color: #bfdbfe;
}

[data-theme='dark'] .token-usage-panel__stats,
[data-theme='dark'] .token-usage-panel__breakdown {
  color: rgba(226, 232, 240, 0.72);
}

[data-theme='dark'] .token-usage-panel__bar {
  background: rgba(51, 65, 85, 0.92);
}

[data-theme='dark'] .btn-clear {
  background-color: rgba(51, 65, 85, 0.9);
  color: rgba(226, 232, 240, 0.86);
  border-color: rgba(148, 163, 184, 0.18);
}

[data-theme='dark'] .btn-clear:hover {
  background-color: rgba(71, 85, 105, 0.95);
}

[data-theme='dark'] .running-indicator {
  background:
    linear-gradient(
      90deg,
      rgba(30, 64, 175, 0.22),
      rgba(15, 23, 42, 0.12)
    );
  border-color: rgba(96, 165, 250, 0.18);
}

[data-theme='dark'] .task-todo-panel {
  border-bottom-color: rgba(148, 163, 184, 0.14);
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.88));
}

[data-theme='dark'] .task-todo-panel__title {
  color: #f8fafc;
}

[data-theme='dark'] .task-todo-panel__active-chip {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(30, 41, 59, 0.9);
  color: rgba(226, 232, 240, 0.78);
}

[data-theme='dark'] .task-todo-panel__active-chip--in_progress {
  border-color: color-mix(in srgb, #22c55e 28%, rgba(148, 163, 184, 0.22));
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.14), rgba(15, 23, 42, 0.92));
  color: #86efac;
}

[data-theme='dark'] .task-todo-panel__active-more {
  background: rgba(37, 99, 235, 0.16);
  color: rgba(226, 232, 240, 0.78);
}

[data-theme='dark'] .task-todo-panel__summary,
[data-theme='dark'] .task-todo-panel__hint,
[data-theme='dark'] .task-todo-panel__status {
  color: rgba(226, 232, 240, 0.72);
}

[data-theme='dark'] .task-todo-panel__item {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(30, 41, 59, 0.78);
}

[data-theme='dark'] .task-todo-panel__item--in_progress {
  border-color: rgba(34, 197, 94, 0.26);
  background: rgba(34, 197, 94, 0.1);
}

[data-theme='dark'] .task-todo-panel__item--pending {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(30, 41, 59, 0.62);
}

[data-theme='dark'] .task-todo-panel__item--completed {
  opacity: 0.78;
}

[data-theme='dark'] .task-todo-panel__text {
  color: #e2e8f0;
}

[data-theme='dark'] .task-todo-panel__item--completed .task-todo-panel__text {
  color: rgba(148, 163, 184, 0.72);
}

[data-theme='dark'] .task-todo-panel__item--in_progress .task-todo-panel__status {
  color: #86efac;
  background: rgba(34, 197, 94, 0.18);
}

[data-theme='dark'] .task-todo-panel__item--pending .task-todo-panel__status {
  color: rgba(226, 232, 240, 0.72);
  background: rgba(148, 163, 184, 0.14);
}

[data-theme='dark'] .task-todo-panel__item--completed .task-todo-panel__status {
  color: rgba(148, 163, 184, 0.72);
  background: rgba(148, 163, 184, 0.12);
}

[data-theme='dark'] .task-todo-panel__items::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.36);
}

[data-theme='dark'] .input-form-section {
  border-bottom-color: rgba(148, 163, 184, 0.14);
  background:
    linear-gradient(
      180deg,
      rgba(120, 53, 15, 0.32),
      rgba(15, 23, 42, 0.24)
    );
}

[data-theme='dark'] .section-title {
  color: #f8fafc;
}

[data-theme='dark'] .btn-skip {
  border-color: rgba(251, 191, 36, 0.28);
  color: rgba(251, 191, 36, 0.92);
}

[data-theme='dark'] .btn-skip:hover {
  background-color: rgba(120, 53, 15, 0.24);
  border-color: rgba(251, 191, 36, 0.42);
}

[data-theme='dark'] .log-title,
[data-theme='dark'] .empty-state,
[data-theme='dark'] .log-content-text {
  color: #e2e8f0;
}

[data-theme='dark'] .log-entry--system {
  background-color: rgba(30, 41, 59, 0.7);
  color: rgba(226, 232, 240, 0.78);
}

[data-theme='dark'] .result-summary,
[data-theme='dark'] .log-entries {
  color: #e2e8f0;
}

[data-theme='dark'] .task-execution-log .result-summary {
  padding: 0.25rem;
  border-radius: var(--radius-lg, 12px);
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 14px 30px rgba(2, 6, 23, 0.24);
}

[data-theme='dark'] .task-execution-log .result-summary :deep(.timeline-message__content),
[data-theme='dark'] .task-execution-log .result-summary :deep(.timeline-entry),
[data-theme='dark'] .task-execution-log .result-summary :deep(.structured-content-renderer),
[data-theme='dark'] .task-execution-log .result-summary :deep(.structured-renderer),
[data-theme='dark'] .task-execution-log .result-summary :deep(.markdown-content) {
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  border-color: rgba(148, 163, 184, 0.18);
}

[data-theme='dark'] .task-execution-log .result-summary :deep(.structured-content__result),
[data-theme='dark'] .task-execution-log .result-summary :deep(.structured-result-card) {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(15, 23, 42, 0.88));
  border-color: rgba(148, 163, 184, 0.18);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.26);
  color: #e2e8f0;
}

[data-theme='dark'] .task-execution-log .result-summary :deep(.structured-result-card__label) {
  color: rgba(96, 165, 250, 0.92);
  border-color: rgba(96, 165, 250, 0.32);
}

[data-theme='dark'] .task-execution-log .result-summary :deep(.structured-result-card__summary),
[data-theme='dark'] .task-execution-log .result-summary :deep(.structured-result-card__section),
[data-theme='dark'] .task-execution-log .result-summary :deep(.structured-result-card__section p) {
  color: #e2e8f0;
}

[data-theme='dark'] .task-execution-log :deep(.timeline-message__content),
[data-theme='dark'] .task-execution-log :deep(.timeline-entry),
[data-theme='dark'] .task-execution-log :deep(.tool-call),
[data-theme='dark'] .task-execution-log :deep(.thinking-display),
[data-theme='dark'] .task-execution-log :deep(.structured-renderer),
[data-theme='dark'] .task-execution-log :deep(.markdown-content) {
  color: #e2e8f0;
}

[data-theme='dark'] .task-execution-log :deep(.execution-timeline) {
  --timeline-bubble-bg: rgba(15, 23, 42, 0.88);
  --timeline-bubble-border: rgba(148, 163, 184, 0.18);
  --timeline-bubble-shadow: 0 14px 30px rgba(2, 6, 23, 0.3);
  --timeline-user-bubble-bg: linear-gradient(135deg, rgba(37, 99, 235, 0.28), rgba(14, 165, 233, 0.16));
  --timeline-user-bubble-border: rgba(96, 165, 250, 0.24);
  --timeline-entry-bg: rgba(15, 23, 42, 0.78);
  --timeline-entry-border: rgba(148, 163, 184, 0.18);
}

[data-theme='dark'] .task-execution-log :deep(.timeline-message__content) {
  background: rgba(15, 23, 42, 0.88);
  border-color: rgba(148, 163, 184, 0.18);
  box-shadow: 0 14px 30px rgba(2, 6, 23, 0.3);
  color: #e2e8f0;
}

[data-theme='dark'] .task-execution-log :deep(.timeline-message--user .timeline-message__content) {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.28), rgba(14, 165, 233, 0.16));
  border-color: rgba(96, 165, 250, 0.24);
  color: #f8fafc;
}

[data-theme='dark'] .task-execution-log :deep(.timeline-message__text),
[data-theme='dark'] .task-execution-log :deep(.markdown-content),
[data-theme='dark'] .task-execution-log :deep(.markdown-content p),
[data-theme='dark'] .task-execution-log :deep(.markdown-content li),
[data-theme='dark'] .task-execution-log :deep(.markdown-content strong),
[data-theme='dark'] .task-execution-log :deep(.structured-content-renderer) {
  color: #e2e8f0;
}
</style>
